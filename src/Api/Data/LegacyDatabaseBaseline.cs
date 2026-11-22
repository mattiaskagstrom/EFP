using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Storage;

namespace Efp.Api.Data;

// Dynamic identifiers are quoted; types and DDL come from the immutable initial
// migration or PostgreSQL's catalog, never from HTTP input. Identifiers cannot be SQL parameters.
#pragma warning disable EF1002

/// <summary>One-time, transactional adoption of pre-migrations databases.</summary>
public static class LegacyDatabaseBaseline
{
    public const string MigrationId = "20261122221735_InitialSchema";

    public static async Task AdoptAsync(EfpDbContext db)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(20261122, 1)");
        var tables = await ReadNamesAsync(db, "SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
        if (tables.Contains("__EFMigrationsHistory") && (await db.Database.GetAppliedMigrationsAsync()).Any())
            throw new InvalidOperationException("This database already has migration history; use --migrate instead.");
        if (!new[] { "Investigations", "Zones", "Tracks", "ReferencePoints" }.All(tables.Contains))
            throw new InvalidOperationException("Not a supported legacy EFP database. No changes were committed.");

        // The application must be stopped. Locks also prevent concurrent writes while validating data.
        var assembly = db.GetService<IMigrationsAssembly>();
        var migration = assembly.CreateMigration(assembly.Migrations[MigrationId], db.Database.ProviderName!);
        var tableOperations = migration.UpOperations.OfType<CreateTableOperation>().ToArray();
        foreach (var table in tableOperations.Where(table => tables.Contains(table.Name)))
            await db.Database.ExecuteSqlRawAsync($"LOCK TABLE public.{Quote(table.Name)} IN ACCESS EXCLUSIVE MODE");

        // Build the immutable initial migration in a temporary reference schema. This avoids
        // validating a legacy database against a future version of the application's model.
        var reference = "efp_baseline_" + Guid.NewGuid().ToString("N");
        await db.Database.ExecuteSqlRawAsync($"CREATE SCHEMA {Quote(reference)}");
        await db.Database.ExecuteSqlRawAsync($"SET LOCAL search_path = {Quote(reference)}, public");
        var generator = db.GetService<IMigrationsSqlGenerator>();
        foreach (var command in generator.Generate(migration.UpOperations, migration.TargetModel))
            await db.Database.ExecuteSqlRawAsync(command.CommandText);
        await db.Database.ExecuteSqlRawAsync("SET LOCAL search_path = public");

        foreach (var table in tableOperations)
        {
            if (!tables.Contains(table.Name))
            {
                foreach (var command in generator.Generate([table], migration.TargetModel))
                    await db.Database.ExecuteSqlRawAsync(command.CommandText);
                continue;
            }

            var existing = await ReadColumnsAsync(db, "public", table.Name);
            var expected = await ReadColumnsAsync(db, reference, table.Name);
            if (existing.Keys.Except(expected.Keys).Any())
                throw new InvalidOperationException($"Unexpected columns in {table.Name}; review the schema manually.");

            foreach (var column in table.Columns)
            {
                if (!existing.TryGetValue(column.Name, out var actual))
                {
                    var addition = new AddColumnOperation
                    {
                        Table = table.Name, Name = column.Name, ClrType = column.ClrType,
                        ColumnType = column.ColumnType, IsNullable = column.IsNullable,
                        MaxLength = column.MaxLength,
                    };
                    // These defaults are the ones used by the former startup SQL.
                    if (!column.IsNullable)
                    {
                        addition.DefaultValue = (table.Name, column.Name) switch
                        {
                            ("Investigations", "IsPublic") => true,
                            ("Investigations", "AccessCodeVersion") => 1,
                            ("Zones", "Searched" or "ShowName" or "ShowArea" or "IsDeleted") => false,
                            ("Zones", "Points") => 0,
                            ("Findings", "IsDeleted") => false,
                            _ => throw new InvalidOperationException($"Cannot infer existing values for {table.Name}.{column.Name}."),
                        };
                    }
                    foreach (var command in generator.Generate([addition], migration.TargetModel))
                        await db.Database.ExecuteSqlRawAsync(command.CommandText);
                }
                else if (actual != expected[column.Name])
                {
                    var desired = expected[column.Name];
                    var canNormalize = actual.NotNull == desired.NotNull && actual.Identity == desired.Identity &&
                        ((actual.Type == "text" && desired.Type == "character varying(256)") ||
                         (table.Name == "Zones" && column.Name == "Geometry" &&
                          actual.Type == "geometry(Polygon,4326)" && desired.Type == "geometry(Geometry,4326)"));
                    if (!canNormalize)
                        throw new InvalidOperationException($"Unexpected definition for {table.Name}.{column.Name}: {actual}.");

                    // No explicit varchar cast: PostgreSQL must reject overlong values rather than truncate them.
                    await db.Database.ExecuteSqlRawAsync(
                        $"ALTER TABLE {Quote(table.Name)} ALTER COLUMN {Quote(column.Name)} TYPE {column.ColumnType}");
                }
            }
        }

        // Restore missing keys and indexes from the reference schema. Equivalent legacy
        // constraints are renamed so future generated migrations can address them by name.
        foreach (var table in tableOperations)
        {
            var desired = await ReadConstraintsAsync(db, reference, table.Name, reference);
            var existing = await ReadConstraintsAsync(db, "public", table.Name, reference);
            foreach (var (name, definition) in desired)
            {
                if (existing.TryGetValue(name, out var current))
                {
                    if (current != definition) throw new InvalidOperationException($"Unexpected constraint {name}.");
                    continue;
                }
                var equivalent = existing.FirstOrDefault(item => item.Value == definition);
                var sql = equivalent.Key is not null
                    ? $"ALTER TABLE {Quote(table.Name)} RENAME CONSTRAINT {Quote(equivalent.Key)} TO {Quote(name)}"
                    : $"ALTER TABLE {Quote(table.Name)} ADD CONSTRAINT {Quote(name)} {definition}";
                await db.Database.ExecuteSqlRawAsync(sql);
            }

            var verifiedConstraints = await ReadConstraintsAsync(db, "public", table.Name, reference);
            if (verifiedConstraints.Count != desired.Count || desired.Any(constraint =>
                !verifiedConstraints.TryGetValue(constraint.Key, out var actual) || actual != constraint.Value))
                throw new InvalidOperationException($"Unexpected keys or relationships in {table.Name}.");

            var expectedIndexes = await ReadIndexesAsync(db, reference, table.Name, reference);
            var actualIndexes = await ReadIndexesAsync(db, "public", table.Name, reference);
            foreach (var (name, definition) in expectedIndexes)
            {
                if (actualIndexes.TryGetValue(name, out var current))
                {
                    if (current != definition) throw new InvalidOperationException($"Unexpected index {name}.");
                }
                else
                {
                    await db.Database.ExecuteSqlRawAsync(definition);
                }
            }

            var actualColumns = await ReadColumnsAsync(db, "public", table.Name);
            var expectedColumns = await ReadColumnsAsync(db, reference, table.Name);
            if (expectedColumns.Any(column => !actualColumns.TryGetValue(column.Key, out var actual) || actual != column.Value))
                throw new InvalidOperationException($"Schema verification failed for {table.Name}.");
        }

        await db.Database.ExecuteSqlRawAsync($"DROP SCHEMA {Quote(reference)} CASCADE");
        var history = db.GetService<IHistoryRepository>();
        await db.Database.ExecuteSqlRawAsync(history.GetCreateIfNotExistsScript());
        await db.Database.ExecuteSqlRawAsync(history.GetInsertScript(new HistoryRow(MigrationId, "9.0.7")));
        await transaction.CommitAsync();
    }

    private sealed record Column(string Type, bool NotNull, string Identity);

    private static async Task<Dictionary<string, Column>> ReadColumnsAsync(EfpDbContext db, string schema, string table)
    {
        await using var command = Command(db, """
            SELECT a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attidentity::text
            FROM pg_attribute a JOIN pg_class t ON t.oid = a.attrelid JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = @schema AND t.relname = @table AND a.attnum > 0 AND NOT a.attisdropped
            """, schema, table);
        await using var reader = await command.ExecuteReaderAsync();
        var result = new Dictionary<string, Column>();
        while (await reader.ReadAsync()) result.Add(reader.GetString(0), new(reader.GetString(1), reader.GetBoolean(2), reader.GetString(3)));
        return result;
    }

    private static Task<Dictionary<string, string>> ReadConstraintsAsync(EfpDbContext db, string schema, string table, string reference) =>
        ReadDefinitionsAsync(db, """
            SELECT c.conname, pg_get_constraintdef(c.oid)
            FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = @schema AND t.relname = @table AND c.contype IN ('p', 'f')
            """, schema, table, reference);

    private static Task<Dictionary<string, string>> ReadIndexesAsync(EfpDbContext db, string schema, string table, string reference) =>
        ReadDefinitionsAsync(db, """
            SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = @schema AND tablename = @table
            """, schema, table, reference);

    private static async Task<Dictionary<string, string>> ReadDefinitionsAsync(EfpDbContext db, string sql, string schema, string table, string reference)
    {
        await using var command = Command(db, sql, schema, table);
        await using var reader = await command.ExecuteReaderAsync();
        var result = new Dictionary<string, string>();
        while (await reader.ReadAsync())
            result.Add(reader.GetString(0), reader.GetString(1).Replace(reference + ".", "").Replace("public.", ""));
        return result;
    }

    private static async Task<HashSet<string>> ReadNamesAsync(EfpDbContext db, string sql)
    {
        await using var command = Command(db, sql, "public", "");
        await using var reader = await command.ExecuteReaderAsync();
        var result = new HashSet<string>();
        while (await reader.ReadAsync()) result.Add(reader.GetString(0));
        return result;
    }

    private static DbCommand Command(EfpDbContext db, string sql, string schema, string table)
    {
        var command = db.Database.GetDbConnection().CreateCommand();
        command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
        command.CommandText = sql;
        foreach (var (name, value) in new[] { ("schema", schema), ("table", table) })
        {
            var parameter = command.CreateParameter();
            parameter.ParameterName = name;
            parameter.Value = value;
            command.Parameters.Add(parameter);
        }
        return command;
    }

    private static string Quote(string name) => "\"" + name.Replace("\"", "\"\"") + "\"";
}
