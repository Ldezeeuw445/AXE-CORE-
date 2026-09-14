#!/usr/bin/env bash
# Eenmalige inrichting op de API-box, idempotent. Draait als root OP de box.
#
#   bash /opt/northsea-mcp/incoming/deploy/install.sh
#
# Wat dit NIET doet: sleutels schrijven. /opt/northsea-mcp/.env moet al bestaan
# (zie env.example); dit script controleert alleen of de NAMEN er zijn.
set -euo pipefail

ROOT=/opt/northsea-mcp
INCOMING=$ROOT/incoming
DOMAIN=mcp.northseacommodity.com

echo "== gebruiker en mappen"
id northsea-mcp >/dev/null 2>&1 || useradd --system --home-dir $ROOT --shell /usr/sbin/nologin northsea-mcp
mkdir -p $ROOT/app $ROOT/state $ROOT/backups
# Rechten expliciet, nooit via de umask: bij de eerste uitrol maakte een
# stap met `umask 077` $ROOT aan als 700, en dan kon de service-gebruiker
# niet eens bij zijn eigen code (Permission denied, unit bleef herstarten).
chown root:root $ROOT && chmod 755 $ROOT
chown northsea-mcp:northsea-mcp $ROOT/state && chmod 750 $ROOT/state
chmod 700 $ROOT/backups

echo "== omgeving (alleen namen controleren)"
[ -f $ROOT/.env ] || { echo "ontbreekt: $ROOT/.env (zie deploy/env.example)"; exit 2; }
chown root:northsea-mcp $ROOT/.env && chmod 640 $ROOT/.env
for naam in NORTHSEA_MCP_PUBLIC_URL NORTHSEA_MCP_STATE_DB NORTHSEA_MCP_ALLOWED_USER_IDS NORTHSEA_SUPABASE_URL \
            NORTHSEA_SUPABASE_SERVICE_ROLE SUPABASE_URL SUPABASE_SERVICE_ROLE AXE_API_KEY; do
  grep -qE "^${naam}=.+" $ROOT/.env || { echo "leeg of ontbreekt in .env: $naam"; exit 2; }
done

echo "== code en venv"
rsync -a --delete --exclude '.venv' --exclude '__pycache__' --exclude 'tests' "$INCOMING/northsea_mcp/" $ROOT/app/northsea_mcp/
[ -x $ROOT/venv/bin/python ] || python3.12 -m venv $ROOT/venv
$ROOT/venv/bin/pip install -q --upgrade pip
$ROOT/venv/bin/pip install -q -r "$INCOMING/requirements.txt"
chmod -R u=rwX,go=rX $ROOT/app $ROOT/venv

echo "== systemd"
install -m 644 "$INCOMING/deploy/northsea-mcp.service" /etc/systemd/system/northsea-mcp.service
systemctl daemon-reload
systemctl enable northsea-mcp >/dev/null
systemctl restart northsea-mcp
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:8040/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8040/health; echo

echo "== nginx"
echo 'limit_req_zone $binary_remote_addr zone=northsea_oauth:10m rate=20r/m;' > /etc/nginx/conf.d/northsea-mcp-limits.conf
if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
  # Eerst alleen poort 80 zodat certbot de uitdaging kan halen.
  cat > /etc/nginx/sites-available/$DOMAIN <<EOF
server { listen 80; listen [::]:80; server_name $DOMAIN; location /.well-known/acme-challenge/ { root /var/www/html; } location / { return 404; } }
EOF
  ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w /var/www/html -d $DOMAIN --non-interactive --agree-tos --register-unsafely-without-email
fi
install -m 644 "$INCOMING/deploy/nginx-mcp.northseacommodity.com.conf" /etc/nginx/sites-available/$DOMAIN
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
nginx -t && systemctl reload nginx

echo "== klaar"
curl -fsS https://$DOMAIN/health; echo
