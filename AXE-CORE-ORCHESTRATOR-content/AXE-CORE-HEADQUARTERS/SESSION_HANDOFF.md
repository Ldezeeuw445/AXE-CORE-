# Handoff — voor de sessie die lokaal/op de VPS kan (2026-07-27)

Kort bericht om te plakken in de lokale sessie. Alles hieronder staat al gemerged op `orchestrator`.

## Wat er deze sessie is gebouwd (frontend, staat al in de code)
- UI/UX: Architecture + Memory + Maps3D op één mat-zwarte HUD-achtergrond (dot-grid, cyaan depth-glow), Architecture's knoppen (zoom/reset/legend) in dezelfde stijl.
- De 3D-kern op Home reageert nu écht op AXE's status (idle/listening/thinking/speaking/awaiting-approval) — kleur/pulse/snelheid, geen decoratie.
- Nieuwe "mission control"-strook op Home: live open/te-laat-taken, ongelezen meldingen (uitklapbaar), pulserende "wacht op goedkeuring"-pil.
- Code Studio: visuele activity-trace boven de agent-chat (elke stap een bolletje: patch/commando/leesactie, rood bij een echt mislukt commando).
- **Code Studio → Preview-tab (nieuw)**: start/stopt een echte dev-server op de VPS en toont 'm in een iframe.
- **Browser-pagina → Browser Agent-knop (nieuw)**: een échte Playwright-sessie — AXE kan nu daadwerkelijk navigeren/klikken/typen op een pagina (niet alleen lezen), met een live screenshot als "kijkvenster".

## Wat er op de VPS moet gebeuren om dit zichtbaar te krijgen
1. `git pull` op de VPS (axe_api + nginx-config staan al in de repo, `backend/axe_api/`).
2. `pip install -r requirements.txt` (voegt `playwright` toe) + **`playwright install chromium`** — zonder dit geeft de Browser Agent een eerlijke 503, geen nep-resultaat.
3. Nieuwe `nginx_api.conf` toepassen (`/preview/` route + `X-Frame-Options` alleen nog op de JSON-API, niet meer globaal) en nginx reloaden.
4. `PREVIEW_PUBLIC_URL` zetten in axe_api's `.env` (bijv. `https://api.axecompanion.com/preview/`) zodra stap 3 klaar is — anders blijft de Preview-tab netjes "nginx-route nog niet klaar" tonen i.p.v. iets te verzinnen.
5. axe_api herstarten/redeployen (`deploy.sh`).
6. Nog openstaand van eerder: `CRON_SECRET` in `.env` zetten, nieuwe Gemini-key, Groq-key check, OpenRouter check, Ollama-status — zie `NEXT_LEVEL_PLAN.md` sectie 2 en 8.

## Om het in de Tauri-app te zien
De Tauri-app bakt de frontend bij het bouwen in (`frontendDist` in `tauri.conf.json`) — er zit **geen auto-updater** in. Dus na elke keer dat er nieuwe code op `orchestrator` staat (zoals nu):
```
cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
git pull origin orchestrator
npm install   # als package.json veranderd is
npm run tauri:build
```
en de nieuwe `.app`/`.dmg` opnieuw installeren. Wil je dat we een echte auto-updater (`tauri-plugin-updater`) toevoegen zodat dit vanzelf gaat? Dat is nog niet gebouwd, maar wel precies het soort ding dat bij "altijd werkend op je iMac" hoort — staat als open punt.

## Nog open (uit het next-level-plan, ongewijzigd)
- Obsidian-brug (`core_obsidian_notes`) — nog niet gebouwd.
- 3-klappen wake-gesture — nog niet gebouwd (wel al een losse `useClapDetector` hook aanwezig, nog niet aangesloten op een systemtray/altijd-luisterend Tauri-proces).
- Chat-driven tool-markers voor de browser-agent (zodat je het ook gewoon in de hoofd-AXE-chat kan vragen, niet alleen op de Browser-pagina) — bewust nog niet gedaan deze sessie, wel de architectuur ervoor staat er nu (dezelfde backend-endpoints).
