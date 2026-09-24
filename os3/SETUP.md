# AXE-node op je machines

Kort, in de volgorde die je een keer doet. Daarna is AXE zelf de
uitvoeringslaag: een daemon op de Mac mini, de iMac en de VPS belt
**naar buiten** naar `api.axecompanion.com`. Geen inbound poort, dus
het werkt ook als je remote bent (Device Manager, PR #149).

Rabbit OS3 blijft een optionele extra executor via dezelfde `axe`-CLI.
Die hangt onderaan.

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
Zelfde commando: `ln -sf` naar `/usr/local/bin/axe`.

Of, zonder symlink, vanuit de app-map:

```bash
python3 cli/axe help --json
```

## 2. Config / geheimen

Nooit in git, nooit in een prompt plakken. Env of een lokaal bestand.

```bash
# hetzelfde op Mac en VPS
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
drukt hem nooit af. `memoryBackend: axon` is later: zelfde commando's,
andere backend.

## 3. Machine koppelen

Op elke machine één keer. De token wordt **één keer** getoond en
hashed bewaard. Daarna is dat het geheim van die node.

```bash
axe node register --name mac-mini --os darwin --write --json
# veld `pairing` is het geheim — één keer, daarna hashed
# of op de VPS:
axe node register --name vps --os linux --write --json
```

De CLI zet `device_id` + pairing in `~/.config/axe/node.json` (mode 600).
Bewaar die file; zonder geheim weigert de heartbeat.

Lijst in AXE (naam, OS, online / last-seen):

```bash
axe node list --json
```

## 4. Daemon: outbound, geen poort

Eén hartslag + job-poll (testbaar):

```bash
axe node run --once --json
```

Blijvend, voor launchd / systemd:

```bash
axe node run --daemon
```

De daemon verbindt naar buiten. Hij luistert nergens. Jobs uit de
tier-3 router (PR #179) met `target_device` worden **getoond**, nog
niet uitgevoerd — dat is fase 2, zie bouwlijst §8. Hetzelfde hek als
de CLI geldt al wel: mail, NorthSea auto-send, merge naar
`orchestrator` en wissen blijven hard geblokkeerd.

## 5. launchd (macOS) en systemd (Linux)

Vanuit de app-map:

```bash
./scripts/install-axe-node.sh
```

Het script schrijft:

- macOS: `~/Library/LaunchAgents/com.axe.node.plist` (`KeepAlive`)
- Linux: `~/.config/systemd/user/axe-node.service`

Env komt uit `~/.config/axe/config.json` plus `~/.config/axe/node.json`.
Zonder `AXE_API_KEY` en pairing-token start hij niet.

Bestaande workers (`com.axe.computer-worker`, claude-local) blijven
draaien tot fase 2 ze onder `axe node` trekt. Niet drie daemons het
zelfde werk laten doen — zie bouwlijst §8.

## 6. Vijf testprompts (via de CLI, of via OS3)

1. `Meet of AXE leeft.`  
   Verwacht: `axe status --json` meldt core / agents / cron.

2. `Welke machines hangen eraan?`  
   Verwacht: `axe node list --json`.

3. `Wat zijn de open NorthSea-deals?`  
   Verwacht: `axe northsea deals --json`, daarna `axe notify --write "…"`.

4. `Onthoud dat AXE zelf de uitvoeringslaag is.`  
   Verwacht: `axe memory add --write --text "…"` en een notify.

5. `Stuur een mail naar de koper` of `zet auto_send_qualification aan`.  
   Verwacht: geweigerd (`blocked`, exit 3). Geen override.

Als 1–4 JSON teruggeven en 5 blokkeert, hangt de commandolaag aan AXE.

## 7. Optioneel: Rabbit OS3

OS3 is geen vereiste. Als je de rabbit agent wél wilt:

1. Account op https://os3.rabbit.tech, BYOK (jouw sleutel).
2. rabbit agent lokaal, tot vijf nodes.
3. Importeer `os3/SKILL.md` als skill **AXE**.
4. OS3 belt AXE via `axe`, niet andersom. Geen publieke OS3-API.

Namen van rabbit-nodes mogen samenvallen met `AXE_NODE_MAC` /
`AXE_NODE_VPS`, maar de primaire daemon is `axe node run`.

## Wat hierna

- `cli_laag.py` moet op de VPS staan (zit in `vps_sync.py`). Zonder die
  module vallen notify/search/agent-run terug op de oudere routes, en
  bestaan `/cli/nodes*` niet.
- Fase 2 (bouwlijst §8): jobs echt uitvoeren (shell, toegestane paden,
  Claude Code headless), streaming events, computer-worker +
  claude-local-worker onder één daemon.
- Niet mergen naar `orchestrator` vanuit een node of vanuit OS3.
  Dat blijft hard geblokkeerd.
