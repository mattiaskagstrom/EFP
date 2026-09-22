using Efp.Api.Data;
using Efp.Api.Features;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<EfpDbContext>(options => options.UseNpgsql(builder.Configuration.GetConnectionString("Efp"), npgsql => npgsql.UseNetTopologySuite()));
builder.Services.AddHealthChecks().AddDbContextCheck<EfpDbContext>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

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
        ALTER TABLE "Investigations" ADD COLUMN IF NOT EXISTS "SearchConditions" text NULL;
        """);
}
app.UseCors();
app.MapOpenApi();
app.MapHealthChecks("/health");
app.MapInvestigationEndpoints();
app.MapZoneEndpoints();
app.MapReferencePointEndpoints();
app.MapImportExportEndpoints();
app.Run();

public partial class Program { }
