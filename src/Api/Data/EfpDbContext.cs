using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;

namespace Efp.Api.Data;

public sealed class EfpDbContext(DbContextOptions<EfpDbContext> options) : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<Investigation> Investigations => Set<Investigation>();
    public DbSet<Sector> Sectors => Set<Sector>();
    public DbSet<Track> Tracks => Set<Track>();
    public DbSet<ReferencePoint> ReferencePoints => Set<ReferencePoint>();
    public DbSet<InvestigationMap> InvestigationMaps => Set<InvestigationMap>();
    public DbSet<InvestigationAdmin> InvestigationAdmins => Set<InvestigationAdmin>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.HasPostgresExtension("postgis");
        modelBuilder.Entity<ApplicationUser>().ToTable("Users");
        modelBuilder.Entity<IdentityRole<Guid>>().ToTable("Roles");
        modelBuilder.Entity<IdentityUserRole<Guid>>().ToTable("UserRoles");
        modelBuilder.Entity<IdentityUserClaim<Guid>>().ToTable("UserClaims");
        modelBuilder.Entity<IdentityUserLogin<Guid>>().ToTable("UserLogins");
        modelBuilder.Entity<IdentityRoleClaim<Guid>>().ToTable("RoleClaims");
        modelBuilder.Entity<IdentityUserToken<Guid>>().ToTable("UserTokens");
        modelBuilder.Entity<Investigation>().Property(x => x.Status).HasConversion<string>();
        modelBuilder.Entity<Investigation>().HasIndex(x => x.OwnerId);
        modelBuilder.Entity<InvestigationAdmin>().HasKey(x => new { x.InvestigationId, x.AdminId });
        modelBuilder.Entity<InvestigationAdmin>().HasOne(x => x.Investigation).WithMany(x => x.Admins).HasForeignKey(x => x.InvestigationId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<InvestigationAdmin>().HasOne(x => x.Admin).WithMany().HasForeignKey(x => x.AdminId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<UserSession>().HasIndex(x => x.TokenHash).IsUnique();
        modelBuilder.Entity<UserSession>().HasIndex(x => x.InvestigationId);
        modelBuilder.Entity<UserSession>().HasOne(x => x.Investigation).WithMany(x => x.UserSessions).HasForeignKey(x => x.InvestigationId).OnDelete(DeleteBehavior.Cascade);
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
