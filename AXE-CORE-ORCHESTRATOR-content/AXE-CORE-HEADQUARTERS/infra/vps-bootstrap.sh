#!/bin/bash
# AXE CORE — fresh VPS bootstrap
# Run as root on a brand-new box:
#   OLLAMA_PROXY_KEY=<sleutel> ROL=ollama bash vps-bootstrap.sh
#
# ── WHICH BOX IS THIS? (ROL) ────────────────────────────────────────────────
# AXE runs on TWO servers, and this script can set up either one. Pick with ROL:
#
#   ROL=api     api.axecompanion.com — the main API. axe_api, the CrewAI venv,
#               the task worker, the terminal, AND the memory Ollama (bge-m3 on
#               127.0.0.1:11435, see backend/axe_api/ollama-geheugen.service).
#               Does NOT serve the general Ollama on 11434.
#   ROL=ollama  ollama.axecompanion.com — the model box. Ollama on 11434 with
#               its models, behind nginx+TLS, and nothing else. This is the role
#               Hetzner had until it died (1 Oct 2026); a second Strato takes it
#               over. Point ollama.axecompanion.com's A record at the new box and
#               the app needs NO code change — every caller in the frontend
#               addresses that hostname (see infrastructure/config/ollamaSleutel.ts).
#   ROL=alles   everything on one box. What this script used to do unconditionally.
#               Only for a single-server setup, and it will be tight.
#
# Why the memory Ollama stays on the API box and does not move here: an
# embedding that has to cross the internet to another server is an embedding
# that fails when that server is down. The memory must not depend on the model
# box being up — that is exactly the failure that took the old setup out.
#
# ── SIZING: 16GB ────────────────────────────────────────────────────────────
# Written for 16GB RAM (the old 8GB tier is what the warnings below used to be
# about, and it was the real ceiling: one 7-8B model resident, nothing bigger).
# With 16GB on a ROL=ollama box, where nothing else competes:
#   - two 7-8B Q4 models resident at once (~5GB each) — hence MAX_LOADED_MODELS=2
#   - or one 14B Q4 (~9GB), but then only one; 14B+ and deepseek-coder-v2 are
#     possible here where they were not before. Still check `free -h` first.
# On ROL=api or ROL=alles the old caution stands: axe_api, the task worker, the
# crew and the memory Ollama all want RAM too. Run `free -h` after each service
# comes up.
#
# What this script does, in order (steps marked per role):
#   1. System packages: nginx, certbot, python3, git          [all roles]
#   2. Ollama + a model set, with CORS + RAM config           [ollama, alles]
#  2b. De git-checkout in /opt/axe-core-api                   [all roles]
#   3. axe_api (backend/axe_api/deploy.sh — handles its own
#      nginx vhost + cert for api.axecompanion.com)           [api, alles]
#   4. nginx + SLOT + cert voor ollama.axecompanion.com, plus
#      de terminalserver van deze box op /terminal            [ollama, alles]
#   5. The CrewAI crew's isolated venv                        [api, alles]
#   6. OpenJarvis / Hermes / OpenClaw                         [alles only]
#
# Vereist bij ROL=ollama|alles (stap 4 stopt zonder):
#   OLLAMA_PROXY_KEY  de sleutel die nginx vóór Ollama accepteert. Dezelfde die
#                     in de app bij Instellingen > Ollama staat.
# Optioneel daarbij:
#   API_IP            het IP van de API-box; die mag er dan ook zonder sleutel
#                     bij (agent_loop.py stuurt er geen).
#   MEETMODUS=0       meteen dicht in plaats van eerst een dag loggen.
#   SUPABASE_URL / SUPABASE_ANON_KEY / AXE_TERMINAL_ALLOWED_USER_IDS
#                     gaan in /etc/axe-terminal.env; zonder de eerste twee
#                     weigert de terminalserver te starten.
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
# DNS, before running (certbot needs the A record to already point here):
#   ROL=api     api.axecompanion.com    → this box
#   ROL=ollama  ollama.axecompanion.com → this box. Repointing that record from
#               the dead Hetzner box to this one IS the switchover; nothing in
#               the app changes.
#   ROL=alles   both records → this box.

set -euo pipefail

REPO_BRANCH="orchestrator"
DOMAIN_API="api.axecompanion.com"
DOMAIN_OLLAMA="ollama.axecompanion.com"
CERT_EMAIL="admin@axecompanion.com"   # change if you want cert-expiry emails elsewhere

# Which box this is. No default on purpose: a wrong guess here either installs
# a second Ollama next to the API (the RAM fight this split exists to end) or
# deploys the API onto the model box.
ROL="${ROL:-}"
case "$ROL" in
  api|ollama|alles) ;;
  *)
    echo "ROL ontbreekt of is onbekend: '${ROL}'" >&2
    echo "Kies er één:" >&2
    echo "  ROL=api     bash vps-bootstrap.sh   # ${DOMAIN_API} — de hoofd-API" >&2
    echo "  ROL=ollama  bash vps-bootstrap.sh   # ${DOMAIN_OLLAMA} — de modelbox" >&2
    echo "  ROL=alles   bash vps-bootstrap.sh   # alles op één box" >&2
    exit 2
    ;;
esac
doe_ollama=false; doe_api=false; doe_extra=false
case "$ROL" in
  ollama) doe_ollama=true ;;
  api)    doe_api=true ;;
  alles)  doe_ollama=true; doe_api=true; doe_extra=true ;;
esac
echo "→ Rol: $ROL (ollama=$doe_ollama api=$doe_api extra=$doe_extra)"


echo "╔══════════════════════════════════════════╗"
echo "║  AXE CORE — VPS Bootstrap                 ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. System packages ──────────────────────────────────────────────────────
echo "→ Installing system packages..."
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx python3 python3-venv python3-pip git curl >/dev/null

# ── 2. Ollama ───────────────────────────────────────────── [ollama, alles] ──
if [ "$doe_ollama" = true ]; then
echo "→ Installing Ollama..."
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

# MAX_LOADED_MODELS was 1, because on 8GB one 7-8B model WAS the ceiling. On a
# 16GB box with nothing else on it, two of them fit (~5GB each Q4) and the
# second request stops waiting behind the first. KEEP_ALIVE goes from 5m to 10m
# for the same reason: on a dedicated box there is nothing to free the RAM for,
# and a cold load costs seconds every time.
# On ROL=alles, keep it at 1 and 5m — there everything else wants RAM too.
if [ "$ROL" = "ollama" ]; then
  MAX_LOADED=2; KEEP_ALIVE=10m
else
  MAX_LOADED=1; KEEP_ALIVE=5m
fi
echo "→ Configuring Ollama (CORS, ${MAX_LOADED} model(s) resident, keep-alive ${KEEP_ALIVE})..."
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf <<EOF
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
Environment="OLLAMA_MAX_LOADED_MODELS=${MAX_LOADED}"
Environment="OLLAMA_KEEP_ALIVE=${KEEP_ALIVE}"
EOF
systemctl daemon-reload
systemctl enable --now ollama
systemctl restart ollama
sleep 3

echo "→ Pulling models..."
# llama3 / mistral / deepseek-coder:6.7b are the exact tags crew.py's 9
# specialists already expect (see axe_core___god_mode_ai_system/crew.py) —
# pulling anything else for them means editing that file's model strings too.
for m in llama3.2:3b llama3.1:8b llama3 mistral deepseek-coder:6.7b qwen2.5-coder:7b nomic-embed-text; do
  echo "   pulling $m ..."
  ollama pull "$m" || echo "   ! failed to pull $m — continuing"
done

# Only on the dedicated 16GB model box: these did not fit on 8GB at all.
# They are pulled, not preloaded — one at a time is still the rule for 14B.
if [ "$ROL" = "ollama" ]; then
  echo "→ Pulling the 14B set (fits on 16GB, did not fit on 8GB — one at a time)..."
  for m in qwen2.5-coder:14b deepseek-coder-v2:16b; do
    echo "   pulling $m ..."
    ollama pull "$m" || echo "   ! failed to pull $m — continuing"
  done
fi

echo "→ Ollama models actually present:"
ollama list
free -h
else
echo "→ Ollama overgeslagen (ROL=$ROL). De modelbox is $DOMAIN_OLLAMA."
echo "   Het geheugen-Ollama op 127.0.0.1:11435 is iets anders en hoort WEL hier:"
echo "   zie backend/axe_api/ollama-geheugen.service voor de installatieregels."
fi

# ── 2b. De checkout ─────────────────────────────────────────────── [alle] ──
# Stond in stap 3 en dus alleen bij ROL=api. De modelbox heeft hem óók nodig:
# daar staat terminal-server.cjs in, en zonder die map kan vak 6 van de
# Terminals-tab nergens vandaan komen.
#
# Clone/pull gebeurt hier, niet in deploy.sh — een script dat zijn eigen bron
# git-pullt terwijl bash hem nog uitvoert is onveilig (bash leest het bestand
# niet opnieuw vanaf de top), dus deploy.sh gaat ervan uit dat $INSTALL_DIR al
# bij is als hij wordt aangeroepen.
echo "→ Updating /opt/axe-core-api checkout..."
mkdir -p /opt/axe-core-api
cd /opt/axe-core-api
if [ ! -d .git ]; then
  git clone --branch "$REPO_BRANCH" --depth 1 https://github.com/Ldezeeuw445/AXE-CORE-.git .
else
  git pull origin "$REPO_BRANCH"
fi
HQ_DIR="/opt/axe-core-api/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS"

# ── 3. axe_api ──────────────────────────────────────────────── [api, alles] ──
if [ "$doe_api" = true ]; then
echo "→ Deploying axe_api (backend/axe_api/deploy.sh)..."
bash AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api/deploy.sh
echo ""
echo "   ⚠ /opt/axe-core-api/.env still needs real values — this only ran once"
echo "     with placeholders. Edit it now:  nano /opt/axe-core-api/.env"
echo "     then:  systemctl restart axe-core-api"

fi  # einde stap 3 (api)

# ── 4. nginx, slot en cert voor de modelbox ────────────────── [ollama, alles] ──
# Hier stond een vhost die 127.0.0.1:11434 zonder enige controle doorgaf. Tot 13
# september kon daardoor iedereen op internet op deze box modellen draaien,
# downloaden en verwijderen.
#
# De kant van de app bestaat al: src/infrastructure/config/ollamaSleutel.ts
# stuurt `Authorization: Bearer <sleutel uit Instellingen>` mee naar
# ollama.axecompanion.com, en zegt in zijn kop wat hier hoort te staan --
# "nginx laat nu door: Strato (op IP) en verzoeken met deze sleutel. Eerst in
# meet-modus (alleen gelogd), daarna dicht." Dit is dat stuk.
#
# Waarom meet-modus eerst: agent_loop.py op de API-box praat ook met deze
# machine, en een crontab of een script dat ik niet ken misschien ook. Meteen
# dichtgooien betekent dat je het merkt als een taak faalt, niet als je kijkt.
# Een dag loggen en dan omzetten kost één commando en geen verrassing.
if [ "$doe_ollama" = true ]; then

OLLAMA_PROXY_KEY="${OLLAMA_PROXY_KEY:-}"
API_IP="${API_IP:-}"
MEETMODUS="${MEETMODUS:-1}"

if [ -z "$OLLAMA_PROXY_KEY" ]; then
  echo "OLLAMA_PROXY_KEY ontbreekt." >&2
  echo "Zonder sleutel zet dit script een modelbox neer die voor het hele" >&2
  echo "internet bruikbaar is. Dat is precies wat er op 13 september gebeurde." >&2
  echo "" >&2
  echo "  OLLAMA_PROXY_KEY=<sleutel uit AXE-VAULT> ROL=$ROL bash vps-bootstrap.sh" >&2
  echo "" >&2
  echo "Dezelfde sleutel zet je in de app bij Instellingen > Ollama, veld 'key'." >&2
  echo "API_IP=<ip van api.axecompanion.com> mag erbij: dan mag die box er ook" >&2
  echo "zonder sleutel bij (agent_loop.py stuurt er geen)." >&2
  exit 2
fi

echo "→ Slot vóór Ollama (meetmodus=$MEETMODUS)..."
# Losse regel in plaats van $(...) in de heredoc: `[ -n "$X" ] && ...` geeft 1
# terug als X leeg is, en onder `set -e` is dat het einde van het script. Die
# fout zat hier eerder al een keer in.
GEO_REGEL=""
if [ -n "$API_IP" ]; then
  GEO_REGEL="    ${API_IP}/32 1;"
fi

# map en geo horen in de http-context, dus niet in de vhost zelf.
cat > /etc/nginx/conf.d/axe-ollama-slot.conf <<EOF
# Wie mag er bij ollama.axecompanion.com. Gegenereerd door vps-bootstrap.sh.
map \$http_authorization \$axe_ollama_sleutel {
    default 0;
    "Bearer ${OLLAMA_PROXY_KEY}" 1;
}
geo \$axe_ollama_vriend {
    default 0;
${GEO_REGEL}
}
map "\$axe_ollama_sleutel\$axe_ollama_vriend" \$axe_ollama_weg {
    "00" 1;
    default 0;
}
log_format axe_ollama_weiger '\$time_iso8601 \$remote_addr "\$request" '
                             'ua="\$http_user_agent" auth=\$http_authorization';
EOF
chmod 600 /etc/nginx/conf.d/axe-ollama-slot.conf

# Het slot zelf staat in een los bestand, zodat omzetten één regel is en geen
# hergeneratie van de vhost (waar certbot ook in schrijft).
mkdir -p /etc/nginx/snippets
if [ "$MEETMODUS" = "0" ]; then
  echo 'if ($axe_ollama_weg) { return 401; }' > /etc/nginx/snippets/axe-ollama-dicht.conf
else
  : > /etc/nginx/snippets/axe-ollama-dicht.conf
fi

echo "→ Setting up nginx + cert for $DOMAIN_OLLAMA..."
cat > /etc/nginx/sites-available/$DOMAIN_OLLAMA <<EOF
server {
    listen 80;
    server_name $DOMAIN_OLLAMA;

    # Wie geweigerd zou worden, ook in meetmodus. Dit is het logboek dat je een
    # dag later leest voordat je MEETMODUS=0 zet.
    access_log /var/log/nginx/ollama-geweigerd.log axe_ollama_weiger if=\$axe_ollama_weg;

    # Certbot moet hier altijd bij kunnen, ook als het slot dicht staat --
    # anders faalt de verlenging over 60 dagen en merk je dat aan een
    # certificaatfout in de app.
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        auth_basic off;
    }

    # De terminalserver van DEZE box (vak 6 van de Terminals-tab). Zie
    # infra/terminal/nginx-terminal-location.conf -- hij heeft zijn eigen
    # authenticatie (Supabase-token + allowlist) en staat daarom buiten het slot.
    location /terminal {
        proxy_pass http://127.0.0.1:4022;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    location / {
        include /etc/nginx/snippets/axe-ollama-dicht.conf;
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

# ── De terminalserver op deze box ───────────────────────────────────────────
# ROL=ollama draaide deploy.sh niet, en daar stond de enige installatie van
# axe-terminal. Vak 6 bleef dus dood na een geslaagde bootstrap. Deze box heeft
# geen /opt/axe-core-api/.env (die maakt deploy.sh), dus hij krijgt een eigen
# klein bestand met wat de server nodig heeft.
TERM_ENV=/etc/axe-terminal.env
if [ ! -f "$TERM_ENV" ]; then
  umask 077
  cat > "$TERM_ENV" <<EOF
# De terminalserver weigert te starten zonder deze twee (terminal-server.cjs).
# De anon key is dezelfde die in de web-app zit; dit is geen geheim bestand,
# maar de allowlist eronder hoort wel te kloppen.
SUPABASE_URL=${SUPABASE_URL:-}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY:-}

# Wie hier een shell mag openen. LEEG = elk account van dit Supabase-project,
# en dat project bedient ook Companion en Trading OS.
AXE_TERMINAL_ALLOWED_USER_IDS=${AXE_TERMINAL_ALLOWED_USER_IDS:-}
EOF
fi
bash "$HQ_DIR/infra/terminal/install-axe-terminal.sh" "$HQ_DIR" "$TERM_ENV" /opt/axe-workspace

fi  # einde stap 4 (ollama)

# ── 5. CrewAI crew — isolated venv ──────────────────────────── [api, alles] ──
# De crew draait waar axe_api draait: /crew/run spawnt hem als subprocess (zie
# crew_runner.py). Hij PRAAT met de modelbox over https, hij hoort er niet op.
if [ "$doe_api" = true ]; then
echo "→ Setting up the CrewAI crew's isolated venv..."
python3 -m venv /opt/axe-crew-venv
/opt/axe-crew-venv/bin/pip install --quiet --upgrade pip
/opt/axe-crew-venv/bin/pip install --quiet -r \
  /opt/axe-core-api/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api/requirements_crew.txt

fi  # einde stap 5 (api)

# ── 6. OpenJarvis, Hermes Agent, OpenClaw ───────────────────────── [alles] ──
# Alleen op een één-boxopstelling. Op de modelbox hebben ze niets te zoeken (de
# OpenJarvis-installer start zijn EIGEN Ollama, en dat is precies het RAM-gevecht
# dat deze splitsing beëindigt); op de API-box komen ze pas als hun
# /internal/*/execute-routes bestaan, en die bestaan nog niet.
if [ "$doe_extra" = true ]; then
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

fi  # einde stap 6 (alles)

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Done. Real, verified next steps:         ║"
echo "╚══════════════════════════════════════════╝"
if [ "$doe_api" = true ]; then
  echo "1. nano /opt/axe-core-api/.env  — fill in AXE_API_KEY, SUPABASE_SERVICE_ROLE, etc."
  echo "2. systemctl restart axe-core-api"
  echo "3. curl https://$DOMAIN_API/health   (expect 200)"
  echo "4. Het geheugen-Ollama hoort op DEZE box, niet op de modelbox. Zie"
  echo "   backend/axe_api/ollama-geheugen.service — de installatieregels staan er bovenin."
  echo "5. Wherever the frontend actually runs, set AXE_CORE_API_URL=https://$DOMAIN_API and"
  echo "   AXE_CORE_API_KEY=<the same value as AXE_API_KEY above> — both server-side, NOT"
  echo "   VITE_-prefixed. Never Vercel."
  echo ""
  echo "Test /crew/run once axe-core-api is up:"
  echo "  curl -X POST https://$DOMAIN_API/crew/run -H 'Authorization: Bearer <AXE_API_KEY>' \\"
  echo "       -H 'Content-Type: application/json' -d '{\"task\":\"say hello\"}'"
fi

if [ "$doe_ollama" = true ]; then
  echo ""
  echo "Modelbox ($DOMAIN_OLLAMA):"
  echo "  curl https://$DOMAIN_OLLAMA/api/tags   (expect your pulled models listed)"
  echo "  Die URL staat in de app zelf (infrastructure/config/ollamaSleutel.ts): zodra"
  echo "  het A-record hierheen wijst, werkt Ollama weer zonder één regel code."
  echo "  free -h na de eerste twee vragen: 2 modellen resident is de aanname, niet een meting."
  echo ""
  echo "CONTROLEER — twee dingen die niemand voor je doet:"
  echo ""
  echo "  1. Het slot staat op MEETMODUS=${MEETMODUS}."
  if [ "${MEETMODUS:-1}" != "0" ]; then
    echo "     Dat betekent: ALLES komt er nog door, geweigerde verzoeken worden alleen"
    echo "     gelogd. Kijk morgen wie er langskwam en zet hem dan dicht:"
    echo "       tail -50 /var/log/nginx/ollama-geweigerd.log"
    echo "       echo 'if (\$axe_ollama_weg) { return 401; }' > /etc/nginx/snippets/axe-ollama-dicht.conf"
    echo "       nginx -t && systemctl reload nginx"
    echo "     Staat er niets in dat logboek behalve ruis van buiten? Dan kan hij meteen dicht."
  else
    echo "     Dicht. Terug naar meten kan met:"
    echo "       : > /etc/nginx/snippets/axe-ollama-dicht.conf && nginx -t && systemctl reload nginx"
  fi
  echo "     Dezelfde sleutel hoort in de app bij Instellingen > Ollama, veld 'key'."
  echo ""
  echo "  2. Wie hier een shell mag: ${TERM_ENV:-/etc/axe-terminal.env}"
  echo "     AXE_TERMINAL_ALLOWED_USER_IDS leeg = elk account van dit Supabase-project,"
  echo "     en dat project bedient ook Companion en Trading OS. Je eigen id staat in"
  echo "     Supabase > Authentication > Users. Daarna: systemctl restart axe-terminal"
  echo "     Datzelfde bestand heeft SUPABASE_URL en SUPABASE_ANON_KEY nodig, anders"
  echo "     weigert de terminalserver te starten (met opzet)."
fi

if [ "$doe_extra" = true ]; then
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
fi

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
