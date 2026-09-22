# Implementation status

## Första vertikala skivan

Följande är implementerat som en körbar MVP-bas:

- ASP.NET Core API med versionerad `/api/v1`-yta.
- PostgreSQL/PostGIS-konfiguration via Docker Compose.
- Datamodeller för sökinsats, sektorer, spår och PLS/LKP/IPP-referenspunkter.
- CRUD för sökinsatser och sektorer.
- GeoJSON-export för sektorer och spår.
- GPX-import av track points och GPX-export av spår.
- CRUD för PLS/LKP/IPP-referenspunkter via API.
- Health endpoint och OpenAPI.
- React/TypeScript-admin med OpenStreetMap-karta.
- Skapande av sökinsats och ritning av polygonsektorer.
- Kartverktyg för polygon, fyrkant, cirkel, sträcka och text.
- Val av färg och linjetyp för nya ritobjekt.
- Redigering, flytt, borttagning samt Ctrl+Z/Ctrl+Y för ritobjekt.
- Sparande av senaste polygon/fyrkant som sektor.

## Medvetet kvar till nästa skiva

- Administratörsinloggning och rollbaserad åtkomst.
- Revisionslogg.
- Importförhandsgranskning, dubblettkontroll och robust partiell felhantering.
- PLS/LKP/IPP-redigering i adminvyn.
- Sektorredigering efter skapande i adminvyn.
- Patrull-/grupptilldelning och sökmetadsformulär.
- Automatiserade tester och EF Core-migrationer.
- Reverse proxy, TLS, backupjobb och produktionsobservability.
- Android- och iOS-appar.
