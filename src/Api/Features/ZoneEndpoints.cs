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
            if (request.Geometry is null || request.Geometry.Coordinates.Length < 3) return Results.ValidationProblem(new Dictionary<string, string[]> { ["geometry"] = ["A polygon needs at least three coordinates."] });
            var polygon = ToPolygon(request.Geometry);
            if (!polygon.IsValid) return Results.ValidationProblem(new Dictionary<string, string[]> { ["geometry"] = ["The polygon is invalid."] });
            var zone = new Zone { InvestigationId = investigationId, Name = request.Name.Trim(), Instructions = request.Instructions, Status = request.Status, SearchMethod = request.SearchMethod, Priority = request.Priority, AssignedGroup = request.AssignedGroup, Searched = request.Searched, SearchedAt = request.SearchedAt, Points = request.Points, ShowName = request.ShowName, ShowArea = request.ShowArea, Geometry = polygon };
            db.Zones.Add(zone); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/investigations/{investigationId}/zones/{zone.Id}", ToResponse(zone));
        });
        group.MapPut("/{zoneId:guid}", async (Guid investigationId, Guid zoneId, ZoneRequest request, EfpDbContext db, CancellationToken ct) =>
        {
            var zone = await db.Zones.FirstOrDefaultAsync(x => x.Id == zoneId && x.InvestigationId == investigationId, ct);
            if (zone is null) return Results.NotFound();
            zone.Name = request.Name.Trim(); zone.Instructions = request.Instructions; zone.Status = request.Status; zone.SearchMethod = request.SearchMethod; zone.Priority = request.Priority; zone.AssignedGroup = request.AssignedGroup; zone.Searched = request.Searched; zone.SearchedAt = request.SearchedAt; zone.Points = request.Points; zone.ShowName = request.ShowName; zone.ShowArea = request.ShowArea; zone.Geometry = ToPolygon(request.Geometry); zone.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct); return Results.Ok(ToResponse(zone));
        });
        group.MapDelete("/{zoneId:guid}", async (Guid investigationId, Guid zoneId, EfpDbContext db, CancellationToken ct) =>
        {
            var zone = await db.Zones.FirstOrDefaultAsync(x => x.Id == zoneId && x.InvestigationId == investigationId, ct);
            if (zone is null) return Results.NotFound();
            zone.IsDeleted = true;
            zone.DeletedAt = DateTimeOffset.UtcNow;
            zone.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct); return Results.NoContent();
        });
        return endpoints;
    }

    private static Polygon ToPolygon(GeoJsonPolygon geometry)
    {
        var factory = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326);
        var points = geometry.Coordinates.Select(c => new Coordinate(c[0], c[1])).ToArray();
        if (!points.First().Equals2D(points.Last())) points = [.. points, points[0]];
        return factory.CreatePolygon(factory.CreateLinearRing(points));
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
        AreaKm2 = CalculateAreaKm2(zone.Geometry),
        zone.UpdatedAt,
        Geometry = new
        {
            Type = "Polygon",
            Coordinates = zone.Geometry.ExteriorRing.Coordinates.Select(coordinate => new[] { coordinate.X, coordinate.Y }).ToArray(),
        },
    };

    private static double CalculateAreaKm2(Polygon polygon)
    {
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

public sealed record ZoneRequest(string Name, string? Instructions, ZoneStatus Status, SearchMethod SearchMethod, int Priority, string? AssignedGroup, GeoJsonPolygon Geometry, bool Searched = false, DateTimeOffset? SearchedAt = null, int Points = 0, bool ShowName = false, bool ShowArea = false);
public sealed record GeoJsonPolygon(double[][] Coordinates);
