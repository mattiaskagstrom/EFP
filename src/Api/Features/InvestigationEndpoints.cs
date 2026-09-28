using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Efp.Api.Features;

public static class InvestigationEndpoints
{
    public static IEndpointRouteBuilder MapInvestigationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/investigations");
        group.MapGet("", async (EfpDbContext db, HttpContext http, CancellationToken ct) =>
        {
            IQueryable<Investigation> query = db.Investigations.AsNoTracking();
            if (http.User.IsInRole("Superadmin")) return Results.Ok(await query.OrderByDescending(x => x.UpdatedAt).ToListAsync(ct));
            var userId = http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(userId, out var adminId)) query = query.Where(x => x.OwnerId == adminId || x.Admins.Any(member => member.AdminId == adminId));
            else query = query.Where(x => x.IsPublic && (x.Status == InvestigationStatus.Planned || x.Status == InvestigationStatus.Active));
            return Results.Ok(await query.OrderByDescending(x => x.UpdatedAt).ToListAsync(ct));
        });
        group.MapGet("/{id:guid}", async (Guid id, EfpDbContext db, HttpContext http, CancellationToken ct) =>
        {
            var item = await db.Investigations.AsNoTracking().Include(x => x.Sectors).Include(x => x.ReferencePoints).FirstOrDefaultAsync(x => x.Id == id, ct);
            if (item is null) return Results.NotFound();
            var hasInsatsAccess = await InvestigationAccessEndpoints.CanAccessAsync(id, http, db, ct);
            var isPubliclyVisible = item.IsPublic && item.Status is InvestigationStatus.Planned or InvestigationStatus.Active;
            return hasInsatsAccess || isPubliclyVisible ? Results.Ok(item) : Results.Unauthorized();
        });
        group.MapPost("", async (CreateInvestigationRequest request, EfpDbContext db, HttpContext http, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name)) return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Name is required."] });
            if (request.StartsAt.HasValue && request.EndsAt.HasValue && request.EndsAt < request.StartsAt)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["endsAt"] = ["Sluttiden måste vara efter starttiden."] });
            var item = new Investigation { Name = request.Name.Trim(), Description = request.Description, StartsAt = request.StartsAt, EndsAt = request.EndsAt, SearchConditions = request.SearchConditions, IsPublic = request.IsPublic };
            if (!item.IsPublic)
            {
                item.AccessCode = AuthenticationEndpoints.GenerateAccessCode();
                item.AccessCodeHash = AuthenticationEndpoints.HashAccessCode(item.AccessCode);
                item.AccessCodeUpdatedAt = DateTimeOffset.UtcNow;
            }
            var userId = http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(userId, out var ownerId)) { item.OwnerId = ownerId; item.Admins.Add(new InvestigationAdmin { AdminId = ownerId, IsOwner = true }); }
            db.Investigations.Add(item); await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/investigations/{item.Id}", item);
        }).RequireAuthorization("Admin");
        group.MapPatch("/{id:guid}", async (Guid id, UpdateInvestigationRequest request, EfpDbContext db, HttpContext http, CancellationToken ct) =>
        {
            if (!await InvestigationAccessEndpoints.CanManageAsync(id, http, db, ct)) return Results.Forbid();
            var item = await db.Investigations.FindAsync([id], ct);
            if (item is null) return Results.NotFound();
            if (request.Name is not null) item.Name = request.Name.Trim();
            if (request.Description is not null) item.Description = request.Description;
            if (request.StartsAt.HasValue) item.StartsAt = request.StartsAt;
            if (request.EndsAt.HasValue) item.EndsAt = request.EndsAt;
            if (request.SearchConditions is not null) item.SearchConditions = request.SearchConditions;
            if (request.Status is not null) item.Status = request.Status.Value;
            if (request.IsPublic.HasValue && request.IsPublic.Value != item.IsPublic)
            {
                item.IsPublic = request.IsPublic.Value;
                if (item.IsPublic)
                {
                    item.AccessCode = null;
                    item.AccessCodeHash = null;
                    item.AccessCodeUpdatedAt = null;
                }
                else if (string.IsNullOrWhiteSpace(item.AccessCode))
                {
                    item.AccessCode = AuthenticationEndpoints.GenerateAccessCode();
                    item.AccessCodeHash = AuthenticationEndpoints.HashAccessCode(item.AccessCode);
                    item.AccessCodeUpdatedAt = DateTimeOffset.UtcNow;
                }
            }
            if (item.StartsAt.HasValue && item.EndsAt.HasValue && item.EndsAt < item.StartsAt)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["endsAt"] = ["Sluttiden måste vara efter starttiden."] });
            item.UpdatedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(ct);
            return Results.Ok(item);
        }).RequireAuthorization("Admin");
        return endpoints;
    }
}

public sealed record CreateInvestigationRequest(string Name, string? Description, DateTimeOffset? StartsAt = null, DateTimeOffset? EndsAt = null, string? SearchConditions = null, bool IsPublic = true);
public sealed record UpdateInvestigationRequest(string? Name, string? Description, InvestigationStatus? Status, DateTimeOffset? StartsAt = null, DateTimeOffset? EndsAt = null, string? SearchConditions = null, bool? IsPublic = null);
