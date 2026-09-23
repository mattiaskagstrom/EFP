using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Efp.Api.Features;

public static class InvestigationAccessEndpoints
{
    public static IEndpointRouteBuilder MapInvestigationAccessEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/investigations/{investigationId:guid}").RequireAuthorization("Admin");
        group.MapPost("/access-code/rotate", RotateCodeAsync);
        group.MapGet("/admins", ListAdminsAsync);
        group.MapPost("/admins", AddAdminAsync);
        group.MapDelete("/admins/{adminId:guid}", RemoveAdminAsync);

        var sessions = endpoints.MapGroup("/api/v1/admin/user-sessions").RequireAuthorization("Superadmin");
        sessions.MapGet("", ListSessionsAsync);
        sessions.MapDelete("/{sessionId:guid}", RevokeSessionAsync);
        var users = endpoints.MapGroup("/api/v1/admin/users").RequireAuthorization("Superadmin");
        users.MapGet("", ListUsersAsync);
        users.MapPatch("/{userId:guid}", SetUserActiveAsync);
        endpoints.MapGet("/api/v1/admin/system", GetSystemOverviewAsync).RequireAuthorization("Superadmin");
        return endpoints;
    }

    private static async Task<IResult> RotateCodeAsync(Guid investigationId, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await CanManageAsync(investigationId, http, db, ct)) return Results.Forbid();
        var investigation = await db.Investigations.FirstAsync(x => x.Id == investigationId, ct);
        var code = AuthenticationEndpoints.GenerateAccessCode();
        investigation.AccessCodeHash = AuthenticationEndpoints.HashAccessCode(code);
        investigation.AccessCodeVersion++;
        investigation.AccessCodeUpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { code, version = investigation.AccessCodeVersion });
    }

    private static async Task<IResult> ListAdminsAsync(Guid investigationId, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await CanManageAsync(investigationId, http, db, ct)) return Results.Forbid();
        var admins = await db.InvestigationAdmins.AsNoTracking().Where(x => x.InvestigationId == investigationId).Include(x => x.Admin).Select(x => new { id = x.AdminId, username = x.Admin!.UserName, x.IsOwner, x.CreatedAt }).ToListAsync(ct);
        return Results.Ok(admins);
    }

    private static async Task<IResult> AddAdminAsync(Guid investigationId, AddInvestigationAdminRequest request, EfpDbContext db, UserManager<ApplicationUser> users, HttpContext http, CancellationToken ct)
    {
        if (!await CanManageAsync(investigationId, http, db, ct)) return Results.Forbid();
        var admin = await users.FindByNameAsync(request.Username.Trim());
        if (admin is null || !await users.IsInRoleAsync(admin, "Admin")) return Results.NotFound("Admin-kontot kunde inte hittas.");
        if (!await db.InvestigationAdmins.AnyAsync(x => x.InvestigationId == investigationId && x.AdminId == admin.Id, ct))
            db.InvestigationAdmins.Add(new InvestigationAdmin { InvestigationId = investigationId, AdminId = admin.Id });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { id = admin.Id, username = admin.UserName });
    }

    private static async Task<IResult> RemoveAdminAsync(Guid investigationId, Guid adminId, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await CanManageAsync(investigationId, http, db, ct)) return Results.Forbid();
        var membership = await db.InvestigationAdmins.FirstOrDefaultAsync(x => x.InvestigationId == investigationId && x.AdminId == adminId, ct);
        if (membership is null) return Results.NotFound();
        if (membership.IsOwner) return Results.Conflict("Insatsens ägare kan inte tas bort.");
        db.InvestigationAdmins.Remove(membership); await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> ListSessionsAsync(string? callsign, Guid? investigationId, EfpDbContext db, CancellationToken ct)
    {
        var query = db.UserSessions.AsNoTracking().Where(x => x.RevokedAt == null);
        if (investigationId.HasValue) query = query.Where(x => x.InvestigationId == investigationId);
        if (!string.IsNullOrWhiteSpace(callsign)) query = query.Where(x => x.Callsign == callsign.Trim());
        return Results.Ok(await query.OrderByDescending(x => x.LastSeenAt).Select(x => new { x.Id, x.InvestigationId, x.Callsign, x.CreatedAt, x.LastSeenAt, x.RevokedAt, x.AccessCodeVersion }).ToListAsync(ct));
    }

    private static async Task<IResult> RevokeSessionAsync(Guid sessionId, EfpDbContext db, CancellationToken ct)
    {
        var session = await db.UserSessions.FirstOrDefaultAsync(x => x.Id == sessionId, ct);
        if (session is null) return Results.NotFound();
        session.RevokedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> ListUsersAsync(UserManager<ApplicationUser> users)
    {
        var accounts = await users.Users.AsNoTracking().OrderBy(x => x.UserName)
            .Select(x => new { x.Id, x.UserName, x.IsActive, x.CreatedAt }).ToListAsync();
        var result = new List<object>(accounts.Count);
        foreach (var account in accounts)
            result.Add(new { account.Id, account.UserName, account.IsActive, account.CreatedAt, IsSuperadmin = await users.IsInRoleAsync(new ApplicationUser { Id = account.Id }, "Superadmin") });
        return Results.Ok(result);
    }

    private static async Task<IResult> SetUserActiveAsync(Guid userId, SetUserActiveRequest request, UserManager<ApplicationUser> users, CancellationToken ct)
    {
        var user = await users.FindByIdAsync(userId.ToString());
        if (user is null) return Results.NotFound();
        if (await users.IsInRoleAsync(user, "Superadmin")) return Results.Conflict("Superadmin-kontot hanteras via bootstrap.");
        user.IsActive = request.IsActive;
        await users.UpdateAsync(user);
        return Results.Ok(new { user.Id, user.UserName, user.IsActive });
    }

    private static async Task<IResult> GetSystemOverviewAsync(EfpDbContext db, IConfiguration configuration, IWebHostEnvironment environment, CancellationToken ct)
    {
        var statistics = new
        {
            investigations = await db.Investigations.CountAsync(ct),
            activeInvestigations = await db.Investigations.CountAsync(x => x.Status == InvestigationStatus.Active, ct),
            sectors = await db.Sectors.CountAsync(ct),
            tracks = await db.Tracks.CountAsync(ct),
            referencePoints = await db.ReferencePoints.CountAsync(ct),
            activeUserSessions = await db.UserSessions.CountAsync(x => x.RevokedAt == null, ct),
            administrators = await db.Users.CountAsync(ct),
        };
        var parameters = new
        {
            apiVersion = "v1",
            environment = environment.EnvironmentName,
            databaseProvider = "PostgreSQL/PostGIS",
            authentication = "ASP.NET Identity + HttpOnly cookie / bearer user sessions",
            userSessionExpiration = "none (manual revocation or access-code rotation)",
            publicUserAccess = "planned and active public investigations",
            configuration = new
            {
                superadminBootstrapConfigured = !string.IsNullOrWhiteSpace(configuration["Superadmin:Username"]),
                allowedFrontendOrigin = "http://localhost:5173 (development)"
            }
        };
        return Results.Ok(new { statistics, parameters, generatedAt = DateTimeOffset.UtcNow });
    }

    internal static async Task<bool> CanManageAsync(Guid investigationId, HttpContext http, EfpDbContext db, CancellationToken ct)
    {
        if (http.User.IsInRole("Superadmin")) return true;
        var userId = http.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userId, out var id) && await db.InvestigationAdmins.AnyAsync(x => x.InvestigationId == investigationId && x.AdminId == id, ct);
    }

    internal static async Task<bool> CanAccessAsync(Guid investigationId, HttpContext http, EfpDbContext db, CancellationToken ct)
    {
        if (await CanManageAsync(investigationId, http, db, ct)) return true;
        var session = await UserSessionService.FindAsync(http, db, ct);
        return session?.InvestigationId == investigationId;
    }
}

public sealed record AddInvestigationAdminRequest(string Username);
public sealed record SetUserActiveRequest(bool IsActive);
