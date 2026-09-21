using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite;
using NetTopologySuite.Geometries;

namespace Efp.Api.Features;

public static class ReferencePointEndpoints
{
    public static IEndpointRouteBuilder MapReferencePointEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/investigations/{investigationId:guid}/reference-points");
        group.MapGet("", async (Guid investigationId, EfpDbContext db, CancellationToken ct) =>
            Results.Ok((await db.ReferencePoints.AsNoTracking().Where(x => x.InvestigationId == investigationId).ToListAsync(ct)).Select(ToResponse)));
        group.MapPost("", async (Guid investigationId, ReferencePointRequest request, EfpDbContext db, CancellationToken ct) =>
        {
            if (!await db.Investigations.AnyAsync(x => x.Id == investigationId, ct)) return Results.NotFound("Investigation not found.");
            if (request.Longitude is < -180 or > 180 || request.Latitude is < -90 or > 90) return Results.ValidationProblem(new Dictionary<string, string[]> { ["coordinates"] = ["Coordinates are invalid."] });
            var point = new ReferencePoint { InvestigationId = investigationId, Type = request.Type, Label = request.Label.Trim(), Geometry = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326).CreatePoint(new Coordinate(request.Longitude, request.Latitude)) };
            db.ReferencePoints.Add(point); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/investigations/{investigationId}/reference-points/{point.Id}", ToResponse(point));
        });
        return endpoints;
    }

    private static ReferencePointResponse ToResponse(ReferencePoint point) => new(
        point.Id,
        point.InvestigationId,
        point.Type,
        point.Label,
        point.Geometry.X,
        point.Geometry.Y);
}

public sealed record ReferencePointRequest(ReferencePointType Type, string Label, double Longitude, double Latitude);
public sealed record ReferencePointResponse(Guid Id, Guid InvestigationId, ReferencePointType Type, string Label, double Longitude, double Latitude);
