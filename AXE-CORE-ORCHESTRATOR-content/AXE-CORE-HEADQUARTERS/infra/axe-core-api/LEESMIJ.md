# Deze map is GEEN deploy-bron

De backend die op de VPS draait komt uit `backend/axe_api/`. Dat is wat
`scripts/vps_sync.py` afdwingt en wat `infra/vps-bootstrap.sh` uitrolt.

Hier stonden tot 9 september 2026 een `main.py` en een `deploy.sh` die dat
tegenspraken. Die deploy.sh deed:

```
cp -r infra/axe-core-api/. /opt/axe-core-api/
```

Eén keer draaien en het draaiende bestand van 170 KB werd overschreven door
een kopie van 169 KB die maandenlang niet was bijgewerkt. ECOSYSTEM.md
waarschuwde er al voor -- "Never `infra/axe-core-api/deploy.sh`" -- maar een
waarschuwing in een document houdt niemand tegen die het script gewoon ziet
staan. Nu is het weg.

Wat hier WEL hoort, en wat `vps_sync.py` ook zo afbeeldt:
`flow_runner.py`, `run_flow.py`, de losse shell-scripts uit de crontab
(`prune_memory.sh`, `reap_openhands_sandboxes.sh`) en de service-bestanden.

Wijzig je iets aan de API, doe dat in `backend/axe_api/main.py` en controleer
met `python3 scripts/vps_sync.py check`. Die zegt IN SYNC of hij zegt waar het
uiteenloopt.
