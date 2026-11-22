using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql;
using System.Diagnostics;
using Testcontainers.PostgreSql;
using Xunit;

namespace Efp.Api.ContractTests;

public sealed class DatabaseMigrationTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer database = new PostgreSqlBuilder()
        .WithImage("postgis/postgis:16-3.4").Build();

    public Task InitializeAsync() => database.StartAsync();
    public Task DisposeAsync() => database.DisposeAsync().AsTask();

    [Fact]
    public async Task Fresh_database_is_migrated_once_and_matches_the_model()
    {
        await using var db = CreateContext();
        await DatabaseSchema.MigrateAsync(db);
        Assert.Equal([LegacyDatabaseBaseline.MigrationId], await db.Database.GetAppliedMigrationsAsync());
        Assert.False(db.Database.HasPendingModelChanges());
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        var id = await SeedAsync(db);
        await DatabaseSchema.MigrateAsync(db);
        await AssertDataAsync(db, id);
        await AssertSchemaAsync(db);
    }

    [Theory]
    [InlineData("legacy-current.sql", false)]
    [InlineData("legacy-early.sql", false)]
    [InlineData("legacy-early.sql", true)]
    public async Task Legacy_database_is_normalized_without_losing_data(string fixture, bool applyStartupSql)
    {
        await using var db = CreateContext();
        await LoadAsync(db, fixture);
        Guid id;
        if (fixture == "legacy-early.sql" && !applyStartupSql)
        {
            id = Guid.NewGuid();
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "Investigations" ("Id", "Name", "Status", "CreatedAt", "UpdatedAt")
                VALUES ({id}, 'Äldre insats', 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO "Zones" ("Id", "InvestigationId", "Name", "Status", "SearchMethod", "Priority", "Geometry", "UpdatedAt")
                VALUES ({Guid.NewGuid()}, {id}, 'Äldre sektor', 'NotStarted', 'Patrol', 1,
                    ST_GeomFromText('POLYGON((18 59,18.1 59,18.1 59.1,18 59))',4326), CURRENT_TIMESTAMP)
                """);
        }
        else
        {
            if (applyStartupSql) await LoadAsync(db, "legacy-startup.sql");
            id = await SeedAsync(db);
        }

        var refusal = await Assert.ThrowsAsync<InvalidOperationException>(() => DatabaseSchema.MigrateAsync(db));
        Assert.Contains("--baseline-legacy", refusal.Message);
        await LegacyDatabaseBaseline.AdoptAsync(db);
        await DatabaseSchema.MigrateAsync(db);
        Assert.Equal([LegacyDatabaseBaseline.MigrationId], await db.Database.GetAppliedMigrationsAsync());
        await AssertSchemaAsync(db);
        if (fixture == "legacy-early.sql" && !applyStartupSql)
        {
            var investigation = await db.Investigations.SingleAsync(item => item.Id == id);
            Assert.Equal("Äldre insats", investigation.Name);
            Assert.True(investigation.IsPublic);
            Assert.Equal(1, investigation.AccessCodeVersion);
            var sector = await db.Sectors.SingleAsync();
            Assert.Equal("Äldre sektor", sector.Name);
            Assert.Equal(4326, sector.Geometry.SRID);
            Assert.False(sector.Searched);
        }
        else await AssertDataAsync(db, id);

        var repeated = await Assert.ThrowsAsync<InvalidOperationException>(() => LegacyDatabaseBaseline.AdoptAsync(db));
        Assert.Contains("already has migration history", repeated.Message);
    }

    [Theory]
    [InlineData("wrong-type")]
    [InlineData("duplicate-users")]
    [InlineData("orphan-session")]
    [InlineData("overlong-username")]
    public async Task Invalid_legacy_data_rolls_back_all_schema_changes_and_history(string problem)
    {
        await using var db = CreateContext();
        await LoadAsync(db, "legacy-early.sql");
        await LoadAsync(db, "legacy-startup.sql");
        await SeedAsync(db);
        var damage = problem switch
        {
            "wrong-type" => "ALTER TABLE \"Zones\" ALTER COLUMN \"Points\" TYPE text",
            "duplicate-users" => """
                INSERT INTO "Users" ("Id", "UserName", "NormalizedUserName")
                VALUES (gen_random_uuid(), 'Same', 'SAME'), (gen_random_uuid(), 'Same', 'SAME')
                """,
            "orphan-session" => """
                INSERT INTO "UserSessions" ("Id", "InvestigationId", "TokenHash", "Callsign", "CreatedAt", "LastSeenAt", "AccessCodeVersion")
                VALUES (gen_random_uuid(), gen_random_uuid(), 'orphan', 'Test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                """,
            "overlong-username" => """
                INSERT INTO "Users" ("Id", "UserName") VALUES (gen_random_uuid(), repeat('x', 257))
                """,
            _ => throw new ArgumentException(problem),
        };
        await db.Database.ExecuteSqlRawAsync(damage);
        var before = await CatalogAsync(db);
        if (problem == "wrong-type")
        {
            var error = await Assert.ThrowsAsync<InvalidOperationException>(() => LegacyDatabaseBaseline.AdoptAsync(db));
            Assert.Contains("Zones.Points", error.Message);
        }
        else
        {
            var error = await Assert.ThrowsAsync<PostgresException>(() => LegacyDatabaseBaseline.AdoptAsync(db));
            Assert.Equal(problem switch
            {
                "duplicate-users" => PostgresErrorCodes.UniqueViolation,
                "orphan-session" => PostgresErrorCodes.ForeignKeyViolation,
                _ => PostgresErrorCodes.StringDataRightTruncation,
            }, error.SqlState);
        }
        Assert.Equal(before, await CatalogAsync(db));
        Assert.Empty(await db.Database.GetAppliedMigrationsAsync());
        Assert.Single(await db.Investigations.ToListAsync());
    }

    [Fact]
    public async Task Baseline_rejects_an_empty_database()
    {
        await using var db = CreateContext();
        await Assert.ThrowsAsync<InvalidOperationException>(() => LegacyDatabaseBaseline.AdoptAsync(db));
        Assert.Empty(await db.Database.GetAppliedMigrationsAsync());
    }

    [Fact]
    public async Task Management_commands_adopt_and_migrate_without_starting_server_or_seeding_accounts()
    {
        await using var db = CreateContext();
        await LoadAsync(db, "legacy-current.sql");
        // An earlier failed update can leave an empty history table behind.
        await db.Database.ExecuteSqlRawAsync(db.GetService<IHistoryRepository>().GetCreateIfNotExistsScript());
        var refusal = await RunCommandAsync("--migrate");
        Assert.NotEqual(0, refusal.ExitCode);
        Assert.Contains("--baseline-legacy", refusal.Output);
        var baseline = await RunCommandAsync("--baseline-legacy");
        Assert.True(baseline.ExitCode == 0, baseline.Output);
        var update = await RunCommandAsync("--migrate");
        Assert.True(update.ExitCode == 0, update.Output);
        Assert.Empty(await db.Users.ToListAsync());
        Assert.Empty(await db.Roles.ToListAsync());
        Assert.Equal([LegacyDatabaseBaseline.MigrationId], await db.Database.GetAppliedMigrationsAsync());
    }

    private async Task<(int ExitCode, string Output)> RunCommandAsync(string argument)
    {
        var start = new ProcessStartInfo("dotnet")
        {
            RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false,
            CreateNoWindow = true,
        };
        start.ArgumentList.Add(typeof(EfpDbContext).Assembly.Location);
        start.ArgumentList.Add(argument);
        start.Environment["ConnectionStrings__Efp"] = database.GetConnectionString();
        start.Environment["DOTNET_ENVIRONMENT"] = "Testing";
        using var process = Process.Start(start)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try { await process.WaitForExitAsync(timeout.Token); }
        finally { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        return (process.ExitCode, await stdout + await stderr);
    }

    private EfpDbContext CreateContext() => new(new DbContextOptionsBuilder<EfpDbContext>()
        .UseNpgsql(database.GetConnectionString(), options => options.UseNetTopologySuite()).Options);

    private static Task LoadAsync(EfpDbContext db, string fixture) => db.Database.ExecuteSqlRawAsync(
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", fixture)));

    private static async Task<Guid> SeedAsync(EfpDbContext db)
    {
        var owner = new ApplicationUser { UserName = "Befintlig", NormalizedUserName = "BEFINTLIG", PasswordHash = "preserve-hash" };
        var investigation = new Investigation { Name = "Befintlig insats", Owner = owner };
        investigation.Admins.Add(new InvestigationAdmin { Admin = owner, IsOwner = true });
        investigation.Sectors.Add(new Sector
        {
            Name = "Befintlig sektor", Searched = true, Points = 7,
            Geometry = new Polygon(new LinearRing([new(18, 59), new(18.1, 59), new(18.1, 59.1), new(18, 59)])) { SRID = 4326 },
        });
        investigation.Tracks.Add(new Track { Callsign = "A1", Geometry = new LineString([new(18, 59), new(18.1, 59.1)]) { SRID = 4326 } });
        investigation.ReferencePoints.Add(new ReferencePoint { Label = "Start", Geometry = new Point(18, 59) { SRID = 4326 } });
        investigation.Maps.Add(new InvestigationMap { Name = "Karta", ContentType = "image/png", Data = [1, 2, 3] });
        investigation.Findings.Add(new Finding
        {
            Name = "Fynd", SubmittedBy = "A1", ImageContentType = "image/png", ImageFileName = "test.png",
            ImageData = [4, 5, 6], Geometry = new Point(18, 59) { SRID = 4326 }, ObservedAt = DateTimeOffset.UtcNow,
        });
        investigation.UserSessions.Add(new UserSession { TokenHash = "preserve-token", Callsign = "A1", AccessCodeVersion = 1 });
        db.Investigations.Add(investigation);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return investigation.Id;
    }

    private static async Task AssertDataAsync(EfpDbContext db, Guid id)
    {
        db.ChangeTracker.Clear();
        var investigation = await db.Investigations.Include(item => item.Owner).Include(item => item.Admins)
            .Include(item => item.Sectors).Include(item => item.Tracks).Include(item => item.ReferencePoints)
            .Include(item => item.Maps).Include(item => item.Findings).Include(item => item.UserSessions)
            .AsSplitQuery().SingleAsync(item => item.Id == id);
        Assert.Equal("Befintlig insats", investigation.Name);
        Assert.Equal("preserve-hash", investigation.Owner!.PasswordHash);
        Assert.True(Assert.Single(investigation.Admins).IsOwner);
        var sector = Assert.Single(investigation.Sectors);
        Assert.True(sector.Searched);
        Assert.Equal(7, sector.Points);
        Assert.Equal(4326, sector.Geometry.SRID);
        Assert.Equal(4326, Assert.Single(investigation.Tracks).Geometry.SRID);
        Assert.Equal("Start", Assert.Single(investigation.ReferencePoints).Label);
        Assert.Equal(new byte[] { 1, 2, 3 }, Assert.Single(investigation.Maps).Data);
        Assert.Equal(new byte[] { 4, 5, 6 }, Assert.Single(investigation.Findings).ImageData);
        Assert.Equal("preserve-token", Assert.Single(investigation.UserSessions).TokenHash);
    }

    private static async Task AssertSchemaAsync(EfpDbContext db)
    {
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.False(db.Database.HasPendingModelChanges());
        // Compare the complete expected columns, PK/FK definitions and index definitions with
        // a separate schema generated by the same immutable migration, independently of adoption.
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("CREATE SCHEMA expected; SET LOCAL search_path = expected, public");
        var assembly = db.GetService<IMigrationsAssembly>();
        var migration = assembly.CreateMigration(assembly.Migrations[LegacyDatabaseBaseline.MigrationId], db.Database.ProviderName!);
        foreach (var command in db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, migration.TargetModel))
            await db.Database.ExecuteSqlRawAsync(command.CommandText);
        await db.Database.ExecuteSqlRawAsync("SET LOCAL search_path = public");
        var actual = await CatalogAsync(db, "public");
        var expected = await CatalogAsync(db, "expected");
        Assert.All(expected, definition => Assert.Contains(definition, actual));
        await transaction.RollbackAsync();
    }

    private static async Task<string[]> CatalogAsync(EfpDbContext db, string schema = "public")
    {
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT 'column:' || t.relname || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || a.attidentity::text
            FROM pg_attribute a JOIN pg_class t ON t.oid = a.attrelid JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = @schema AND t.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND t.relname <> '__EFMigrationsHistory'
            UNION ALL
            SELECT 'constraint:' || t.relname || ':' || c.conname || ':' || replace(replace(pg_get_constraintdef(c.oid), 'expected.', ''), 'public.', '')
            FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = @schema AND c.contype IN ('p', 'f') AND t.relname <> '__EFMigrationsHistory'
            UNION ALL
            SELECT 'index:' || tablename || ':' || replace(replace(indexdef, 'expected.', ''), 'public.', '')
            FROM pg_indexes WHERE schemaname = @schema AND tablename <> '__EFMigrationsHistory'
            ORDER BY 1
            """;
        command.Parameters.AddWithValue("schema", schema);
        await using var reader = await command.ExecuteReaderAsync();
        var result = new List<string>();
        while (await reader.ReadAsync()) result.Add(reader.GetString(0));
        return result.ToArray();
    }
}
