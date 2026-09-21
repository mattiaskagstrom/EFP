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
