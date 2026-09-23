using Efp.Api.Domain;
using Microsoft.AspNetCore.Identity;

namespace Efp.Api.Features;

public static class AuthenticationBootstrap
{
    public static async Task SeedAsync(IServiceProvider services, IConfiguration configuration)
    {
        var roles = services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        foreach (var role in new[] { "Admin", "Superadmin" })
            if (!await roles.RoleExistsAsync(role)) await roles.CreateAsync(new IdentityRole<Guid>(role));

        var username = configuration["Superadmin:Username"];
        var password = configuration["Superadmin:Password"];
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password)) return;
        var users = services.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByNameAsync(username);
        if (user is null)
        {
            user = new ApplicationUser { UserName = username, IsActive = true };
            var created = await users.CreateAsync(user, password);
            if (!created.Succeeded) throw new InvalidOperationException(string.Join("; ", created.Errors.Select(error => error.Description)));
        }
        if (!await users.IsInRoleAsync(user, "Superadmin")) await users.AddToRoleAsync(user, "Superadmin");
    }
}
