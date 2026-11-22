# Databasmigreringar

EF Core-migreringar och modellsnapshot finns under `src/Api/Data/Migrations/`.
Första migreringen är `20261122221735_InitialSchema`. Den behåller tabellnamnet
`Zones`; namnbytet till `Sectors` är en separat planerad migrering (R4).

## Lokal utveckling och ny databas

Starta PostgreSQL/PostGIS och ange `ConnectionStrings__Efp` som vid vanlig lokal
API-start. API:et tillämpar väntande migreringar vid start. Roller och eventuell
Superadmin skapas därefter av den separata autentiseringsbootstrapen.

För att enbart migrera, utan att starta webbservern eller skapa konton:

```powershell
dotnet run --project src/Api -- --migrate
```

Databasanslutningen ska peka på en befintlig databas. Kontot behöver rättigheter
för schemaändringarna och för att installera PostGIS om tillägget saknas.

## Befintlig databas från före migreringarna

`EnsureCreatedAsync()` skapade ingen migrationshistorik. Kör därför inte första
migreringen direkt mot en sådan databas och registrera inte en baslinje manuellt.
Vanlig appstart avvisar en databas med insatstabellen men utan migrationshistorik
och hänvisar till engångskommandot nedan.

1. Stoppa API:et och andra processer som skriver till databasen.
2. Ta en backup och verifiera uppgraderingen på en återställd kopia först.
3. Ange `ConnectionStrings__Efp` för databasen som ska uppgraderas.
4. Kör:

   ```powershell
   dotnet run --project src/Api -- --baseline-legacy
   dotnet run --project src/Api -- --migrate
   ```

5. Starta API:et normalt och kontrollera inloggning, befintliga insatser och kartdata.

Engångskommandot kräver de äldre kärntabellerna `Investigations`, `Zones`, `Tracks`
och `ReferencePoints` i schemat `public`. Det hanterar den tidigare MVP-strukturen,
de kända tillagda kolumnerna och schemat från senaste `EnsureCreated`-versionen.
Databaser med egna ändringar behöver granskas separat.

Hela baslinjeringen körs i en transaktion med lås på befintliga applikationstabeller.
Kommandot skapar en tillfällig referensstruktur från den **oföränderliga första
migreringen**, kompletterar saknade tabeller och kända kolumner, återställer
främmande nycklar och index samt normaliserar primärnycklarnas och relationernas
namn. Identitys namn- och e-postkolumner får rätt längdbegränsning; äldre
polygonkolumner för sektorer breddas till geometri utan att byta koordinatsystem.
Kända nya obligatoriska fält får samma standardvärden som tidigare startup-SQL.

Kolumner, typer, nullbarhet, identitetskolumner, nycklar och förväntade index
kontrolleras innan den första migreringen registreras i `__EFMigrationsHistory`.
Referensschemat tas bort i samma transaktion. Befintliga kolumnstandardvärden och
extra index lämnas kvar. Dubbletter som bryter mot unika index, föräldralösa
relationer, för långa Identity-värden eller okända kolumndefinitioner avbryter
kommandot och rullar tillbaka alla dess ändringar. Åtgärda då datan efter granskning
och kör om. Kommandot tar inte bort poster eller kortar strängar för att få dem att passa.

En redan baslinjerad databas avvisas av `--baseline-legacy`; använd `--migrate`
för efterföljande uppgraderingar. Baslinjeringen skapar inga konton och startar
ingen webbserver. Inga befintliga utvecklings- eller driftdatabaser uppgraderas av testerna.

## Skapa nästa migrering

Kör från repositoryts rot (`source/`):

```powershell
dotnet tool restore
dotnet ef migrations add BeskrivandeNamn --project src/Api --output-dir Data/Migrations
dotnet ef migrations has-pending-model-changes --project src/Api
dotnet test tests/Api.UnitTests/Api.UnitTests.csproj
dotnet test tests/Api.ContractTests/Api.ContractTests.csproj
```

Det lokala verktygsmanifestet låser `dotnet-ef` till 9.0.7. Design-time-fabriken
skapar enbart DbContext och kör varken schemaändringar eller kontobootstrap.
Den läser anslutningssträngen från miljövariabeln `ConnectionStrings__Efp`;
generering av migrationsfiler kräver ingen databasanslutning.

Granska alltid genererade `Up`/`Down`-operationer och checka in migrering,
designerfil och snapshot tillsammans. Ändra inte redan tillämpade migreringar.

## Driftsättning

Stoppa gamla API-instanser, säkerhetskopiera och kör migreringarna en gång före
start av den nya versionen. Med befintlig Compose-konfiguration och startad databas:

```powershell
docker compose run --rm --no-deps api --migrate
docker compose up -d api
```

För den första uppgraderingen från legacy-schema körs först motsvarande
`docker compose run --rm --no-deps api --baseline-legacy`. API-imagen ska vara byggd
från den nya versionen. Anslutningssträngen hämtas från samma Compose-konfiguration
som vid normal start. Inga SDK-verktyg behövs i runtime-imagen.

En granskbar SQL-fil för en efterföljande uppgradering kan också genereras med
`dotnet ef migrations script --idempotent --project src/Api --output migration.sql`.
Den filen ersätter inte engångsbaslinjeringen av legacy-databaser.
Nedgradering till före `InitialSchema` tar bort applikationstabellerna; använd en
verifierad backup om den första övergången behöver återställas.

Bakgrund: [Microsofts dokumentation om migreringar](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/)
och [hantering av migrationshistorik](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/managing).
