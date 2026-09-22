using System.Globalization;
using System.Xml.Linq;
using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite;
using NetTopologySuite.Geometries;
using NetTopologySuite.Operation.Polygonize;
using NetTopologySuite.Operation.Union;

namespace Efp.Api.Features;

public static class ImportExportEndpoints
{
    public static IEndpointRouteBuilder MapImportExportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/investigations/{investigationId:guid}");
        group.MapPost("/tracks/import", ImportGpxAsync).DisableAntiforgery();
        group.MapPatch("/tracks/{trackId:guid}", UpdateTrackMetadataAsync);
        group.MapPost("/sectors/import", ImportSectorsGpxAsync).DisableAntiforgery();
        group.MapGet("/sectors.geojson", ExportSectorsGeoJsonAsync);
        group.MapGet("/sectors.gpx", ExportSectorsGarminGpxAsync);
        group.MapGet("/sectors.garmin.gpx", ExportSectorsGarminGpxAsync);
        group.MapGet("/tracks.geojson", ExportTracksGeoJsonAsync);
        group.MapGet("/tracks.gpx", ExportTracksGpxAsync);
        group.MapGet("/tracks.garmin.gpx", ExportTracksGpxAsync);
        return endpoints;
    }

    private static async Task<IResult> ImportGpxAsync(Guid investigationId, IFormFile file, string? callsign, EfpDbContext db, CancellationToken ct)
    {
        if (!await db.Investigations.AnyAsync(x => x.Id == investigationId, ct)) return Results.NotFound("Investigation not found.");
        if (file.Length == 0 || file.Length > 25 * 1024 * 1024) return Results.BadRequest("GPX file must be between 1 byte and 25 MB.");
        await using var stream = file.OpenReadStream();
        var document = await XDocument.LoadAsync(stream, LoadOptions.None, ct);
        var points = document.Descendants().Where(x => x.Name.LocalName == "trkpt").Select(x => new Coordinate(Parse(x.Attribute("lon")?.Value), Parse(x.Attribute("lat")?.Value))).ToArray();
        if (points.Length < 2) return Results.BadRequest("GPX must contain at least two track points.");
        var geometry = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326).CreateLineString(points);
        var track = new Track { InvestigationId = investigationId, Callsign = string.IsNullOrWhiteSpace(callsign) ? "GPX import" : callsign.Trim(), SourceFile = file.FileName, Geometry = geometry };
        db.Tracks.Add(track); await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/investigations/{investigationId}/tracks/{track.Id}", new { track.Id, track.Callsign, track.SourceFile, PointCount = points.Length });
    }

    private static async Task<IResult> UpdateTrackMetadataAsync(Guid investigationId, Guid trackId, TrackMetadataRequest request, EfpDbContext db, CancellationToken ct)
    {
        if (request.Pod is < 0 or > 100) return Results.ValidationProblem(new Dictionary<string, string[]> { ["pod"] = ["POD måste vara mellan 0 och 100."] });
        var track = await db.Tracks.FirstOrDefaultAsync(x => x.Id == trackId && x.InvestigationId == investigationId, ct);
        if (track is null) return Results.NotFound();
        track.Pod = request.Pod;
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { track.Id, track.Callsign, track.SourceFile, track.Pod });
    }

    private static async Task<IResult> ImportSectorsGpxAsync(Guid investigationId, IFormFile file, EfpDbContext db, CancellationToken ct)
    {
        if (!await db.Investigations.AnyAsync(x => x.Id == investigationId, ct)) return Results.NotFound("Investigation not found.");
        if (file.Length == 0 || file.Length > 25 * 1024 * 1024) return Results.BadRequest("GPX file must be between 1 byte and 25 MB.");

        await using var stream = file.OpenReadStream();
        var document = await XDocument.LoadAsync(stream, LoadOptions.None, ct);
        var segments = document.Descendants().Where(x => x.Name.LocalName == "trkseg").ToArray();
        if (segments.Length == 0) return Results.BadRequest("GPX must contain at least one track segment for a sector.");

        var existingCount = await db.Sectors.CountAsync(x => x.InvestigationId == investigationId, ct);
        var imported = new List<object>();
        var created = new List<Sector>();
        foreach (var segment in segments)
        {
            var points = segment.Elements().Where(x => x.Name.LocalName == "trkpt").Select(x => new Coordinate(Parse(x.Attribute("lon")?.Value), Parse(x.Attribute("lat")?.Value))).ToArray();
            if (points.Length < 3) continue;
            var factory = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326);
            var segmentName = segment.Parent?.Elements().FirstOrDefault(x => x.Name.LocalName == "name")?.Value;
            var polygons = PolygonizeTrack(factory, points);
            foreach (var (polygon, polygonIndex) in polygons.Select((item, index) => (item, index)))
            {
                var name = string.IsNullOrWhiteSpace(segmentName) ? $"GPX-sektor {existingCount + created.Count + 1}" : polygons.Count == 1 ? segmentName.Trim() : $"{segmentName.Trim()} {polygonIndex + 1}";
                var sector = new Sector { InvestigationId = investigationId, Name = name, Status = SectorStatus.NotStarted, SearchMethod = SearchMethod.Patrol, Priority = existingCount + created.Count + 1, Instructions = $"Importerad från {file.FileName}", Geometry = polygon };
                created.Add(sector);
                imported.Add(new { sector.Name, PointCount = polygon.ExteriorRing.NumPoints });
            }
        }

        if (created.Count == 0) return Results.BadRequest("GPX innehåller inga giltiga sektorer. Filen måste innehålla slutna polygoner eller ett linjeunderlag som kan polygoniseras till områden.");
        db.Sectors.AddRange(created); await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/investigations/{investigationId}/sectors", new { FileName = file.FileName, Sectors = imported });
    }

    private static List<Polygon> PolygonizeTrack(GeometryFactory factory, Coordinate[] points)
    {
        if (points.Select(point => $"{point.X:F7},{point.Y:F7}").Distinct().Count() < 3) return [];
        if (points.Length >= 4 && points[0].Equals2D(points[^1]))
        {
            var polygon = factory.CreatePolygon(factory.CreateLinearRing(points));
            return polygon.IsValid && polygon.Area > 0 ? [polygon] : [];
        }

        var line = factory.CreateLineString(points);
        var nodedLinework = UnaryUnionOp.Union(line);
        var polygonizer = new Polygonizer();
        polygonizer.Add(nodedLinework);
        return polygonizer.GetPolygons().OfType<Polygon>().Where(polygon => polygon.IsValid && polygon.Area > 0).ToList();
    }

    private static async Task<IResult> ExportSectorsGeoJsonAsync(Guid investigationId, EfpDbContext db, CancellationToken ct)
    {
        var sectors = await db.Sectors.AsNoTracking().Where(x => x.InvestigationId == investigationId).ToListAsync(ct);
        var features = sectors.Select(sector => new { type = "Feature", id = sector.Id, properties = new { sector.Name, sector.Status, sector.SearchMethod, sector.Priority, sector.AssignedGroup }, geometry = ToGeoJsonGeometry(sector.Geometry) });
        return Results.Json(new { type = "FeatureCollection", features });
    }

    private static async Task<IResult> ExportSectorsGpxAsync(Guid investigationId, EfpDbContext db, CancellationToken ct)
    {
        var sectors = await db.Sectors.AsNoTracking().Where(x => x.InvestigationId == investigationId).OrderBy(x => x.Priority).ToListAsync(ct);
        var ns = XNamespace.Get("http://www.topografix.com/GPX/1/1");
        var root = new XElement(ns + "gpx", new XAttribute("version", "1.1"), new XAttribute("creator", "EFP"));
        foreach (var sector in sectors)
        {
            var points = sector.Geometry.Coordinates.Select(coordinate => new XElement(ns + "trkpt", new XAttribute("lat", coordinate.Y.ToString(CultureInfo.InvariantCulture)), new XAttribute("lon", coordinate.X.ToString(CultureInfo.InvariantCulture))));
            root.Add(new XElement(ns + "trk", new XElement(ns + "name", sector.Name), new XElement(ns + "trkseg", points)));
        }
        return Results.Text(new XDocument(new XDeclaration("1.0", "utf-8", "yes"), root).ToString(), "application/gpx+xml");
    }

    private static async Task<IResult> ExportSectorsGarminGpxAsync(Guid investigationId, EfpDbContext db, CancellationToken ct)
    {
        var sectors = await db.Sectors.AsNoTracking().Where(x => x.InvestigationId == investigationId).OrderBy(x => x.Priority).ToListAsync(ct);
        var ns = XNamespace.Get("http://www.topografix.com/GPX/1/1");
        var xsi = XNamespace.Get("http://www.w3.org/2001/XMLSchema-instance");
        var root = new XElement(ns + "gpx",
            new XAttribute("version", "1.1"),
            new XAttribute("creator", "EFP Garmin export"),
            new XAttribute(XNamespace.Xmlns + "xsi", xsi),
            new XAttribute(xsi + "schemaLocation", "http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"));

        foreach (var sector in sectors)
        {
            var coordinates = sector.Geometry.Coordinates.ToList();
            if (coordinates.Count > 0 && !coordinates[0].Equals2D(coordinates[^1])) coordinates.Add(coordinates[0]);
            var points = coordinates.Select(coordinate => new XElement(ns + "trkpt",
                new XAttribute("lat", coordinate.Y.ToString(CultureInfo.InvariantCulture)),
                new XAttribute("lon", coordinate.X.ToString(CultureInfo.InvariantCulture))));
            root.Add(new XElement(ns + "trk",
                new XElement(ns + "name", sector.Name),
                new XElement(ns + "type", "boundary"),
                new XElement(ns + "trkseg", points)));
        }

        return Results.Text(new XDocument(new XDeclaration("1.0", "utf-8", "yes"), root).ToString(), "application/gpx+xml");
    }

    private static async Task<IResult> ExportTracksGeoJsonAsync(Guid investigationId, EfpDbContext db, CancellationToken ct)
    {
        var tracks = await db.Tracks.AsNoTracking().Where(x => x.InvestigationId == investigationId).ToListAsync(ct);
        var features = tracks.Select(track => new { type = "Feature", id = track.Id, properties = new { track.Callsign, track.SourceFile, track.StartedAt, track.EndedAt, track.Pod }, geometry = new { type = "LineString", coordinates = track.Geometry.Coordinates.Select(c => new[] { c.X, c.Y }).ToArray() } });
        return Results.Json(new { type = "FeatureCollection", features });
    }

    private static async Task<IResult> ExportTracksGpxAsync(Guid investigationId, EfpDbContext db, CancellationToken ct)
    {
        var tracks = await db.Tracks.AsNoTracking().Where(x => x.InvestigationId == investigationId).ToListAsync(ct);
        var root = new XElement(XName.Get("gpx", "http://www.topografix.com/GPX/1/1"), new XAttribute("version", "1.1"), new XAttribute("creator", "EFP"));
        foreach (var track in tracks)
        {
            var trk = new XElement(root.Name.Namespace + "trk", new XElement(root.Name.Namespace + "name", track.Callsign), new XElement(root.Name.Namespace + "trkseg", track.Geometry.Coordinates.Select(coordinate => new XElement(root.Name.Namespace + "trkpt", new XAttribute("lat", coordinate.Y.ToString(CultureInfo.InvariantCulture)), new XAttribute("lon", coordinate.X.ToString(CultureInfo.InvariantCulture))))));
            root.Add(trk);
        }
        return Results.Text(new XDocument(new XDeclaration("1.0", "utf-8", "yes"), root).ToString(), "application/gpx+xml");
    }

    private static double Parse(string? value) => double.Parse(value ?? throw new FormatException("Missing coordinate."), CultureInfo.InvariantCulture);

    private static object ToGeoJsonGeometry(Geometry geometry) => geometry.GeometryType == "Polygon"
        ? new { type = "Polygon", coordinates = new[] { geometry.Coordinates.Select(c => new[] { c.X, c.Y }).ToArray() } }
        : new { type = "LineString", coordinates = geometry.Coordinates.Select(c => new[] { c.X, c.Y }).ToArray() };
}

public sealed record TrackMetadataRequest(double? Pod = null);
