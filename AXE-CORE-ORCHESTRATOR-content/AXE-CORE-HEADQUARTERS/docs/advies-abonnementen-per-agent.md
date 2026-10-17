# Advies: welk abonnement per agent, en welke API-credits nog zin hebben

Bron: `backend/axe_api/agent_tiers.json` (de router leest dat bestand).
Gemeten 17 okt 2026: de agent-cycli stopten op *Every provider failed* terwijl
de Claude Pro- en ChatGPT Plus-seats op de Mac mini vrijwel stil stonden.

Tiers hier zijn **model-tiers**, niet de roster-tiers (manager/worker/app):

1. Zwaar redeneren/coderen — Claude-stoel (Opus/Sonnet), Codex `gpt-5-codex` als tweede, Cursor bij repo-wijd werk.
2. Gewone cycli — Groq als snelle gratis weg, daarna Sonnet/Haiku op een stoel.
3. Periodiek/goedkoop — Groq, Cerebras, lokale Ollama. Nooit een stoel.

## Agent → tier → model → stoel

| Agent / crew | Tier | Model | Abonnement / stoel |
|---|---|---|---|
| AXE Core (`axe`) | 2 | Groq, daarna Claude Sonnet | claude2 / claude3 / claude4 |
| Wingman | 2 | Groq + Claude Sonnet | zelfde Claude-seats |
| NorthSea Desk Manager | 2 | Groq + Claude Sonnet | Claude-seats; DAX energy 6u = tier 3 |
| Trading Agent | 2 | Groq + Claude Sonnet | Claude-seats; géén live orders |
| AXE Developer | 1 | Claude Opus/Sonnet, Codex tweede, Cursor repo-wijd | claude2–4, daarna `~/.codex` / `~/.codex-tweede`, dan Cursor Pro |
| ThinkTank | 2 | Groq + Claude Sonnet | Claude-seats; DAX ideas 12u = tier 3 |
| Browser | 2 | Groq + Ollama | geen stoel nodig; DAX sites 6u |
| Memory | 2 | Groq + Ollama | geen stoel |
| Task | 2 | Groq + Ollama | geen stoel |
| Cron Manager | 3 | Groq / Cerebras / Ollama | geen stoel |
| Finance | 3 | Groq / Ollama | geen stoel; koopt niets |
| App Manager | 3 | Groq / Ollama | geen stoel |
| AXE Intel | 2 | Groq + Claude Haiku | Claude-seats |
| AXE Companion | 2 | Groq + Claude Haiku | Claude-seats |
| Crew Wags / Forge | 1 | Claude seat | developer-seats |
| Crew Dollar Bill / Nova / Research | 2 | Groq + Haiku/Sonnet | Claude-seats |
| Crew Sentinel / Pulse / Atlas | 3 | Groq / Ollama | geen stoel |
| NorthSea deal/sourcing supervisors | 2 | Groq + Sonnet | Claude-seats |
| Overige NorthSea-specialisten | 2–3 | Groq / Ollama | meestal geen stoel |

Luka's echte seats (Mac mini):

- Claude Pro: `CLAUDE_CONFIG_DIR=~/.claude-tweede`, `~/.claude-derde`, `~/.claude-vierde`
- ChatGPT Plus: `CODEX_HOME=~/.codex`, `~/.codex-tweede`
- Cursor Pro: `cursor-agent login`
- OpenHands: VPS (`OPENHANDS_URL`), geen CLI-login

## Welke betaalde API-credits nog zin hebben

| Provider | Advies | Waarom |
|---|---|---|
| Groq (gratis) | **houden** | Snelle tier-2/3-weg. Een 429 is een limiet, geen factuur. |
| Cerebras (gratis) | **houden** | Tweede gratis pad als Groq afkoelt. |
| Ollama (Mac mini / modelbox) | **houden** | Geen tegoed. Laatste vangnet. |
| OpenAI API (`gpt-4.1-mini`) | **niet top-uppen** | Codex-seats doen hetzelfde werk. De 429 "no credits" van 17 okt is precies waarom de lus nu naar een stoel gaat. |
| Anthropic API | **niet top-uppen** | Drie Claude Pro-seats staan al klaar. API-credits betalen dubbel. |
| OpenRouter | **weg** | Alleen een doorgeefluik; was al leeg. Niets dat Groq/stoelen niet kunnen. |
| Gemini API | **niet top-uppen** | Free/cooling. Geen reden om prepayment credits te kopen. |
| Claude / ChatGPT / Cursor **abonnementen** | **houden en gebruiken** | Dit is de capaciteit die stil stond. De router spreidt nu over stoelen via `core_coding_seats`. |

AXE koopt niets zelf. Als een betaalde API toch weigert, komt er één `core_notifications`-regel `[tegoed] <provider>` — geen aankoop.

## Wat jij op de Mac en de VPS moet doen

1. Mac mini: `launchctl kickstart -k gui/$(id -u)/com.axe.computer-worker` (of de machine herstarten). Nieuwe worker kent `seat` + `CLAUDE_CONFIG_DIR` / `CODEX_HOME`.
2. Controleer logins, één keer als een stoel `logged_in=false` is:
   - `CLAUDE_CONFIG_DIR=~/.claude-tweede claude auth login` (en derde/vierde)
   - `codex login` en `CODEX_HOME=~/.codex-tweede codex login`
   - `cursor-agent login`
3. VPS: `python3 scripts/vps_sync.py check` en daarna de gewone sync/deploy zodat `axe_api` deze router draait. Zonder die deploy blijft de oude lus *Every provider failed* zeggen.
4. DAX: `dax-wacht` schrijft nu elke ronde `dax-routine` opnieuw. De developer-CI herstelt een `.venv-ci` zonder pip. Geen handmatige pip in de container.
