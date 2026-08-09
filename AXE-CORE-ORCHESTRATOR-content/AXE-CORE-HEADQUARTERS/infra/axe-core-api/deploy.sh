#!/usr/bin/env bash
#
# Push axe-core-api to the VPS.
#
# Copies the tracked source over, restarts the unit, and verifies the service
# actually came back before returning. It deliberately never touches
# /opt/axe-core-api/.env — secrets live only on the host.
#
#   ./deploy.sh              deploy to the default host
#   HOST=1.2.3.4 ./deploy.sh deploy elsewhere
#
set -euo pipefail

HOST="${HOST:-root@212.227.91.79}"
KEYFILE="${KEYFILE:-$HOME/.ssh/axe-core-vps}"
REMOTE_DIR="/opt/axe-core-api"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ssh_() { ssh -i "$KEYFILE" "$HOST" "$@"; }

echo "→ checking syntax before shipping"
python3 -c "import ast,sys; ast.parse(open('$HERE/main.py').read())"

echo "→ backing up the running copy"
# Timestamped, so a bad deploy is one mv away from being undone.
ssh_ "cp $REMOTE_DIR/main.py $REMOTE_DIR/main.py.bak-\$(date +%Y%m%d-%H%M%S)"

echo "→ copying source"
scp -i "$KEYFILE" "$HERE/main.py" "$HOST:$REMOTE_DIR/main.py"
scp -i "$KEYFILE" "$HERE/prune_memory.sh" "$HOST:$REMOTE_DIR/prune_memory.sh"
scp -i "$KEYFILE" "$HERE/axe-core-api.service" "$HOST:/etc/systemd/system/axe-core-api.service"
ssh_ "chmod +x $REMOTE_DIR/prune_memory.sh"

echo "→ restarting"
ssh_ "systemctl daemon-reload && systemctl restart axe-core-api"
sleep 4

echo "→ verifying"
# `systemctl is-active` alone is not proof: uvicorn can be up while the app
# failed to import. Ask the service something only a working app can answer.
state=$(ssh_ "systemctl is-active axe-core-api" || true)
if [ "$state" != "active" ]; then
  echo "✗ unit is '$state' — last log lines:"
  ssh_ "journalctl -u axe-core-api -n 30 --no-pager"
  exit 1
fi

code=$(ssh_ "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8001/health --max-time 10" || echo "000")
if [ "$code" != "200" ]; then
  echo "✗ unit is active but /health returned $code — last log lines:"
  ssh_ "journalctl -u axe-core-api -n 30 --no-pager"
  exit 1
fi

echo "✓ deployed and healthy"
