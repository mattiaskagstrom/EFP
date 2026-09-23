using Efp.Api.Data;
using Efp.Api.Features;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;
using Efp.Api.Domain;
using Microsoft.AspNetCore.Identity;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<EfpDbContext>(options => options.UseNpgsql(builder.Configuration.GetConnectionString("Efp"), npgsql => npgsql.UseNetTopologySuite()));
builder.Services.AddIdentityCore<ApplicationUser>(options =>
{
    options.User.RequireUniqueEmail = false;
    options.Password.RequiredLength = 10;
    options.Password.RequireNonAlphanumeric = false;
    options.Lockout.MaxFailedAccessAttempts = 5;
}).AddRoles<IdentityRole<Guid>>().AddEntityFrameworkStores<EfpDbContext>().AddSignInManager();
builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme).AddIdentityCookies(options =>
{
    options.ApplicationCookie.Configure(cookie =>
    {
        cookie.Cookie.Name = "efp.admin";
        cookie.Cookie.HttpOnly = true;
        cookie.Cookie.SameSite = SameSiteMode.Lax;
        cookie.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        cookie.SlidingExpiration = true;
        cookie.Events.OnRedirectToLogin = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }
            context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
        cookie.Events.OnRedirectToAccessDenied = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            }
            context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
    });
});
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Admin", policy => policy.RequireRole("Admin", "Superadmin"));
    options.AddPolicy("Superadmin", policy => policy.RequireRole("Superadmin"));
});
builder.Services.AddHealthChecks().AddDbContextCheck<EfpDbContext>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .SetIsOriginAllowed(origin => origin is "http://localhost:5173" or "http://127.0.0.1:5173" || builder.Environment.IsDevelopment())
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<EfpDbContext>();
    await db.Database.EnsureCreatedAsync();
    // Tillfällig MVP-schemajustering för utvecklingsdatabaser. Ersätts av EF-migration
    // innan produktionssättning.
    await db.Database.ExecuteSqlRawAsync("""
        ALTER TABLE "Zones" ADD COLUMN IF NOT EXISTS "Searched" boolean NOT NULL DEFAULT FALSE;
        ALTER TABLE "Zones" ADD COLUMN IF NOT EXISTS "SearchedAt" timestamp with time zone NULL;
        ALTER TABLE "Zones" ADD COLUMN IF NOT EXISTS "Points" integer NOT NULL DEFAULT 0;
        ALTER TABLE "Zones" ADD COLUMN IF NOT EXISTS "ShowName" boolean NOT NULL DEFAULT FALSE;
        ALTER TABLE "Zones" ADD COLUMN IF NOT EXISTS "ShowArea" boolean NOT NULL DEFAULT FALSE;
        ALTER TABLE "Zones" ADD COLUMN IF NOT EXISTS "IsDeleted" boolean NOT NULL DEFAULT FALSE;
        ALTER TABLE "Zones" ADD COLUMN IF NOT EXISTS "DeletedAt" timestamp with time zone NULL;
        ALTER TABLE "Zones" ALTER COLUMN "Geometry" TYPE geometry(Geometry, 4326) USING "Geometry"::geometry;
        ALTER TABLE "Investigations" ADD COLUMN IF NOT EXISTS "StartsAt" timestamp with time zone NULL;
        ALTER TABLE "Investigations" ADD COLUMN IF NOT EXISTS "EndsAt" timestamp with time zone NULL;
        ALTER TABLE "Zones" ADD COLUMN IF NOT EXISTS "Poa" double precision NULL;
        ALTER TABLE "Tracks" ADD COLUMN IF NOT EXISTS "Pod" double precision NULL;
        ALTER TABLE "Tracks" ADD COLUMN IF NOT EXISTS "AssignedGroup" text NULL;
        ALTER TABLE "Tracks" ADD COLUMN IF NOT EXISTS "SectorId" uuid NULL;
        ALTER TABLE "Tracks" ADD COLUMN IF NOT EXISTS "Notes" text NULL;
        CREATE TABLE IF NOT EXISTS "Findings" (
            "Id" uuid NOT NULL PRIMARY KEY,
            "InvestigationId" uuid NOT NULL REFERENCES "Investigations" ("Id") ON DELETE CASCADE,
            "SubmittedBy" text NOT NULL,
            "Description" text NULL,
            "ObservedAt" timestamp with time zone NOT NULL,
            "SubmittedAt" timestamp with time zone NOT NULL,
            "ImageContentType" text NOT NULL,
            "ImageFileName" text NOT NULL,
            "ImageData" bytea NOT NULL,
            "Geometry" geometry(Point, 4326) NOT NULL
        );
        CREATE INDEX IF NOT EXISTS "IX_Findings_InvestigationId" ON "Findings" ("InvestigationId");
        CREATE INDEX IF NOT EXISTS "IX_Findings_Geometry" ON "Findings" USING gist ("Geometry");
        ALTER TABLE "Investigations" ADD COLUMN IF NOT EXISTS "SearchConditions" text NULL;
        ALTER TABLE "Investigations" ADD COLUMN IF NOT EXISTS "IsPublic" boolean NOT NULL DEFAULT TRUE;
        ALTER TABLE "Investigations" ADD COLUMN IF NOT EXISTS "AccessCodeHash" text NULL;
        ALTER TABLE "Investigations" ADD COLUMN IF NOT EXISTS "AccessCodeVersion" integer NOT NULL DEFAULT 1;
        ALTER TABLE "Investigations" ADD COLUMN IF NOT EXISTS "AccessCodeUpdatedAt" timestamp with time zone NULL;
        ALTER TABLE "Investigations" ADD COLUMN IF NOT EXISTS "OwnerId" uuid NULL;
        CREATE TABLE IF NOT EXISTS "Users" ("Id" uuid NOT NULL PRIMARY KEY, "UserName" text NULL, "NormalizedUserName" text NULL, "Email" text NULL, "NormalizedEmail" text NULL, "EmailConfirmed" boolean NOT NULL DEFAULT FALSE, "PasswordHash" text NULL, "SecurityStamp" text NULL, "ConcurrencyStamp" text NULL, "PhoneNumber" text NULL, "PhoneNumberConfirmed" boolean NOT NULL DEFAULT FALSE, "TwoFactorEnabled" boolean NOT NULL DEFAULT FALSE, "LockoutEnd" timestamp with time zone NULL, "LockoutEnabled" boolean NOT NULL DEFAULT FALSE, "AccessFailedCount" integer NOT NULL DEFAULT 0, "IsActive" boolean NOT NULL DEFAULT TRUE, "CreatedAt" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS "Roles" ("Id" uuid NOT NULL PRIMARY KEY, "Name" text NULL, "NormalizedName" text NULL, "ConcurrencyStamp" text NULL);
        CREATE TABLE IF NOT EXISTS "UserRoles" ("UserId" uuid NOT NULL, "RoleId" uuid NOT NULL, CONSTRAINT "PK_UserRoles" PRIMARY KEY ("UserId", "RoleId"));
        CREATE TABLE IF NOT EXISTS "UserClaims" ("Id" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "UserId" uuid NOT NULL, "ClaimType" text NULL, "ClaimValue" text NULL);
        CREATE TABLE IF NOT EXISTS "UserLogins" ("LoginProvider" text NOT NULL, "ProviderKey" text NOT NULL, "ProviderDisplayName" text NULL, "UserId" uuid NOT NULL, CONSTRAINT "PK_UserLogins" PRIMARY KEY ("LoginProvider", "ProviderKey"));
        CREATE TABLE IF NOT EXISTS "RoleClaims" ("Id" integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "RoleId" uuid NOT NULL, "ClaimType" text NULL, "ClaimValue" text NULL);
        CREATE TABLE IF NOT EXISTS "UserTokens" ("UserId" uuid NOT NULL, "LoginProvider" text NOT NULL, "Name" text NOT NULL, "Value" text NULL, CONSTRAINT "PK_UserTokens" PRIMARY KEY ("UserId", "LoginProvider", "Name"));
        CREATE TABLE IF NOT EXISTS "InvestigationAdmins" ("InvestigationId" uuid NOT NULL, "AdminId" uuid NOT NULL, "IsOwner" boolean NOT NULL DEFAULT FALSE, "CreatedAt" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PK_InvestigationAdmins" PRIMARY KEY ("InvestigationId", "AdminId"));
        CREATE TABLE IF NOT EXISTS "UserSessions" ("Id" uuid NOT NULL PRIMARY KEY, "InvestigationId" uuid NOT NULL, "TokenHash" text NOT NULL UNIQUE, "Callsign" text NOT NULL, "CreatedAt" timestamp with time zone NOT NULL, "LastSeenAt" timestamp with time zone NOT NULL, "RevokedAt" timestamp with time zone NULL, "AccessCodeVersion" integer NOT NULL);
        CREATE TABLE IF NOT EXISTS "InvestigationMaps" (
            "Id" uuid NOT NULL PRIMARY KEY,
            "InvestigationId" uuid NOT NULL REFERENCES "Investigations" ("Id") ON DELETE CASCADE,
            "Name" text NOT NULL,
            "ContentType" text NOT NULL,
            "Data" bytea NOT NULL,
            "West" double precision NOT NULL,
            "South" double precision NOT NULL,
            "East" double precision NOT NULL,
            "North" double precision NOT NULL,
            "CreatedAt" timestamp with time zone NOT NULL
        );
        CREATE INDEX IF NOT EXISTS "IX_InvestigationMaps_InvestigationId" ON "InvestigationMaps" ("InvestigationId");
        """);
    // Kör bootstrap först efter att även äldre utvecklingsdatabaser har fått
    // Identity-tabellerna ovan.
    await AuthenticationBootstrap.SeedAsync(scope.ServiceProvider, app.Configuration);
}
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapOpenApi();
app.MapHealthChecks("/health");
app.MapAuthenticationEndpoints();
app.MapInvestigationAccessEndpoints();
app.MapInvestigationEndpoints();
app.MapSectorEndpoints();
app.MapReferencePointEndpoints();
app.MapInvestigationMapEndpoints();
app.MapImportExportEndpoints();
app.MapFindingEndpoints();
app.Run();

public partial class Program { }
