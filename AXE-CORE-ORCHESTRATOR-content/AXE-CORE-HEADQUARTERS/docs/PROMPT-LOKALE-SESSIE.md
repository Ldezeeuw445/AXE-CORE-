# Prompt voor de lokale sessie (Mac mini)

Kopieer alles onder de streep naar een Claude Code-sessie die op de Mac mini
draait met volledige toegang.

---

Je draait lokaal op de Mac mini van Luka, met volledige toegang tot de machine,
het netwerk en de repo's. Je taak is niet "iets bouwen" maar **iets aan de praat
krijgen en dat bewijzen**: na jouw sessie moet AXE CORE end-to-end bruikbaar
zijn vanuit zijn eigen vensters, zonder dat er een terminal op de Mac open hoeft
te staan.

De repo staat op `~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS`,
branch `orchestrator`. Begin met `git pull` — er is vandaag veel gewijzigd aan
de terminals.

## De regel die boven alles gaat: bewijzen, niet aannemen

Dit project heeft één terugkerend probleem, en het is niet dat dingen stuk gaan.
Het is dat **stuk zijn er niet uitziet als stuk**. Een paar echte voorbeelden
van deze week:

- De chat antwoordde niet. Drie sessies lang gezocht bij codex. De echte reden
  stond de hele tijd in stderr — de app kapte die af op 24 tekens.
- De terminals waren "traag". Ze draaiden op pijpen in plaats van op een pty,
  dus uitvoer kwam per blok van 4 KB. Even snel als altijd, alleen onzichtbaar.
- Een service worker serveerde maandenlang de oude app na een rebuild.

Dus: **geen enkele stap is klaar omdat hij "zou moeten werken".** Elke stap
eindigt met een commando dat je echt hebt gedraaid en waarvan je de uitvoer in
je verslag plakt. Zie je geen bewijs, dan is het niet af. Werkt iets niet, zeg
dat met de foutmelding erbij — een half werkende stap die als "klaar" wordt
gerapporteerd kost hier meer tijd dan een eerlijke "dit lukt niet".

## Als je Luka nodig hebt

Je gaat dingen tegenkomen die je niet alleen kunt: een login die een browser
opent, een wachtwoord, het IP van de iMac. Dat is verwacht. Doe het dan zo:

1. Maak eerst alles af wat **niet** van dat antwoord afhangt. Blijf niet wachten.
2. Stel de vraag **concreet en uitvoerbaar**: welk commando hij moet draaien, op
   welke machine, wat hij moet zien als het gelukt is. Niet "codex moet
   ingelogd zijn" maar "draai `codex login` in vak 3 van de Terminals-tab, kies
   'Sign in with ChatGPT', en plak hier wat `codex login status` daarna zegt".
3. Zeg erbij wat er op jou wacht zolang je geen antwoord hebt.
4. Ga daarna verder waar je gebleven was.

**Vraag nooit om sleutelwaarden in de chat.** Namen van variabelen wel, waardes
niet. Moet er een sleutel ergens staan, laat Luka die zelf in het bestand zetten
en controleer daarna alleen of hij *gevuld* is (`[ -n "$X" ] && echo gevuld`).

## Wat er moet staan als je klaar bent

### 1. De terminals in AXE CORE werken echt

Acht vakken, gedefinieerd in `src/domain/terminalHosts.ts`:

| vak | id | wat |
|---|---|---|
| 1 | `deze-mac` | Mac · repo |
| 2 | `mac-api` | Mac · API |
| 3 | `mac-agents` | Mac · agents |
| 4 | `mac-git` | Mac · git |
| 5 | `vps-strato` | `wss://api.axecompanion.com/terminal` |
| 6 | `vps-hetzner` | leeg |
| 7 | `imac` | leeg |
| 8 | `vrij` | leeg |

1–4 zijn vier shells op dezelfde Mac via `ws://127.0.0.1:4022/terminal`.

Sinds vandaag start de shell via `script` in een echte pty (zie
`terminalShell.cjs` en `docs/TERMINALS.md`). Controleer dat dat op de Mac ook
echt gebeurt — BSD-`script` heeft andere vlaggen dan de Linux-versie, en die
code is alleen op Linux gedraaid:

```bash
cd ~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
node -e "
const {spawn}=require('child_process');
const {ptyCommando}=require('./terminalShell.cjs');
const s=ptyCommando(process.platform, process.env.SHELL||'/bin/zsh');
console.log('start:',JSON.stringify(s));
const sh=spawn(s.cmd,s.args,{env:{...process.env,TERM:'xterm-256color'}});
let u='';sh.stdout.on('data',b=>u+=b);
setTimeout(()=>sh.stdin.write('tty; tput cols\n'),400);
setTimeout(()=>{console.log(u);sh.kill();process.exit(0)},1500);
"
```

Je moet `/dev/ttys…` zien. Zie je dat niet, repareer `ptyCommando` voor darwin
en zeg wat je veranderd hebt. Werkt `script` op macOS écht niet, zet dan
`AXE_TERMINAL_PTY=0` en meld dat als openstaand probleem — niet stilletjes
laten staan.

Daarna, in de app zelf (Terminals-tab, elk van de vier Mac-vakken):

- Er staat een prompt. (Op pijpen was die er niet.)
- `ls --color=auto` geeft kleur.
- Een `sleep 30` breekt af met Ctrl+C.
- Tab-aanvulling werkt.
- `top` tekent een scherm en `q` sluit het.
- Geen dubbele letters bij het typen (dat zou betekenen dat de browser nog
  zelf echoot terwijl de pty dat ook doet).

### 1b. Let op de wees op poort 4022

Een valkuil die ons al een ronde kostte, en een stille. AXE CORE start de
terminalserver zelf en ruimt hem op bij afsluiten -- maar die opruimer hangt aan
Tauri's afsluit-gebeurtenis, en het bijwerkscript sluit de app met `pkill`
(SIGTERM). Dan gaat de app weg zonder dat de handler draait, en blijft de server
als wees op zijn poort staan.

Gevolg: de nieuwe app start op, ziet poort 4022 bezet, start dus niets, en raakt
hem niet aan omdat hij niet van hem is. Alles in de app is nieuw behalve juist de
shell waar je in werkt -- en niets zegt dat.

`scripts/axe-bijwerken.sh` ruimt dit sinds vandaag op (zoekt op poort, kijkt via
de werkmap van het proces of het van deze checkout is, en laat andermans server
staan). Controleer dat het op de Mac echt werkt:

```bash
lsof -ti :4022
lsof -a -p $(lsof -ti :4022 | head -1) -d cwd -Fn
```

De werkmap moet de checkout zijn. Draai daarna `npm run bijwerken` en controleer
dat er ná afloop een NIEUW pid op 4022 staat. Zie je hetzelfde pid als ervoor,
dan werkt het opruimen op macOS niet en is dat een bevinding.

Als een terminalvak zich raar gedraagt na een update, is dit de eerste
verdachte -- niet de code.

### 2. Elk abonnement is ingelogd, en dat blijft zo

De drie CLI's die AXE CORE gebruikt (`backend/axe_api/agent_runner.py`):

| motor | binary | installeren | inloggen |
|---|---|---|---|
| Claude Code | `claude` | `npm i -g @anthropic-ai/claude-code` | `claude auth login` |
| Codex | `codex` | `npm i -g @openai/codex` | `codex login` |
| Cursor | `cursor-agent` | `curl https://cursor.com/install -fsS \| bash` | `cursor-agent login` |

Per motor, **vanuit vak 3 van de Terminals-tab in AXE CORE** (niet vanuit
Terminal.app — het hele punt is dat het daar kan):

```bash
cd ~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
codex exec "zeg alleen: ok" 2>&1 | tail -5
claude -p "zeg alleen: ok" 2>&1 | tail -5
cursor-agent -p "zeg alleen: ok" --force 2>&1 | tail -5
```

Twee dingen die je moet weten voor je conclusies trekt:

- **`cd` naar de repo is niet optioneel.** Vanuit `~` weigert codex met
  "Not inside a trusted directory" — dat leest als een kapotte CLI terwijl er
  niets mis is.
- **"usage limit" is geen storing.** Codex zei vandaag "You've hit your usage
  limit … try again at 5:36 PM". De app vangt dat sinds vandaag af en schakelt
  door. Kom je dat tegen: noteer het, ga verder, en test die motor later
  opnieuw. Rapporteer hem niet als kapot.

Vraagt een login om een browser, dan is dat een taak voor Luka — geef hem het
exacte commando en vak.

Zet **nooit** `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY` of
`OPENAI_BASE_URL` in de omgeving van een host die deze CLI's draait. De runner
stript ze met opzet; ze zetten betekent betalen per token naast een abonnement
dat al betaald is.

### 3. De backend draait en accepteert de code-editor

`backend/axe_api/run-local.sh` op poort 8001. AXE CORE start hem sinds vandaag
zelf (`src-tauri/src/diensten.rs`, met een watchdog van 10 seconden). Controleer:

```bash
curl -s http://127.0.0.1:8001/health
curl -s -H "Authorization: Bearer $AXE_API_KEY" http://127.0.0.1:8001/claude/repos
```

`/claude/repos` moet de repo's noemen die de code-editor mag aanraken. Is het
leeg, dan weigert élke run, en dat is de meest waarschijnlijke reden dat de
code-editor straks niets doet. Zet `AGENT_REPOS` in `backend/axe_api/.env.local`,
vorm `naam=/pad`, meerdere gescheiden door komma's. Een checkout op `main` of
`master` wordt geweigerd (beschermde branch) — controleer dus ook op welke
branch elke whitelist-repo staat.

Draai daarna `python -m pytest backend/axe_api/test_agent_runner.py` en plak de
uitkomst.

### 4. De vijf motoren van de code-editor doen het

Er wordt op dit moment een nieuwe code-editor aangesloten (ontwerp in PR #148).
Die krijgt één composer met vijf agents: **AXE native, OpenHands, Claude Code,
Codex, Cursor**. Zorg dat de onderkant klopt zodat het meteen werkt zodra de
UI erop aansluit:

- Claude Code / Codex / Cursor: stap 2 hierboven.
- OpenHands draait op de VPS. `OPENHANDS_URL` (en eventueel
  `OPENHANDS_API_KEY`) moeten daar gezet zijn; zonder dat geeft de API een
  eerlijke "not configured" terug. Controleer welke van de twee het is en zeg
  het.
- AXE native is de eigen weg via `/claude/run`; die staat of valt met stap 3.

Test elk van de vijf met een echte, kleine opdracht via de API (niet via de UI,
die is nog in aanbouw) en plak per motor het antwoord of de foutmelding.

### 5. De browsers: VPS, Mac mini, iMac

`src/domain/browserHosts.ts` kent een host per URL (geen naam, een adres — een
tailnet-naam mag). Zorg dat alle drie bereikbaar zijn vanuit AXE CORE en
noteer per host het adres dat werkt.

Voor de **iMac** heb je waarschijnlijk informatie van Luka nodig: bereikbaar
adres of tailnet-naam, of de machine aan staat, en of hij daar iets mag
installeren. Vraag dat expliciet, met wat hij moet doen om het op te zoeken
(bijvoorbeeld `tailscale status` of Systeeminstellingen → Delen).

### 6. Computer use

`src/infrastructure/gateways/computerRelay.ts` praat via Supabase met een agent
op de machine — geen open poort, dat is met opzet. Controleer dat
`onlineDevices()` daadwerkelijk een apparaat teruggeeft, en dat een
onschuldige call (een screenshot) werkt op de Mac mini. Lukt dat niet, zoek uit
of de relay-agent daar überhaupt draait en meld wat er ontbreekt.

Draai niets wat bestanden verandert of iets verstuurt als test. Een screenshot
is genoeg bewijs.

## Dingen die je niet mag doen

- Geen `git stash` of `git checkout --` op de VPS zonder eerst te kijken wat er
  staat en het te melden. Daar staat werk dat nergens anders staat.
- Geen sleutelwaardes in de chat of in een commit. Namen wel.
- `LSE_API_KEY` krijgt **geen** `VITE_`-prefix (dat zou hem naar de browser
  sturen). LSE-data blijft in AXE CORE; niet in Companion of Trading OS.
- `AXE_TERMINAL_ALLOWED_USER_IDS` moet gezet zijn op **elke** host die
  `terminal-server.cjs` draait. Hetzelfde Supabase-project bedient ook
  Companion en Trading OS, dus zonder die lijst kan elk account van dat project
  een shell openen. Luka's user id is `acff7a12-1111-481d-a7a9-cc07583b8069`
  (dat is een id, geen sleutel) — **zonder** achtervoegsel `-axe-core`.
- Niets weggooien wat je niet snapt. Kom je dode code of dubbele endpoints
  tegen (`backend/axe_api/main.py` heeft dubbele endpointsets), meld het; ruim
  het niet op in dezelfde sessie als deze opdracht.

## Wat je oplevert

Eén verslag met per onderdeel: **wat werkt** (met de uitvoer erbij), **wat niet
werkt** (met de foutmelding), en **wat Luka moet doen** (per punt: machine,
exact commando, en wat hij moet zien als het goed is). Geen samenvatting die
netter klinkt dan de werkelijkheid — de hele reden dat deze prompt bestaat, is
dat dingen hier te vaak "klaar" heetten terwijl ze het niet waren.
