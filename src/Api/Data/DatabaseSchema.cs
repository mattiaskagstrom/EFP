using Microsoft.EntityFrameworkCore;

namespace Efp.Api.Data;

public static class DatabaseSchema
{
    public static async Task MigrateAsync(EfpDbContext db)
    {
        await db.Database.OpenConnectionAsync();
        try
        {
            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = "SELECT to_regclass('public.\"Investigations\"') IS NOT NULL";
            if (await command.ExecuteScalarAsync() is true && !(await db.Database.GetAppliedMigrationsAsync()).Any())
                throw new InvalidOperationException(
                    "Legacy database detected. Stop the application, back up the database and run --baseline-legacy first. See docs/database-migrations.md.");

            await db.Database.MigrateAsync();
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }
}
