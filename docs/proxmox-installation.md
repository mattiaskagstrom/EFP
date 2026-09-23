# Installation på Proxmox

EFP kan installeras med ett Community Scripts-liknande bootstrap-skript som körs direkt på en Proxmox VE-nod och skapar en separat Debian 12-LXC.

## Snabbinstallation

Kör som `root` i Proxmox Shell:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/mattiaskagstrom/EFP/refs/heads/master/scripts/proxmox/efp-install.sh)"
```

Skriptet frågar efter CT-ID, hostname, nätverksbrygga, lagring samt Git-repository och branch. Standardvärdena kan normalt accepteras med Enter.

## Vad som installeras

Skriptet hämtar Debian 12, skapar en unprivilegierad LXC med Docker-features, installerar Docker Engine/Compose, klonar EFP till `/opt/efp`, skapar en slumpmässig databashemlighet i `.env` och startar PostgreSQL/PostGIS, API och React-admin med Docker Compose. Containrarna startar automatiskt efter omstart.

Admin-gränssnittet exponeras på port `5173` och API/OpenAPI på port `8080`. Efter installation visas LXC-IP och root-lösenord.

## Konfigurera Superadmin-kontot

Superadmin-kontot skapas vid API:ets uppstart från konfigurationen `Superadmin__Username` och `Superadmin__Password`. På Proxmox ligger konfigurationen i `/opt/efp/.env` inne i LXC-containern.

Anslut till containern:

```bash
pct enter <CT-ID>
cd /opt/efp
```

Öppna `.env` och lägg till ett unikt konto och lösenord:

```bash
nano /opt/efp/.env
```

Exempel:

```dotenv
EFP_DB_PASSWORD=<databaslösenordet som installationsskriptet skapade>
ASPNETCORE_ENVIRONMENT=Production
Superadmin__Username=superadmin
Superadmin__Password=<minst 10 tecken>
```

Lösenordet måste vara minst 10 tecken. Använd gärna ett slumpmässigt lösenord med minst 20 tecken och undvik radbrytningar; värden med specialtecken kan omges av dubbla citationstecken i `.env`.

Starta om API-containern så att konfigurationen läses in:

```bash
chmod 600 /opt/efp/.env
docker compose up -d --force-recreate api
docker compose logs --tail=100 api
```

När API-containern startar skapas rollen `Superadmin` och användaren om de inte redan finns. Logga sedan in i adminvyn och öppna `/admin/system` för att kontrollera systemöversikten.

Viktigt:

- Lägg aldrig `.env` i Git och visa inte lösenordet i loggar eller skärmdumpar.
- Om kontot redan finns lägger bootstrapen bara till rollen `Superadmin`; den ändrar inte lösenordet vid varje omstart. Sätt därför värdena innan första uppstarten.
- Om konfigurationen saknas startar API:et fortfarande, men något Superadmin-konto skapas inte.
- Konfigurationen gäller API-containern. Ändra inte bara miljövariabler på Proxmox-värden utan att återskapa containern.

Se även [Bootstrap av Superadmin](drift-bootstrap-superadmin.md) och [Autentisering och behörighet](autentisering-och-behorighet.md).

## Uppdatering

```bash
pct exec <CT-ID> -- bash -lc 'cd /opt/efp && git pull --ff-only && docker compose up -d --build'
```

Databasvolymen påverkas inte av en normal uppdatering. Ta backup före uppdatering när miljön innehåller viktig data.

## Kontroll och felsökning

```bash
pct status <CT-ID>
pct enter <CT-ID>
```

Inne i containern:

```bash
cd /opt/efp
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 admin
curl http://localhost:8080/health
```

## Säkerhet och begränsningar

Installationen använder HTTP och är avsedd för labb eller internt nät. Före skarp drift bör TLS införas, API-port `8080` begränsas, backup/återläsning testas och autentisering färdigställas. Skydda `/opt/efp/.env` och lägg inte filen i Git.

Containern är unprivilegierad, men Docker i LXC kräver `nesting` och `keyctl`. För högre isolering bör Compose-stack köras i en dedikerad VM.

## Avveckling

Kontrollera CT-ID och säkerhetskopiera först:

```bash
pct stop <CT-ID>
pct destroy <CT-ID>
```

`pct destroy` är destruktivt och tar även bort databasdata i containern.

## Relaterade filer

- [Proxmox-installationsskript](../scripts/proxmox/efp-install.sh)
- [Docker Compose](../docker-compose.yml)
- [Teknisk arkitektur](teknisk-arkitektur.md)
