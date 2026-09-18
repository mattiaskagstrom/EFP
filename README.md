# EFP sökapplikation

Krav och planeringsunderlag för en applikation som stödjer patrullsök och skallgångskedja inom Hemvärnets EFP-verksamhet.

## Dokument

- [Kravspecifikation](docs/kravspecifikation.md) – övergripande mål, funktionella krav och icke-funktionella krav.
- [Funktioner och datamodell](docs/funktioner-och-datamodell.md) – centrala arbetsflöden och informationsobjekt.
- [Sökmetoder och MSO-begrepp](docs/sokmetoder-och-mso.md) – patrullsök, skallgångssök, ledstångssök och centrala förkortningar.
- [Teknisk arkitektur](docs/teknisk-arkitektur.md) – föreslagen teknikstack, drift, skalning och uppdateringar.
- [Action items](docs/action-items.md) – prioriterad genomförandeplan med definitioner av klart.
- [MVP och öppna beslut](docs/mvp-och-oppna-beslut.md) – förslag på första version samt frågor som behöver beslutas.

Dokumenten är ett tidigt kravunderlag och ska förfinas tillsammans med användare, insatsledning och tekniskt ansvariga.

## Kodbas

Den första MVP-basen finns under `src/Api` och `src/Admin`.

### Starta backend lokalt

Förutsätter .NET 9 SDK och Docker:

```powershell
docker compose up -d db
$env:ConnectionStrings__Efp = "Host=localhost;Port=5432;Database=efp;Username=efp;Password=efp-dev-password"
$env:ASPNETCORE_URLS = "http://localhost:8080"
dotnet run --project src/Api
```

API:et finns på `http://localhost:8080` när det körs i container och OpenAPI på `/openapi/v1.json`.

### Starta admin lokalt

Förutsätter Node.js och pnpm:

```powershell
pnpm install
pnpm --dir src/Admin dev
```

Adminvyn använder OpenStreetMap och kan skapa sökinsatser, rita zoner samt exportera zoner som GeoJSON.

### Starta hela utvecklingsmiljön

Använd det samlade PowerShell-skriptet:

```powershell
.\scripts\dev.ps1
```

Skriptet kontrollerar Node.js, pnpm/npm, .NET SDK och Docker, kör paketrestore, startar PostgreSQL/PostGIS samt backend och admin-interface. Databasen stoppas när skriptet avslutas men datavolymen sparas. Använd `-KeepDatabase` om databasen ska fortsätta köra efter avslut.

Om npm-registret använder ett företagscertifikat aktiverar skriptet automatiskt Node.js systemcertifikat med `NODE_USE_SYSTEM_CA=1`. Node.js 22.15 eller senare rekommenderas för detta. Pnpm är rekommenderat; om bara npm finns används en isolerad npm-fallback utan dependency-skript.
