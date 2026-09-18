using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Efp.Api.Data;

public sealed class EfpDbContext(DbContextOptions<EfpDbContext> options) : DbContext(options)
{
    public DbSet<Investigation> Investigations => Set<Investigation>();
    public DbSet<Zone> Zones => Set<Zone>();
    public DbSet<Track> Tracks => Set<Track>();
    public DbSet<ReferencePoint> ReferencePoints => Set<ReferencePoint>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("postgis");
        modelBuilder.Entity<Investigation>().Property(x => x.Status).HasConversion<string>();
        modelBuilder.Entity<Zone>().Property(x => x.Status).HasConversion<string>();
        modelBuilder.Entity<Zone>().Property(x => x.SearchMethod).HasConversion<string>();
        modelBuilder.Entity<ReferencePoint>().Property(x => x.Type).HasConversion<string>();
        modelBuilder.Entity<Zone>().Property(x => x.Geometry).HasColumnType("geometry (Polygon, 4326)");
        modelBuilder.Entity<Track>().Property(x => x.Geometry).HasColumnType("geometry (LineString, 4326)");
        modelBuilder.Entity<ReferencePoint>().Property(x => x.Geometry).HasColumnType("geometry (Point, 4326)");
        modelBuilder.Entity<Zone>().HasIndex(x => x.Geometry).HasMethod("gist");
        modelBuilder.Entity<Track>().HasIndex(x => x.Geometry).HasMethod("gist");
        modelBuilder.Entity<ReferencePoint>().HasIndex(x => x.Geometry).HasMethod("gist");
    }
}
