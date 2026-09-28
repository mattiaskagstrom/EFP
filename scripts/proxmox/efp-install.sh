#!/usr/bin/env bash
# EFP Proxmox installer, designed for the community-scripts style of execution.
# bash -c "$(curl -fsSL https://raw.githubusercontent.com/mattiaskagstrom/EFP/refs/heads/master/scripts/proxmox/efp-install.sh)"
set -Eeuo pipefail

readonly REPO_URL_DEFAULT="https://github.com/mattiaskagstrom/EFP.git"
readonly BRANCH_DEFAULT="master"
readonly HOSTNAME_DEFAULT="efp"
readonly BRIDGE_DEFAULT="vmbr0"
readonly TEMPLATE_STORAGE_DEFAULT="local"
readonly ROOTFS_STORAGE_DEFAULT="local-lvm"
readonly CTID_DEFAULT="$(pvesh get /cluster/nextid 2>/dev/null || true)"

log() { printf '\033[1;36m[EFP]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[EFP]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[EFP FEL]\033[0m %s\n' "$*" >&2; exit 1; }
command_exists() { command -v "$1" >/dev/null 2>&1; }
ask() { local prompt="$1" default="$2" answer; read -r -p "$prompt [$default]: " answer; printf '%s' "${answer:-$default}"; }

[[ "$(id -u)" == "0" ]] || die "Skriptet måste köras som root på Proxmox-noden."
command_exists pct || die "Kommandot pct saknas. Kör skriptet på en Proxmox VE-nod."
command_exists pveam || die "Kommandot pveam saknas. Kör skriptet på en Proxmox VE-nod."
command_exists pvesm || die "Kommandot pvesm saknas. Kör skriptet på en Proxmox VE-nod."

CTID="$(ask 'CT-ID' "${CTID_DEFAULT:-220}")"
HOSTNAME="$(ask 'Hostname' "$HOSTNAME_DEFAULT")"
BRIDGE="$(ask 'Nätverksbrygga' "$BRIDGE_DEFAULT")"
TEMPLATE_STORAGE="$(ask 'Lagring för LXC-template' "$TEMPLATE_STORAGE_DEFAULT")"
ROOTFS_STORAGE="$(ask 'Lagring för LXC-disk' "$ROOTFS_STORAGE_DEFAULT")"
REPO_URL="$(ask 'Git-repository' "$REPO_URL_DEFAULT")"
BRANCH="$(ask 'Git-branch' "$BRANCH_DEFAULT")"

[[ "$CTID" =~ ^[0-9]+$ ]] || die "CT-ID måste vara numeriskt."
pct status "$CTID" >/dev/null 2>&1 && die "CT $CTID finns redan."
pvesm status --storage "$TEMPLATE_STORAGE" >/dev/null 2>&1 || die "Lagringen $TEMPLATE_STORAGE hittades inte."
pvesm status --storage "$ROOTFS_STORAGE" >/dev/null 2>&1 || die "Lagringen $ROOTFS_STORAGE hittades inte."

TEMPLATE="$(pveam available --section system | awk '$2 ~ /^debian-12-standard_/ { print $2; exit }')"
[[ -n "$TEMPLATE" ]] || die "Kunde inte hitta Debian 12-template via pveam."
TEMPLATE_FILE="$(pvesm list "$TEMPLATE_STORAGE" --content vztmpl 2>/dev/null | awk -v template="$TEMPLATE" '$1 ~ template { print $1; exit }')"
if [[ -z "$TEMPLATE_FILE" ]]; then
  log "Laddar ned $TEMPLATE till $TEMPLATE_STORAGE ..."
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
  TEMPLATE_FILE="$(pvesm list "$TEMPLATE_STORAGE" --content vztmpl 2>/dev/null | awk -v template="$TEMPLATE" '$1 ~ template { print $1; exit }')"
fi
[[ -n "$TEMPLATE_FILE" ]] || die "Debian-template kunde inte lokaliseras efter nedladdning."

ROOT_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24 || true)"
log "Skapar LXC $CTID ($HOSTNAME) ..."
pct create "$CTID" "$TEMPLATE_FILE" \
  --hostname "$HOSTNAME" \
  --cores 2 \
  --memory 4096 \
  --swap 1024 \
  --rootfs "$ROOTFS_STORAGE:16" \
  --net0 "name=eth0,bridge=$BRIDGE,ip=dhcp,type=veth" \
  --features "nesting=1,keyctl=1" \
  --unprivileged 1 \
  --onboot 1 \
  --password "$ROOT_PASSWORD"

cleanup_on_error() { warn "Installationen misslyckades. Containern $CTID finns kvar för felsökning."; }
trap cleanup_on_error ERR
pct start "$CTID"
until pct exec "$CTID" -- true >/dev/null 2>&1; do sleep 2; done

log "Installerar Docker, Git och Compose i containern ..."
pct exec "$CTID" -- bash -s -- "$REPO_URL" "$BRANCH" <<'CONTAINER_SCRIPT'
set -Eeuo pipefail
REPO_URL="$1"
BRANCH="$2"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
mkdir -p /opt
if [[ -d /opt/efp/.git ]]; then
  git -C /opt/efp fetch --tags origin
  git -C /opt/efp checkout "$BRANCH"
  git -C /opt/efp pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" /opt/efp
fi
cd /opt/efp
if [[ ! -f /opt/efp/.env ]]; then
  DB_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32 || true)"
  printf 'EFP_DB_PASSWORD=%s\nASPNETCORE_ENVIRONMENT=Production\n# Konfigurera Superadmin__Username och Superadmin__Password före skarp drift.\n' "$DB_PASSWORD" > /opt/efp/.env
  chmod 600 /opt/efp/.env
fi
docker compose up -d --build
CONTAINER_SCRIPT

trap - ERR
IP="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')"
log "EFP är installerat."
printf '\nÖppna admin-gränssnittet: http://%s:5173\n' "${IP:-<container-ip>}"
printf 'API/OpenAPI:              http://%s:8080/openapi/v1.json\n' "${IP:-<container-ip>}"
printf 'LXC root-lösenord:        %s\n' "$ROOT_PASSWORD"
printf '\nUppdatera senare med:\n  pct exec %s -- bash -lc "cd /opt/efp && git pull --ff-only && docker compose up -d --build"\n' "$CTID"
printf '\nRekommendation: lägg TLS/reverse proxy framför port 5173 innan skarp drift.\n'
