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
# Bij elke rode regel hoort staan WAT je eraan doet, niet alleen dat er iets
# mis is. Luka's maatstaf: "als er iets fout is, wat er fout is en hoe ik het
# kan fixen zonder dat ik jou nodig heb." fix() drukt die stap eronder af --
# ingesprongen en gedimd, zodat hij bij de rode regel hoort maar de meting
# zelf niet overschreeuwt. Het is een concreet commando, geen "kijk eens".
fix()    { printf "     \033[2m↳ zelf te doen:\033[0m %s\n" "$1"; }

kop "HOSTS"
# n8n staat hier NIET bij, met opzet. Die draait op 127.0.0.1:5678 en is nooit
# publiek geweest -- er is geen nginx-blok en geen certificaat voor die naam.
# Een eerdere versie testte hem wel en meldde hem als "onbereikbaar", wat een
# storing suggereerde die er niet was. Wat nooit bestond kan niet stuk zijn.
# Elke host wordt op zijn eigen gezondheidspad bevraagd, niet op de wortel.
# Dit stond op "https://$h/" en die route bestaat op de API niet -- dus een
# kerngezonde server meldde zich met 404. Het script rekende dat als "leeft"
# (groen) maar drukte het getal af, en 404 in beeld leest als een storing. Twee
# keer heeft dat hier tot een zoektocht naar een probleem geleid dat er niet
# was; een statuscheck die vals alarm geeft is erger dan geen statuscheck.
for hp in "api.axecompanion.com/health" "ollama.axecompanion.com/"; do
  h="${hp%%/*}"
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "https://$hp" 2>/dev/null)
  t=$(curl -s -o /dev/null -w "%{time_total}" --max-time 8 "https://$hp" 2>/dev/null)
  case "$code" in
    000)
      rood "$h" "onbereikbaar (timeout na ${t}s)"
      case "$h" in
        api.axecompanion.com)
          # Val 4 uit AGENTS.md: de VPS valt om als ollama te veel geheugen pakt.
          # Dat is de eerste plek om te kijken, niet de laatste.
          fix "ssh -i ~/.ssh/axe-core-vps root@212.227.91.79 'systemctl status axe-core-api --no-pager'"
          fix "geheugen op? (val 4)  ssh ... root@212.227.91.79 'systemctl restart ollama && systemctl restart axe-core-api'"
          fix "reageert de VPS zelf niet op ssh, dan is de server weg -- herstart hem in het IONOS-paneel" ;;
        ollama.axecompanion.com)
          fix "ssh -i ~/.ssh/axe-core-vps root@212.227.91.79 'cat /sys/fs/cgroup/system.slice/ollama.service/memory.events; systemctl restart ollama'" ;;
      esac ;;
    2*|3*) groen "$h" "HTTP $code in ${t}s";;
    # Ollama staat achter een sleutel: 401 zonder sleutel is precies goed.
    401) if [ "$h" = "ollama.axecompanion.com" ]; then groen "$h" "beveiligd (401 zonder sleutel) in ${t}s"
         else geel "$h" "HTTP 401 -- host leeft, wil een sleutel"; fi;;
    # Nu we het echte gezondheidspad vragen is 4xx wél een signaal: de host
    # antwoordt, maar de dienst erachter niet zoals verwacht.
    4*|5*) geel "$h" "HTTP $code -- host leeft, dienst antwoordt niet goed";;
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
if [ -z "$U" ]; then
  rood "Supabase" "geen URL in .env"
  fix "zet VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in .env (Supabase > Project Settings > API)"
else
  # De anon-sleutel ziet door row-level security vaak NIETS: dan meldde dit
  # "niet leesbaar" of "0 episodes" in rood terwijl de tabel vol stond (22 nov
  # gemeten: core_tasks en de leerlus). Een vals alarm is erger dan geen meting,
  # dus bij leeg/onleesbaar meten we nog een keer via de VPS-sleutel.
  API_KEY="${AXE_CORE_API_KEY:-${VITE_AXE_CORE_API_KEY:-}}"
  via_vps() {  # 0 = er staan rijen, 1 = echt leeg, 2 = niet te meten
    [ -n "$API_KEY" ] || return 2
    local r; r=$(curl -s --max-time 10 -H "Authorization: Bearer $API_KEY" \
      "https://api.axecompanion.com/supabase/table/$1?limit=1" 2>/dev/null)
    case "$r" in "[]") return 1;; "[{"*) return 0;; *) return 2;; esac
  }
  for t in memory core_notifications core_tasks agent_learning_episodes; do
    n=$(curl -s --max-time 10 "$U/rest/v1/$t?select=id&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K" \
        -H "Prefer: count=exact" -H "Range: 0-0" -D - -o /dev/null 2>/dev/null \
        | grep -i content-range | tr -d '\r' | sed 's|.*/||')
    if [ -z "$n" ] || [ "$n" = "0" ]; then
      via_vps "$t"; rc=$?
      if [ $rc = 0 ]; then
        groen "$t" "gevuld (via de VPS gemeten; de anon-sleutel ziet het niet door RLS)"
        continue
      elif [ $rc = 2 ] && [ -z "$n" ]; then
        geel "$t" "niet te meten: de anon-sleutel mag hem niet lezen (RLS) en de VPS antwoordt niet"
        fix "zet AXE_CORE_API_KEY in .env (zie SLEUTELS.md) of kijk bij HOSTS of de API leeft"
        continue
      fi
    fi
    if [ -z "$n" ]; then
      rood "$t" "niet leesbaar"
      # Leest de rest wel en deze niet, dan is het geen sleutel- of netwerkfout
      # maar RLS op juist deze tabel.
      fix "controleer VITE_SUPABASE_ANON_KEY in .env; blijft alleen '$t' hangen, dan is het RLS -- zie Supabase > Authentication > Policies"
    elif [ "$t" = "agent_learning_episodes" ]; then
      # Deze tabel is de enige harde meting of de leerlus echt rondloopt.
      # Nul rijen is hier geen "leeg maar gezond": het betekent dat er nooit
      # is vastgelegd welke herinneringen een beslissing in gingen, en dan
      # valt er later ook niets te versterken. Zie
      # src/application/system/learningLoopWiring.test.ts voor de twee keer
      # dat dit stilletjes was losgekoppeld.
      if [ "$n" = "0" ]; then
        rood "leerlus" "0 episodes -- de app heeft niet gedraaid, of de lus is weer losgekoppeld"
        fix "open de app en laat één cyclus lopen; blijft het 0, dan is de lus los -- draai: npx vitest run learningLoopWiring"
      else
        groen "leerlus" "$n episodes vastgelegd"
      fi
    else
      groen "$t" "$n rijen"
    fi
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
API_KEY="${API_KEY:-${AXE_CORE_API_KEY:-${VITE_AXE_CORE_API_KEY:-}}}"
if [ -z "$SRK" ] && [ -z "$API_KEY" ]; then
  geel "diensten" "kluis niet gevonden -- $VAULT"
  fix "sluit de EagetSSD aan, of zet AXE_CORE_API_KEY in .env om het via de VPS te lezen"
elif [ -z "$U" ]; then
  rood "diensten" "geen Supabase-URL"
  fix "zet VITE_SUPABASE_URL in .env (Supabase > Project Settings > API)"
else
  # HOSTS hierboven mat de API zojuist live. Botst die met wat de app onthield,
  # dan is de opgeslagen stand achterhaald -- en dat moet erbij staan, anders
  # lees je hier groen terwijl de server er nu uit ligt.
  API_NU=$(curl -s -o /dev/null -w '%{http_code}' -m 6 https://api.axecompanion.com/health)
  export API_NU
  { if [ -n "$SRK" ]; then
      curl -s --max-time 12 "$U/rest/v1/core_system_state?select=service,status,updated_at&order=service.asc" \
        -H "apikey: $SRK" -H "Authorization: Bearer $SRK" 2>/dev/null
    else  # zonder kluis: dezelfde tabel via de VPS
      curl -s --max-time 12 -H "Authorization: Bearer $API_KEY" \
        "https://api.axecompanion.com/supabase/table/core_system_state?limit=200&order_by=service&order_dir=asc" 2>/dev/null
    fi; } \
  | python3 -c "
import sys, json, datetime, re
G='\033[32m'; R='\033[31m'; Y='\033[33m'; X='\033[0m'; D='\033[2m'
# Zelfde afspraak als fix() in bash: onder een rode regel staat de stap die
# Luka zelf kan zetten.
def fix(s): print('     ' + D + '↳ zelf te doen:' + X + ' ' + s)
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
    fix('de opgeslagen stand is achterhaald -- herstart: ssh -i ~/.ssh/axe-core-vps root@212.227.91.79 \'systemctl restart axe-core-api\'')
if uit:
    print(f'  {R}\u25cf{X} liggen eruit ({len(uit)})'.ljust(40) + ', '.join(uit))
    # De systemd-unit gebruikt koppeltekens, de dienstnaam hier underscores:
    # 'systemctl restart axe_api' gaf al eens 'Unit not found' terwijl de dienst
    # gewoon draaide als axe-core-api (zie vps_sync.py). Dus vertaal expliciet.
    # Niet alles is een systemd-unit: groq of xai 'herstarten' bestaat niet.
    # Per soort de stap die echt helpt (5.3: bij elke rode regel wat je doet).
    PROVIDER = {'groq','xai','gemini','openrouter','openai','anthropic','cerebras','mistral','deepseek','google'}
    NIET_INGERICHT = {'openjarvis','kilocode'}
    # Gemeten op de VPS (22 nov): units ollama en axe-terminal bestaan; n8n draait
    # er niet (geen unit, geen container) en axe_intel is een Supabase-functie.
    UNIT = {'ollama':'ollama','terminal':'axe-terminal','hermes':'ollama'}
    ANDERS = {'n8n': 'n8n: draait niet op de VPS (geen unit, geen container) -- alleen nodig als je een n8n-flow gebruikt',
              'axe_intel': 'axe_intel: Supabase-functie intel-proxy -- Supabase > Edge Functions > intel-proxy > Logs'}
    units = sorted({UNIT[n] for n in uit if n in UNIT})
    prov = [n for n in uit if n in PROVIDER]
    leeg = [n for n in uit if n in NIET_INGERICHT]
    trading = [n for n in uit if n in ('metaapi','trading_os')]
    for n in uit:
        if n in ANDERS: fix(ANDERS[n])
    rest = [n for n in uit if n not in UNIT and n not in PROVIDER and n not in NIET_INGERICHT and n not in trading and n not in ANDERS]
    if vers is not None and vers*60 >= 90:
        fix('deze meting is ' + f'{vers:.0f}' + ' uur oud: open de app (of AXE CORE > Status) en kijk of het nog zo is')
    if units:
        fix('ssh -i ~/.ssh/axe-core-vps root@212.227.91.79 \'systemctl restart ' + ' '.join(units) + '\'  (' + ', '.join(n for n in uit if n in UNIT) + ')')
    if prov:
        fix(', '.join(prov) + ': geen dienst maar een sleutel -- AXE CORE > Instellingen > Keys, knop Test; rood = sleutel of tegoed op')
    if leeg:
        fix(', '.join(leeg) + ': nooit ingericht -- geen storing, negeren')
    if trading:
        fix(', '.join(trading) + ': trading -- kijk in Trading OS, niet hier herstarten')
    if rest:
        fix(', '.join(rest) + ': koppeling in de app -- AXE CORE > Instellingen > Integraties')
for naam, uur in oud:
    print(f'  {Y}\u25cf{X} {naam}'.ljust(40) + f'niet meer gemeten sinds {uur/24:.0f} dagen')
"
fi

kop "AGENTS  (wanneer schreef wie voor het laatst)"
if [ -n "$U" ]; then
  # Via de VPS als dat kan: de anon-sleutel ziet door RLS niets en dan bleef dit kopje leeg.
  { if [ -n "${API_KEY:-}" ]; then
      curl -s --max-time 12 -H "Authorization: Bearer $API_KEY" \
        "https://api.axecompanion.com/supabase/table/memory?limit=200&order_by=created_at&order_dir=desc" 2>/dev/null
    else
      curl -s --max-time 12 "$U/rest/v1/memory?select=agent,created_at&order=created_at.desc&limit=200" \
        -H "apikey: $K" -H "Authorization: Bearer $K" 2>/dev/null
    fi; } \
  | python3 -c "
import sys,json,datetime,re
try: rows=json.load(sys.stdin)
except Exception: print('  (kon niet lezen)'); raise SystemExit
nu=datetime.datetime.now(datetime.timezone.utc); laatst={}
for r in rows: laatst.setdefault(r.get('agent','?'), r.get('created_at',''))
if not laatst: print('  \033[33m●\033[0m geen antwoord of geen rijen -- draai het nog eens; blijft het leeg, kijk bij HOSTS')
for a,ts in sorted(laatst.items()):
    try:
        # Postgres geeft microseconden met een wisselend aantal cijfers
        # (.84557 is er vijf); fromisoformat wil er drie of zes.
        t=re.sub(r'\.(\d+)', lambda m: '.'+m.group(1).ljust(6,'0')[:6], ts.replace('Z','+00:00'))
        d=datetime.datetime.fromisoformat(t); u=(nu-d).total_seconds()/3600
        kleur='\033[32m' if u<2 else ('\033[33m' if u<24 else '\033[31m')
        print(f'  {kleur}●\033[0m {a:<26} {ts[:16]}  ({u:.0f} uur geleden)')
        if u >= 24:
            # Zelfde afspraak als fix(): onder een rode regel staat wat je zelf doet.
            print('     \033[2m↳ zelf te doen:\033[0m kijk of zijn cron nog loopt: '
                  + 'cli/axe cron list | grep -i ' + a.split('-')[0]
                  + '  -- staat hij uit of faalt hij, dan in de app bij Cron > Run now; '
                  + 'is hij met pensioen, dan is rood hier terecht en mag je het negeren')
    except Exception: print(f'  \033[33m●\033[0m {a:<26} tijd onleesbaar: {ts!r}')
"
fi

kop "GESCHIEDENIS"
# Elke run schrijft één regel. Zo wordt "de VPS valt soms weg" een reeks
# tijdstippen in plaats van een gevoel -- en dan is te zien of het elk uur
# gebeurt, na een cyclus, of willekeurig.
LOG=".axe-status.log"
# Zelfde pad als HOSTS hierboven, anders vertelt het logboek een ander
# verhaal dan het scherm.
api=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 https://api.axecompanion.com/health 2>/dev/null)
printf "%s api=%s\n" "$(date -u '+%Y-%m-%dT%H:%M')" "${api:-000}" >> "$LOG"
n=$(wc -l < "$LOG" | tr -d ' ')
uit=$(grep -c " api=000" "$LOG" 2>/dev/null); uit=${uit:-0}
if [ "$n" -lt 2 ]; then
  geel "logboek" "eerste meting -- draai dit vaker om een patroon te zien"
else
  if [ "$uit" -gt 0 ]; then
    rood "logboek" "$uit van $n metingen: API onbereikbaar"
    # Een patroon in de tijdstippen wijst de oorzaak aan: elk uur of na een
    # cyclus is bijna altijd het geheugen (val 4), niet het netwerk.
    fix "kijk of de uitval een ritme heeft (hieronder); vaak is het geheugen -- ssh ... root@212.227.91.79 'systemctl restart ollama'"
  else
    groen "logboek" "$n metingen, altijd bereikbaar"
  fi
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
