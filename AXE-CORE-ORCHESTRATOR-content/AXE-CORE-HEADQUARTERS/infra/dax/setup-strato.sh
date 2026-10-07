#!/usr/bin/env bash
# STRATO DAX compute plane — eenmalige installatie. Draai als root OP de STRATO-VPS.
#
#   scp -r infra/dax root@<strato>:/opt/axe-dax-src
#   ssh root@<strato> 'bash /opt/axe-dax-src/setup-strato.sh "<publieke sleutel van de control plane>"'
#
# Wat het doet (en niet meer dan dat):
#   1. Docker + compose-plugin, logrotatie per container (daemon.json)
#   2. 4 GB swap als vangnet (16 GB RAM, Chromium is hongerig)
#   3. Firewall: alleen SSH erin. Docker luistert NIET op het netwerk.
#   4. De control plane mag alleen `docker system dial-stdio` via SSH
#      (zo werkt DOCKER_HOST=ssh://), niets anders: geen shell.
#   5. Bouwt het gedeelde image axe-dax-base:latest (één keer, alle DAX'en delen het).
#   6. Dagelijkse opruimronde (dax-onderhoud.sh) via cron.
#
# Idempotent: nog eens draaien kan geen kwaad. Verwijdert nooit volumes.
set -euo pipefail

PUBKEY="${1:-}"
SRC="$(cd "$(dirname "$0")" && pwd)"

echo "→ docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
install -d /etc/docker
cp "$SRC/daemon.json" /etc/docker/daemon.json
systemctl enable --now docker
systemctl restart docker

echo "→ swap"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "→ firewall (alleen ssh)"
if command -v ufw >/dev/null; then
  ufw allow OpenSSH >/dev/null
  ufw --force enable >/dev/null
fi

echo "→ control-plane toegang (alleen docker dial-stdio)"
id -u axe-dax >/dev/null 2>&1 || useradd -m -s /bin/bash axe-dax
usermod -aG docker axe-dax
install -d -m 700 -o axe-dax -g axe-dax /home/axe-dax/.ssh
if [ -n "$PUBKEY" ]; then
  REGEL="command=\"docker system dial-stdio\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $PUBKEY"
  touch /home/axe-dax/.ssh/authorized_keys
  grep -qF "$PUBKEY" /home/axe-dax/.ssh/authorized_keys || echo "$REGEL" >> /home/axe-dax/.ssh/authorized_keys
  chown axe-dax:axe-dax /home/axe-dax/.ssh/authorized_keys
  chmod 600 /home/axe-dax/.ssh/authorized_keys
else
  echo "   (geen sleutel meegegeven — voeg hem later toe en draai dit opnieuw)"
fi

echo "→ image axe-dax-base:latest"
docker build -t axe-dax-base:latest "$SRC"

echo "→ onderhoud"
install -m 755 "$SRC/dax-onderhoud.sh" /usr/local/bin/dax-onderhoud
cat > /etc/cron.d/axe-dax-onderhoud <<'CRON'
17 4 * * * root /usr/local/bin/dax-onderhoud >> /var/log/axe-dax-onderhoud.log 2>&1
CRON

echo "✓ klaar. Op de control plane:"
echo "   AXE_DAX_ENABLED=1"
echo "   AXE_DAX_DOCKER_HOST_STRATO=ssh://axe-dax@$(hostname -I | awk '{print $1}')"
echo "   AXE_DAX_MAX_HEAVY=3"
