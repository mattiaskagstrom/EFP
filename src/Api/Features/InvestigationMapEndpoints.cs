using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Efp.Api.Features;

public static class InvestigationMapEndpoints
{
    private static readonly HashSet<string> AllowedContentTypes = ["image/png", "image/jpeg"];

    public static IEndpointRouteBuilder MapInvestigationMapEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/investigations/{investigationId:guid}/maps");
        group.MapGet("", ListAsync);
        group.MapPost("", UploadAsync).DisableAntiforgery();
        group.MapGet("/{mapId:guid}/image", ImageAsync);
        group.MapDelete("/{mapId:guid}", DeleteAsync);
        return endpoints;
    }

    private static async Task<IResult> ListAsync(Guid investigationId, EfpDbContext db, CancellationToken ct)
    {
        if (!await db.Investigations.AnyAsync(item => item.Id == investigationId, ct)) return Results.NotFound("Investigation not found.");
        var maps = await db.InvestigationMaps.AsNoTracking().Where(item => item.InvestigationId == investigationId).OrderBy(item => item.CreatedAt).Select(item => new { item.Id, item.Name, item.ContentType, item.West, item.South, item.East, item.North, ImageUrl = $"/api/v1/investigations/{item.InvestigationId}/maps/{item.Id}/image", item.CreatedAt }).ToListAsync(ct);
        return Results.Ok(maps);
    }

    private static async Task<IResult> UploadAsync(Guid investigationId, IFormFile file, double west, double south, double east, double north, EfpDbContext db, CancellationToken ct)
    {
        if (!await db.Investigations.AnyAsync(item => item.Id == investigationId, ct)) return Results.NotFound("Investigation not found.");
        if (file.Length is <= 0 or > 50 * 1024 * 1024) return Results.BadRequest("Kartbilden måste vara mellan 1 byte och 50 MB.");
        if (!AllowedContentTypes.Contains(file.ContentType.ToLowerInvariant())) return Results.BadRequest("Kartbilden måste vara PNG eller JPEG.");
        if (!IsBoundsValid(west, south, east, north)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["bounds"] = ["Ange giltiga koordinater: väst < öst och syd < nord."] });

        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream, ct);
        var map = new InvestigationMap { InvestigationId = investigationId, Name = Path.GetFileName(file.FileName), ContentType = file.ContentType.ToLowerInvariant(), Data = stream.ToArray(), West = west, South = south, East = east, North = north };
        db.InvestigationMaps.Add(map);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/investigations/{investigationId}/maps/{map.Id}", ToResponse(map));
    }

    private static async Task<IResult> ImageAsync(Guid investigationId, Guid mapId, EfpDbContext db, CancellationToken ct)
    {
        var map = await db.InvestigationMaps.AsNoTracking().FirstOrDefaultAsync(item => item.Id == mapId && item.InvestigationId == investigationId, ct);
        return map is null ? Results.NotFound() : Results.File(map.Data, map.ContentType, enableRangeProcessing: true);
    }

    private static async Task<IResult> DeleteAsync(Guid investigationId, Guid mapId, EfpDbContext db, CancellationToken ct)
    {
        var map = await db.InvestigationMaps.FirstOrDefaultAsync(item => item.Id == mapId && item.InvestigationId == investigationId, ct);
        if (map is null) return Results.NotFound();
        db.InvestigationMaps.Remove(map);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static bool IsBoundsValid(double west, double south, double east, double north) =>
        double.IsFinite(west) && double.IsFinite(south) && double.IsFinite(east) && double.IsFinite(north) &&
        west >= -180 && east <= 180 && south >= -90 && north <= 90 && west < east && south < north;

    private static object ToResponse(InvestigationMap map) => new { map.Id, map.Name, map.ContentType, map.West, map.South, map.East, map.North, ImageUrl = $"/api/v1/investigations/{map.InvestigationId}/maps/{map.Id}/image", map.CreatedAt };
}
