using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Testcontainers.PostgreSql;
using Xunit;

namespace Efp.Api.ContractTests;

public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer database = new PostgreSqlBuilder()
        .WithImage("postgis/postgis:16-3.4")
        .WithDatabase("efp_test")
        .WithUsername("efp_test")
        .WithPassword("efp_test_password")
        .Build();

    public async Task InitializeAsync() => await database.StartAsync();

    public new async Task DisposeAsync()
    {
        await database.DisposeAsync();
        Dispose();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Efp"] = database.GetConnectionString(),
            ["Superadmin:Username"] = "test-superadmin",
            ["Superadmin:Password"] = "CorrectHorseBattery9",
        }));
    }
}
