# Teknisk arkitektur

**Version:** 0.1  
**Status:** Förslag  
**Syfte:** Teknisk kravställning och rekommenderad målarkitektur

## 1. Övergripande arkitektur

Systemet ska bestå av:

1. Mobilapplikationer för Android och iOS.
2. Webbaserat administrationsgränssnitt.
3. Backend med API och synkroniseringsfunktioner.
4. Relationsdatabas med geografiskt stöd.
5. Lagring för eventuella filer, exempelvis fotografier och exporter.

Backend bör initialt byggas som en modulär monolit. Den ska ha tydliga interna moduler men inte delas upp i mikrotjänster innan det finns ett konkret behov. Detta minskar drift- och utvecklingskomplexitet i första versionen.

## 2. Föreslagen teknikstack

### Backend

- C#.
- ASP.NET Core.
- Aktuell .NET LTS-version.
- REST API som huvudsakligt integrationsgränssnitt.
- OpenAPI/Swagger för API-dokumentation.
- Entity Framework Core som ORM.
- NetTopologySuite för geografiska typer och spatiala operationer.

Backend ska kunna köras på Linux-baserad infrastruktur, inklusive virtuell maskin eller containerplattform på Proxmox.

### Databas

PostgreSQL med PostGIS är förstahandsval.

Databasen ska stödja:

- geografiska punkter
- linjer och GPS-spår
- polygoner och söksektorer
- avståndsberäkningar
- överlappnings- och innehållsfrågor
- spatiala index

Koordinatsystem ska vara dokumenterat och konsekvent i hela systemet. Importerade koordinater ska valideras innan de sparas.

GPS-spår bör kunna lagras både som detaljerade positionspunkter och som optimerad geometri för visning och spatiala sökningar.

### Webbgränssnitt

- React.
- TypeScript.
- Responsivt gränssnitt för större skärmar och surfplattor.
- Kartfunktionalitet via en separat kartkomponent eller karttjänst.

### Mobilapplikationer

- React Native.
- TypeScript.
- Gemensam mobilkod för Android och iOS där plattformsskillnaderna tillåter det.
- Native-moduler ska kunna användas när GPS, kartor, lagring eller operativsystemets bakgrundsregler kräver det.

## 3. Gemensam frontendkod

React på webben och React Native på mobilen ger möjlighet att dela betydande delar av kodbasen, men användargränssnittet bör inte förutsättas vara helt gemensamt.

Följande bör delas i ett gemensamt TypeScript-paket eller motsvarande:

- API-klient
- datatyper och DTO:er
- valideringsregler
- behörighetslogik
- synkroniseringslogik
- felhantering
- datum- och koordinatfunktioner
- design tokens, exempelvis färger och avstånd

Kartor, GPS, bakgrundskörning, filhantering och vissa UI-komponenter kan behöva plattformsspecifik kod.

Projektet bör använda en monorepo-struktur för att samla webbapp, mobilapp, gemensamma paket och eventuellt backendrelaterade kontrakt. Verktyg som pnpm workspaces, Turborepo eller Nx kan utvärderas.

## 4. Bakgrunds-GPS

För mobilappens bakgrundsspårning ska `react-native-background-geolocation` från Transistor Software utvärderas som förstahandsalternativ.

Biblioteket erbjuder bland annat:

- bakgrundsspårning på Android och iOS
- rörelsedetektering
- batterimedveten start och paus av positionsinsamling
- lokal lagring av positioner
- stöd för drift utan nätanslutning
- möjlighet till geofencing

Biblioteket ska dock inte betraktas som en ersättning för applikationens egen synkroniseringsmodell. Applikationen behöver fortfarande definiera hur lokala spår kopplas till sökinsatser, användare, metadata och serverns synkroniseringskö.

Följande ska verifieras i en teknisk prototyp:

- noggrannhet och uppdateringsfrekvens i svensk terräng
- batteriförbrukning under ett helt sökpass
- beteende när appen avslutas eller telefonen startas om
- iOS- och Android-behörigheter
- användning utan mobiltäckning
- export till systemets GPX-modell
- kompatibilitet med vald React Native-version
- licens- och kostnadsmodell för produktion

Bibliotekets JavaScript-/wrapperdel är öppen källkod, medan de underliggande native-SDK:erna är kommersiella och kräver licens för produktionsbyggen. Detta ska vägas in i budget och leverantörsberoende innan teknikvalet låses. Se [projektets licensinformation](https://docs.transistorsoft.com/license/) och [officiell dokumentation](https://docs.transistorsoft.com/react-native/setup/).

## 5. API och synkronisering

API:et ska:

- dokumenteras med OpenAPI
- versionshanteras
- ha tydliga felkoder och felmeddelanden
- stödja paginering och filtrering
- kunna hantera stora GPX-filer och GPS-spår
- ha idempotenta synkroniseringsanrop
- kunna återuppta avbrutna överföringar

Backend ska vara stateless. Ingen information som krävs för systemets funktion får enbart finnas i en enskild backend-instans eller i dess lokala filsystem.

Filer och större exportobjekt bör lagras i gemensam objektlagring eller annan lagring som kan användas av flera backendinstanser.

## 6. Skalning

Backend ska utformas för horisontell skalning:

- flera instanser ska kunna köras parallellt
- instanserna ska kunna ligga bakom lastbalanserare eller reverse proxy
- sessioner ska inte vara bundna till en specifik instans
- bakgrundsjobb ska tåla omstart och dubbla leveranser
- synkronisering ska vara idempotent
- databasanslutningar ska hanteras med poolning och tydliga gränser

Första installationen kan köras med en backendinstans, men arkitekturen ska inte hindra senare skalning.

## 7. Uppdatering utan driftstörning

Systemet ska kunna uppdateras med minimal eller ingen planerad driftstörning.

Det ska därför finnas stöd för:

- containerbaserad eller på annat sätt reproducerbar distribution
- health checks
- readiness- och liveness-kontroller
- rolling update eller blue-green deployment
- bakåtkompatibla API-förändringar
- databasmigreringar i flera bakåtkompatibla steg
- säkerhetskopiering före större förändringar
- återställning eller rollback vid misslyckad uppdatering

Databasmigreringar ska planeras så att gammal och ny applikationsversion kan samexistera under en övergångsperiod.

## 8. Drift på Linux och Proxmox

Backend och tillhörande tjänster ska kunna paketeras som Docker-containrar eller motsvarande reproducerbara artefakter.

Första driftmiljön bör kunna bestå av:

- Linux-VM på Proxmox
- Docker Compose eller motsvarande enkel orkestrering
- reverse proxy med TLS
- PostgreSQL/PostGIS
- separat backuphantering

Kubernetes bör inte vara ett krav för MVP, men lösningen ska inte byggas på funktioner som omöjliggör senare migrering till mer avancerad orkestrering.

## 9. Drift, observability och säkerhet

Systemet bör ha:

- strukturerad loggning
- korrelations-ID för API-anrop och synkronisering
- hälsokontroller
- mätvärden för API, databas och synkronisering
- larm vid återkommande synkroniseringsfel
- separata konfigurationer för utveckling, test och produktion
- secrets utanför källkod och versionshantering
- databasbackup
- dokumenterad och testad återläsning från backup
- krypterad trafik mellan klient, API och administrationsgränssnitt

## 10. Tekniska beslut som behöver fattas senare

- Kartleverantör och licensmodell.
- Lokal lagring i mobilappen, exempelvis SQLite-baserad lösning.
- Objektlagring för bilder och exporter.
- Val av autentisering och tokenmodell.
- Reverse proxy och TLS-hantering.
- CI/CD-lösning.
- Logg- och övervakningsplattform.
- Slutligt val av monorepoverktyg.
- Huruvida SignalR behövs för realtidsuppdateringar.
