# Bootstrap av Superadmin

Superadmin skapas inte via publik registrering. Ange initiala värden som konfiguration eller secrets i driftmiljön:

```text
Superadmin__Username=...
Superadmin__Password=...
```

Vid uppstart skapas rollen `Superadmin` och kontot om de saknas. Lösenordet lagras endast som ASP.NET Identity-hash. Ändra inte secrets i repositoryt och använd olika värden i utveckling, test och produktion.

Den nuvarande utvecklingsuppstarten använder `EnsureCreated` och kompatibilitets-SQL för äldre utvecklingsdatabaser. Innan produktion ska detta ersättas av granskade EF Core-migrationer och backup/återställning ska testas.
