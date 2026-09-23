using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite;
using NetTopologySuite.Geometries;

namespace Efp.Api.Features;

public static class SectorEndpoints
{
    public static IEndpointRouteBuilder MapSectorEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/investigations/{investigationId:guid}/sectors");
        group.MapGet("", async (Guid investigationId, EfpDbContext db, HttpContext http, CancellationToken ct) =>
        {
            var session = await UserSessionService.FindAsync(http, db, ct);
            if (!http.User.IsInRole("Admin") && !http.User.IsInRole("Superadmin") && session?.InvestigationId != investigationId) return Results.Unauthorized();
            var sectors = await db.Sectors.AsNoTracking().Where(x => x.InvestigationId == investigationId).OrderBy(x => x.Priority).ToListAsync(ct);
            return Results.Ok(sectors.Select(ToResponse));
        });
        group.MapPost("", async (Guid investigationId, SectorRequest request, EfpDbContext db, CancellationToken ct) =>
        {
            if (!await db.Investigations.AnyAsync(x => x.Id == investigationId, ct)) return Results.NotFound("Investigation not found.");
            if (request.Geometry is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["geometry"] = ["Geometry is required."] });
            if (request.Poa is < 0 or > 100) return Results.ValidationProblem(new Dictionary<string, string[]> { ["poa"] = ["POA måste vara mellan 0 och 100."] });
            if (!TryCreateGeometry(request.Geometry, out var geometry, out var error)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["geometry"] = [error] });
            var sector = new Sector { InvestigationId = investigationId, Name = request.Name.Trim(), Instructions = request.Instructions, Status = request.Status, SearchMethod = request.SearchMethod, Priority = request.Priority, AssignedGroup = request.AssignedGroup, Searched = request.Searched, SearchedAt = request.SearchedAt, Points = request.Points, ShowName = request.ShowName, ShowArea = request.ShowArea, Poa = request.Poa, Geometry = geometry };
            db.Sectors.Add(sector); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/investigations/{investigationId}/sectors/{sector.Id}", ToResponse(sector));
        }).RequireAuthorization("Admin");
        group.MapPut("/{sectorId:guid}", async (Guid investigationId, Guid sectorId, SectorRequest request, EfpDbContext db, CancellationToken ct) =>
        {
            var sector = await db.Sectors.FirstOrDefaultAsync(x => x.Id == sectorId && x.InvestigationId == investigationId, ct);
            if (sector is null) return Results.NotFound();
            if (request.Poa is < 0 or > 100) return Results.ValidationProblem(new Dictionary<string, string[]> { ["poa"] = ["POA måste vara mellan 0 och 100."] });
            if (!TryCreateGeometry(request.Geometry, out var geometry, out var error)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["geometry"] = [error] });
            sector.Name = request.Name.Trim(); sector.Instructions = request.Instructions; sector.Status = request.Status; sector.SearchMethod = request.SearchMethod; sector.Priority = request.Priority; sector.AssignedGroup = request.AssignedGroup; sector.Searched = request.Searched; sector.SearchedAt = request.SearchedAt; sector.Points = request.Points; sector.ShowName = request.ShowName; sector.ShowArea = request.ShowArea; sector.Poa = request.Poa; sector.Geometry = geometry; sector.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct); return Results.Ok(ToResponse(sector));
        }).RequireAuthorization("Admin");
        group.MapDelete("/{sectorId:guid}", async (Guid investigationId, Guid sectorId, EfpDbContext db, CancellationToken ct) =>
        {
            var sector = await db.Sectors.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == sectorId && x.InvestigationId == investigationId, ct);
            if (sector is null) return Results.NotFound();
            if (sector.IsDeleted) return Results.NoContent();
            sector.IsDeleted = true;
            sector.DeletedAt = DateTimeOffset.UtcNow;
            sector.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct); return Results.NoContent();
        }).RequireAuthorization("Admin");
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

    private static object ToResponse(Sector sector) => new
    {
        sector.Id,
        sector.InvestigationId,
        sector.Name,
        sector.Instructions,
        sector.Status,
        sector.SearchMethod,
        sector.Priority,
        sector.AssignedGroup,
        sector.Searched,
        sector.SearchedAt,
        sector.Points,
        sector.ShowName,
        sector.ShowArea,
        sector.Poa,
        AreaKm2 = CalculateSize(sector.Geometry),
        sector.UpdatedAt,
        Geometry = new
        {
            Type = sector.Geometry.GeometryType,
            Coordinates = sector.Geometry.Coordinates.Select(coordinate => new[] { coordinate.X, coordinate.Y }).ToArray(),
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

public sealed record SectorRequest(string Name, string? Instructions, SectorStatus Status, SearchMethod SearchMethod, int Priority, string? AssignedGroup, GeoJsonGeometry Geometry, bool Searched = false, DateTimeOffset? SearchedAt = null, int Points = 0, bool ShowName = false, bool ShowArea = false, double? Poa = null);
public sealed record GeoJsonGeometry(double[][] Coordinates, string? Type = null);
