# axe CLI op je machines

Kort, in de volgorde die je een keer doet. De CLI is een hek bovenop
wat er **al** draait: computer-worker, durable kernel, leerlus/RAG.
Geen tweede daemon, geen tweede geheugen.

Rabbit OS3 is optioneel en gebruikt dezelfde `axe`-commando's.

De commandolaag staat in de app-map:

```
AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/cli/axe
```

## 1. `axe` CLI

Python 3 is genoeg. Geen extra packages.

```bash
cd /pad/naar/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
chmod +x cli/axe
sudo ln -sf "$(pwd)/cli/axe" /usr/local/bin/axe
axe help --json
```

Op de VPS is het pad vaak `/opt` of de git-checkout die je daar al hebt.
Of, zonder symlink:

```bash
python3 cli/axe help --json
```

## 2. Config / geheimen

Nooit in git, nooit in een prompt plakken. Env of een lokaal bestand.

```bash
export AXE_API_URL=https://api.axecompanion.com
export AXE_API_KEY='…'          # dezelfde bearer als de app; staat op de VPS in /opt/axe-core-api/.env
export AXE_ACTOR=axe
export AXE_NODE_MAC=mac-mini
export AXE_NODE_VPS=vps
```

Of `~/.config/axe/config.json`:

```json
{
  "apiUrl": "https://api.axecompanion.com",
  "apiKey": "niet-in-git",
  "actor": "axe",
  "nodeMac": "mac-mini",
  "nodeVps": "vps",
  "memoryBackend": "rag"
}
```

`AXE_API_KEY` woont in de kluis (`SLEUTELS.md`) en op de VPS. De CLI
drukt hem nooit af. `memoryBackend: axon` is een label, geen tweede store
— AXON is een apart product met een write-bridge, geen AXE-backend.

## 3. Machines die er al zijn

De Mac-relay is `infra/computer-worker` (launchd
`com.axe.computer-worker`, `scripts/install-computer-worker-launchd.sh`).
Die belt outbound naar Supabase, schrijft `core_computer_workers`, pakt
`core_tasks` met `capability=computer_use`. Claude-local is
`infra/claude-local-worker` (handmatig, `capability=claude_local`).

```bash
axe node list --json
```

leest die bestaande rijen. Geen `register`, geen nieuwe pairing-token,
geen tweede KeepAlive.

Remote (vakantie, Samsung): Device Manager (PR #149) is de telefoon-UI
die dezelfde Mac-workers werk geeft. Geen extra poort op de Mac.

## 4. Vijf testprompts

1. `Meet of AXE leeft.` → `axe status --json`
2. `Welke machines hangen eraan?` → `axe node list --json`
3. `Wat zijn de open NorthSea-deals?` → `axe northsea deals --json`, daarna `axe notify --write "…"`
4. `Onthoud dat de leerlus de bron is.` → `axe memory add --write --text "…"`
5. `Stuur een mail naar de koper` of `zet auto_send_qualification aan.` → `blocked`, exit 3

## 5. Optioneel: Rabbit OS3

1. Account op https://os3.rabbit.tech, BYOK (jouw sleutel).
2. Importeer `os3/SKILL.md` als skill **AXE**.
3. OS3 belt AXE via `axe`, niet andersom. Geen publieke OS3-API.

## Wat hierna

- `cli_laag.py` op de VPS (`vps_sync.py`). Zonder die module vallen
  notify/search/agent-run terug op oudere routes; `axe node list` valt
  terug op de namen in config.
- Niet mergen naar `orchestrator`. Dat blijft hard geblokkeerd.
- Inventaris van wat er al is: bouwlijst §8. Niet opnieuw bouwen.
