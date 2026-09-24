# OS3 aan AXE hangen

Kort, in de volgorde die je een keer doet. Daarna praat OS3 met AXE
via `axe`, op de Mac mini en op de VPS.

De commandolaag staat in de app-map:

```
AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/cli/axe
```

## 1. OS3-account

1. Ga naar https://os3.rabbit.tech en maak een account.
2. Zet een BYOK-sleutel (de jouwe, niet een Rabbit-key).
3. Installeer de **rabbit agent** lokaal: terminal-first, tot vijf nodes.
   Eén node op de Mac mini, één op de VPS.

Er is geen publieke OS3-API. OS3 belt AXE, niet andersom.

## 2. rabbit agent op de Mac mini

Op de Mac, in een terminal:

```bash
# volg de installer van rabbit; daarna:
# node-naam (aanpasbaar): mac-mini
```

Deze node ziet de repo, de Tauri-app en Claude Code.

## 3. rabbit agent op de VPS

Op `api.axecompanion.com` (212.227.91.79), als root of de axe-user:

```bash
# zelfde installer, node-naam (aanpasbaar): vps
```

Deze node ziet de backend, Docker, NorthSea en CrewAI.

## 4. `axe` CLI op beide

Python 3 is genoeg. Geen extra packages.

```bash
cd /pad/naar/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
chmod +x cli/axe
sudo ln -sf "$(pwd)/cli/axe" /usr/local/bin/axe
axe help --json
```

Op de VPS is het pad vaak `/opt` of de git-checkout die je daar al hebt.
Zelfde commando: `ln -sf` naar `/usr/local/bin/axe`.

Of, zonder symlink, vanuit de app-map:

```bash
python3 cli/axe help --json
```

## 5. Config / geheimen

Nooit in git, nooit in een prompt plakken. Env of een lokaal bestand.

```bash
# hetzelfde op Mac en VPS
export AXE_API_URL=https://api.axecompanion.com
export AXE_API_KEY='…'          # dezelfde bearer als de app; staat op de VPS in /opt/axe-core-api/.env
export AXE_ACTOR=os3
export AXE_NODE_MAC=mac-mini
export AXE_NODE_VPS=vps
```

Of `~/.config/axe/config.json`:

```json
{
  "apiUrl": "https://api.axecompanion.com",
  "apiKey": "niet-in-git",
  "actor": "os3",
  "nodeMac": "mac-mini",
  "nodeVps": "vps",
  "memoryBackend": "rag"
}
```

`AXE_API_KEY` woont in de kluis (`SLEUTELS.md`) en op de VPS. De CLI
drukt hem nooit af. `memoryBackend: axon` is later: zelfde commando's,
andere backend.

## 6. Skill importeren

In OS3: importeer `os3/SKILL.md` als skill **AXE**. Dat is wie je bent
en wanneer je welk `axe`-commando gebruikt.

## 7. Vijf testprompts

Na import, in OS3, dit letterlijk (of in het Nederlands hetzelfde):

1. `Meet of AXE leeft.`  
   Verwacht: OS3 draait `axe status --json` en meldt core / agents / cron.

2. `Wat zijn de open NorthSea-deals?`  
   Verwacht: `axe northsea deals --json`, daarna `axe notify --write "…"`.

3. `Onthoud dat Luka OS3 als uitvoeringslaag gebruikt.`  
   Verwacht: `axe memory add --write --text "…"` en een notify.

4. `Zet de developer aan het werk op: noem de open taken.`  
   Verwacht: `axe agent run developer "…" --write`, een `task_id`,
   daarna `axe task wait <id>`.

5. `Stuur een mail naar de koper` of `zet auto_send_qualification aan`.  
   Verwacht: geweigerd (`blocked`, exit 3). Geen override. Meld dat
   eerlijk via `axe notify --write`.

Als 1–4 JSON teruggeven en 5 blokkeert, hangt OS3 aan AXE.

## Wat hierna

- `cli_laag.py` moet op de VPS staan (zit in `vps_sync.py`). Zonder die
  module vallen notify/search/agent-run terug op de oudere routes.
- Approvals die OS3 maakt, zie je in AXE onder pending approvals.
- Niet mergen naar `orchestrator` vanuit OS3. Dat blijft hard geblokkeerd.
