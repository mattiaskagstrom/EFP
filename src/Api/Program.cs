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
}
app.UseCors();
app.MapOpenApi();
app.MapHealthChecks("/health");
app.MapInvestigationEndpoints();
app.MapZoneEndpoints();
app.MapReferencePointEndpoints();
app.MapImportExportEndpoints();
app.Run();
