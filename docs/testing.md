# Teststrategi

Projektet har separata testnivåer för backend, API-kontrakt, frontend och webbläsarflöden.

## Lokalt

För snabba tester:

```powershell
.\scripts\test.ps1 -Suite Fast
```

För API-kontraktet separat:

```powershell
.\scripts\test.ps1 -Suite ApiContract
```

För frontend:

```powershell
.\scripts\test.ps1 -Suite Frontend
```

För hela Playwright-sviten:

```powershell
.\scripts\test.ps1 -Suite Full
```

På Linux/macOS kan motsvarande köras med `./scripts/test.sh Fast` eller `./scripts/test.sh Full`.

Fast-sviten startar en separat Compose-miljö med projektnamnet `efp-test` och tar bort den efteråt. Den använder inte den vanliga utvecklingsvolymen.

## API-kontrakt

API-kontraktstesterna kör mot PostgreSQL/PostGIS i Testcontainers och verifierar routes, statuskoder, JSON-fält, enumvärden, GeoJSON, GPX och OpenAPI.

Den förväntade publika v1-strukturen finns i `tests/contracts/openapi.v1.json`. Jämför aktuell OpenAPI mot baslinjen med:

```bash
node scripts/compare-openapi.mjs tests/contracts/openapi.v1.json openapi.current.json
```

Att ta bort routes eller metoder från `/api/v1` ska stoppa CI. Medvetna breaking changes kräver en ny API-version.

## GitHub Actions

`ci-fast.yml` körs på Pull Requests och push till `main`. Den kör backendtester, API-kontrakt, frontendtester, build, OpenAPI-diff samt smoke- och kritiska E2E-tester.

`ci-full-e2e.yml` kan köras manuellt och körs nattligen. Den startar en ren Compose-miljö och kör den omfattande Playwright-sviten. Screenshots, trace, video, loggar och OpenAPI-resultat sparas som artifacts vid fel eller avslutad körning.

## Testdata

Stabila fixtures ska ligga under `tests/fixtures`. Tester ska inte använda verkliga insatsdata, externa karttiles eller externa API:er.
