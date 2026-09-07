#!/usr/bin/env bash
# Wat werkt er, nu, gemeten.
#
# Geschreven omdat "ik weet niet meer wat werkt" twee dagen duurde terwijl de
# oorzaak in één regel te zien was: de API-host antwoordde niet. Elke regel
# hieronder is een meting, geen aanname -- en het draait zonder de VPS, want
# juist als die weg is wil je dit kunnen draaien.
#
#   bash scripts/axe-status.sh
set -uo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }

groen()  { printf "  \033[32m●\033[0m %-26s %s\n" "$1" "$2"; }
rood()   { printf "  \033[31m●\033[0m %-26s %s\n" "$1" "$2"; }
geel()   { printf "  \033[33m●\033[0m %-26s %s\n" "$1" "$2"; }
kop()    { printf "\n\033[1m%s\033[0m\n" "$1"; }

kop "HOSTS"
# n8n staat hier NIET bij, met opzet. Die draait op 127.0.0.1:5678 en is nooit
# publiek geweest -- er is geen nginx-blok en geen certificaat voor die naam.
# Een eerdere versie testte hem wel en meldde hem als "onbereikbaar", wat een
# storing suggereerde die er niet was. Wat nooit bestond kan niet stuk zijn.
for h in api.axecompanion.com ollama.axecompanion.com; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "https://$h/" 2>/dev/null)
  t=$(curl -s -o /dev/null -w "%{time_total}" --max-time 8 "https://$h/" 2>/dev/null)
  case "$code" in
    000) rood "$h" "onbereikbaar (timeout na ${t}s)";;
    2*|3*|4*) groen "$h" "HTTP $code in ${t}s";;
    *) geel "$h" "HTTP $code";;
  esac
done

kop "PROVIDERS"
# Deze test stond hier eerst en mat NIETS: de sleutels staan niet in .env maar
# in user_settings, achter row-level security. Wat je terugkreeg waren 401's op
# lege sleutels, plus een vals "OK" voor OpenRouter -- dat endpoint antwoordt
# ook zonder sleutel. Een meting die altijd hetzelfde zegt is geen meting.
if grep -qE "^VITE_(OPENAI|ANTHROPIC|GROQ|GEMINI)_API_KEY=.{10}" .env 2>/dev/null; then
  geel "sleutels in .env" "aanwezig -- maar de app gebruikt die uit Instellingen"
else
  geel "sleutels" "staan in de app (Instellingen), niet hier -- niet te testen vanaf hier"
fi
groen "waar te kijken" "AXE CORE > Instellingen > Keys, knop Test per kaart"

kop "DATA  (Supabase rechtstreeks, niet via de VPS)"
U="${VITE_SUPABASE_URL:-}"; K="${VITE_SUPABASE_ANON_KEY:-}"
if [ -z "$U" ]; then rood "Supabase" "geen URL in .env"; else
  for t in memory core_notifications core_tasks; do
    n=$(curl -s --max-time 10 "$U/rest/v1/$t?select=id&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K" \
        -H "Prefer: count=exact" -H "Range: 0-0" -D - -o /dev/null 2>/dev/null \
        | grep -i content-range | tr -d '\r' | sed 's|.*/||')
    [ -n "$n" ] && groen "$t" "$n rijen" || rood "$t" "niet leesbaar"
  done
fi

kop "DIENSTEN  (wat de app zelf zag bij haar laatste meting)"
# Deze tabel is het geheugen van de app: bij elke gezondheidsronde schrijft ze
# per dienst weg wat ze aantrof. RLS laat alleen ingelogde lezers toe, dus de
# anon-sleutel ziet hier nul rijen -- vandaar de sleutel uit de kluis. Die
# staat bewust niet in .env: de kluis is de enige bron.
VAULT="/Volumes/EagetSSD/AXE-VAULT/secrets.env"
SRK=""
[ -f "$VAULT" ] && SRK=$(grep -m1 "^SUPABASE_SERVICE_ROLE_KEY=" "$VAULT" | cut -d= -f2- | tr -d "\"' ")
if [ -z "$SRK" ]; then
  geel "diensten" "kluis niet gevonden -- $VAULT"
elif [ -z "$U" ]; then
  rood "diensten" "geen Supabase-URL"
else
  # HOSTS hierboven mat de API zojuist live. Botst die met wat de app onthield,
  # dan is de opgeslagen stand achterhaald -- en dat moet erbij staan, anders
  # lees je hier groen terwijl de server er nu uit ligt.
  API_NU=$(curl -s -o /dev/null -w '%{http_code}' -m 6 https://api.axecompanion.com/health)
  export API_NU
  curl -s --max-time 12 "$U/rest/v1/core_system_state?select=service,status,updated_at&order=service.asc" \
    -H "apikey: $SRK" -H "Authorization: Bearer $SRK" 2>/dev/null \
  | python3 -c "
import sys, json, datetime, re
G='\033[32m'; R='\033[31m'; Y='\033[33m'; X='\033[0m'
try: rows = json.load(sys.stdin)
except Exception: print('  (kon niet lezen)'); raise SystemExit
if not isinstance(rows, list) or not rows:
    print('  (geen rijen)'); raise SystemExit
nu = datetime.datetime.now(datetime.timezone.utc)
aan, uit, oud, leeftijden = [], [], [], []
for r in rows:
    ts = r.get('updated_at') or ''
    try:
        t = re.sub(r'\.(\d+)', lambda m: '.' + m.group(1).ljust(6,'0')[:6], ts.replace('Z','+00:00'))
        uur = (nu - datetime.datetime.fromisoformat(t)).total_seconds()/3600
    except Exception:
        uur = None
    naam = r.get('service','?'); st = r.get('status','?')
    # Een meting van gisteren zegt niets over vandaag. Ouder dan een etmaal is
    # geen status meer maar een herinnering, en die hoort apart.
    leeftijden.append((naam, uur))
    if uur is not None and uur > 24: oud.append((naam, uur))
    elif st == 'online': aan.append(naam)
    else: uit.append(naam)
# De leeftijd van de meting hoort bovenaan: een groen bolletje van drie uur
# oud is geen status maar een gerucht, en juist dat leidde tot 'het werkte
# toch net nog'.
vers = min((u for _, u in leeftijden if u is not None), default=None)
if vers is None:
    print(f'  {Y}\u25cf{X} gemeten'.ljust(40) + 'onbekend wanneer')
elif vers*60 < 90:
    print(f'  {G}\u25cf{X} gemeten'.ljust(40) + f'{vers*60:.0f} min geleden -- vers')
else:
    print(f'  {Y}\u25cf{X} gemeten'.ljust(40) + f'{vers:.1f} uur geleden -- open de app om te verversen')
print(f'  {G}\u25cf{X} draaien ({len(aan)})'.ljust(40) + ', '.join(aan))
import os
_nu = os.environ.get('API_NU','')
if 'axe_core_api' in aan and _nu != '200':
    _hoe = _nu if _nu else 'geen antwoord'
    print(f'  {R}\u25cf{X} LET OP'.ljust(40) + 'axe_core_api staat hier groen, maar antwoordt NU niet (' + _hoe + ')')
if uit: print(f'  {R}\u25cf{X} liggen eruit ({len(uit)})'.ljust(40) + ', '.join(uit))
for naam, uur in oud:
    print(f'  {Y}\u25cf{X} {naam}'.ljust(40) + f'niet meer gemeten sinds {uur/24:.0f} dagen')
"
fi

kop "AGENTS  (wanneer schreef wie voor het laatst)"
if [ -n "$U" ]; then
  curl -s --max-time 12 "$U/rest/v1/memory?select=agent,created_at&order=created_at.desc&limit=200" \
    -H "apikey: $K" -H "Authorization: Bearer $K" 2>/dev/null \
  | python3 -c "
import sys,json,datetime,re
try: rows=json.load(sys.stdin)
except Exception: print('  (kon niet lezen)'); raise SystemExit
nu=datetime.datetime.now(datetime.timezone.utc); laatst={}
for r in rows: laatst.setdefault(r.get('agent','?'), r.get('created_at',''))
for a,ts in sorted(laatst.items()):
    try:
        # Postgres geeft microseconden met een wisselend aantal cijfers
        # (.84557 is er vijf); fromisoformat wil er drie of zes.
        t=re.sub(r'\.(\d+)', lambda m: '.'+m.group(1).ljust(6,'0')[:6], ts.replace('Z','+00:00'))
        d=datetime.datetime.fromisoformat(t); u=(nu-d).total_seconds()/3600
        kleur='\033[32m' if u<2 else ('\033[33m' if u<24 else '\033[31m')
        print(f'  {kleur}●\033[0m {a:<26} {ts[:16]}  ({u:.0f} uur geleden)')
    except Exception: print(f'  \033[33m●\033[0m {a:<26} tijd onleesbaar: {ts!r}')
"
fi

kop "GESCHIEDENIS"
# Elke run schrijft één regel. Zo wordt "de VPS valt soms weg" een reeks
# tijdstippen in plaats van een gevoel -- en dan is te zien of het elk uur
# gebeurt, na een cyclus, of willekeurig.
LOG=".axe-status.log"
api=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 https://api.axecompanion.com/ 2>/dev/null)
printf "%s api=%s\n" "$(date -u '+%Y-%m-%dT%H:%M')" "${api:-000}" >> "$LOG"
n=$(wc -l < "$LOG" | tr -d ' ')
uit=$(grep -c " api=000" "$LOG" 2>/dev/null); uit=${uit:-0}
if [ "$n" -lt 2 ]; then
  geel "logboek" "eerste meting -- draai dit vaker om een patroon te zien"
else
  [ "$uit" -gt 0 ] && rood "logboek" "$uit van $n metingen: API onbereikbaar" \
                   || groen "logboek" "$n metingen, altijd bereikbaar"
  echo "     laatste vijf:"
  tail -5 "$LOG" | sed 's/^/       /'
fi

kop "APP"
[ -d dist/public/assets ] && {
  hoofd=$(ls -S dist/public/assets/*.js 2>/dev/null | head -1)
  groen "startbrok" "$(du -h "$hoofd" 2>/dev/null | cut -f1) ($(ls dist/public/assets/*.js | wc -l | tr -d ' ') brokken)"
}
groen "branch" "$(git branch --show-current) @ $(git log -1 --format=%h)"
echo
