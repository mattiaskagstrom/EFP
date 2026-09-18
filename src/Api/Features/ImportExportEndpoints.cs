using System.Globalization;
using System.Xml.Linq;
using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite;
using NetTopologySuite.Geometries;

namespace Efp.Api.Features;

public static class ImportExportEndpoints
{
    public static IEndpointRouteBuilder MapImportExportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/investigations/{investigationId:guid}");
        group.MapPost("/tracks/import", ImportGpxAsync).DisableAntiforgery();
        group.MapGet("/zones.geojson", ExportZonesGeoJsonAsync);
        group.MapGet("/tracks.geojson", ExportTracksGeoJsonAsync);
        group.MapGet("/tracks.gpx", ExportTracksGpxAsync);
        return endpoints;
    }

    private static async Task<IResult> ImportGpxAsync(Guid investigationId, IFormFile file, string callsign, EfpDbContext db, CancellationToken ct)
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

    private static async Task<IResult> ExportZonesGeoJsonAsync(Guid investigationId, EfpDbContext db, CancellationToken ct)
    {
        var zones = await db.Zones.AsNoTracking().Where(x => x.InvestigationId == investigationId).ToListAsync(ct);
        var features = zones.Select(zone => new { type = "Feature", id = zone.Id, properties = new { zone.Name, zone.Status, zone.SearchMethod, zone.Priority, zone.AssignedGroup }, geometry = new { type = "Polygon", coordinates = new[] { zone.Geometry.ExteriorRing.Coordinates.Select(c => new[] { c.X, c.Y }).ToArray() } } });
        return Results.Json(new { type = "FeatureCollection", features });
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
