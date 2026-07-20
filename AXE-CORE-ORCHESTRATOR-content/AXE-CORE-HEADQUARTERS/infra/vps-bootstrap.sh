#!/bin/bash
# AXE CORE — fresh VPS bootstrap
# Run as root on a brand-new box: bash vps-bootstrap.sh
#
# Sized for the 6 vCore / 8GB RAM / 240GB NVMe tier. Ollama can only keep
# ~one 7-8B model resident in RAM at a time on 8GB alongside everything
# else here — that's a hardware ceiling, not a config mistake. Don't add
# bigger models (14B+, or deepseek-coder-v2) without upgrading RAM first.
#
# What this script does, in order:
#   1. System packages: nginx, certbot, python3, git
#   2. Ollama + a model set sized for 8GB, with CORS + single-model-in-RAM config
#   3. axe_api (backend/axe_api/deploy.sh — already exists, handles its own
#      nginx vhost + cert for api.axecompanion.com)
#   4. nginx + cert for ollama.axecompanion.com specifically (deploy.sh
#      doesn't touch this one)
#   5. The CrewAI crew's isolated venv (backend/axe_api/requirements_crew.txt)
#
# What this script deliberately does NOT do, and why:
#   - OpenJarvis, OpenClaw, a standalone Kilo Code server, Hermes Agent:
#     the frontend calls /internal/{openjarvis,openclaw,kilocode,hermes}/execute
#     as if these are real running services, but axe_api's main.py has never
#     implemented those routes, and I don't have verified real install
#     instructions for any of these as standalone HTTP servers (their entries
#     in this repo's own provider catalog link to generic github.com, not a
#     specific repo). Scripting fake-but-plausible install steps for them
#     would just be a second instance of the "looks wired up, isn't real"
#     problem this cleanup is trying to get rid of. If you have a specific
#     real project in mind for any of these names, give me its actual repo
#     and I'll wire it properly — both here and as real axe_api routes.
#   - OpenHands: this IS a real, documented project (github.com/All-Hands-AI/OpenHands),
#     but its Docker image tags and setup steps change over time and I can't
#     verify the current ones from this sandbox. See the commented-out block
#     near the bottom — check that repo's current README before uncommitting it.
#
# DNS: point both api.axecompanion.com and ollama.axecompanion.com A records
# at this server's IP before running (certbot needs that to issue certs).

set -euo pipefail

REPO_BRANCH="orchestrator"
DOMAIN_API="api.axecompanion.com"
DOMAIN_OLLAMA="ollama.axecompanion.com"
CERT_EMAIL="admin@axecompanion.com"   # change if you want cert-expiry emails elsewhere

echo "╔══════════════════════════════════════════╗"
echo "║  AXE CORE — VPS Bootstrap                 ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. System packages ──────────────────────────────────────────────────────
echo "→ Installing system packages..."
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx python3 python3-venv python3-pip git curl >/dev/null

# ── 2. Ollama ────────────────────────────────────────────────────────────────
echo "→ Installing Ollama..."
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

echo "→ Configuring Ollama (CORS + one-model-in-RAM for 8GB)..."
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_KEEP_ALIVE=5m"
EOF
systemctl daemon-reload
systemctl enable --now ollama
systemctl restart ollama
sleep 3

echo "→ Pulling models (sized for 8GB RAM — nothing over ~5GB Q4 each)..."
# llama3 / mistral / deepseek-coder:6.7b are the exact tags crew.py's 9
# specialists already expect (see axe_core___god_mode_ai_system/crew.py) —
# pulling anything else for them means editing that file's model strings too.
for m in llama3.2:3b llama3.1:8b llama3 mistral deepseek-coder:6.7b qwen2.5-coder:7b nomic-embed-text; do
  echo "   pulling $m ..."
  ollama pull "$m" || echo "   ! failed to pull $m — continuing"
done

echo "→ Ollama models actually present:"
ollama list

# ── 3. axe_api ───────────────────────────────────────────────────────────────
echo "→ Deploying axe_api (backend/axe_api/deploy.sh)..."
mkdir -p /opt/axe-core-api
cd /opt/axe-core-api
if [ ! -d .git ]; then
  git clone --branch "$REPO_BRANCH" --depth 1 https://github.com/Ldezeeuw445/AXE-CORE-.git .
fi
bash AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api/deploy.sh
echo ""
echo "   ⚠ /opt/axe-core-api/.env still needs real values — this only ran once"
echo "     with placeholders. Edit it now:  nano /opt/axe-core-api/.env"
echo "     then:  systemctl restart axe-core-api"

# ── 4. nginx + cert for ollama.axecompanion.com ─────────────────────────────
echo "→ Setting up nginx + cert for $DOMAIN_OLLAMA..."
cat > /etc/nginx/sites-available/$DOMAIN_OLLAMA <<EOF
server {
    listen 80;
    server_name $DOMAIN_OLLAMA;
    location / {
        proxy_pass http://127.0.0.1:11434;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 300s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/$DOMAIN_OLLAMA /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d "$DOMAIN_OLLAMA" --non-interactive --agree-tos -m "$CERT_EMAIL" || \
  echo "   ! certbot failed — check that $DOMAIN_OLLAMA's DNS A record already points here"

# ── 5. CrewAI crew — isolated venv (per requirements_crew.txt's own instructions) ──
echo "→ Setting up the CrewAI crew's isolated venv..."
python3 -m venv /opt/axe-crew-venv
/opt/axe-crew-venv/bin/pip install --quiet --upgrade pip
/opt/axe-crew-venv/bin/pip install --quiet -r \
  /opt/axe-core-api/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api/requirements_crew.txt

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Done. Real, verified next steps:         ║"
echo "╚══════════════════════════════════════════╝"
echo "1. nano /opt/axe-core-api/.env  — fill in AXE_API_KEY, SUPABASE_SERVICE_ROLE, etc."
echo "2. systemctl restart axe-core-api"
echo "3. curl https://$DOMAIN_API/health   (expect 200)"
echo "4. curl https://$DOMAIN_OLLAMA/api/tags   (expect your pulled models listed)"
echo "5. In Vercel: set AXE_CORE_API_URL=https://$DOMAIN_API and AXE_CORE_API_KEY=<the same value as AXE_API_KEY above>"
echo "   — both server-side, NOT VITE_-prefixed."
echo ""
echo "Test /crew/run once axe-core-api is up:"
echo "  curl -X POST https://$DOMAIN_API/crew/run -H 'Authorization: Bearer <AXE_API_KEY>' \\"
echo "       -H 'Content-Type: application/json' -d '{\"task\":\"say hello\"}'"
echo ""
echo "NOT set up by this script (see the comment block at the top for why):"
echo "  OpenJarvis, OpenClaw, Kilo Code server, Hermes Agent — no verified real target."
echo "  OpenHands — real project, but check github.com/All-Hands-AI/OpenHands's"
echo "  current README for the right Docker image tag before deploying it."

# ── OpenHands (OPTIONAL — verify against current docs before running) ───────
# Real, documented project. Needs Docker. Uncomment and check image tags at
# https://github.com/All-Hands-AI/OpenHands first — these change between
# releases and I can't confirm the current ones from here.
#
# apt-get install -y docker.io
# docker run -d --name openhands-app --restart unless-stopped \
#   -e SANDBOX_RUNTIME_CONTAINER_IMAGE=docker.all-hands.dev/all-hands-ai/runtime:latest \
#   -e LLM_MODEL="ollama/qwen2.5-coder:7b" \
#   -e LLM_BASE_URL="http://host.docker.internal:11434" \
#   -v /var/run/docker.sock:/var/run/docker.sock \
#   -v ~/.openhands:/.openhands \
#   -p 3001:3000 \
#   --add-host host.docker.internal:host-gateway \
#   docker.all-hands.dev/all-hands-ai/openhands:latest
