using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Efp.Api.Data;

public sealed class EfpDesignTimeDbContextFactory : IDesignTimeDbContextFactory<EfpDbContext>
{
    public EfpDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .AddEnvironmentVariables()
            .AddCommandLine(args)
            .Build();
        var connectionString = configuration.GetConnectionString("Efp")
            ?? "Host=localhost;Database=efp;Username=efp";
        return new EfpDbContext(new DbContextOptionsBuilder<EfpDbContext>()
            .UseNpgsql(connectionString, options => options.UseNetTopologySuite()).Options);
    }
}
