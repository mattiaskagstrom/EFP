# Action items och genomförandeplan

**Version:** 0.1  
**Status:** Arbetsunderlag

## Prioritering

Arbetet genomförs i följande ordning:

1. Backend och webbaserat administrationsgränssnitt.
2. Androidapplikation.
3. iOS-applikation.

Målet för prioritet 1 är att skapa ett användbart system för att administrera zoner samt importera och exportera geografiskt underlag. Det ska kunna användas tillsammans med andra appar som stödjer GPX innan mobilapparna är färdiga.

## Definition av första användbara leverans

Den första leveransen ska kunna:

- skapa en sökinsats
- rita, redigera och ta bort zoner
- importera GPS-spår från GPX
- visa spår och zoner på karta
- exportera spår och zoner i överenskomna format
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

- [ ] Definiera entiteter för sökinsats, zon, spår, spårpunkt och import/exportjobb.
- [ ] Definiera livscykel och status för sökinsats och zon.
- [ ] Bestämma koordinatsystem och precision.
- [ ] Skapa PostgreSQL/PostGIS-schema.
- [ ] Lägga till spatiala index.
- [ ] Implementera EF Core-modeller och databasmigreringar.
- [ ] Skapa testdata för en sökinsats med zoner och spår.

**Klart när:** En testdatabas kan skapas från tom miljö och innehåller validerade geoobjekt.

### 1.3 Backend-API

- [ ] Skapa ASP.NET Core API.
- [ ] Implementera OpenAPI/Swagger.
- [ ] Implementera CRUD för sökinsatser.
- [ ] Implementera CRUD för zoner.
- [ ] Implementera hämtning av spår och spårpunkter.
- [ ] Implementera filtrering på sökinsats, zon, tid och källa.
- [ ] Implementera validering av koordinater och geometrier.
- [ ] Implementera tydliga felkoder och felmeddelanden.
- [ ] Införa API-versionering från början.
- [ ] Skriva en första uppsättning enhetstester och API-tester.

**Klart när:** Webbklienten kan skapa, läsa, ändra och ta bort sökinsatser och zoner via API:et.

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

### 1.5 Export av spår och zoner

- [ ] Definiera vilka objekt som ska kunna exporteras.
- [ ] Implementera export av spår till GPX.
- [ ] Implementera export av punkter som GPX waypoints.
- [ ] Bestämma format för polygonzoner.
- [ ] Implementera export av zoner som GeoJSON.
- [ ] Utreda om zoner även ska exporteras som KML/KMZ eller annat praktiskt format.
- [ ] Dokumentera att GPX inte är ett fullständigt standardformat för polygonala zoner.
- [ ] Låta användaren välja hela sökinsatsen eller filtrerat urval.
- [ ] Låta användaren välja spår, punkter, zoner eller kombinationer.
- [ ] Generera tydliga filnamn och metadata.
- [ ] Skriva tester som verifierar att exporterade filer kan öppnas i vanliga GIS- och GPX-verktyg.

**Klart när:** Administratören kan exportera ett valt underlag och öppna det i minst ett externt verktyg som stödjer respektive format.

### 1.6 Admin-interface och kartredigering

- [ ] Skapa React/TypeScript-applikation för administration.
- [ ] Implementera inloggning eller annan initial administratörsautentisering.
- [ ] Skapa vy för lista och skapande av sökinsatser.
- [ ] Skapa kartvy med lager för zoner och spår.
- [ ] Implementera ritning av polygonzon.
- [ ] Implementera redigering av zonens hörnpunkter.
- [ ] Implementera flytt, kopiering och borttagning av zoner.
- [ ] Implementera zonens namn, instruktion, status och prioritet.
- [ ] Implementera importdialog för GPX.
- [ ] Implementera exportdialog med filter och formatval.
- [ ] Visa import- och exportfel på ett begripligt sätt.
- [ ] Implementera enkel legend och lagerkontroll.

**Klart när:** En administratör kan skapa en sökinsats, rita zoner, importera spår och exportera ett avgränsat underlag utan terminal eller manuell databashantering.

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
- [ ] Testa zoner med få och många hörnpunkter.
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
- [ ] Implementera visning av sökinsats, zoner och spår.
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

## Vidareutveckling – MSO-baserad zonfördelning

Automatisk zonfördelning prioriteras efter den första mobilversionen. Funktionen ska generera ett granskningsbart beslutsunderlag, inte ersätta insatsledningens beslut.

### Förberedande datamodell

- [ ] Modellera PLS, LKP och IPP som namngivna geografiska referenspunkter.
- [ ] Modellera sökområde, primärt sökområde och segment.
- [ ] Modellera ledstänger som linjegeometrier eller importerade kartobjekt.
- [ ] Lägga till sökmetod på zoner och segment.
- [ ] Lägga till prioritet, POA, POD och källa/underlag där det är relevant.
- [ ] Spara profilversion och indata för varje genererad zonindelning.

### Kravanalys och verksamhetsförankring

- [ ] Ta fram konkreta exempel på MSO-profiler och tidigare zonindelningar.
- [ ] Dokumentera hur PLS, LKP och IPP ska påverka zonförslaget.
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

**Klart när:** En insatsadministratör kan ange MSO-relaterade indata, få ett begripligt zonförslag, ändra förslaget och godkänna en slutlig zonindelning.

## Tekniska beslut som bör tas tidigt

- [ ] Fastställ koordinatsystem.
- [ ] Fastställ exportformat för zoner, med GeoJSON som rekommenderad bas.
- [ ] Välj GPX-bibliotek för .NET.
- [ ] Välj kartbibliotek och kartdatakälla.
- [ ] Välj monorepoverktyg.
- [ ] Välj strategi för lokal databas i mobilapparna.
- [ ] Fastställ autentisering för administratörer.
- [ ] Fastställ regler för vem som får se och ändra importerade spår.
- [ ] Kontrollera licens och budget för bakgrunds-GPS-biblioteket.
- [ ] Bestäm om foton ska ingå i första mobilversionen.
- [ ] Bestäm vilka delar av MSO-baserad zonfördelning som ska vara regelbaserade respektive manuella.

## Föreslagen ordning inom prioritet 1

1. Projektgrund och lokal utvecklingsmiljö.
2. Datamodell och PostGIS-schema.
3. Backend-API för sökinsats, zoner och spår.
4. GPX-import.
5. Admin-karta och zonredigering.
6. Export av spår, punkter och zoner.
7. Driftpaketering och backup.
8. Kvalitetssäkring med riktiga testfiler.

Den ordningen ger tidigt ett fungerande kärnflöde och minskar risken att mobilapparna byggs mot ett API eller en datamodell som senare måste göras om.
