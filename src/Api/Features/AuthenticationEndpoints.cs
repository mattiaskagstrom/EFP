using System.Security.Cryptography;
using System.Text;
using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Efp.Api.Features;

public static class AuthenticationEndpoints
{
    internal const string CodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public static string GenerateAccessCode()
    {
        var bytes = RandomNumberGenerator.GetBytes(8);
        return new string(bytes.Select(value => CodeAlphabet[value % CodeAlphabet.Length]).ToArray());
    }

    public static string HashAccessCode(string code) => new PasswordHasher<ApplicationUser>().HashPassword(new ApplicationUser(), code.Trim().ToUpperInvariant());

    public static IEndpointRouteBuilder MapAuthenticationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var auth = endpoints.MapGroup("/api/v1/auth");
        var admin = auth.MapGroup("/admin");
        admin.MapPost("/register", RegisterAdminAsync).AllowAnonymous();
        admin.MapPost("/login", LoginAdminAsync).AllowAnonymous();
        admin.MapPost("/logout", LogoutAdminAsync).RequireAuthorization();
        admin.MapGet("/me", GetAdminAsync).RequireAuthorization();

        var user = auth.MapGroup("/user");
        user.MapPost("/connect", ConnectUserAsync).AllowAnonymous();
        user.MapGet("/session", GetUserSessionAsync).AllowAnonymous();
        user.MapPost("/disconnect", DisconnectUserAsync).AllowAnonymous();
        return endpoints;
    }

    private static async Task<IResult> RegisterAdminAsync(AdminRegisterRequest request, UserManager<ApplicationUser> users, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Trim().Length < 3)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["username"] = ["Användarnamnet måste vara minst tre tecken."] });
        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 10)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["password"] = ["Lösenordet måste vara minst tio tecken."] });

        var user = new ApplicationUser { UserName = request.Username.Trim(), IsActive = true };
        var result = await users.CreateAsync(user, request.Password);
        if (!result.Succeeded) return Results.ValidationProblem(result.Errors.GroupBy(x => x.Code).ToDictionary(x => x.Key, x => x.Select(error => error.Description).ToArray()));
        await users.AddToRoleAsync(user, "Admin");
        return Results.Created("/api/v1/auth/admin/me", new { user.Id, user.UserName, Role = "Admin" });
    }

    private static async Task<IResult> LoginAdminAsync(AdminLoginRequest request, SignInManager<ApplicationUser> signIn, UserManager<ApplicationUser> users, CancellationToken ct)
    {
        var user = await users.FindByNameAsync(request.Username.Trim());
        if (user is null || !user.IsActive) return Results.Unauthorized();
        var result = await signIn.PasswordSignInAsync(user, request.Password, isPersistent: true, lockoutOnFailure: true);
        return result.Succeeded ? Results.Ok(new { user.Id, user.UserName, Role = (await users.GetRolesAsync(user)).FirstOrDefault() ?? "Admin" }) : Results.Unauthorized();
    }

    private static async Task<IResult> LogoutAdminAsync(SignInManager<ApplicationUser> signIn)
    {
        await signIn.SignOutAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> GetAdminAsync(HttpContext http, UserManager<ApplicationUser> users)
    {
        var user = await users.GetUserAsync(http.User);
        if (user is null || !user.IsActive) return Results.Unauthorized();
        return Results.Ok(new { user.Id, user.UserName, Roles = await users.GetRolesAsync(user) });
    }

    private static async Task<IResult> ConnectUserAsync(UserConnectRequest request, EfpDbContext db, IPasswordHasher<ApplicationUser> hasher, CancellationToken ct)
    {
        if (request.InvestigationId == Guid.Empty || string.IsNullOrWhiteSpace(request.Callsign)) return Results.BadRequest("Insats och anropsnamn måste anges.");
        var investigation = await db.Investigations.FirstOrDefaultAsync(x => x.Id == request.InvestigationId, ct);
        if (investigation is null || investigation.Status is InvestigationStatus.Closed or InvestigationStatus.Archived) return Results.NotFound("Sökinsatsen är inte tillgänglig.");
        if (!investigation.IsPublic)
        {
            if (string.IsNullOrWhiteSpace(request.Code) || investigation.AccessCodeHash is null) return Results.Forbid();
            var verification = hasher.VerifyHashedPassword(new ApplicationUser(), investigation.AccessCodeHash, request.Code.Trim().ToUpperInvariant());
            if (verification == PasswordVerificationResult.Failed) return Results.Forbid();
        }

        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var session = new UserSession { InvestigationId = investigation.Id, Callsign = request.Callsign.Trim(), TokenHash = Hash(rawToken), AccessCodeVersion = investigation.AccessCodeVersion };
        db.UserSessions.Add(session);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { sessionId = session.Id, investigationId = session.InvestigationId, session.Callsign, token = rawToken, session.CreatedAt, session.AccessCodeVersion });
    }

    private static async Task<IResult> GetUserSessionAsync(HttpContext http, EfpDbContext db, CancellationToken ct)
    {
        var session = await UserSessionService.FindAsync(http, db, ct);
        return session is null ? Results.Unauthorized() : Results.Ok(new { session.Id, session.InvestigationId, session.Callsign, session.CreatedAt, session.LastSeenAt });
    }

    private static async Task<IResult> DisconnectUserAsync(HttpContext http, EfpDbContext db, CancellationToken ct)
    {
        var session = await UserSessionService.FindAsync(http, db, ct);
        if (session is null) return Results.NoContent();
        session.RevokedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    internal static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}

public static class UserSessionService
{
    public static async Task<UserSession?> FindAsync(HttpContext http, EfpDbContext db, CancellationToken ct)
    {
        var header = http.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
        var token = header[7..].Trim();
        if (token.Length == 0) return null;
        var session = await db.UserSessions.Include(x => x.Investigation).FirstOrDefaultAsync(x => x.TokenHash == AuthenticationEndpoints.Hash(token) && x.RevokedAt == null, ct);
        if (session is null || session.Investigation is null || session.AccessCodeVersion != session.Investigation.AccessCodeVersion) return null;
        session.LastSeenAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return session;
    }
}

public sealed record AdminRegisterRequest(string Username, string Password);
public sealed record AdminLoginRequest(string Username, string Password);
public sealed record UserConnectRequest(Guid InvestigationId, string? Code, string Callsign);
