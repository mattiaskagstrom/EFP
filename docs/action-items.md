# Action items och genomförandeplan

**Version:** 0.1  
**Status:** Arbetsunderlag

## Todo från första kodgenomgången (2026-11-22)

Följande refaktoreringar följs upp med checklistorna nedan. Befintliga funktioner och API-kontrakt ska bevaras under arbetet.

### R1. Dela upp domänmodellerna

- [x] Ersätt `src/Api/Domain/Models.cs` med en fil per klass, exempelvis `Investigation.cs`, `Sector.cs` och `ApplicationUser.cs`.
- [x] Lägg även domänens enumtyper i egna namngivna filer och behåll namnrymden `Efp.Api.Domain`.

**Bedömning:** Bra förslag. Modellerna representerar separata begrepp och blir enklare att hitta och granska var för sig.

**Klart när:** Samlingsfilen är borttagen, varje domäntyp har en tydlig hemvist och backend bygger samt befintliga enhets- och API-kontraktstester går igenom.

**Genomfört 2026-11-22:** Nio klasser och fyra enumtyper har egna filer. Samtliga typdefinitioner har jämförts mot tidigare `Models.cs` och är oförändrade. Backend bygger; 2 enhetstester och 13 API-kontraktstester mot isolerad PostgreSQL/PostGIS går igenom. Bygget rapporterar en befintlig nullable-varning (CS8602) i `Program.cs`.

### R2. Byt från endpointmoduler till controllers

- [ ] Flytta HTTP-endpointsen i `src/Api/Features/*Endpoints.cs` till controllers i `src/Api/Controllers/`, grupperade efter resurs eller sammanhängande ansvar.
- [ ] Ersätt registreringarna av `MapXEndpoints()` i `Program.cs` med controllerregistrering och `MapControllers()`.
- [ ] Bevara URL:er, HTTP-metoder, JSON-format, statuskoder, autentisering, behörighetskontroller och uppladdningsbeteende. Kontrollera särskilt skillnader i automatisk modellvalidering och JSON-konfiguration vid övergången.
- [ ] Lägg återanvändbar verksamhetslogik i fokuserade tjänster där det behövs, så att controllers inte blir nya samlingsfiler.

**Bedömning:** Rimligt förslag utifrån önskemålet om en tydligare controllerstruktur. Nuvarande Minimal API-moduler är också en giltig struktur; förekomsten av `MapXEndpoints()` är i sig inget fel. Vinsten här är ett enhetligt arbetssätt och enklare navigering för den som föredrar controllers. Bytet behöver därför inte kombineras med nya generella abstraktionslager.

**Klart när:** Funktionernas HTTP-endpoints finns i controllers, de gamla endpointregistreringarna är borttagna och API-kontraktstester verifierar att klienternas beteende bevarats.

### R3. Ersätt schemainitieringen med EF Core-migreringar

- [ ] Inför versionshanterade migreringar och modellsnapshot under `src/Api/Data/Migrations/`.
- [ ] Ersätt `EnsureCreatedAsync()` och det långa SQL-blocket i `Program.cs` med ett dokumenterat flöde för migreringar.
- [ ] Ta fram en övergång för befintliga databaser som skapats med `EnsureCreatedAsync()` och efterföljande SQL-justeringar. Kontrollera och anpassa deras schema innan en migrationsbaslinje registreras; befintliga data ska bevaras.
- [ ] Dokumentera hur migreringar körs lokalt och vid driftsättning. Håll bootstrap av roller och Superadmin åtskild från schemaändringarna.
- [ ] Verifiera både installation i tom PostgreSQL/PostGIS-databas och uppgradering av en befintlig databas med representativa data, inklusive Identity-tabeller och spatiala index.

**Bedömning:** Prioriterat. Det nuvarande SQL-blocket är redan markerat som tillfälligt i koden. Migreringar ger en spårbar schemahistorik. Eventuell nödvändig PostGIS-SQL hör hemma i en migrering.

**Klart när:** Både nyinstallation och uppgradering fungerar med migreringar, data bevaras och `Program.cs` inte längre innehåller det manuella schemablocket eller använder `EnsureCreatedAsync()`.

### R4. Byt databastabellen `Zones` till `Sectors`

- [ ] Genomför namnbytet med en separat EF Core-migrering efter R3. Använd tabellomdöpning så att tabellen inte tas bort och återskapas.
- [ ] Uppdatera mappningen `ToTable("Zones")` i `EfpDbContext` till `Sectors` och anpassa berörda index- och constraintnamn.
- [ ] Uppdatera aktiva SQL-referenser, tester och dokumentation. Historiska migreringar ska behålla de namn som gällde vid respektive steg.
- [ ] Verifiera att befintliga sektorer, geometrier, relationer och index bevaras vid uppgradering.

**Bedömning:** Bra förslag. Domänmodellen, DbSet och API använder redan sektorbegreppet; databasen bör följa samma namngivning. Det faktiska nuvarande tabellnamnet är `Zones`, så föreslaget nytt namn är `Sectors` enligt databasens befintliga namnstil.

**Klart när:** Både en ny och en uppgraderad databas använder `Sectors`, med bevarade data och fungerande sektorflöden.

### R5. Separera frontendtester från produktionskod

- [ ] Flytta `src/Admin/src/**/*.test.ts` och `*.test.tsx` till `src/Admin/tests/`, med en struktur som speglar kodens funktionsområden.
- [ ] Flytta `testSetup.ts` till `src/Admin/tests/setup.ts` och uppdatera Vitests testurval, setup-sökväg, importer och eventuell coverage-konfiguration.
- [ ] Säkerställ TypeScript-kontroll av testkoden med lämplig testkonfiguration och dokumentera testkommandona i `docs/testing.md`.
- [ ] Behåll de gemensamma end-to-end-testerna i `tests/e2e/`.

**Bedömning:** Rimlig preferens. Tester bredvid implementationen gör dem lätta att hitta vid ändringar, men en separat testmapp ger den tydliga uppdelning som önskas här. En speglad struktur behåller kopplingen mellan kod och tester.

**Klart när:** Produktionskoden i `src/Admin/src/` är separerad från testfiler och testsetup, och befintliga frontendtester, typkontroll och produktionsbygge fungerar.

### R6. Dela upp `main.tsx` efter ansvar

- [ ] Begränsa `src/Admin/src/main.tsx` till appstart, globala stilimporter och montering av React-roten. Flytta appkomposition, routing och felgräns till `app/`.
- [ ] Bryt ut vyer och komponenter för rollval, inloggning, insatslista, administration och användarens insatsvy.
- [ ] Bryt ut kartredigeraren, kartlager, geometrihjälpare och redigeringshistorik i fokuserade moduler.
- [ ] Flytta API-anrop till en gemensam klient och funktionsspecifika API-moduler. Samla relaterad tillstånds- och effektlogik i hooks där det förenklar komponenterna.
- [ ] Placera typer nära respektive funktion och dela dem först när flera funktioner behöver samma kontrakt.
- [ ] Genomför uppdelningen stegvis och verifiera befintliga flöden för inloggning, navigering, kartredigering, spara/ångra, import och export.

**Bedömning:** Tydligt behov. Filen är cirka 1 550 rader och innehåller flera oberoende ansvar. Enbart en flytt till en lika stor `App.tsx` löser inte problemet; dela även upp logik och tillstånd efter ansvar.

**Klart när:** Startfilen bara startar appen, vyer och kartlogik har egna moduler och befintliga tester samt relevanta end-to-end-flöden fungerar utan beteendeförändringar.

### R7. Inför en tydlig mappstruktur i frontend

- [ ] Använd en funktionsindelad struktur under `src/Admin/src/`: `app/`, `features/`, `shared/` och `styles/`.
- [ ] Samla funktioner under exempelvis `features/auth/`, `features/investigations/`, `features/sectors/`, `features/tracks/`, `features/findings/`, `features/reference-points/`, `features/maps/` och `features/import-export/`.
- [ ] Placera gemensam kartinfrastruktur i `shared/map/`, API-klienten i `shared/api/` och faktiskt återanvända UI-komponenter i `shared/ui/`. Funktionsspecifika komponenter, hooks och hjälpare stannar i sin funktion.
- [ ] Spegla indelningen under `src/Admin/tests/` enligt R5 och dokumentera mappansvar samt beroenderiktning: appen sätter ihop funktionerna, funktionerna använder gemensam kod och gemensam kod ska inte importera funktioner.
- [ ] Fastställ strukturen före R5–R6 och flytta befintliga filer stegvis när deras ansvar bryts ut.

**Bedömning:** Bra förslag. Funktionsindelning håller relaterad kod tillsammans när appen växer. Skapa undermappar när de behövs och undvik stora generella samlingsmappar för all logik och alla typer.

**Klart när:** Befintlig frontendkod följer den dokumenterade strukturen, testerna speglar den och frontendens typkontroll, tester och bygge fungerar.

**Föreslagen arbetsordning:** R1 → R3 → R4 → R2 → R7 → R5 → R6. Bestäm frontendstrukturen i R7 innan testflytt och uppdelning; genomför själva kodflyttarna tillsammans med R5–R6. Håll databasändringar, controllerbyte och frontendrefaktorering i separata granskningsbara ändringar.

## Prioritering

Arbetet genomförs i följande ordning:

1. Backend och webbaserat administrationsgränssnitt.
2. Androidapplikation.
3. iOS-applikation.

Målet för prioritet 1 är att skapa ett användbart system för att administrera sektorer samt importera och exportera geografiskt underlag. Det ska kunna användas tillsammans med andra appar som stödjer GPX innan mobilapparna är färdiga.

## Definition av första användbara leverans

Den första leveransen ska kunna:

- skapa en sökinsats
- rita, redigera och ta bort sektorer
- importera GPS-spår från GPX
- visa spår och sektorer på karta
- exportera spår och sektorer i överenskomna format
- filtrera och välja vilka objekt som ska exporteras
- köras på Linux/Proxmox
- säkerhetskopiera och återställa databasen

## Prioritet 1 – Backend och admin-interface

### 1.1 Projektgrund och utvecklingsmiljö

- [ ] Skapa repository- och mappstruktur för backend, webbapp och gemensamma paket.
- [ ] Välja monorepoverktyg för frontend, exempelvis pnpm workspaces, Turborepo eller Nx.
- [ ] Skapa utvecklingsmiljö med .NET, Node.js, React och TypeScript.
- [ ] Sätta kodstandard, formattering och statisk analys.
- [ ] Skapa lokal Docker Compose-miljö med backend, PostgreSQL och PostGIS.
- [ ] Dokumentera hur en utvecklare startar hela miljön lokalt.

**Klart när:** En ny utvecklare kan klona projektet, starta miljön och köra ett första backend- och frontendtest.

### 1.2 Domänmodell och databas

- [ ] Definiera entiteter för sökinsats, sektor, spår, spårpunkt och import/exportjobb.
- [ ] Definiera livscykel och status för sökinsats och sektor.
- [ ] Bestämma koordinatsystem och precision.
- [ ] Skapa PostgreSQL/PostGIS-schema.
- [ ] Lägga till spatiala index.
- [ ] Implementera EF Core-modeller och databasmigreringar.
- [ ] Skapa testdata för en sökinsats med sektorer och spår.

**Klart när:** En testdatabas kan skapas från tom miljö och innehåller validerade geoobjekt.

### 1.3 Backend-API

- [ ] Skapa ASP.NET Core API.
- [ ] Implementera OpenAPI/Swagger.
- [ ] Implementera CRUD för sökinsatser.
- [ ] Implementera CRUD för sektorer.
- [ ] Implementera hämtning av spår och spårpunkter.
- [ ] Implementera filtrering på sökinsats, sektor, tid och källa.
- [ ] Implementera validering av koordinater och geometrier.
- [ ] Implementera tydliga felkoder och felmeddelanden.
- [ ] Införa API-versionering från början.
- [ ] Skriva en första uppsättning enhetstester och API-tester.

**Klart när:** Webbklienten kan skapa, läsa, ändra och ta bort sökinsatser och sektorer via API:et.

### 1.4 GPX-import av spår

- [ ] Välja och dokumentera GPX-bibliotek för .NET.
- [ ] Implementera uppladdning av GPX-fil.
- [ ] Validera filstorlek, XML-struktur, koordinater och tidsdata.
- [ ] Tolka GPX tracks och track points.
- [ ] Konvertera importerade spår till systemets datamodell.
- [ ] Spara källa, filnamn, importtid och eventuell beskrivning.
- [ ] Hantera GPX-filer med flera spår.
- [ ] Visa förhandsgranskning innan import bekräftas.
- [ ] Hantera dubbletter och upprepade importer.
- [ ] Rapportera partiella fel utan att tyst förlora giltiga spår.

**Klart när:** En användare kan importera en extern GPX-fil, granska resultatet på karta och spara spåret i rätt sökinsats.

### 1.5 Export av spår och sektorer

- [ ] Definiera vilka objekt som ska kunna exporteras.
- [ ] Implementera export av spår till GPX.
- [ ] Implementera export av punkter som GPX waypoints.
- [ ] Bestämma format för polygonsektorer.
- [ ] Implementera export av sektorer som GeoJSON.
- [ ] Utreda om sektorer även ska exporteras som KML/KMZ eller annat praktiskt format.
- [ ] Dokumentera att GPX inte är ett fullständigt standardformat för polygonala sektorer.
- [ ] Låta användaren välja hela sökinsatsen eller filtrerat urval.
- [ ] Låta användaren välja spår, punkter, sektorer eller kombinationer.
- [ ] Generera tydliga filnamn och metadata.
- [ ] Skriva tester som verifierar att exporterade filer kan öppnas i vanliga GIS- och GPX-verktyg.

**Klart när:** Administratören kan exportera ett valt underlag och öppna det i minst ett externt verktyg som stödjer respektive format.

### 1.6 Admin-interface och kartredigering

- [ ] Skapa React/TypeScript-applikation för administration.
- [ ] Implementera inloggning eller annan initial administratörsautentisering.
- [ ] Skapa vy för lista och skapande av sökinsatser.
- [ ] Skapa kartvy med lager för sektorer och spår.
- [ ] Implementera ritning av polygonsektor.
- [ ] Implementera redigering av sektorns hörnpunkter.
- [ ] Implementera flytt, kopiering och borttagning av sektorer.
- [ ] Implementera sektorns namn, instruktion, status och prioritet.
- [ ] Implementera importdialog för GPX.
- [ ] Implementera exportdialog med filter och formatval.
- [ ] Visa import- och exportfel på ett begripligt sätt.
- [ ] Implementera enkel legend och lagerkontroll.

**Klart när:** En administratör kan skapa en sökinsats, rita sektorer, importera spår och exportera ett avgränsat underlag utan terminal eller manuell databashantering.

### 1.7 Drift och distribution

- [ ] Skapa Dockerfile för backend.
- [ ] Skapa bygg- och produktionskonfiguration för webbappen.
- [ ] Skapa Docker Compose-konfiguration för första produktionsmiljön.
- [ ] Dokumentera installation på Linux-VM på Proxmox.
- [ ] Konfigurera reverse proxy och TLS.
- [ ] Implementera health checks.
- [ ] Implementera databasbackup.
- [ ] Testa återläsning från backup.
- [ ] Dokumentera uppdatering och rollback.
- [ ] Säkerställa att konfiguration och secrets inte ligger i repositoryt.

**Klart när:** Systemet kan installeras, uppdateras och återställas på en ren Linux-miljö med dokumenterade steg.

### 1.8 Kvalitetssäkring för prioritet 1

- [ ] Testa import med GPX från flera olika appar.
- [ ] Testa stora spår och många samtidiga spår.
- [ ] Testa ogiltiga och skadade GPX-filer.
- [ ] Testa sektorer med få och många hörnpunkter.
- [ ] Testa koordinater nära svenska latituder och longituder.
- [ ] Testa behörighet mellan administratörer och vanliga användare.
- [ ] Testa backup och återställning.
- [ ] Genomföra en praktisk pilot med verkligt eller anonymiserat underlag.

## Prioritet 2 – Androidapplikation

Android utvecklas efter att backendens datamodell, API och import/exportflöden är stabila.

### 2.1 Mobil grund

- [ ] Skapa React Native-applikation med TypeScript.
- [ ] Implementera anslutning till sökinsats via kod och QR-kod.
- [ ] Implementera lokal lagring och lokal kö för osynkade ändringar.
- [ ] Implementera visning av sökinsats, sektorer och spår.
- [ ] Implementera hantering av GPS-behörigheter.

### 2.2 GPS-spårning

- [ ] Utvärdera och integrera `react-native-background-geolocation`.
- [ ] Implementera start, paus och stopp av spår.
- [ ] Spara metadata för användare, patrull och sökinsats.
- [ ] Hantera låg noggrannhet, saknad signal och batterisparläge.
- [ ] Testa spårning med låst skärm och appen i bakgrunden.
- [ ] Testa beteende efter appavslut och omstart av telefon.
- [ ] Testa ett helt sökpass med varierande täckning.

### 2.3 Punkter och synkronisering

- [ ] Implementera skapande av punkter från aktuell position.
- [ ] Implementera metadata för fynd och observationer.
- [ ] Implementera manuell synkronisering som standard.
- [ ] Implementera återupptagning efter avbruten synkronisering.
- [ ] Visa tydlig synkroniseringsstatus.
- [ ] Implementera automatisk synkronisering som konfigurerbart alternativ.

**Klart när:** En Androidanvändare kan ansluta till en insats, genomföra ett helt offline-sökpass, skapa punkter och synkronisera resultatet efteråt.

## Prioritet 3 – iOS-applikation

iOS-appen ska i största möjliga mån återanvända Android-appens domänlogik, API-klient, synkronisering och datamodell.

- [ ] Skapa och konfigurera iOS-buildmiljö.
- [ ] Implementera iOS-behörigheter för position och bakgrundsaktivitet.
- [ ] Integrera och verifiera `react-native-background-geolocation` på iOS.
- [ ] Testa bakgrundsspårning med låst skärm.
- [ ] Testa batteriförbrukning och återstartsbeteende.
- [ ] Testa appens beteende vid saknad uppkoppling.
- [ ] Verifiera QR-läsning, kartor, punktplacering och synkronisering.
- [ ] Genomföra TestFlight-pilot.
- [ ] Dokumentera App Store-relaterade krav för bakgrundspositionering.

**Klart när:** En iOS-användare kan genomföra samma centrala arbetsflöde som Androidanvändaren med plattformens krav uppfyllda.

## Vidareutveckling – MSO-baserad sektorfördelning

Automatisk sektorfördelning prioriteras efter den första mobilversionen. Funktionen ska generera ett granskningsbart beslutsunderlag, inte ersätta insatsledningens beslut.

### Förberedande datamodell

- [ ] Modellera PLS, LKP och IPP som namngivna geografiska referenspunkter.
- [ ] Modellera sökområde, primärt sökområde och segment.
- [ ] Modellera ledstänger som linjegeometrier eller importerade kartobjekt.
- [ ] Lägga till sökmetod på sektorer och segment.
- [ ] Lägga till prioritet, POA, POD och källa/underlag där det är relevant.
- [ ] Spara profilversion och indata för varje genererad sektorindelning.

### Kravanalys och verksamhetsförankring

- [ ] Ta fram konkreta exempel på MSO-profiler och tidigare sektorindelningar.
- [ ] Dokumentera hur PLS, LKP och IPP ska påverka sektorförslaget.
- [ ] Definiera vilka terrängobjekt som ska räknas som ledstänger.
- [ ] Definiera regler för prioritering mellan primärt sökområde, ledstänger och övriga segment.
- [ ] Definiera vilka sökmetoder som kan kombineras i samma insats.
- [ ] Förankra regler och resultat med erfaren insatsledning.

### Teknisk prototyp

- [ ] Importera eller rita ett sökområde.
- [ ] Ange PLS, LKP och IPP.
- [ ] Importera eller välja ledstänger.
- [ ] Ange sökresurser och vald sökmetod.
- [ ] Generera ett första segmentförslag.
- [ ] Visa POA/POD och andra antaganden visuellt.
- [ ] Låta administratören flytta, slå ihop, dela och ta bort segment.
- [ ] Spara både automatgenererad och manuellt ändrad version.
- [ ] Exportera det godkända resultatet.

**Klart när:** En insatsadministratör kan ange MSO-relaterade indata, få ett begripligt sektorförslag, ändra förslaget och godkänna en slutlig sektorindelning.

## Tekniska beslut som bör tas tidigt

- [ ] Fastställ koordinatsystem.
- [ ] Fastställ exportformat för sektorer, med GeoJSON som rekommenderad bas.
- [ ] Välj GPX-bibliotek för .NET.
- [ ] Välj kartbibliotek och kartdatakälla.
- [ ] Välj monorepoverktyg.
- [ ] Välj strategi för lokal databas i mobilapparna.
- [ ] Fastställ autentisering för administratörer.
- [ ] Fastställ regler för vem som får se och ändra importerade spår.
- [ ] Kontrollera licens och budget för bakgrunds-GPS-biblioteket.
- [ ] Bestäm om foton ska ingå i första mobilversionen.
- [ ] Bestäm vilka delar av MSO-baserad sektorfördelning som ska vara regelbaserade respektive manuella.

## Föreslagen ordning inom prioritet 1

1. Projektgrund och lokal utvecklingsmiljö.
2. Datamodell och PostGIS-schema.
3. Backend-API för sökinsats, sektorer och spår.
4. GPX-import.
5. Admin-karta och sektorredigering.
6. Export av spår, punkter och sektorer.
7. Driftpaketering och backup.
8. Kvalitetssäkring med riktiga testfiler.

Den ordningen ger tidigt ett fungerande kärnflöde och minskar risken att mobilapparna byggs mot ett API eller en datamodell som senare måste göras om.
