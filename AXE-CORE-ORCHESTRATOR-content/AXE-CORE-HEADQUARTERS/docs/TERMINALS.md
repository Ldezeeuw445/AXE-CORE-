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

```bash
systemctl --no-pager status ollama --lines=0
ollama list
journalctl -u ollama -n 40 --no-pager
```

### iMac

Nog geen adres. Zodra je `terminal-server.cjs` daar draait en het adres invult
in de Terminals-tab, geldt hetzelfde als voor deze Mac: **dat venster moet open
blijven**.

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
