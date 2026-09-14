#!/usr/bin/env bash
# Uitrollen vanaf de Mac, met dezelfde gedachte als scripts/vps_sync.py:
# eerst vergelijken, dan pas overschrijven, en altijd een weg terug.
#
#   backend/northsea_mcp/deploy/deploy.sh check     # wat zou er veranderen (rsync --dry-run --checksum)
#   backend/northsea_mcp/deploy/deploy.sh install   # eerste keer: code + install.sh op de box
#   backend/northsea_mcp/deploy/deploy.sh deploy    # backup -> code -> pip -> herstart -> health; bij falen terugrollen
#   backend/northsea_mcp/deploy/deploy.sh rollback  # vorige backup terugzetten
set -euo pipefail

HOST=${AXE_VPS_HOST:-root@212.227.91.79}
KEY=${AXE_VPS_KEY:-$HOME/.ssh/axe-core-vps}
HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")
RSYNC_SSH="ssh -i $KEY -o BatchMode=yes"

case "${1:-}" in
  check)
    rsync -rcn --delete --itemize-changes -e "$RSYNC_SSH" --exclude '__pycache__' "$HIER/northsea_mcp/" "$HOST:/opt/northsea-mcp/app/northsea_mcp/"
    ;;
  install)
    "${SSH[@]}" "mkdir -p /opt/northsea-mcp/incoming"
    rsync -a --delete -e "$RSYNC_SSH" --exclude '.venv' --exclude '__pycache__' --exclude '.pytest_cache' \
      "$HIER/northsea_mcp" "$HIER/requirements.txt" "$HIER/deploy" "$HOST:/opt/northsea-mcp/incoming/"
    "${SSH[@]}" "bash /opt/northsea-mcp/incoming/deploy/install.sh"
    ;;
  deploy)
    STAMP=$(date -u +%Y%m%d-%H%M%S)
    "${SSH[@]}" "set -e; mkdir -p /opt/northsea-mcp/backups/$STAMP /opt/northsea-mcp/incoming; cp -a /opt/northsea-mcp/app/northsea_mcp /opt/northsea-mcp/backups/$STAMP/; ls -1dt /opt/northsea-mcp/backups/* | tail -n +11 | xargs -r rm -rf"
    rsync -a --delete -e "$RSYNC_SSH" --exclude '.venv' --exclude '__pycache__' --exclude '.pytest_cache' \
      "$HIER/northsea_mcp" "$HIER/requirements.txt" "$HIER/deploy" "$HOST:/opt/northsea-mcp/incoming/"
    "${SSH[@]}" "set -e
      rsync -a --delete --exclude '__pycache__' /opt/northsea-mcp/incoming/northsea_mcp/ /opt/northsea-mcp/app/northsea_mcp/
      /opt/northsea-mcp/venv/bin/pip install -q -r /opt/northsea-mcp/incoming/requirements.txt
      systemctl restart northsea-mcp
      for i in \$(seq 1 30); do curl -fsS http://127.0.0.1:8040/health >/dev/null 2>&1 && break; sleep 1; done
      if ! curl -fsS http://127.0.0.1:8040/health; then
        echo 'health faalt -> terugrollen naar $STAMP'
        rsync -a --delete /opt/northsea-mcp/backups/$STAMP/northsea_mcp/ /opt/northsea-mcp/app/northsea_mcp/
        systemctl restart northsea-mcp; exit 1
      fi"
    echo; echo "uitgerold (backup $STAMP)"
    ;;
  rollback)
    "${SSH[@]}" "set -e; B=\$(ls -1dt /opt/northsea-mcp/backups/* | head -1); rsync -a --delete \$B/northsea_mcp/ /opt/northsea-mcp/app/northsea_mcp/; systemctl restart northsea-mcp; sleep 3; curl -fsS http://127.0.0.1:8040/health; echo; echo teruggezet naar \$B"
    ;;
  *) echo "gebruik: $0 check|install|deploy|rollback"; exit 2 ;;
esac
