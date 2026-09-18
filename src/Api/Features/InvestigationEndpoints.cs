using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Efp.Api.Features;

public static class InvestigationEndpoints
{
    public static IEndpointRouteBuilder MapInvestigationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/investigations");
        group.MapGet("", async (EfpDbContext db, CancellationToken ct) => Results.Ok(await db.Investigations.AsNoTracking().OrderByDescending(x => x.UpdatedAt).ToListAsync(ct)));
        group.MapGet("/{id:guid}", async (Guid id, EfpDbContext db, CancellationToken ct) =>
        {
            var item = await db.Investigations.AsNoTracking().Include(x => x.Zones).Include(x => x.ReferencePoints).FirstOrDefaultAsync(x => x.Id == id, ct);
            return item is null ? Results.NotFound() : Results.Ok(item);
        });
        group.MapPost("", async (CreateInvestigationRequest request, EfpDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name is required."] });
            var item = new Investigation { Name = request.Name.Trim(), Description = request.Description };
            db.Investigations.Add(item); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/investigations/{item.Id}", item);
        });
        group.MapPatch("/{id:guid}", async (Guid id, UpdateInvestigationRequest request, EfpDbContext db, CancellationToken ct) =>
        {
            var item = await db.Investigations.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            if (request.Name is not null) item.Name = request.Name.Trim();
            if (request.Description is not null) item.Description = request.Description;
            if (request.Status is not null) item.Status = request.Status.Value;
            item.UpdatedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(ct);
            return Results.Ok(item);
        });
        return endpoints;
    }
}

public sealed record CreateInvestigationRequest(string Name, string? Description);
public sealed record UpdateInvestigationRequest(string? Name, string? Description, InvestigationStatus? Status);
