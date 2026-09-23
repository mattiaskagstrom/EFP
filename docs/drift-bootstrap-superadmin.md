# Bootstrap av Superadmin

Superadmin skapas inte via publik registrering. Ange initiala värden som konfiguration eller secrets i driftmiljön:

```text
Superadmin__Username=...
Superadmin__Password=BytDettaLokalt9
```

Vid uppstart skapas rollen `Superadmin` och kontot om de saknas. Lösenordet måste vara minst 10 tecken och innehålla minst en siffra och en versal. Lösenordet lagras endast som ASP.NET Identity-hash. Ändra inte secrets i repositoryt och använd olika värden i utveckling, test och produktion.

Den nuvarande utvecklingsuppstarten använder `EnsureCreated` och kompatibilitets-SQL för äldre utvecklingsdatabaser. Innan produktion ska detta ersättas av granskade EF Core-migrationer och backup/återställning ska testas.
