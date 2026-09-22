using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite;
using NetTopologySuite.Geometries;

namespace Efp.Api.Features;

public static class ZoneEndpoints
{
    public static IEndpointRouteBuilder MapZoneEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/investigations/{investigationId:guid}/zones");
        group.MapGet("", async (Guid investigationId, EfpDbContext db, CancellationToken ct) =>
        {
            var zones = await db.Zones.AsNoTracking().Where(x => x.InvestigationId == investigationId).OrderBy(x => x.Priority).ToListAsync(ct);
            return Results.Ok(zones.Select(ToResponse));
        });
        group.MapPost("", async (Guid investigationId, ZoneRequest request, EfpDbContext db, CancellationToken ct) =>
        {
            if (!await db.Investigations.AnyAsync(x => x.Id == investigationId, ct)) return Results.NotFound("Investigation not found.");
            if (request.Geometry is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["geometry"] = ["Geometry is required."] });
            if (request.Poa is < 0 or > 100) return Results.ValidationProblem(new Dictionary<string, string[]> { ["poa"] = ["POA måste vara mellan 0 och 100."] });
            if (!TryCreateGeometry(request.Geometry, out var geometry, out var error)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["geometry"] = [error] });
            var zone = new Zone { InvestigationId = investigationId, Name = request.Name.Trim(), Instructions = request.Instructions, Status = request.Status, SearchMethod = request.SearchMethod, Priority = request.Priority, AssignedGroup = request.AssignedGroup, Searched = request.Searched, SearchedAt = request.SearchedAt, Points = request.Points, ShowName = request.ShowName, ShowArea = request.ShowArea, Poa = request.Poa, Geometry = geometry };
            db.Zones.Add(zone); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/investigations/{investigationId}/zones/{zone.Id}", ToResponse(zone));
        });
        group.MapPut("/{zoneId:guid}", async (Guid investigationId, Guid zoneId, ZoneRequest request, EfpDbContext db, CancellationToken ct) =>
        {
            var zone = await db.Zones.FirstOrDefaultAsync(x => x.Id == zoneId && x.InvestigationId == investigationId, ct);
            if (zone is null) return Results.NotFound();
            if (request.Poa is < 0 or > 100) return Results.ValidationProblem(new Dictionary<string, string[]> { ["poa"] = ["POA måste vara mellan 0 och 100."] });
            if (!TryCreateGeometry(request.Geometry, out var geometry, out var error)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["geometry"] = [error] });
            zone.Name = request.Name.Trim(); zone.Instructions = request.Instructions; zone.Status = request.Status; zone.SearchMethod = request.SearchMethod; zone.Priority = request.Priority; zone.AssignedGroup = request.AssignedGroup; zone.Searched = request.Searched; zone.SearchedAt = request.SearchedAt; zone.Points = request.Points; zone.ShowName = request.ShowName; zone.ShowArea = request.ShowArea; zone.Poa = request.Poa; zone.Geometry = geometry; zone.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct); return Results.Ok(ToResponse(zone));
        });
        group.MapDelete("/{zoneId:guid}", async (Guid investigationId, Guid zoneId, EfpDbContext db, CancellationToken ct) =>
        {
            var zone = await db.Zones.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == zoneId && x.InvestigationId == investigationId, ct);
            if (zone is null) return Results.NotFound();
            if (zone.IsDeleted) return Results.NoContent();
            zone.IsDeleted = true;
            zone.DeletedAt = DateTimeOffset.UtcNow;
            zone.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct); return Results.NoContent();
        });
        return endpoints;
    }

    private static bool TryCreateGeometry(GeoJsonGeometry input, out Geometry geometry, out string error)
    {
        var factory = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326);
        var points = input.Coordinates.Select(c => new Coordinate(c[0], c[1])).ToArray();
        if (string.Equals(input.Type, "LineString", StringComparison.OrdinalIgnoreCase) || (string.IsNullOrWhiteSpace(input.Type) && points.Length == 2))
        {
            geometry = factory.CreateLineString(points);
            error = points.Length >= 2 && geometry.IsValid ? string.Empty : "A line needs at least two valid coordinates.";
            return error.Length == 0;
        }
        var uniquePoints = new List<Coordinate>();
        foreach (var point in points)
        {
            if (!uniquePoints.Any(existing => existing.Equals2D(point))) uniquePoints.Add(point);
        }
        points = uniquePoints.ToArray();
        if (points.Length < 3) { geometry = factory.CreatePolygon(); error = "A polygon needs at least three coordinates."; return false; }
        if (!points.First().Equals2D(points.Last())) points = [.. points, points[0]];
        var polygon = factory.CreatePolygon(factory.CreateLinearRing(points));
        geometry = polygon; error = polygon.IsValid ? string.Empty : "The polygon is invalid.";
        return error.Length == 0;
    }

    private static object ToResponse(Zone zone) => new
    {
        zone.Id,
        zone.InvestigationId,
        zone.Name,
        zone.Instructions,
        zone.Status,
        zone.SearchMethod,
        zone.Priority,
        zone.AssignedGroup,
        zone.Searched,
        zone.SearchedAt,
        zone.Points,
        zone.ShowName,
        zone.ShowArea,
        zone.Poa,
        AreaKm2 = CalculateSize(zone.Geometry),
        zone.UpdatedAt,
        Geometry = new
        {
            Type = zone.Geometry.GeometryType,
            Coordinates = zone.Geometry.Coordinates.Select(coordinate => new[] { coordinate.X, coordinate.Y }).ToArray(),
        },
    };

    private static double CalculateSize(Geometry geometry)
    {
        if (geometry is LineString line) return Math.Round(line.Length * 111_320 / 1000, 3);
        if (geometry is not Polygon polygon) return 0;
        var coordinates = polygon.ExteriorRing.Coordinates;
        if (coordinates.Length < 4) return 0;
        var latitude = coordinates.Average(coordinate => coordinate.Y) * Math.PI / 180;
        const double kmPerDegree = 111.32;
        var area = 0d;
        for (var index = 0; index < coordinates.Length - 1; index++)
        {
            var current = coordinates[index];
            var next = coordinates[index + 1];
            var currentX = current.X * kmPerDegree * Math.Cos(latitude);
            var currentY = current.Y * kmPerDegree;
            var nextX = next.X * kmPerDegree * Math.Cos(latitude);
            var nextY = next.Y * kmPerDegree;
            area += currentX * nextY - nextX * currentY;
        }
        return Math.Round(Math.Abs(area) / 2, 3);
    }
}

public sealed record ZoneRequest(string Name, string? Instructions, ZoneStatus Status, SearchMethod SearchMethod, int Priority, string? AssignedGroup, GeoJsonGeometry Geometry, bool Searched = false, DateTimeOffset? SearchedAt = null, int Points = 0, bool ShowName = false, bool ShowArea = false, double? Poa = null);
public sealed record GeoJsonGeometry(double[][] Coordinates, string? Type = null);
