# Missies en DAX — AXE werkt door zonder "ga door"

Gebouwd 7 okt 2026. Bovenop de durable task-kernel; niets vervangen.

## In één alinea

Een **missie** is een uitkomst boven losse taken ("finish AXON Memory") met
mijlpalen. De **missielus** (`mission_engine.py`) draait in het worker-proces op
de VPS en kiest na elke bewezen stap zelf de volgende — zonder app, browser of
Luka. Uitvoeren blijft een gewone `core_task` via de bestaande worker,
approvals en bewijsplicht. Een **DAX** (Dedicated Agent eXecutor) is de vaste
computer waarop een agent uitvoert: een container op de STRATO-VPS met een
persistente workspace en een persistent browserprofiel. Agent Workspace = wie;
DAX = waar.

## Bestanden

| Wat | Waar |
|---|---|
| Migratie (missies, DAX, slots, agent-tijdlijn, claim-fix) | `supabase/migrations/20261007120000_missies_en_dax.sql` |
| Beslisregel + opslag missies | `backend/axe_api/missies.py` |
| Missielus | `backend/axe_api/mission_engine.py` (start vanuit `task_worker.run_forever`) |
| DAX-register, runtime (Docker/lokaal), slots, slapen | `backend/axe_api/dax.py` |
| Echte agentstatus, tijdlijn, "sinds je weg was", observability | `backend/axe_api/agent_activiteit.py` |
| HTTP | `backend/axe_api/missie_api.py` (opgehangen in `main.py`) |
| DAX-image, setup, onderhoud | `infra/dax/` |
| Eeuwig gesprek | `src/domain/chat/hoofdgesprek.ts`, `voiceStore.ts`, `chatPersistence.ts` |
| Home-status | `src/domain/agents/serverStatus.ts`, `AgentVensters.tsx`, `ManagerChat.tsx` |
| CLI | `cli/axe missions …`, `axe agents activity`, `axe dax list`, `axe observe` |
| Bewijs | `backend/axe_api/integratie/test_bewijs.py` (A–G), `test_missies.py` |

## Gedrag

- Missie-status: `active`, `monitoring` (doorlopend, wacht op volgende ronde),
  `waiting_agent`, `waiting_approval`, `blocked`, `human_decision_required`,
  `paused`, `completed`, `failed`, `cancelled`.
- Na elke taak: bewijs (`verification.passed`) of het telt als mislukt. Agent
  sluit af met `MILESTONE: done | continue NEXT_ACTION: … | blocked REASON: … |
  human REASON: …`.
- Mislukt → opnieuw met de fout erbij (max 3) → daarna `blocked` + melding.
- Approval → missie `waiting_approval`, staat bewaard; akkoord → dezelfde taak
  hervat, missie gaat zelf door.
- `continue_until`: `complete`/`blocked` = automatisch door; `paused` =
  stapmodus; `human_decision_required` = na elke mijlpaal Luka laten beslissen.
- `recurring_interval_seconds`: na de laatste mijlpaal `monitoring`, en na het
  interval opnieuw (NorthSea deal sourcing).
- Agentstatus op Home: WORKING alleen bij een levende lease. Verder
  VERIFYING, WAITING_TOOL, WAITING_AGENT, WAITING_APPROVAL, QUEUED, BLOCKED,
  ERROR, MONITORING, MISSION_COMPLETE, SLEEPING.
- Eén eeuwig gesprek: vaste id `a8e00000-0000-4000-8000-00000000a8e0`; het
  hoofdgesprek toont de nieuwste 500 AXE-berichten over alle oude gesprek-id's
  (er wordt niets herschreven). Geen "+ nieuw gesprek" meer; oude gesprekken
  blijven in het archief. Begroeting hooguit één keer per dag over alle
  apparaten, alleen met echt nieuws of een briefje.

## Gevonden en gerepareerd in de kernel

`claim_next_core_task` claimde taken in `verifying`/`planning` ook mét levende
lease → met meerdere slots draaide dezelfde stap twee keer (bewezen in test D).
En een taak waarvan de worker stierf op de laatste poging bleef eeuwig
`running`. Beide gerepareerd in de migratie.

## Uitrol

### 1. Database (Supabase, AXE-project)

```bash
supabase db push   # of: plak 20261007120000_missies_en_dax.sql in de SQL-editor
```
Additief en idempotent. Controle:
```sql
select id, owner_agent, heavy_slots from core_dax_computers;   -- 5 rijen
select proname from pg_proc where proname in
 ('claim_next_core_mission','acquire_dax_slot','release_dax_slot','defer_core_task');
```

### 2. Control plane (huidige VPS, api.axecompanion.com)

```bash
python3 scripts/vps_sync.py check
python3 scripts/vps_sync.py deploy      # ship missies/dax/agent_activiteit/missie_api + main/task_worker
systemctl restart axe-core-api axe-task-worker
journalctl -u axe-task-worker -n 50 | grep -i mission
```
Zonder DAX-variabelen draait de missielus al (op de VPS zelf, zoals elke taak).
Uitzetten: `AXE_MISSIONS=0`.

### 3. STRATO (compute plane)

Op de control plane:
```bash
ssh-keygen -t ed25519 -N '' -f /root/.ssh/axe_dax
scp -r infra/dax root@<STRATO_IP>:/opt/axe-dax-src
ssh root@<STRATO_IP> "bash /opt/axe-dax-src/setup-strato.sh '$(cat /root/.ssh/axe_dax.pub)'"
cat >> /root/.ssh/config <<'EOF'
Host strato-dax
  HostName <STRATO_IP>
  User axe-dax
  IdentityFile /root/.ssh/axe_dax
EOF
DOCKER_HOST=ssh://strato-dax docker ps        # moet werken, zonder shell-toegang
```
Dan in `/opt/axe-core-api/.env`:
```
AXE_DAX_ENABLED=1
AXE_DAX_DOCKER_HOST_STRATO=ssh://strato-dax
AXE_DAX_MAX_HEAVY=3
AXE_DAX_IDLE_SLEEP=1800
```
en `systemctl restart axe-task-worker axe-core-api`.

Abonnement-CLI's in een DAX (eenmalig inloggen, staat daarna in het home-volume):
```bash
DOCKER_HOST=ssh://strato-dax docker exec -it dax-developer-01 claude   # /login
DOCKER_HOST=ssh://strato-dax docker exec -it dax-developer-01 codex login
```

### Omgevingsvariabelen

| Variabele | Default | Wat |
|---|---|---|
| `AXE_MISSIONS` | `1` | missielus aan/uit |
| `AXE_DAX_ENABLED` | `0` | agents met een DAX voeren daar uit |
| `AXE_DAX_DOCKER_HOST_STRATO` | — | `ssh://strato-dax`; per host `AXE_DAX_DOCKER_HOST_<HOST>` |
| `AXE_DAX_MAX_HEAVY` | `3` | globaal max zware DAX-taken tegelijk |
| `AXE_DAX_DEFER_SECONDS` | `20` | wachttijd als alles bezet is |
| `AXE_DAX_IDLE_SLEEP` | `1800` | container stopt na zoveel s zonder werk |
| `AXE_DAX_EXEC_TIMEOUT` | `600` | max duur van één shell-stap in een DAX |
| `AXE_DAX_LOCAL_ROOT` | `/opt/axe-dax` | voor `runtime='local'` |

## Verifiëren na uitrol

```bash
axe missions create --write --title "DAX smoke" --goal "prove DAX works" \
  --agent developer --steps "write hello.txt in your workspace; read it back"
axe agents activity        # developer → WORKING, daarna MISSION_COMPLETE
axe missions show <id>     # milestone.completed x2, mission.completed
axe dax list               # dax-developer-01 running, slots 0 na afloop
axe observe
```
Lokaal (zonder productie):
```bash
cd backend/axe_api && eval "$(bash integratie/start_testdb.sh | grep ^export)"
python3 -m pytest integratie/test_bewijs.py -v
```

## Bekende beperkingen

- Het DAX-image (`infra/dax/Dockerfile`) is niet in deze sessie gebouwd: Docker
  Hub en MCR waren daar niet bereikbaar. De tests draaien op een kaal image met
  de host-userland gemount (zelfde Chromium/Playwright); op STRATO bouwt
  `setup-strato.sh` het echte image.
- `npm install`/`pip install` zijn binnen een DAX vrij (eigen container);
  `git push`, `ssh`, `systemctl`, `docker`, mail en orders blijven goedkeuring vragen.
- Overnemen van de DAX-browser (VNC/CDP) is voorbereid (profiel is een map,
  headless) maar niet gebouwd.
- Engine/model op de Home-kaart verschijnt alleen als de taak het meegeeft;
  de agent-lus logt dat nog niet, dus meestal leeg — er wordt niets geraden.
- Missies aanmaken kan via API en `axe missions create`; nog niet als
  zin in de AXE-chat.
