using Efp.Api.Data;
using Efp.Api.Features;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;
using Efp.Api.Domain;
using Microsoft.AspNetCore.Identity;

var baselineLegacy = args.Contains("--baseline-legacy");
var migrateOnly = args.Contains("--migrate");
if (baselineLegacy && migrateOnly)
    throw new ArgumentException("Run --baseline-legacy and --migrate as separate commands.");
var builder = WebApplication.CreateBuilder(args.Where(arg => arg is not ("--baseline-legacy" or "--migrate")).ToArray());
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
    if (baselineLegacy)
    {
        await LegacyDatabaseBaseline.AdoptAsync(db);
        app.Logger.LogInformation("Legacy database adopted into EF Core migration history.");
        return;
    }
    await DatabaseSchema.MigrateAsync(db);
    if (migrateOnly) return;
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
