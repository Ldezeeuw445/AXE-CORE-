# Terminals — wat draait waar, en wat moet blijven staan

Dit is het antwoord op één vraag: **welke vensters moet ik openhouden om AXE
CORE volledig te laten werken?**

Het korte antwoord: **geen**. AXE CORE start de twee diensten zelf zodra hij
opent, want hij draait op diezelfde Mac -- en een bewaker zet ze elke tien
seconden terug als er eentje omvalt.

De Terminals-tab heeft acht vakken. Vier daarvan zijn dezelfde Mac met een
andere rol (repo, API, agents, git): elk vak is een eigen shell op poort 4022,
zoals vier tabbladen in Terminal.app. Bouwen duurt minuten, de API-logs wil je
ondertussen zien, een agent-login wacht op jouw antwoord en git doe je
tussendoor -- dat in één shell proppen betekent wachten op elkaar.

Je ziet ze bovenaan de Terminals-tab, met een lampje per dienst en een
start/stop-knop. Wil je ze liever met de hand in een venster draaien, dan kan
dat nog steeds -- de app merkt dat er al iets op de poort luistert en laat het
met rust. Hieronder staan die commando's, want je hebt ze nodig zodra de app
zelf niet start.

---

## Wat AXE CORE zelf start

Bij het openen zet de app deze twee aan, tenzij er al iets op hun poort
luistert. Bij het afsluiten haalt hij alleen neer wat hij zelf startte -- jouw
eigen venster blijft met rust gelaten.

De uitvoer gaat naar `.axe-logs/terminal.log` en `.axe-logs/api.log` in de
repo. Start er een niet, dan staat daar waarom.

> **Waarom via een login-shell.** Een GUI-app op macOS erft je PATH niet: hij
> krijgt het kale `/usr/bin:/bin` en daar staat geen npm, geen node uit nvm en
> geen homebrew. De app start ze daarom via `zsh -lc`, dat je profiel leest.
> Dit is de valkuil die anders een uur zoeken kost: het werkt in een terminal
> en niet vanuit de app.

## Dezelfde twee met de hand

Nodig zodra de app ze niet kan starten. Ze draaien in de **voorgrond**: de
prompt komt niet terug — dat is geen storing. Sluit je het venster, dan stopt
de dienst.

### 1. De shell-server

```bash
cd ~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
npm run terminal
```

**Waarvoor:** de Terminals-tab in de app praat hiermee. Zonder dit staat
"Deze Mac" op rood met *Connection failed*.

**Luistert op:** `127.0.0.1:4022`

**Wat je moet zien:** `AXE terminal-server luistert op 127.0.0.1:4022`. Zegt hij
iets over `AXE_TERMINAL_ALLOWED_USER_IDS` dat leeg is, dan laat hij iedereen
toe met een geldig Supabase-token — en dat zijn ook de abonnees van Companion
en Trading OS, want het is één Supabase-project. Zet hem in
`backend/axe_api/.env.local`.

### 2. De lokale API

```bash
cd ~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api
./run-local.sh
```

**Waarvoor:** de Code Agent, commit & push vanuit de app, en de agent-motoren
(Claude, Codex, Cursor). Zonder dit geeft de Code Agent `AXE API 404`.

**Luistert op:** `127.0.0.1:8001`

> Staat de hostkeuze in de Code Agent op **VPS** in plaats van **deze Mac**, dan
> helpt deze server je niet — dan praat de app met de VPS, en die heeft zijn
> eigen deploy nodig (zie onder).

---

## Op je Mac: commando's die terugkomen

Deze bezetten het venster niet.

| Commando | Wat het doet |
|---|---|
| `npm run bijwerken` | Binnenhalen, bouwen, de oude app sluiten, de nieuwe openen. Zegt welke commits binnenkwamen en waaruit hij gebouwd is. |
| `npm run welke` | Leest uit élke AXE CORE.app op deze Mac welke commit erin zit. Het antwoord op "is mijn wijziging er wel in". |
| `lsof -ti :8001 \| xargs kill` | Sluit wat er op 8001 luistert. Voor *address already in use*. |
| `lsof -ti :4022 \| xargs kill` | Idem voor de terminal-server. |
| `ps aux \| grep -E "uvicorn\|terminal-server" \| grep -v grep` | Draaien die twee nog? |

---

## Op de VPS'en: niets hoeft open te blijven

Daar draait alles onder **systemd**. `systemctl restart` komt terug en de dienst
blijft daarna zelf draaien — ook als je de ssh-verbinding verbreekt. Dat is het
hele verschil met de Mac.

### Strato — `api.axecompanion.com`

```bash
# Deployen na een push. De && is belangrijk: mislukt de pull, dan mag de
# herstart NIET doorgaan -- anders herstart je de oude code en lijkt het gelukt.
cd /opt/axe-core-api && git pull && systemctl restart axe-core-api && systemctl --no-pager status axe-core-api --lines=5

# Draait alles nog
systemctl --no-pager status axe-core-api axe-terminal axe-companion axe-task-worker --lines=0

# Wat ging er mis
journalctl -u axe-core-api -n 60 --no-pager
journalctl -u axe-terminal -n 40 --no-pager
```

**Diensten:** `axe-core-api` · `axe-terminal` · `axe-companion` · `axe-task-worker`

### Hetzner — `ollama.axecompanion.com`

Ollama met 18 modellen. Draait als dienst; geen venster nodig.

**Terminal (vak 6):** `wss://ollama.axecompanion.com/terminal`. Dienst
`axe-terminal` (systemd), code in `/opt/axe-terminal`, omgeving in
`/etc/axe-terminal.env`, luistert alleen op `127.0.0.1:4022`; nginx geeft TLS.
Bijwerken: kopieer `terminal-server.cjs` en `terminalShell.cjs` naar
`/opt/axe-terminal` en `systemctl restart axe-terminal`.

> Tot 13 september stond hier de Docker-container `axe-terminal-server`
> (10 juli) op **publieke** poort 4022, en die accepteerde elk token. Docker
> publiceert poorten langs ufw heen, dus "ufw staat alleen 22 toe" beschermde
> niets. De container is gestopt en start niet meer vanzelf.

```bash
systemctl --no-pager status axe-terminal ollama --lines=0
ollama list
journalctl -u ollama -n 40 --no-pager
```

### iMac — `main-imac-luka` (gebruiker `lukadezeeuw`)

**Terminal (vak 7):** `wss://main-imac-luka.tail03735e.ts.net:4022/terminal` —
staat in `terminalHosts.ts`. Zonder dat in de bundel is het vak na een herstart
van de Mac-mini-app leeg, omdat een lokaal ingevuld adres daar niet overleeft.

- Draait als LaunchAgent `com.axe.terminal` uit `~/.axe-terminal` (los van de
  checkout in `~/Projects/AXE-CORE-`, zodat een pull of lokale wijziging daar
  de terminal niet raakt). Log: `/tmp/axe-terminal.log`.
- Luistert alleen op `127.0.0.1:4022`. **Tailscale Serve** geeft het HTTPS-adres,
  alleen binnen je tailnet; op het thuisnetwerk is 4022 dicht.
- Zelfde muur als overal: Supabase-token en `AXE_TERMINAL_ALLOWED_USER_IDS`.
- Bijwerken: kopieer `terminal-server.cjs` en `terminalShell.cjs` naar
  `~/.axe-terminal/` en `launchctl kickstart -k gui/$(id -u)/com.axe.terminal`.
- Uitzetten: `tailscale serve --https=4022 off` en
  `launchctl bootout gui/$(id -u)/com.axe.terminal`.

Gemeten 13 september: `claude` en `codex` staan erop (codex ingelogd, claude
niet), `cursor-agent` is toen geïnstalleerd. Inloggen doe je in vak 7 zelf,
want de sleutelhanger van de iMac is alleen in je eigen sessie open — via ssh
zegt cursor-agent *"login keychain is locked"*.

---

## De volgorde als je van nul begint

1. `npm run bijwerken` — laatste versie binnen, gebouwd, open.
2. Nieuw venster: `npm run terminal` — **laten staan**.
3. Nieuw venster: `backend/axe_api/run-local.sh` — **laten staan**.
4. In de app, Code Agent: hostkeuze op **deze Mac**.
5. Ging er iets mis op de VPS: de deploy-regel hierboven.

---

## Waar dit ook in de app staat

De Terminals-tab toont per machine dezelfde lijst, met:

- **doorgetrokken rand** = draait meteen (leest alleen, verandert niets)
- **streepjesrand** = komt in de prompt te staan, jij drukt enter
- **amber rondje** = blijft draaien, het venster is daarna bezet

Die markering komt uit `src/domain/terminalSnelacties.ts` (`blijftDraaien`), met
een test die bewaakt dat de Mac er precies twee heeft en een VPS geen enkele.
Klopt dit document niet meer met de app, dan is de code de waarheid.

---

## Waarom de terminals traag waren (en niet meer zijn)

Twee oorzaken, en de eerste was de echte.

### 1. Er was geen terminal

`terminal-server.cjs` startte de shell met `spawn(shell, ['-l'])`: drie pijpen,
geen pty. Een shell zonder terminal is een ander programma:

| | op pijpen | op een pty |
|---|---|---|
| prompt | geen | ja |
| uitvoer | per blok van 4 KB | meteen |
| Ctrl+C | doet niets | breekt af |
| tab-aanvulling | nee | ja |
| `less`, `top`, `vim` | onbruikbaar | werken |
| kleur | uit | aan |

Die blokbuffering is wat "mega traag" voelde: je typt `npm run build`, ziet
seconden niets, en dan alles tegelijk. Het commando liep even snel als altijd —
je zag het alleen niet gebeuren.

Nu start de shell in een echte pty. Geen nieuwe dependency. Gemeten in deze
repo: `tty` geeft `/dev/pts/0`, `tput cols` geeft de echte breedte, en `Ctrl+C`
breekt een `sleep 30` af.

- **Linux:** via `script -qfc`.
- **macOS:** via een lusje in de systeem-`python3` (module `pty`). Níét via
  `script`: BSD-`script` leest de terminalinstellingen van zijn eigen stdin en
  stopt als dat geen tty is — vanuit Node is dat altijd een socket. Gemeten 13
  september op de Mac mini: exit 1 na 5 ms,
  `script: tcgetattr/ioctl: Operation not supported on socket`, en elk Mac-vak
  ging meteen dicht. Met python3: `tty` geeft `/dev/ttys002`, `Ctrl+C` breekt
  `sleep 30` af, `exit 7` komt als exitcode 7 bij de server aan.

Zet `AXE_TERMINAL_PTY=0` om terug te vallen op pijpen als een machine er niet
mee blijkt te werken.

### 2. Elke cel was een DOM-element

xterm tekent zonder addon elke cel als DOM-knoop. Eén scherm vol uitvoer is dan
duizenden knopen om op te maken — maal acht vakken. Nu via de GPU
(`@xterm/addon-webgl`), met terugval op DOM als WebGL geweigerd wordt.

Daarbij: de cursor knippert alleen nog in het vak met focus (was zestien
hertekeningen per seconde in vensters waar je niet naar kijkt), scrollback van
5000 naar 2000 regels per vak, en `fit()` draait één keer per frame in plaats
van één keer per resize-melding — dat laatste was de schokkerigheid tijdens het
verslepen van het venster.

### Wat dit voor de VPS betekent

De Strato-VPS draait nog de oude server en blijft dus op pijpen tot je daar
deployt. Dat is geen storing: de server zegt in zijn eerste bericht of hij een
pty gaf, en de browser zet zijn eigen regeleditor alleen aan als het antwoord
nee is. Oude server, oud gedrag; nieuwe server, echte terminal.

### Wat nog niet meebeweegt

De venstermaat wordt één keer gezet, bij het openen van de sessie. `script`
heeft zelf geen terminal om de maat van over te nemen, en zonder native module
is er geen ioctl — dus vraagt de server het de shell met `stty`. Dat later
herhalen zou midden in een regel vallen die je aan het typen bent. Maak je een
vak veel groter, klik dan op de gele stip voor een verse shell.
