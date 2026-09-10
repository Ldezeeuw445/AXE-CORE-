# De browser-agent op een Mac

AXE's browser draaide altijd op de VPS in Duitsland. Dat werkt, maar het is één
machine: gaat die onderuit — geheugen op, poorten dicht — dan kan AXE niet meer
browsen. Met dezelfde dienst op een Mac erbij werkt er altijd wel één, en je
kiest in de app welke.

De keuze staat in de bliksemknop bij AXE CHAT, onder **Browser**. De VPS blijft
de standaard en de terugval; kies je niets, dan verandert er niets.

## Wat er draait

`backend/axe_api/browser_agent_app.py` — de browser-agent als eigen proces, met
de routes al op `/browser/agent` en een `/health` ernaast. Precies wat de app
verwacht, dus er hoeft niets omgeschreven te worden.

**Eén worker, en dat is geen zuinigheid.** Een Playwright-pagina is een levend
object met een open verbinding; die kun je niet in een database leggen en elders
oppakken. Draaide dit met meerdere workers, dan maakte `POST /session` een
sessie in de ene en landde `navigate` in een andere die er nooit van gehoord
had. Zie de kop van dat bestand — dat is weken lang de browser-tab geweest.

## Starten

```bash
cd ~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api
python3 -m venv .venv
.venv/bin/pip install fastapi uvicorn playwright
.venv/bin/playwright install chromium
.venv/bin/uvicorn browser_agent_app:app --host 0.0.0.0 --port 8099 --workers 1
```

Controleren dat hij leeft:

```bash
curl -s http://127.0.0.1:8099/health
```

## In de app zetten

Bliksemknop bij AXE CHAT → **Browser** → **+ een Mac erbij** → het adres:

```
http://<naam-van-deze-mac>:8099
```

Gebruik de **tailnet-naam** en niet `.local`: dan werkt het ook als je niet op
hetzelfde wifi zit. De naam van een machine die al een computer-worker draait
zie je in datzelfde paneel onder **Computer**.

Het adres wordt gecontroleerd voor het erbij mag: alleen `http`/`https`, en geen
pad of query. Er wordt `/browser/agent/...` achter geplakt, dus een basis met
een pad geeft stilletjes een verkeerde URL — en dat leest straks als een kapotte
agent in plaats van als een typefout.

Klopt het, dan zegt het paneel `draait op <naam>` met een groene stip. Het
lampje peilt de GEKOZEN host, niet altijd de VPS.

## Wat je hier moet weten

**Er zit geen slot op.** De VPS-versie heeft de auth van de API ervoor staan;
dit proces niet. Bind hem daarom niet aan het open internet. Op een tailnet is
`0.0.0.0` in orde omdat het tailnet zelf de grens is; op een gewoon netwerk kun
je beter `--host 127.0.0.1` gebruiken en er een tunnel voor zetten.

**Hij opent echte vensters op jouw machine.** Chromium draait headless, dus je
ziet niets, maar het is jouw IP, jouw netwerk en jouw cookies-map. Dat is
meestal precies wat je wilt — een site die de VPS uit Duitsland blokkeert doet
tegen je eigen Mac normaal — maar het is het verschil dat je moet kennen.

**Alleen de browser verhuist.** Handel, geheugen en status blijven bij de
VPS-API; die routes bestaan hier niet eens.
