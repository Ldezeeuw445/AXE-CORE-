#!/bin/bash
# AXE CORE — fresh VPS bootstrap
# Run as root on a brand-new box: bash vps-bootstrap.sh
#
# Sized for the 6 vCore / 8GB RAM / 240GB NVMe tier. Ollama can only keep
# ~one 7-8B model resident in RAM at a time on 8GB alongside everything
# else here — that's a hardware ceiling, not a config mistake. Don't add
# bigger models (14B+, or deepseek-coder-v2) without upgrading RAM first.
# By the end of this script there are potentially SIX background processes
# on this one 8GB box (Ollama, axe_api, n8n if you run it, OpenJarvis,
# Hermes Agent, OpenClaw) plus CrewAI/Kilo Code spawned on demand. Run
# `free -h` after each service comes up — if you're tight, the lightest
# things to cut first are OpenJarvis's bundled Ollama (see step 6) and
# running Ollama's OLLAMA_KEEP_ALIVE even shorter than 5m.
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
# OpenJarvis, Hermes Agent, and OpenClaw are all real, confirmed projects
# (verified against their actual sites/docs — not guessed) with real
# install one-liners, installed below. What's still NOT done here:
#   - The exact "run as an always-on background service" command for Hermes
#     Agent and OpenClaw. I have their real install steps and (for OpenClaw)
#     its real Ollama config format, but not a verified daemon/serve
#     subcommand for either — asserting one I haven't confirmed would be
#     exactly the "looks wired up, isn't real" problem this cleanup exists
#     to fix. Step 6 below installs both for real and tells you the one
#     command to run (--help) to find the real subcommand, then how to turn
#     that into a systemd unit.
#   - The axe_api routes that actually call these (/internal/{openjarvis,
#     openclaw,kilocode,hermes}/execute) — none exist in main.py yet. Once
#     each tool's real local API/CLI shape is confirmed, those get built
#     the same way /crew/run already works (see crew_runner.py).
#   - A standalone Kilo Code *server*: Kilo Code (kilo.ai) is real but is an
#     IDE extension / CLI tool, not something with a persistent-server mode
#     — it gets invoked per-task via subprocess, same pattern as CrewAI's
#     crew_runner.py, not installed as a systemd service like Ollama.
#   - OpenHands: real, documented (github.com/All-Hands-AI/OpenHands), but
#     its Docker image tags change between releases and I can't verify the
#     current ones from this sandbox. See the commented-out block near the
#     bottom — check that repo's current README before uncommenting it.
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

# ── 6. OpenJarvis, Hermes Agent, OpenClaw ───────────────────────────────────
# Real installers, confirmed against each project's actual site. All three
# are personal-agent frameworks, not just chat APIs, which is the whole
# point of routing different task types to different ones (LangGraph's job).
#
# ⚠ OpenJarvis's installer bundles its own Ollama + a starter model. On this
#   8GB box that's a second Ollama fighting the one from step 2 for RAM —
#   check for a running second `ollama serve` after this step and either
#   stop it or point OpenJarvis's config at the existing instance
#   (http://127.0.0.1:11434) instead of letting it run its own.
echo "→ Installing OpenJarvis..."
curl -fsSL https://open-jarvis.github.io/OpenJarvis/install.sh | bash || echo "   ! OpenJarvis install failed — check https://openjarvis.stanford.edu/ for current steps"
echo "   ⚠ CHECK NOW: run 'ps aux | grep ollama' — if OpenJarvis started a second"
echo "     Ollama process, stop it and point OpenJarvis at the existing one instead."

echo "→ Installing Hermes Agent..."
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash || echo "   ! Hermes Agent install failed — check https://hermes-agent.nousresearch.com/ for current steps"

echo "→ Installing OpenClaw..."
curl -fsSL https://openclaw.ai/install.sh | bash || echo "   ! OpenClaw install failed — check https://openclaw.ai/ for current steps"
mkdir -p ~/.openclaw
cat > ~/.openclaw/openclaw.json <<'EOF'
{
  "modelProviders": {
    "ollama": {
      "baseUrl": "http://127.0.0.1:11434",
      "type": "ollama-local"
    }
  }
}
EOF
echo "   → wrote ~/.openclaw/openclaw.json pointing at the local Ollama instance"
echo "   (this is OpenClaw's documented native-Ollama config shape — verified against docs.openclaw.ai/providers/ollama)"

echo ""
echo "   None of these three are running as a background service yet. For each:"
echo "     jarvis --help     # find the real 'serve'-style subcommand, then wrap it in a systemd unit"
echo "     hermes --help     # same"
echo "     openclaw --help   # same"
echo "   (Kilo Code is intentionally not installed here — it's invoked per-task via"
echo "    subprocess once its axe_api route exists, same pattern as CrewAI's crew_runner.py,"
echo "    not run as a standing service. Check kilo.ai for the current real install command"
echo "    when that route gets built — not asserting an exact package name I haven't verified.)"

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
echo "Installed but NOT yet running as a service (need the --help check from step 6):"
echo "  OpenJarvis, Hermes Agent, OpenClaw — installed for real, need one manual"
echo "  command check each to find their real 'serve' subcommand, then a systemd unit."
echo "Not installed by this script at all:"
echo "  Kilo Code — invoked per-task via subprocess once its axe_api route exists,"
echo "  not a standing service. OpenHands — real project, but check"
echo "  github.com/All-Hands-AI/OpenHands's current README for the right Docker image"
echo "  tag before uncommenting the block near the bottom of this script."
echo "None of these four have an axe_api route yet (/internal/*/execute 404s until built)."

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
