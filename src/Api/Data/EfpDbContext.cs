using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Efp.Api.Data;

public sealed class EfpDbContext(DbContextOptions<EfpDbContext> options) : DbContext(options)
{
    public DbSet<Investigation> Investigations => Set<Investigation>();
    public DbSet<Sector> Sectors => Set<Sector>();
    public DbSet<Track> Tracks => Set<Track>();
    public DbSet<ReferencePoint> ReferencePoints => Set<ReferencePoint>();
    public DbSet<InvestigationMap> InvestigationMaps => Set<InvestigationMap>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("postgis");
        modelBuilder.Entity<Investigation>().Property(x => x.Status).HasConversion<string>();
        // Keep the existing physical table name while exposing the domain as sectors.
        modelBuilder.Entity<Sector>().ToTable("Zones");
        modelBuilder.Entity<Sector>().Property(x => x.Status).HasConversion<string>();
        modelBuilder.Entity<Sector>().Property(x => x.SearchMethod).HasConversion<string>();
        modelBuilder.Entity<ReferencePoint>().Property(x => x.Type).HasConversion<string>();
        modelBuilder.Entity<Sector>().Property(x => x.Geometry).HasColumnType("geometry (Geometry, 4326)");
        modelBuilder.Entity<Sector>().HasQueryFilter(x => !x.IsDeleted);
        modelBuilder.Entity<Track>().Property(x => x.Geometry).HasColumnType("geometry (LineString, 4326)");
        modelBuilder.Entity<ReferencePoint>().Property(x => x.Geometry).HasColumnType("geometry (Point, 4326)");
        modelBuilder.Entity<InvestigationMap>().ToTable("InvestigationMaps");
        modelBuilder.Entity<InvestigationMap>().HasIndex(x => x.InvestigationId);
        modelBuilder.Entity<Sector>().HasIndex(x => x.Geometry).HasMethod("gist");
        modelBuilder.Entity<Track>().HasIndex(x => x.Geometry).HasMethod("gist");
        modelBuilder.Entity<ReferencePoint>().HasIndex(x => x.Geometry).HasMethod("gist");
    }
}
