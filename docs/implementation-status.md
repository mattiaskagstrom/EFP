# Implementation status

## Första vertikala skivan

Följande är implementerat som en körbar MVP-bas:

- ASP.NET Core API med versionerad `/api/v1`-yta.
- PostgreSQL/PostGIS-konfiguration via Docker Compose.
- Datamodeller för sökinsats, zoner, spår och PLS/LKP/IPP-referenspunkter.
- CRUD för sökinsatser och zoner.
- GeoJSON-export för zoner och spår.
- GPX-import av track points och GPX-export av spår.
- CRUD för PLS/LKP/IPP-referenspunkter via API.
- Health endpoint och OpenAPI.
- React/TypeScript-admin med OpenStreetMap-karta.
- Skapande av sökinsats och ritning av polygonzoner.

## Medvetet kvar till nästa skiva

- Administratörsinloggning och rollbaserad åtkomst.
- Revisionslogg.
- Importförhandsgranskning, dubblettkontroll och robust partiell felhantering.
- PLS/LKP/IPP-redigering i adminvyn.
- Zonredigering efter skapande i adminvyn.
- Patrull-/grupptilldelning och sökmetadsformulär.
- Automatiserade tester och EF Core-migrationer.
- Reverse proxy, TLS, backupjobb och produktionsobservability.
- Android- och iOS-appar.
