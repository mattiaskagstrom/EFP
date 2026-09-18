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
        group.MapPost("/zones/import", ImportZonesGpxAsync).DisableAntiforgery();
        group.MapGet("/zones.geojson", ExportZonesGeoJsonAsync);
        group.MapGet("/zones.gpx", ExportZonesGpxAsync);
        group.MapGet("/tracks.geojson", ExportTracksGeoJsonAsync);
        group.MapGet("/tracks.gpx", ExportTracksGpxAsync);
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

    private static async Task<IResult> ImportZonesGpxAsync(Guid investigationId, IFormFile file, EfpDbContext db, CancellationToken ct)
    {
        if (!await db.Investigations.AnyAsync(x => x.Id == investigationId, ct)) return Results.NotFound("Investigation not found.");
        if (file.Length == 0 || file.Length > 25 * 1024 * 1024) return Results.BadRequest("GPX file must be between 1 byte and 25 MB.");

        await using var stream = file.OpenReadStream();
        var document = await XDocument.LoadAsync(stream, LoadOptions.None, ct);
        var segments = document.Descendants().Where(x => x.Name.LocalName == "trkseg").ToArray();
        if (segments.Length == 0) return Results.BadRequest("GPX must contain at least one track segment for a zone.");

        var existingCount = await db.Zones.CountAsync(x => x.InvestigationId == investigationId, ct);
        var imported = new List<object>();
        var created = new List<Zone>();
        foreach (var segment in segments)
        {
            var points = segment.Elements().Where(x => x.Name.LocalName == "trkpt").Select(x => new Coordinate(Parse(x.Attribute("lon")?.Value), Parse(x.Attribute("lat")?.Value))).ToArray();
            if (points.Length < 3) continue;
            var factory = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326);
            var segmentName = segment.Parent?.Elements().FirstOrDefault(x => x.Name.LocalName == "name")?.Value;
            var polygons = PolygonizeTrack(factory, points);
            foreach (var (polygon, polygonIndex) in polygons.Select((item, index) => (item, index)))
            {
                var name = string.IsNullOrWhiteSpace(segmentName) ? $"GPX-zon {existingCount + created.Count + 1}" : polygons.Count == 1 ? segmentName.Trim() : $"{segmentName.Trim()} {polygonIndex + 1}";
                var zone = new Zone { InvestigationId = investigationId, Name = name, Status = ZoneStatus.NotStarted, SearchMethod = SearchMethod.Patrol, Priority = existingCount + created.Count + 1, Instructions = $"Importerad från {file.FileName}", Geometry = polygon };
                created.Add(zone);
                imported.Add(new { zone.Name, PointCount = polygon.ExteriorRing.NumPoints });
            }
        }

        if (created.Count == 0) return Results.BadRequest("GPX innehåller inga giltiga zoner. Filen måste innehålla slutna polygoner eller ett linjeunderlag som kan polygoniseras till områden.");
        db.Zones.AddRange(created); await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/investigations/{investigationId}/zones", new { FileName = file.FileName, Zones = imported });
    }

    private static List<Polygon> PolygonizeTrack(GeometryFactory factory, Coordinate[] points)
    {
        if (points.Length >= 4 && points[0].Equals2D(points[^1]))
        {
            var polygon = factory.CreatePolygon(factory.CreateLinearRing(points));
            return polygon.IsValid ? [polygon] : [];
        }

        var line = factory.CreateLineString(points);
        var nodedLinework = UnaryUnionOp.Union(line);
        var polygonizer = new Polygonizer();
        polygonizer.Add(nodedLinework);
        return polygonizer.GetPolygons().OfType<Polygon>().Where(polygon => polygon.IsValid && polygon.Area > 0).ToList();
    }

    private static async Task<IResult> ExportZonesGeoJsonAsync(Guid investigationId, EfpDbContext db, CancellationToken ct)
    {
        var zones = await db.Zones.AsNoTracking().Where(x => x.InvestigationId == investigationId).ToListAsync(ct);
        var features = zones.Select(zone => new { type = "Feature", id = zone.Id, properties = new { zone.Name, zone.Status, zone.SearchMethod, zone.Priority, zone.AssignedGroup }, geometry = new { type = "Polygon", coordinates = new[] { zone.Geometry.ExteriorRing.Coordinates.Select(c => new[] { c.X, c.Y }).ToArray() } } });
        return Results.Json(new { type = "FeatureCollection", features });
    }

    private static async Task<IResult> ExportZonesGpxAsync(Guid investigationId, EfpDbContext db, CancellationToken ct)
    {
        var zones = await db.Zones.AsNoTracking().Where(x => x.InvestigationId == investigationId).OrderBy(x => x.Priority).ToListAsync(ct);
        var ns = XNamespace.Get("http://www.topografix.com/GPX/1/1");
        var root = new XElement(ns + "gpx", new XAttribute("version", "1.1"), new XAttribute("creator", "EFP"));
        foreach (var zone in zones)
        {
            var points = zone.Geometry.ExteriorRing.Coordinates.Select(coordinate => new XElement(ns + "trkpt", new XAttribute("lat", coordinate.Y.ToString(CultureInfo.InvariantCulture)), new XAttribute("lon", coordinate.X.ToString(CultureInfo.InvariantCulture))));
            root.Add(new XElement(ns + "trk", new XElement(ns + "name", zone.Name), new XElement(ns + "trkseg", points)));
        }
        return Results.Text(new XDocument(new XDeclaration("1.0", "utf-8", "yes"), root).ToString(), "application/gpx+xml");
    }

    private static async Task<IResult> ExportTracksGeoJsonAsync(Guid investigationId, EfpDbContext db, CancellationToken ct)
    {
        var tracks = await db.Tracks.AsNoTracking().Where(x => x.InvestigationId == investigationId).ToListAsync(ct);
        var features = tracks.Select(track => new { type = "Feature", id = track.Id, properties = new { track.Callsign, track.SourceFile, track.StartedAt, track.EndedAt }, geometry = new { type = "LineString", coordinates = track.Geometry.Coordinates.Select(c => new[] { c.X, c.Y }).ToArray() } });
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
}
