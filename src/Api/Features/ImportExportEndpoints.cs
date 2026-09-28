using System.Globalization;
using System.Xml;
using System.Xml.Linq;
using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using NetTopologySuite;
using NetTopologySuite.Geometries;
using NetTopologySuite.Geometries.Utilities;
using NetTopologySuite.Operation.Overlay.Snap;
using NetTopologySuite.Operation.Polygonize;
using NetTopologySuite.Operation.Union;
using NetTopologySuite.Precision;

namespace Efp.Api.Features;

public static class ImportExportEndpoints
{
    // The police-sector GPX export may contain one long, unsplit line with
    // small gaps and near-duplicate vertices. This removes tiny sliver
    // faces created by those inaccuracies without changing ordinary polygons.
    private const double ImportedPolygonMinimumAreaKm2 = 0.2;
    private const double ImportedLinePrecisionScale = 10_000d;
    private const double ImportedLineSnapToleranceDegrees = 0.0015d;

    public static IEndpointRouteBuilder MapImportExportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/investigations/{investigationId:guid}");
        group.MapPost("/tracks/import", ImportGpxAsync).DisableAntiforgery();
        group.MapGet("/tracks", ListTracksAsync);
        group.MapPatch("/tracks/{trackId:guid}", UpdateTrackMetadataAsync).RequireAuthorization("Admin");
        group.MapPost("/sectors/import", ImportSectorsGpxAsync).DisableAntiforgery().RequireAuthorization("Admin");
        group.MapGet("/sectors.geojson", ExportSectorsGeoJsonAsync);
        group.MapGet("/sectors.gpx", ExportSectorsGarminGpxAsync);
        group.MapGet("/sectors.garmin.gpx", ExportSectorsGarminGpxAsync);
        group.MapGet("/tracks.geojson", ExportTracksGeoJsonAsync);
        group.MapGet("/tracks.gpx", ExportTracksGpxAsync);
        group.MapGet("/tracks.garmin.gpx", ExportTracksGpxAsync);
        return endpoints;
    }

    private static async Task<IResult> ImportGpxAsync(Guid investigationId, IFormFile file, [FromForm] string? callsign, [FromForm] double? pod, [FromForm] string? assignedGroup, [FromForm] Guid? sectorId, [FromForm] string? notes, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        if (!await db.Investigations.AnyAsync(x => x.Id == investigationId, ct)) return Results.NotFound("Investigation not found.");
        if (file.Length == 0 || file.Length > 25 * 1024 * 1024) return Results.BadRequest("GPX file must be between 1 byte and 25 MB.");
        if (pod is < 0 or > 100) return Results.ValidationProblem(new Dictionary<string, string[]> { ["pod"] = ["POD måste vara mellan 0 och 100."] });
        if (sectorId.HasValue && !await db.Sectors.AnyAsync(x => x.Id == sectorId && x.InvestigationId == investigationId, ct)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["sectorId"] = ["Vald sektor finns inte i sökinsatsen."] });
        await using var stream = file.OpenReadStream();
        XDocument document;
        try { document = await XDocument.LoadAsync(stream, LoadOptions.None, ct); }
        catch (Exception exception) when (exception is XmlException or FormatException) { return Results.BadRequest("GPX-filen innehåller ogiltig XML."); }
        Coordinate[] points;
        try { points = document.Descendants().Where(x => x.Name.LocalName == "trkpt").Select(x => new Coordinate(Parse(x.Attribute("lon")?.Value), Parse(x.Attribute("lat")?.Value))).ToArray(); }
        catch (FormatException) { return Results.BadRequest("GPX-filen innehåller ogiltiga koordinater."); }
        if (points.Length < 2) return Results.BadRequest("GPX must contain at least two track points.");
        var geometry = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326).CreateLineString(points);
        var track = new Track { InvestigationId = investigationId, Callsign = string.IsNullOrWhiteSpace(callsign) ? "GPX import" : callsign.Trim(), SourceFile = file.FileName, AssignedGroup = assignedGroup?.Trim(), SectorId = sectorId, Notes = notes?.Trim(), Pod = pod, Geometry = geometry };
        db.Tracks.Add(track); await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/investigations/{investigationId}/tracks/{track.Id}", new { track.Id, track.Callsign, track.SourceFile, track.AssignedGroup, track.SectorId, track.Notes, track.Pod, PointCount = points.Length });
    }

    private static async Task<IResult> ListTracksAsync(Guid investigationId, [FromQuery] string? callsign, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        var query = db.Tracks.AsNoTracking().Where(x => x.InvestigationId == investigationId);
        if (!string.IsNullOrWhiteSpace(callsign)) query = query.Where(x => x.Callsign == callsign.Trim());
        var tracks = await query.OrderByDescending(x => x.ImportedAt).Select(x => new { x.Id, x.Callsign, x.SourceFile, x.AssignedGroup, x.SectorId, x.Notes, x.Pod, x.StartedAt, x.EndedAt, x.ImportedAt, PointCount = x.Geometry.NumPoints }).ToListAsync(ct);
        return Results.Ok(tracks);
    }

    private static async Task<IResult> UpdateTrackMetadataAsync(Guid investigationId, Guid trackId, TrackMetadataRequest request, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanManageAsync(investigationId, http, db, ct)) return Results.Forbid();
        if (request.Pod is < 0 or > 100) return Results.ValidationProblem(new Dictionary<string, string[]> { ["pod"] = ["POD måste vara mellan 0 och 100."] });
        var track = await db.Tracks.FirstOrDefaultAsync(x => x.Id == trackId && x.InvestigationId == investigationId, ct);
        if (track is null) return Results.NotFound();
        track.Pod = request.Pod;
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { track.Id, track.Callsign, track.SourceFile, track.AssignedGroup, track.SectorId, track.Notes, track.Pod });
    }

    private static async Task<IResult> ImportSectorsGpxAsync(Guid investigationId, IFormFile file, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanManageAsync(investigationId, http, db, ct)) return Results.Forbid();
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

            // Some source systems export a complete sector underlay as one
            // continuous track without closed rings or segment boundaries.
            // Keep that information as an editable line sector instead of
            // discarding the entire import when polygonization is inconclusive.
            if (polygons.Count == 0)
            {
                var line = factory.CreateLineString(RemoveConsecutiveDuplicates(points));
                if (line.NumPoints >= 2 && line.IsValid)
                {
                    var name = string.IsNullOrWhiteSpace(segmentName) ? $"GPX-linje {existingCount + created.Count + 1}" : segmentName.Trim();
                    var sector = new Sector { InvestigationId = investigationId, Name = name, Status = SectorStatus.NotStarted, SearchMethod = SearchMethod.Patrol, Priority = existingCount + created.Count + 1, Instructions = $"Importerad linjeunderlag från {file.FileName}. Ingen säker sluten polygon kunde skapas.", Geometry = line };
                    created.Add(sector);
                    imported.Add(new { sector.Name, PointCount = line.NumPoints, GeometryType = "LineString", Warning = "Importerad som linjeunderlag" });
                }
            }
        }

        if (created.Count == 0) return Results.BadRequest("GPX innehåller inga giltiga sektorer. Filen måste innehålla slutna polygoner eller ett linjeunderlag som kan polygoniseras till områden.");
        db.Sectors.AddRange(created); await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/investigations/{investigationId}/sectors", new { FileName = file.FileName, Sectors = imported });
    }

    private static List<Polygon> PolygonizeTrack(GeometryFactory factory, Coordinate[] points)
    {
        points = RemoveConsecutiveDuplicates(points);
        if (points.Select(point => $"{point.X:F7},{point.Y:F7}").Distinct().Count() < 3) return [];
        if (points.Length >= 4 && points[0].Equals2D(points[^1]))
        {
            var polygon = factory.CreatePolygon(factory.CreateLinearRing(points));
            if (polygon.IsValid && polygon.Area > 0) return [polygon];
            return RepairPolygon(polygon).ToList();
        }

        // Some police exports put all sector boundaries into one open
        // trkseg. Reduce coordinate noise before noding so boundaries that
        // should meet are treated as meeting by the polygonizer.
        var line = factory.CreateLineString(points);
        var reducedLine = GeometryPrecisionReducer.Reduce(line, new PrecisionModel(ImportedLinePrecisionScale));
        var snappedLine = reducedLine;
        for (var pass = 0; pass < 2; pass++)
        {
            snappedLine = GeometrySnapper.SnapToSelf(snappedLine, ImportedLineSnapToleranceDegrees, cleanResult: true);
        }
        var nodedLinework = UnaryUnionOp.Union(snappedLine);
        var averageLatitudeRadians = points.Average(point => point.Y) * Math.PI / 180d;
        var minimumAreaDegreesSquared = ImportedPolygonMinimumAreaKm2 /
            (111.32d * 111.32d * Math.Max(0.1d, Math.Cos(averageLatitudeRadians)));
        var polygonizer = new Polygonizer();
        polygonizer.Add(nodedLinework);
        var polygons = polygonizer.GetPolygons().OfType<Polygon>()
            .SelectMany(RepairPolygon)
            .ToList();

        return AbsorbSmallPolygonArtifacts(polygons, minimumAreaDegreesSquared);
    }

    private static IEnumerable<Polygon> RepairPolygon(Polygon polygon)
    {
        if (polygon.IsValid && polygon.Area > 0) return [polygon];
        var repaired = GeometryFixer.Fix(polygon);
        return ExtractPolygons(repaired).Where(item => item.IsValid && item.Area > 0);
    }

    private static List<Polygon> AbsorbSmallPolygonArtifacts(List<Polygon> polygons, double minimumAreaDegreesSquared)
    {
        var significant = polygons.Where(polygon => polygon.Area >= minimumAreaDegreesSquared).ToList();
        var small = polygons.Where(polygon => polygon.Area < minimumAreaDegreesSquared).ToList();

        foreach (var artifact in small)
        {
            if (significant.Count == 0) break;

            var candidate = significant
                .Select((polygon, index) => new
                {
                    Polygon = polygon,
                    Index = index,
                    SharedBoundary = polygon.Boundary.Intersection(artifact.Boundary).Length,
                })
                .Where(item => item.SharedBoundary > 0)
                .OrderByDescending(item => item.SharedBoundary)
                .FirstOrDefault();

            if (candidate is null) continue;

            var merged = GeometryFixer.Fix(candidate.Polygon.Union(artifact));
            var repairedPolygons = ExtractPolygons(merged).Where(polygon => polygon.IsValid && polygon.Area > 0).ToList();
            if (repairedPolygons.Count == 1) significant[candidate.Index] = repairedPolygons[0];
        }

        return significant;
    }

    private static IEnumerable<Polygon> ExtractPolygons(Geometry geometry)
    {
        if (geometry is Polygon polygon)
        {
            yield return polygon;
            yield break;
        }

        if (geometry is not GeometryCollection) yield break;

        for (var index = 0; index < geometry.NumGeometries; index++)
        {
            foreach (var child in ExtractPolygons(geometry.GetGeometryN(index))) yield return child;
        }
    }

    private static Coordinate[] RemoveConsecutiveDuplicates(Coordinate[] points)
    {
        var result = new List<Coordinate>();
        foreach (var point in points)
        {
            if (result.Count == 0 || !result[^1].Equals2D(point)) result.Add(point);
        }
        return result.ToArray();
    }

    private static async Task<IResult> ExportSectorsGeoJsonAsync(Guid investigationId, [FromQuery] Guid[]? sectorIds, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        var query = db.Sectors.AsNoTracking().Where(x => x.InvestigationId == investigationId);
        if (sectorIds is { Length: > 0 }) query = query.Where(x => sectorIds.Contains(x.Id));
        var sectors = await query.ToListAsync(ct);
        var features = sectors.Select(sector => new { type = "Feature", id = sector.Id, properties = new { sector.Name, sector.Status, sector.SearchMethod, sector.Priority, sector.AssignedGroup }, geometry = ToGeoJsonGeometry(sector.Geometry) });
        return Results.Json(new { type = "FeatureCollection", features });
    }

    private static async Task<IResult> ExportSectorsGpxAsync(Guid investigationId, [FromQuery] Guid[]? sectorIds, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        var query = db.Sectors.AsNoTracking().Where(x => x.InvestigationId == investigationId);
        if (sectorIds is { Length: > 0 }) query = query.Where(x => sectorIds.Contains(x.Id));
        var sectors = await query.OrderBy(x => x.Priority).ToListAsync(ct);
        var ns = XNamespace.Get("http://www.topografix.com/GPX/1/1");
        var root = new XElement(ns + "gpx", new XAttribute("version", "1.1"), new XAttribute("creator", "EFP"));
        foreach (var sector in sectors)
        {
            var points = sector.Geometry.Coordinates.Select(coordinate => new XElement(ns + "trkpt", new XAttribute("lat", coordinate.Y.ToString(CultureInfo.InvariantCulture)), new XAttribute("lon", coordinate.X.ToString(CultureInfo.InvariantCulture))));
            root.Add(new XElement(ns + "trk", new XElement(ns + "name", sector.Name), new XElement(ns + "trkseg", points)));
        }
        return Results.Text(new XDocument(new XDeclaration("1.0", "utf-8", "yes"), root).ToString(), "application/gpx+xml");
    }

    private static async Task<IResult> ExportSectorsGarminGpxAsync(Guid investigationId, [FromQuery] Guid[]? sectorIds, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        var query = db.Sectors.AsNoTracking().Where(x => x.InvestigationId == investigationId);
        if (sectorIds is { Length: > 0 }) query = query.Where(x => sectorIds.Contains(x.Id));
        var sectors = await query.OrderBy(x => x.Priority).ToListAsync(ct);
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

    private static async Task<IResult> ExportTracksGeoJsonAsync(Guid investigationId, [FromQuery] Guid[]? trackIds, [FromQuery] Guid[]? sectorIds, [FromQuery(Name = "from")] DateTimeOffset? fromDate, [FromQuery(Name = "to")] DateTimeOffset? toDate, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        if (fromDate > toDate) return Results.BadRequest("Exportens starttid måste vara före sluttiden.");
        var query = db.Tracks.AsNoTracking().Where(x => x.InvestigationId == investigationId);
        query = ApplyTrackFilter(query, trackIds, fromDate, toDate);
        var tracks = await query.ToListAsync(ct);
        tracks = await FilterTracksBySectorsAsync(investigationId, tracks, sectorIds, db, ct);
        var features = tracks.Select(track => new { type = "Feature", id = track.Id, properties = new { track.Callsign, track.SourceFile, track.AssignedGroup, track.SectorId, track.Notes, track.StartedAt, track.EndedAt, track.Pod }, geometry = new { type = "LineString", coordinates = track.Geometry.Coordinates.Select(c => new[] { c.X, c.Y }).ToArray() } });
        return Results.Json(new { type = "FeatureCollection", features });
    }

    private static async Task<IResult> ExportTracksGpxAsync(Guid investigationId, [FromQuery] Guid[]? trackIds, [FromQuery] Guid[]? sectorIds, [FromQuery(Name = "from")] DateTimeOffset? fromDate, [FromQuery(Name = "to")] DateTimeOffset? toDate, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        if (fromDate > toDate) return Results.BadRequest("Exportens starttid måste vara före sluttiden.");
        var query = db.Tracks.AsNoTracking().Where(x => x.InvestigationId == investigationId);
        query = ApplyTrackFilter(query, trackIds, fromDate, toDate);
        var tracks = await query.ToListAsync(ct);
        tracks = await FilterTracksBySectorsAsync(investigationId, tracks, sectorIds, db, ct);
        var root = new XElement(XName.Get("gpx", "http://www.topografix.com/GPX/1/1"), new XAttribute("version", "1.1"), new XAttribute("creator", "EFP"));
        foreach (var track in tracks)
        {
            var trk = new XElement(root.Name.Namespace + "trk", new XElement(root.Name.Namespace + "name", track.Callsign), new XElement(root.Name.Namespace + "trkseg", track.Geometry.Coordinates.Select(coordinate => new XElement(root.Name.Namespace + "trkpt", new XAttribute("lat", coordinate.Y.ToString(CultureInfo.InvariantCulture)), new XAttribute("lon", coordinate.X.ToString(CultureInfo.InvariantCulture))))));
            root.Add(trk);
        }
        return Results.Text(new XDocument(new XDeclaration("1.0", "utf-8", "yes"), root).ToString(), "application/gpx+xml");
    }

    private static async Task<List<Track>> FilterTracksBySectorsAsync(Guid investigationId, List<Track> tracks, Guid[]? sectorIds, EfpDbContext db, CancellationToken ct)
    {
        if (sectorIds is not { Length: > 0 }) return tracks;
        var sectorGeometries = await db.Sectors.AsNoTracking()
            .Where(x => x.InvestigationId == investigationId && sectorIds.Contains(x.Id))
            .Select(x => x.Geometry)
            .ToListAsync(ct);
        if (sectorGeometries.Count == 0) return [];
        return tracks.Where(track => sectorGeometries.Any(sector => track.Geometry.Intersects(sector))).ToList();
    }

    private static IQueryable<Track> ApplyTrackFilter(IQueryable<Track> query, Guid[]? trackIds, DateTimeOffset? fromDate, DateTimeOffset? toDate)
    {
        if (trackIds is { Length: > 0 }) query = query.Where(x => trackIds.Contains(x.Id));
        if (fromDate.HasValue) query = query.Where(x => x.StartedAt.HasValue && (x.EndedAt == null || x.EndedAt >= fromDate));
        if (toDate.HasValue) query = query.Where(x => x.StartedAt.HasValue && x.StartedAt <= toDate);
        return query;
    }

    private static double Parse(string? value) => double.Parse(value ?? throw new FormatException("Missing coordinate."), CultureInfo.InvariantCulture);

    private static object ToGeoJsonGeometry(Geometry geometry) => geometry.GeometryType == "Polygon"
        ? new { type = "Polygon", coordinates = new[] { geometry.Coordinates.Select(c => new[] { c.X, c.Y }).ToArray() } }
        : new { type = "LineString", coordinates = geometry.Coordinates.Select(c => new[] { c.X, c.Y }).ToArray() };
}

public sealed record TrackMetadataRequest(double? Pod = null);
