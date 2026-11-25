# AXE CORE — bouwlijst

<!-- stand:begin -->
**Stand: 36% klaar** `███████░░░░░░░░░░░░░` -- 75 klaar, 79 gebouwd maar nog niet bewezen, 52 open (van 206).

Klaar = live én in het echt bewezen (gemeten, of Luka zag het werken), met datum en bewijs erbij. Code die er staat met groene tests is `[~]` gebouwd, niet klaar. Geteld door `python3 scripts/bouwlijst_stand.py`; zet nooit zelf een getal.

| Deel | Klaar | Gebouwd | Open |
|---|---|---|---|
| Luka 22 nov -- deze week af: OS3, managers = Grokbot = DAX, NorthSea maakt deals | 1 (5%) | 18 | 2 |
| Eerst — één doorlopend systeem (audit 19 nov 2026) | 9 (47%) | 10 | 0 |
| Besproken 9-19 nov -- alles wat Luka vroeg, op één plek | 2 (6%) | 30 | 4 |
| Nu — AXE als co-founder (Luka, 17 nov 2026) | 4 (36%) | 5 | 2 |
| Uit Spazio OS (Pulsar) -- voor AXE (Luka, 18 nov) | 6 (13%) | 15 | 26 |
| 1 — Tabs kloppend maken | 4 (57%) | 0 | 3 |
| 2 — Agents | 6 (86%) | 0 | 1 |
| 3 — Trading | 12 (75%) | 0 | 4 |
| 4 — Computer use, browser, code-editor | 1 (33%) | 0 | 2 |
| 5 — Luka kan het zelf | 3 (43%) | 1 | 3 |
| 6 — AXE als baas (Jarvis-route, niet letterlijk Jarvis) | 23 (92%) | 0 | 2 |
| 7 — axe-commandolaag (CLI + hek, geen tweede agent) | 4 (57%) | 0 | 3 |
<!-- stand:end -->

Bijgewerkt 19 november 2026. Alles hieronder is **gemeten**, niet aangenomen.
Staat er een aanname, dan staat erbij dat het er een is.

Lees eerst `AGENTS.md` in de hoofdmap. Werk je hieraan met Cursor of Cowork:
zet je naam bij het punt dat je oppakt, zodat we niet twee keer hetzelfde doen.

---

## Luka 22 nov -- deze week af: OS3, managers = Grokbot = DAX, NorthSea maakt deals

- [~] **Zijbalk: geen Not tested / Unknown meer**: VPS-sleutels test de zijbalk zelf (half uur cache, 402 = No credits); stoelen: worker vond `~/.local/bin` niet onder launchd, opencode wachtte op stdin, Cursor liep in time-out en `isAuthenticated` werd niet gelezen -- alles gerepareerd, lokaal nagebootst. Live na App bijwerken.
- [~] **Home: per kant één kaart met twee tabs** (Working now / Recent; Needs your OK / Seats·DAX·Cron), tellers, groter op de Mac mini, binnen de maat op de iMac; stoelen met hun echte naam. In de preview gemeten.
- [~] **Managers-tab = Grokbot** (22 nov gebouwd, in de preview gezien: Luka's bubbel vol in de managerkleur, manager-bubbel vol grijs, geen avatar/tijd per bubbel maar tijd als scheiding na een half uur, puntjes bij hover met 5 emoji + Beantwoorden + Kopiëren (menu klapt naar boven als het onderaan niet past), reactie als rondje op de hoek, antwoordbalk boven de composer met citaat dat mee gaat naar de manager, 'Bericht gestuurd' klein in het midden, statusregel twee regels i.p.v. half afgekapt, knoppenrij recht, geen vierkant om AXE. Nog niet: DAX-bots in deze lijst): zelfde look en werking -- reacties (emoji), reply, puntjes bij hover op een bubbel, Luka's bubbel in de kleur van de manager, zichtbaar als een andere manager of AXE iets stuurde ("Bericht van X"), geen vierkant om de AXE-avatar, knoppen recht uitgelijnd, statusregel ("Task running ...") helemaal leesbaar, DAX-knop netjes.
- [~] **DAX-bots = managers** (22 nov: de 5 DAX-bots -- NorthSea, Trading, Developer, ThinkTank, Browser -- staan als groep 'DAX bots · always on' in de Managers-tab met hetzelfde Grokbot-gesprek; de DAX-knop springt naar die groep; de managerlus op de VPS beantwoordt hun berichten ook met de app dicht, met eigen sleutels (nooit de chat-Groq), en meldt hun taken terug. In de preview gezien; test groen. Nog niet: hun status in de lijst ('Ready') komt nog niet uit hun DAX-werk): geen aparte agents meer; elke DAX-bot staat in de Managers-tab, always on, en kan hetzelfde als een manager (praten, laten zien, regelen) -- geen verschil tussen Claude, Grokbot en DAX-bots.
- [~] **Taken: weten of ik iets moet** (22 nov gebouwd, in de preview met echte data: elke mislukte, geannuleerde of afgewezen taak stond als 'Wacht op jou', ook Mac-stapjes (codex.run, git.branch) en al-opgeloste mislukkingen; en een geblokkeerde of op-ok-wachtende taak stond als 'Bezig'. Nu `takenRuis.ts`: Mac-stapjes en afgesloten taken weg, een mislukking die daarna lukte of opnieuw loopt weg, dubbel = alleen de nieuwste; alleen sleutel/login/tegoed/besluit telt als 'Wacht op jou' (ook de 'need attention'-teller); geblokkeerd = Wacht op jou; nieuwe kaart 'Gepland voor de AI' zegt dat je er niets mee hoeft en heeft één knop 'Start de rij'. Gevonden: 9 DAX-taken staan sinds 15:21 in de wachtrij ('Waiting for DAX capacity') -- nog uitzoeken): nu 38 gepland, 30 mislukt, steeds 1-10 "need attention" ook na retry. Per taak: van wie, wat er gebeurt, of Luka iets moet; oude mislukte die al opgelost zijn uit beeld.
- [~] **Restyle naar de referentiemap (23 nov)**: voorbeeld in een privé-canvas (Home, Accounts, Keys, alle tabs). Live op orchestrator: Home (4 kerncijfers boven de orb, workers + meldingen elk de helft boven de composer, feed-rijen), Settings › Accounts (kop met tellers, 'Needs a fix', 'Runs on Mac mini and iMac', lege CLI-mappen bij 'Not used' i.p.v. rood) en Keys per app (kerncijfers, tabs per app, tabel met verbruik + pil). Verbruik per sleutel: `sleutel_teller.py` + `core_key_usage`, live op de VPS en bewezen (eerste rijen 23 nov 16:08: Groq 3 werkt, Groq 2/4 en OpenRouter 3-5 op limiet, Cerebras 402). Ook live: Ledger (tellers over het hele venster), Meer-tab in groepen, Taken (kop met kerncijfers), Cron (Active/Paused/Last run failed/Next run + 'Needs a fix' met Run again). Nog: Managers, NorthSea, Trading (na Luka's ja), Code; tabs samenvoegen/weghalen (CrewAI pas na Luka's ja).
- [~] **Planner-job faalde 3x** (23 nov, gezien via de nieuwe Cron-kerncijfers): kilo weigerde headless elke schrijfstap ('auto-rejected permission'). Nu `--auto` voor Kilo/OpenCode bij schrijven (`b397b9ac`), lokaal echt getest, live op de VPS. 24 nov gemeten: de weigering is weg -- de run van 23:10 op de Mac mini liep helemaal door, maar telde als 'fail' door twee andere dingen: Claude Code (axe-core) liep langer dan 300 s, en de code-agent in trading-os faalde op typecheck omdat 5 npm-pakketten daar niet geïnstalleerd zijn (npm install vroeg om een ok). De run van 21:01 faalde op een volle schijf (zie hieronder). Gerepareerd 24 nov: (1) de axe-core-taak was 'Fix: sleutel dax-northsea-01' -- de bron was al op 21 nov klaar, maar een Fix-taak ging nooit dicht; nu sluit de Planner een Fix-taak zodra zijn bron niet meer kapot is (alleen als de storingen echt gelezen zijn); (2) een cron op 'skipped' (Review Desk wacht op Luka's autorisatie) gaf steeds een Fix-taak die geen agent kan oplossen -- 'skipped' is nu geen storing. Nog open: trading-os mist 5 npm-pakketten op de Mac mini (`npm install` wacht op een ok). Bewezen als een Planner-run 'ok' geeft. -- GEZIEN 24 nov 21:10: Planner-run 'ok'. trading-os typecheck slaagt nu op de Mac mini; de teruggezette taak 'Build next step: Trading OS' (Luka: 'zorg dat alles werkt') gaat mee in de volgende run.
- [~] **Agent-worktrees vulden de schijf** (24 nov): elke codex/claude/cursor-run kreeg een eigen worktree in `~/.axe/worktrees` en niemand ruimde op -- 327 stuks van 121 MB op de iMac (38 GB, schijf 0 vrij, Planner en builds faalden met 'No space left'). 275 runs leverden niets op. Nu `infra/computer-worker/worktreeOpruim.mjs`: een run zonder commits en zonder wijzigingen ruimt zijn worktree + lege branch meteen op; elk uur een veegronde (jonger dan 2 uur blijft, open werk blijft altijd, een branch met commits blijft -- alleen de map gaat na een dag weg). Getest met echte git (de test ving een fout die een branch met commits had gewist). Op de iMac met Luka's ok opgeruimd: 275 weg, 52 blijven, 33 GB vrij. Bewezen als de Mac mini na App bijwerken ook opruimt en de map niet meer groeit.
- [~] **Eindeloze lege agent-runs gestopt** (24 nov): op de iMac 436 `claude_code.run` in 2 uur, elk een worktree van 121 MB -- de schijf liep binnen 25 min weer vol. OORZAAK: de managers lieten hun denkstap door een Claude-stoel doen; die antwoordde 'You've hit your session limit', de lus las dat als tekst zonder actie en startte meteen een nieuwe run. Nu: een limiet/login-fout van een stoel is een fout (30 min afkoeling), en na 3 keer geen actie stopt de taak (`agent_loop.stoel_limiet_of_fout`, `MAX_ZONDER_ACTIE`). Live op de VPS 02:13; GEMETEN: daarna 0 nieuwe runs (was ~70/10 min). 8 achtergebleven runs geannuleerd. Daarna gezien: de lus viel op Cursor ('API key is invalid') en 3x-geen-actie liet 18 echte verzoeken falen i.p.v. wachten -- ook dat is nu een stoelfout (f4e9685f), de 18 staan weer in de wachtrij. Ook gevonden: `scripts/test_vps_sync.py` was sinds 23 nov rood (miste klaar_regels/sleutel_teller) en hield elke backend-update op de Macs tegen -- gerepareerd. Planner-taken in de VPS-rij (24 nov nog 1: 'Build next step: Trading OS', met klaar werk erin, faalde als 'No handler for planner'; wie hem op queued zette is niet terug te vinden -- geen approval, geen rij, geen db-functie): nu geeft de VPS-worker zo'n taak met zijn eigen lease terug aan de Planner (pending, poging terug, event task.returned) i.p.v. hem te laten falen (b608d671, live 24 nov 22:06, test groen; 1139 backend-tests groen). LIVE BEWEZEN 25 nov 10:50: eerste task.returned. 25 nov ook: Planner-runs 12:10 en 15:10 faalden op een vervolgtaak met alleen een afgekapte titel als doel ('Goed idee, en dit…'); de motor ging verkennen in ~/.config/axe -- nu gaat het echte doel mee plus 'alleen in de repo', en zonder echt doel geen vervolgtaak.
- [~] **Macs ruimen zichzelf op, ook als de build faalt** (24 nov): de Mac mini liep vol en zijn build faalde (01:36, 4 GB vrij) -- het opruimen zat in de nieuwe worker, die hij pas na een build krijgt. Nu draait de autosync elke ronde vóór de build `infra/computer-worker/ruim-worktrees.mjs` uit de verse checkout; open werk dat een dag stil ligt wordt op de eigen branch vastgelegd. iMac opnieuw opgeruimd: 182 weg, 23 GB vrij. Bewezen als de Mac mini weer bouwt.
- [~] **Sprint 4: DAX-bots met status uit hun echte werk** (24 nov): de DAX-bots stonden als 'Ready'/'Live' zonder bron. Nu levert `/agents/...`-overzicht per DAX-bot `werk` (`dax_werk.py`): open taken, wacht op jou (taken + open ok-vragen), mislukt en klaar in 24 u, laatste klaar, en Trading de intel-feeds (vers/fout, 5 min cache). De Managers-tab toont het woord (Needs you / Working / Failing / Asleep als zijn computer slaapt / Idle -- nooit een vast Ready) en de regel, bv. '1 open · 1 waiting on you · 4 deal actions done (24h)'. Tests groen. Bewezen als Luka de regels in de echte app ziet veranderen.
- [~] **Sprint 5: lessen relevant, met memory-refs en uitkomst** (24 nov): de manager kreeg de 3 NIEUWSTE lessen; nu de relevantste voor de opdracht (woordoverlap + hoe vaak de les hielp), max 5 (Luka 2, ervaring 3), met datum ('les van 10 nov'), en de regel om te zeggen 'Ik gebruik de les van <datum>: ...'. De taak bewaart welke lessen in zijn context stonden (`metadata.used_lessons`, de memory-ref); bij klaar/mislukt schrijft `taak_verslag.les_uitkomsten` per les good/bad, en een les die vaker schaadde dan hielp valt weg. Test drijft de hele keten. Bewezen als een manager in een echte taak naar een eerdere les verwijst.
- [~] **Sprint 1-3 nagelopen (24 nov)**: al gebouwd -- werkbon met scope/af-is-af/tests, oplevering met compleet-regel, vals klaar geweigerd, review-stap voor Luka, les na elke managertaak (sprint 1); live voortgang in het juiste gesprek, max 1 per 45 s en 6 tussenstappen, statusregel (sprint 2, `taak_voortgang.py`); klaar alleen met verify_command dat het werk bewijst, falen-toegeven = blocked, 2x mislukt = blokkade + één stap bij Luka met vrijgeven (sprint 3). LIVE BEWEZEN 24 nov (taak 70f76852): Luka's opdracht aan de AXE CORE Manager -> taak -> Claude Code op een Mac -> test toegevoegd + stub gerepareerd -> commit 821420c5 op axe/20261124-9lg844 -> taak klaar met bewijs, taakverslag en 'Klaar:' in het gesprek, 4 lessen 'good'; zelf nagelopen: 21 passed met echte pytest. Onderweg live gevonden en gerepareerd: codewerk werd 3 losse taken, 'Mac mini' viel weg, iMac alfabetisch eerst, sessielimiet ('resets 8:20am') niet herkend/teruggeschreven, stoelen leken verouderd door trage meting, volle/geweigerde stoel steeds opnieuw gekozen, reset in UTC gelezen, 1,5 u wachten terwijl er stoelen vrij waren, stoel-brein kon nooit 'klaar' zeggen, 'compleet' zonder dat tests draaiden, worker draaide oude code tot een herstart. Sprint 3 gebouwd en live (16eac594, dbf3e977): elke managertaak krijgt soort + criteria in het doel; feed-taken een echte meting vooraf (intel_sync_log), en bij 'klaar' meet de lus opnieuw -- niet ververst of nog een fout = geen klaar; verslag toont voor -> na. Live gezien: corporateJets-taak 45953e76 is één taak met meting vooraf (01:35, fout 429); Claude Code op de Mac mini schreef de reparatie (backoff bij 429), liep na 900 s af, werk nagelopen en live gezet (4bbd0da7) -> feed ververst 11:35 zonder fout. De taak zelf wacht op capaciteit (API's leeg: Gemini 402, OpenAI 0 tegoed; Groq op limiet); zijn 'klaar' met acceptatiemeting nog niet gezien. Wel live bewezen (bafd3cab): na uitstel gaat hij verder waar hij was ('Resuming at step 4 ... 3 earlier steps kept', 15:17 en 15:40) in plaats van 14x opnieuw bij stap 1. Feed blijft vers (15:35, geen fout); iMac 13 worktrees, 28 GB vrij. 24 nov avond GEMETEN: de feed faalde toch weer (19:35, 20:35: 4 staarten antwoordden, de 5e 429 -> hele ronde 'fout'); nu telt een afgekapte ronde met echte antwoorden als ververst met 'limiet' in info (c9ac41f6) -> 22:35 ververst zonder fout. De taak liep stap 4..11 alleen tekst: (1) de rem 'geen actie' begon na elk uitstel op 0 -- nu telt hij door (b08cc634, live gezien: gestopt na 11, eerlijk, want de acceptatie was op dat moment niet gehaald); (2) 'al opgelost, niets te wijzigen' kon nooit klaar zonder commit -- nu is een gehaalde meetbare acceptatie het bewijs (b08cc634); (3) de agent vond `uvx` niet (worker-PATH miste ~/.local/bin, d33b6a33); (4) de taaktekst ('limiet (429)') zette codex/claude/claude2/claude3 als rate limited op slot, zodat 423 uitstellen in 3 uur geen stoel probeerden (b1b01218, valse slotjes weggehaald). Opnieuw gestart als adf08f3a: liep 38 stappen zoekwerk tegen de 40 terwijl de meting al gehaald was, en een stoel die 'ik kon de logs niet lezen' schreef telde als falen ondanks de gehaalde meting -- nu beslist de meting (1602935a) en meet de lus zelf om de 5 stappen en voor het budget op is (c075fa29). LIVE BEWEZEN 24 nov 23:25 (taak a59ab95e): klaar na 5 stappen, result.acceptatie = 'feed corporateJets: voor 01:35 (fout 429) -> na 22:35 = gehaald'. Sprint 3 (acceptatie met meting voor en na) is daarmee live bewezen. Onderweg gerepareerd: codex-lus (216 runs, 219 worktrees) -> elke mislukte stoel koelt af, worker ruimt/bewaart werk bij fout of time-out, veegronde herkent upstream-gelijke basiscommits. de agent mocht pytest niet draaien (werkbon noemt nu het uvx-commando, nog niet live gezien).
- [~] **NorthSea-desk: koper, Brent en DXY echt** (24 nov): koper en DXY stonden altijd op 'No price feed' (stooq: CORS in de browser, nu ook een bot-controle) en Brent toonde 100,31 terwijl de future op 86,60 stond. Nu via de VPS `/market/daily` (Yahoo, server-side, 5 min cache, `markt_dag.py`); trading-feeds ongemoeid. In de preview GEMETEN: Copper 5.5985/lb +2.22%, Brent 86.48 -6.58%, DXY 104.23 +0.41%. Komt met de app-build.
- [~] **MT5-bridge-server (Strato 31.70.196.19) overal met verbonden/werkt** (24 nov, Luka gaf het adres): de API-VPS meet hem in `/status/vps-agents` (`mt5_bridge_status.py`, geen IP in het open antwoord) -> zijbalk-regel 'MT5 bridge' en de systeemlijst ('MT5 bridge server (Strato)'). Eerlijk in twee stappen: verbonden = de machine antwoordt (gemeten vanaf de iMac: poort 22 open, 293 ms); werkt = alleen groen als `MT5_BRIDGE_HEALTH_URL` gezet is en 2xx geeft -- nu oranje 'Connected · bridge not measured', want de bridge heeft geen health-adres naar buiten (alleen poort 22 open). Alleen lezen, niets aan MT5/trading. Nog nodig: het health-adres van de bridge (of Luka's ok om er via SSH naar te kijken).
- [~] **NorthSea Desk valt terug op de VPS** (24 nov, Luka: "northsea desk werkt niet"): de desk haalt /northsea/* van de Mac mini (Tailscale :8443) en toonde 'Cannot reach mac-mini...' zodra die zichzelf opnieuw bouwde. Gemeten: de VPS geeft dezelfde gegevens (zelfde velden). Nu: Mac mini onbereikbaar in stand 'auto' -> VPS, en `agentHostStand()` zegt 'vps' (niet stil); nooit voor /claude/*. Tests groen. Komt met de app-build.
- [~] **Werk van agents gaat nooit meer verloren** (24 nov, Luka: "niet iets voor niks gemaakt"): in `~/.axe/worktrees` lag op 4 plekken goed werk dat nooit gecommit werd. OORZAAK: de worker gaf Claude Code alleen `acceptEdits` -- bestanden aanpassen mocht, maar elk shell-commando (tests, `git commit`) werd headless geweigerd; Codex' sandbox kan de .git van een worktree niet schrijven. Nu op orchestrator gezet en getest: (1) eigenaarsactie 'Unusual Whales: nieuwe sleutel' met meting (intel_market_tide staat stil sinds 31 aug); (2) corporate jets op de kaart uit de eigen VPS-feed `/osint/air` i.p.v. de intel-proxy die 401 gaf; (3) projectsmgr zet taken die >6 uur zonder beweging op 'running' staan op failed (terug te zetten) i.p.v. elke pulse een onuitvoerbare 'Zelf oplossen'-taak. Gerepareerd: Claude Code mag nu precies tests draaien en committen (`--allowedTools`; push/merge/rm/vrije shell blijven dicht); en laat een agent toch iets open, dan legt de worker het vast op de EIGEN axe/-branch met 'bewaard:' -- de VPS telt dat als niet klaar (niet getest) en zegt waar het staat. Geen van de 441 oude axe/-branches had werk dat niet al op orchestrator stond. Nog niet echt gezien: Claude headless met de nieuwe rechten (alle Claude-stoelen op de iMac uitgelogd of aan hun limiet). Bewezen als een echte agent-run zelf test en commit.
- [x] **Mac mini bleef op een oude build** (23 nov, Luka): elke autosync-build sinds 22 nov faalde op een los `scripts/companion-stripe-env.sh` (sleutels, hoort niet in git) -- nu in .gitignore (`028ae98a`). De iMac faalde op een volle schijf (opgeruimd: npx-, uv- en simulatorcaches, ~8 GB). BEWEZEN 23 nov 22:48: Mac mini en iMac melden allebei build 46320992.
- [~] **Home-metrics** (23 nov: kerncijfers staan, zie hierboven): alles wat belangrijk is in één blik (naast agents en kaarten), goede metrics, niets dubbel, nutteloze dingen weg; daarna elke pagina een perfecte layout.
- [ ] **NorthSea Manager maakt echt deals**: 24/7 naar een deal toe werken (zie ook "NorthSea-dealbesluit echt laten landen").
- [ ] **Doorwerken**: de hele lijst constant afwerken tot AXE CORE deze week af is.

## Eerst — één doorlopend systeem (audit 19 nov 2026)

Luka liet een buitenstaander kijken; de conclusie klopt grotendeels: AXE heeft
geen extra AI nodig maar **bedrading en continuïteit**. Wat al kan, moet één
gesprek worden dat weet wat er speelt. Gecontroleerd tegen de code (19 nov):
`agenticEngine` heeft echt geen aanroeper; `toolRegistry.computer` is wél
aangesloten; `core_agents` heeft 19 rijen zonder dubbelen (wel een testrij
`poc34142-agent`); `langGraphOrchestrator` zit in spraak/routes, niet in de
leerlus. Volgorde = belang. Geen nieuwe app/agent/model tot dit staat.

- [x] **1. Eén managercontext** (live 19 nov 13:51; bewijs: `GET /managers/northseamgr/context` op de VPS gaf echte open taken, mislukte taken en eigen berichten van de NorthSea Manager: `backend/axe_api/manager_context.py`, in de agent-lus én de managerchat via `GET /managers/{agent}/context`; namen als northsea/northseamgr tellen als één) (`getManagerContext(app, manager)`): bij elk
      bericht compact mee -- app-status, open taken van die manager, laatste
      10 beslissingen, tools die hij mag, lessen, wat al geprobeerd is, wat
      hij zelf mag en wat goedkeuring vraagt. Nu verspreid over
      `_gedeeld_log_context`, `axe_overzicht` en `grok_managers`.
- [~] **2. Live voortgang in het managergesprek** (live 19 nov 13:51; bewezen met een echte taak bij de AXE Manager: "begonnen", "wacht op je ok" en "is gestopt" kwamen in zijn gesprek, de ok-vraag als nieuw. Nog niet gezien: tussenstappen en "klaar" bij een taak die afloopt, en de chat in de app die elke 5 s ververst (wacht op de app-build): `backend/axe_api/taak_voortgang.py` in de task-worker; een taak uit de managerchat draagt `metadata.chat_manager`, de VPS zet begin / stappen (max 1 per 45 s, max 6) / controleren / wacht op jou / klaar / mislukt als regel in dát gesprek, ook met de app dicht; chat ververst elke 5 s zolang zo'n taak loopt; één statustaal in `taak_voortgang.status()`): een taak draait op de
      achtergrond, Luka praat door, de manager meldt kort tussendoor
      ("bestanden gelezen", "tests draaien", "klaar, diff staat klaar").
      Statussen: planning / running / waiting_approval / verifying /
      completed / failed -- overal dezelfde (geen done naast completed).
- [~] **3. Coding-worker als interne medewerker** (22 nov erbij: de oplevering gaat nu mee in het taakresultaat; de lus weigert 'klaar' zolang de laatste oplevering niet compleet is (geen tests/branch, of iets niet gecommit) en zegt wat mist; een complete oplevering geeft één stap 'Review <branch>' voor Luka met wat/tests/risico's, de manager meldt wat/tests/risico's/branch in zijn gesprek, en de taak wordt een les. Test drijft de echte lus: half -> geweigerd, compleet -> klaar. Eerste echte opdracht (taak 9917ae23, 'voeg één test toe') vond twee echte fouten: (1) ELKE managertaak stond op alleen-lezen (kolomdefault 'read'), dus Claude Code op de Mac werd geweigerd -- nu 'execute', schrijven blijft achter Luka's ok; (2) de taak heette klaar met als samenvatting 'ik kan het niet' en als bewijs `ls -l` -- nu `klaar_regels.py`: falen toegeven = blocked, leeg bewijs telt niet, coding gevraagd zonder oplevering = niet klaar. Die taak is als test vastgelegd. Tweede echte opdracht (taak 96670ce0): Luka keurde claude_code.run goed; de keten liep (Mac mini, eigen worktree axe/20261122-fx3zsw) en eindigde EERLIJK als blocked -- Claude Code zat aan zijn weeklimiet (tot 22:00). Gevonden en gerepareerd: de echte motorfout kwam niet door (manager zei '429, bestand niet leesbaar') en '(no output)' telde als niet-gecommit; nu `motor_fout` in de oplevering en de lus stuurt naar codex/cursor. Derde poging (taak d69996de): na Luka's ok ging hij naar codex.run, maar ELKE Codex-run op de Mac faalde direct -- de worker gaf `--approve-for-me` mee en codex 0.142 kent die niet (gerepareerd in worker.mjs, komt met App bijwerken). Erger: een eerdere poging deed om 16:34 `git.create_branch` (safe_execute, zonder vragen) op Luka's echte AXE Core-checkout van de Mac mini; om 17:10 stond die weer op orchestrator. Nu hard geweigerd op de VPS (`verzet_checkout`): branch maken/wisselen/resetten alleen in ~/.axe/worktrees, en de lus vraagt daar geen ok meer voor. Taak geannuleerd. Vierde poging (taak 4ee2cfb7, na App bijwerken, Luka keurde codex.run goed): Codex draaide nu ECHT (de flag-fix werkte), maar werd na 5 min afgekapt (`timed out after 300s`); de tweede run bleef sinds 18:15 hangen (waarschijnlijk werd de worker midden in de run herstart) en de taak verloor zijn lease -- geannuleerd. Gerepareerd: coding-agents 15 min op de Mac (AXE_AGENT_TIMEOUT_MS), VPS wacht 16 min. Komt met App bijwerken; dan opnieuw. Vijfde poging (taak b153843e, Luka keurde codex.run goed): Codex liep weer vast, nu na 900 s. OORZAAK gemeten op deze Mac: de worker liet stdin open en `codex exec` wacht daar op tot de time-out (open: 45 s TIMEOUT, dicht: klaar in 12 s). Gerepareerd: runStatus sluit stdin meteen. Taak geannuleerd; komt met App bijwerken. Zesde poging (taak 1a8e9193, Mac mini werkte zichzelf bij via autosync): Codex antwoordde nu binnen seconden (stdin-fix werkt), maar weigerde: het model uit Luka's Codex-config (`gpt-6-astra`) vraagt een nieuwere Codex; met een ChatGPT-account mag 0.142 ook gpt-5.4 niet. Codex is 0.142, nieuwste 0.171 -> Codex bijwerken op de Macs (Luka's ok). Taak eindigde eerlijk als blocked. Daarna (Luka: "Ja doe maar"): Codex op deze Mac bijgewerkt naar 0.171 -- ook die weigert gpt-5.4/gpt-5.5/gpt-6-astra met een ChatGPT-account, maar `codex debug models` noemt gpt-6-luna en gpt-5.6-terra, en die antwoorden. Nu: de worker probeert bij een geweigerd model zelf de modellen uit Codex' catalogus (Luka's config blijft ongemoeid), en App bijwerken doet `codex update`. Zevende poging werd niet gestart: de vingerafdruk-regel blokkeerde (2x mislukt) en zette één stap 'loopt vast' bij Luka -- eerste live bewijs van de rem. Gat gevonden: Luka kon een geblokkeerd probleem niet vrijgeven. Nu: die stap op Done = mislukkingen van daarvoor tellen niet meer. Ook gerepareerd: een oplevering met alleen werkbon-voorbeeldtekst en geen commit heette 'compleet'; nu niet meer, en Codex' API-fout komt als motor_fout door. Ook gevonden: core_agent_events is een VIEW, inserts faalden altijd (ook staande_diensten._event); de tellers van de managerlus staan nu in core_manager_messages. Eerder: gebouwd 19 nov, nog niet live en nog niet met een echte opdracht gezien: elke `claude_code/codex/cursor.run` krijgt een vaste werkbon -- scope, "af is af", kopjes Samenvatting/Tests/Risico's -- in `device_actions.werkbon`; de Mac zet branch, commits, niet-gecommit en `git diff --stat` eronder; `device_actions.oplevering` maakt er één oplevering van met `compleet`; de manager meldt die aan Luka en noemt niets af zonder tests): manager geeft Claude Code /
      Codex een opdracht met scope en "af is af"; terug komen diff, tests,
      risico's; AXE vat samen; Luka keurt goed of vraagt aanpassing. (18 nov:
      `claude_code.run` zonder prompt faalde elk uur -- die poort staat nu.)
- [x] **4. Geheugen terugschrijven na elke taak** (BEWEZEN 20 nov 01:03: twee echte taakverslagen in het log (browser, developer), en `GET /managers/developer/context` toont "Je laatste taakverslagen" met bronnen taakverslagen: 1. 20 nov, ECHTE OORZAAK gevonden: het gedeelde log, de taakverslagen en de lessen hadden NUL rijen, omdat `gedeeld_log` schreef met kind 'log'/'les' en de database alleen directive/report/ask toestaat -- elke insert werd stil geweigerd. Gerepareerd (`log_rij` -> report, `les_rij` -> directive) met test; live 20 nov 01:02: de eerste rij ooit staat in het log, en de eerste les ook. Nog te zien: het eerste echte taakverslag. Eerder: live 19 nov 18:23, reparatie 18:46 -- ook een taak die de database zelf op mislukt zet (worker weg, 20 van 44 mislukte taken) krijgt nu een verslag. Nog niet bewezen: er is nog geen echt verslag in het log, want de taken hangen op trage modellen (Groq-limiet, Ollama 5 min per stap): `backend/axe_api/taak_verslag.py` schrijft na elke taak -- gelukt én mislukt -- een verslag gedaan/werkte/faalde/besluit/volgende in het gedeelde log, onder de manager van het gesprek; de managercontext leest zijn laatste 4 verslagen terug; onder elk managerantwoord staat "— op basis van: 2 open taken · 1 taakverslag · 4 lessen"): wat gedaan, wat werkte, wat
      faalde, welk besluit, volgende stap. (Deels: gedeeld log + lessen, 18 nov.)
      Zichtbaar maken welke herinneringen een antwoord stuurden.
- [~] **5. Eén agent-register** (live 19 nov 19:27; bewezen op de VPS: de sync gaf 20 agents, 18 oude rijen op retired, testrij weg, 9 capabilities omgezet; `GET /agents/register` geeft 20 rijen met bron core_agents en drift []. Nog niet gezien: de Agents-tab met dit register, die komt met de volgende app-build. Wat er gebouwd is: `backend/axe_api/agent_register.py` vult `core_agents` bij elke API-start uit precies wat de lus draait -- de 20 werkplekken met rol, tools, model (agent_tiers.json), geheugen-namespace en status; de 18 oude rijen uit juli/aug (claude-3.5-sonnet, lege toolsets) gaan op `retired` met `vervangen_door`, de testrij `poc34142-agent` gaat weg, capabilities die naar een oude naam wezen gaan naar de echte agent; `GET /agents/register` geeft de rijen plus `drift`; de Agents-tab leest alleen actieve rijen en bewaart geen lokale "bewerkingen" meer die niets deden; app en lus geven NorthSea nu allebei `northsea_read`, een test houdt de tools gelijk): `core_agents` is de enige bron; Agents-tab
      toont exact dat; testrij weg; per agent rol, tools, model,
      geheugen-namespace, status.
- [x] **6. Eén tool-register dat echt werkt** (live 19 nov 19:42; bewijs op de VPS: `GET /tools/register?agent=northseamgr` gaf zijn 6 tools met rechten en gaten [], en de draaiende code weigerde `write_file` voor de NorthSea Manager -- niets geschreven, antwoord "not one of your tools". Wat er gebouwd is: `backend/axe_api/tool_register.py` geeft per tool wat hij doet, input, output, rechten, bekende fouten en wie hem mag -- input en "wie" afgeleid uit de lus en de werkplekken, dus kan niet afdrijven; `GET /tools/register?agent=X`; een test eist voor alle 20 agents dat lus == tool-register == core_agents. Gat gedicht: een tool buiten de werkplek werd tot nu toe gewoon uitgevoerd als het model hem toch aanriep -- nu weigert de lus hem en zegt welke tools de agent wel heeft): test "welke tools heeft agent
      X" == register; per tool input/output/rechten/fouten/wie mag hem.
- [x] **7. Leerlus voor alle agents** (BEWEZEN 20 nov 01:03: VPS-taken sluiten episodes onder hun eigen agent -- browser poor, code-editor poor -- en cron schrijft geen geslaagde runs meer. live 19 nov 20:01; bewezen: sinds de herstart schrijft cron geen geslaagde runs meer als episode (0 in de eerste minuten, was ~70 per uur). Nog niet gezien: de eerste episode van een echte VPS-taak onder zijn eigen agent. Gemeten vooraf: in 30 dagen nul episodes versterkt, bijna geen episode met herinneringen eraan, géén episode voor managers/developer/browser, en cron schreef ~50.000 lege episodes per maand. Nu: elke VPS-taak sluit een episode onder zijn eigen agent (good = klaar én bewezen, poor = mislukt of niet compleet) via `taak_verslag.schrijf`, dus ook als de database de taak op mislukt zette; cron schrijft alleen nog mislukte runs; `agenticEngine` + `agenticEditBridge` (dode code) weg; een test houdt chat (langGraph) en browser-agent in dezelfde beurten-lus en de lus-namen gelijk tussen app en VPS): `agenticEngine` aansluiten of weg,
      `langGraphOrchestrator` in dezelfde lus als `browserAgentLoop`.
  - [~] **Versterken voor de managers**: de VPS-lus haalt nog geen herinneringen op
        die je kunt versterken (0 lessen in het gedeelde log; manager-context is
        taken/verslagen), dus hun episodes hebben nog geen memory-refs. Eerst
        bepalen welke herinneringen een manager echt gebruikt.
    *(22 nov: gebouwd -- elke afgeronde managertaak wordt een les in `ervaring` (Werkte/Mislukt + waarom + toepassen op), dubbel = één keer; de managercontext leest Luka's 3 nieuwste lessen en 3 eigen ervaringen terug, en de bron telt mee als "lessen". Memory-refs op de episodes nog niet.)*
  - [~] **Manager-lus betrouwbaar** (audit 22 nov): nooit dubbel, nooit eindeloos herhalen,
        nooit half-geldige modeluitvoer als actie, één ronde tegelijk, zichtbaar.
    *(22 nov: gebouwd -- `manager_betrouwbaar.py`: idem-sleutel per opdracht + vingerafdruk per probleem; zelfde probleem open = geen nieuwe taak, 2x mislukt = geblokkeerd en één stap voor Luka (Your turn), net opgelost = 24 u afkoelen. Strikte JSON met één herstelpoging, anders geen taak. Eén ronde tegelijk per worker (over de 2 workers heen: de lease op de cron-rij). GET /managers/gezondheid met per manager taken, succes, dubbel tegengehouden, ongeldige uitvoer, alarmen -- tellers als events in de database (agent managerwerk), laatste ronde uit core_schedules, zodat beide workers hetzelfde zeggen. 11 scenario-tests + 1013 backend-tests groen. Nog niet: verificatie vóór "klaar" met meting voor/na, en een lock over processen heen (nu de lease op de cron-rij).)*
- [~] **8. De ervaring** (gebouwd 19 nov, komt met de volgende app-build; nog niet gezien: één statusregel bovenin elk managervenster -- Waiting on you / Listening / Task running / Thinking / Ready, volgorde = belang (`managerStaat.ts`); spraak via de microfoon in een managervenster gaat naar díe manager, niet meer naar het AXE-hoofdgesprek; een taak uit een managergesprek meldt "klaar" alleen nog in dat gesprek (was: twee keer in de draad + hardop in het hoofdgesprek); tussenstappen die de server al gelezen zette geven geen badge meer; "Done: X" komt er één keer in, niet per open apparaat): per manager één venster; altijd zichtbaar "luistert /
      bezig / taak draait / wacht op jou"; spraak, tekst en taakstatus in één
      stroom; geen popups voor gewone voortgang; meldingen kort, geen spam.
  - [~] **De notch-chat aan de managerdraad** (gebouwd 20 nov, komt met de app-build: de notch toont het echte gesprek van de gekozen manager; een bericht gaat erin, de manager antwoordt zelf of het wordt een taak met `chat`; los gpt-4o-mini weg): de notch praatte met een los
        model (gpt-4o-mini), niet met de echte manager en zijn draad.
  - [~] **Managervenster op Home (AgentVensters) zelfde route als de desk** (gebouwd 20 nov: één gedeelde `startManagerJob` in `presentation/store/managerJob.ts`, met `chat`; het Home-venster houdt de draad bij zolang het open is; komt met de app-build):
        start taken zonder `chat`, dus zonder voortgang in de draad.
  - [~] **Alleen belangrijke meldingen trillen** (Luka 19 nov: "alleen
        belangrijk"; gebouwd, komt met de app-build): "Done" van een gewone
        taak geeft geen systeemmelding meer, op de telefoon én de Mac. Wel:
        goedkeuring nodig, taak mislukt, NorthSea needs-your-OK. De rest
        staat in de bel en in het managergesprek.
- [x] **CLI-abonnementen als uitvoerders, niet als brein** (gemeten 20 nov, 7 dagen core_tasks: het denkwerk van de eigen lus deden groq 56, ollama 44, openai 29 -- nul keer een abonnement; Claude Code/Codex liepen alleen als uitvoerder via claude_code.run op de Mac mini, 23 computer-use-taken): AXE's eigen lus is
      de baas; Claude/Codex/Cursor/OpenHands zijn workers of terugval.
- [x] **Supabase (AXE) weer gezond** (19 nov, gemeten): na Luka's herstart
      inloggen 0,18 s en een query 0,10 s vanaf de VPS (was 15-40 s / time-out);
      Luka logde weer in op de PWA en gooide een foto via Portal. Oorzaken weg:
      een vergeten preview-tabblad (185 lease-calls/min), opgestapelde timers
      bij elke token-refresh (opstartroutine nu één keer per venster), en het
      managers-overzicht (20 queries per poll -> 1; events-queries 120 -> 5-10
      per minuut). Bewakingsjobs naar elke 10 en 15 min.
- [~] **Lease-stapeling op de Macs**: fix op orchestrator (`0d6cfdce`), de Macs
      krijgen hem via autosync; nog niet gemeten dat de lease-calls daar dalen.
- [x] **HTTP-cronjobs uit Postgres naar de VPS** -- niet meer nodig (gemeten
      20 nov, pg_stat_statements sinds de herstart): `dispatch_cron` 1.004 keer,
      gemiddeld 21 ms; `uptime_check` 38 ms. Beide via pg_net (asynchroon). De
      25-32 s was tijdens de storing. Verhuizen zou ook de Companion-tradingjobs
      raken (paper-stops, trailing-stops): niet zonder Luka.
- [x] **`chart_live_snapshots` alleen gewijzigde symbolen** -- niet nodig (gemeten
      20 nov): 22.688 upserts van gemiddeld 1,1 ms = 25 s databasetijd sinds de
      herstart. De schrijver (`snapshotBuffer.ts`) zit in de Trading OS-app,
      niet in deze repo. Opnieuw kijken als de database weer zwaar wordt.
- [x] **Trage leesqueries** (live 20 nov; bewijs: EXPLAIN ANALYZE na de indexen --
      rag_memories per gebruiker/app via `rag_memories_user_app_tijd`, 6 blokken
      en 1,3 ms i.p.v. 7.028 blokken; global_memory op tijd via
      `global_memory_tijd`, 0,2 ms): `rag_memories` (1-2 s) en `global_memory` (0,2 s)
      per aanroep. Oorzaak gemeten 20 nov: volledige tabelscan (55 MB), geen
      index op gebruiker/app/tijd, en de statistieken waren leeg sinds de
      herstart (ANALYZE gedaan). Indexen staan klaar in
      `supabase/migrations/20261120090000_geheugen_indexen.sql`, toegepast
      met Luka's ok.
---

## Besproken 9-19 nov -- alles wat Luka vroeg, op één plek

Uit het gesprek van 9 t/m 19 nov teruggelezen, zodat niets alleen in een chat
blijft staan. Wat al ergens anders op de lijst stond, staat hier niet dubbel.

**Praten en luisteren**
- [~] **Eén stem in de kamer** (9 nov, `/voice/claim`, ADR-01): Mac mini, iMac
      en Samsung horen tegelijk; AXE kiest er één en de rest zwijgt. Nog nooit
      met alle drie tegelijk in de kamer getest.
- [~] **Alle functies op één lijst, met hands-free** (20 nov: `FUNCTIES.md`, ~90 functies per gebied met werkt / stem / typen / klik en een voorbeeldzin. Meteen gerepareerd: getypt "open trading" opent nu de tab (was een taak), en de stem kan tabs, de Home-weergave en de notch openen (`open_tab`). Nog open, zie de gaten onderaan FUNCTIES.md.)
  - [~] **Getypt een afspraak toevoegen** (20 nov: `afspraakUitZin` + tier 1 `calendar_add`; in de preview opgeslagen op vrijdag 19:30. Bewezen zodra Luka het in de echte app doet.)
  - [~] **AXE leest de hele Mac** (Luka 20 nov): `files.list/read/search` ook buiten de werkmap -- thuismap, /Applications, /Volumes. Nooit: verborgen mappen, sleutelhanger, cookies, browserprofielen, wachtwoordmanagers, vault, .env/*.key (`leesRegels.mjs`, getest). Schrijven/verwijderen blijft in de werkmap met een ok. Bewezen zodra AXE op de Mac mini `/Applications` laat zien.
  - [~] **Claude-account 1 'not connected' terwijl hij ingelogd was** (20 nov): de controle zette zelf CLAUDE_CONFIG_DIR=~/.claude; gerepareerd `7afae4dc`, op de iMac gemeten true.
  - [~] **Login-knoppen voor elk account** (20 nov: Claude login 2/3/4, Codex login 2/3, Cursor 2 onder de terminal; `scripts/prive-login.sh` opent de inlogpagina in een Chrome-privévenster, want de gewone browser keurde meteen account 1 goed. Bewezen als Luka account 2 inlogt en de kaart een ander e-mailadres toont.)
  - [~] **AXE mag Ollama op Strato herstarten** (Luka 20 nov): eigen sleutel `axe-ollama-knop` op de VPS (alleen `status` en `restart`), `/ollama-knop/status|restart` in de API. Wacht op Luka: `infra/dax/ollama-knop-recht.sh` één keer als root op Strato draaien. Gemeten 20 nov: Ollama bereikbaar maar elk antwoord >170 s (rij vol door DAX-bots op CPU). Volgende: bots naar Groq als de Ollama-rij vol is.
  - [~] **DAX-bots inloggen vanuit AXE** (20 nov): Strato-terminal heeft eigen knoppen (Ollama, containers, DAX-logins, per bot Claude/Codex inloggen); kreeg eerst de knoppen van de API-VPS. Bewezen als Keys per app de bots op Works zet.
  - [~] **Ruis wordt gesprek** (20 nov: far_field-ruisonderdrukking, taalhint NL/EN voor de transcriptie, drempel 0,6, en `isRuis`: een los bromgeluid of vreemd los woord komt niet in de chat en AXE breekt zijn antwoord erop af. Bewezen als Luka een dag praat zonder rommel in de chat.)
  - [~] **Telefoon: het invoerveld neemt op elke tab meer dan de halve hoogte** (20 nov, 375 px); op Taken zie je daardoor maar een paar regels. Gerepareerd: statuspillen en tip-knoppen elk op één schuifregel, orb klein -- de tab krijgt 400 i.p.v. 324 px (preview 375x812, Taken leesbaar). Bewezen op Luka's telefoon na de volgende build. Nog open: op Home lopen de managerlijst, het gesprek en de kaarten door elkaar heen.
      alles wat ooit in AXE
      gebouwd of bedacht is (computer use, eigen browser, "hey axe show me the
      map of New York", ...), per functie: werkt het echt, en kan Luka het met
      alleen zijn stem gebruiken.
- [~] **AXE-chat antwoordt weer** (19 nov 23:30 Luka: "AXE Core is temporarily
      unavailable"). Gemeten: snelle vragen gingen naar een Groq-model dat niet
      meer bestaat (gerepareerd, `bae63792`); Groq zelf zat vanavond 7x aan zijn
      limiet omdat de VPS-agents dezelfde Groq-organisatie gebruiken; reserves
      leeg: Gemini (geen tegoed), OpenRouter (geen tegoed), Ollama (401). Alleen
      OpenAI werkt, maar stond niet in de reserve-rij (de chat probeerde er
      maximaal 3). Luka koos "OpenAI als reserve" (zijn Groq is gratis): OpenAI
      komt nu altijd als laatste achter de drie (`CHAT_RESERVE`). In de preview
      bewezen: Groq en OpenRouter faalden, OpenAI antwoordde. Nog niet gezien
      in de echte app (volgende build).
- [~] **Eigen gratis Groq voor de agents** (Luka 20 nov): de VPS-agents gebruiken
      `GROQ_AGENTS_API_KEY` als die er is, anders de gedeelde `GROQ_API_KEY`.
      Groq-limieten gelden per organisatie, dus het moet een sleutel van een
      tweede (gratis) Groq-account zijn. Luka maakt dat account; dan zet ik de
      sleutel op de VPS.
- [ ] **Praten zoals Rabbit OS3**: meerdere dingen zeggen, AXE blijft bij het
      gesprek en zet op de achtergrond taken uit over de managers. (Leunt op
      Eerst 2 en 8.)

**De Macs**
- [x] **Tweede scherm Mac mini: AXE pakt de focus niet meer** (BEWEZEN 20 nov 17:36: na de reparatie van de LaunchAgent 15 min focus.log gemeten -- 0 focusmomenten, daarvoor elke ~10 s) (18 nov
      `109779a8` notch, `d7453322` wekwoord volgt echte vensterfocus).
      19 nov 23:40 Luka: "op de mac mini pakt axe core nog steeds de focus" --
      dus niet opgelost. Eerst meten wélk venster/proces de focus pakt.
      20 nov, focus.log van de Mac mini gelezen (nieuwe worker-actie): reeksen
      van "focus axe-float-axe" (notch) en "focus main" elke ~10,3 s, minuten
      lang (laatst 19 nov 23:33). Op de iMac niet. Oorzaak nog niet zeker; de
      app logt nu bij elk focusmoment ook het event van macOS (muis/toets/
      systeem/app) en welke app vooraan stond -- daarmee is de bron te zien
      zodra de Mac mini de nieuwe build heeft.
      20 nov, vangnet (Luka: "getting pretty annoying"): krijgt een AXE-venster
      de focus zonder klik/toets/Cmd-Tab/Dock van Luka, dan geeft AXE hem meteen
      terug aan de vorige app ([NSApp deactivate]) en schrijft "teruggegeven"
      in focus.log. Uit: `touch ~/.axe/focus-vangnet-uit`.
      20 nov middag, log Mac mini na de build: de notch pakt niets meer, maar het
      HOOFDvenster kreeg elke ~10 s de focus en het vangnet liet een deel staan:
      een klik in een ándere app (tweede scherm) telde als "Luka wil AXE", en
      Shift loslaten tijdens typen telde als Cmd-Tab. Nu: een klik telt alleen
      op een AXE-venster, het Dock of de menubalk; Cmd-Tab binnen 0,3 s. Het
      log schrijft ook `aanroep=` als AXE-code het venster naar voren haalt, zodat
      de bron van de 10 s zichtbaar wordt.
      20 nov 17u, de BRON gevonden: op de Mac mini een met de hand gezette
      LaunchAgent `com.axe.core` met KeepAlive=true rond `open -a "AXE CORE.app"`
      -- `open` stopt meteen, launchd start hem na 10 s opnieuw, en elke
      `open -a` activeert AXE. De autosync zet nu KeepAlive uit en maakt er
      `open -g` van (op elke Mac waar hij staat). Bewezen als focus.log stil blijft.
      20 nov: alle bekende focus-pakkers in de code zijn al afgevangen (notch
      niet-focusable, herstart na build op de achtergrond + focus terug). De
      app logt elk focusmoment in ~/.axe/focus.log, maar dat stond buiten wat
      de worker mag lezen. Nu: worker-actie `axe.focus_log` (alleen lezen) om
      dat log + de app vooraan vanaf de VPS te lezen. Volgende: lezen, oorzaak.
- [~] **Notch helemaal tegen de bovenkant van het scherm.** (20 nov: het venster stond al op y=0 -- notch.log 243x `venster_top = scherm_top` op de iMac -- maar las als grijs hangend paneel. Nu: bovenrand massief zwart dat in het glas overloopt, en holle schoudertjes links/rechts zoals een MacBook-notch. Komt met de app-build. Mac mini: `axe.focus_log` stuurt nu ook notch.log mee om daar te meten.)
- [~] **Geen nieuwe witte AXE CORE naast de oude op de Mac mini** na een build. (24 nov gemeten: LaunchServices kende op de Mac mini 10+ apps met bundle-id com.axe.core -- verdwenen dmg-volumes, release-bundels van oude worktrees, 'AXE CORE PR304', een back-up; de verse bundle in de build-map telt tijdens de build ook mee. Iets dat AXE op bundle-id opent pakt dan een kopie naast de echte; na `rm -rf` van die bundle is hij wit. Nu: `axe-bijwerken.sh` meldt na de build en na de installatie elke andere com.axe.core af bij LaunchServices (`lsregister -u`, geen bestanden weg). Parser droog getest op de iMac. Nog te zien: de eerstvolgende build op de Mac mini.)
- [~] **Beide Macs traag** (18 nov): oorzaak meten en weghalen. 20 nov gemeten
      op de iMac (8 GB, 8 kernen): AXE's eigen webview ~57% CPU continu (WebKit
      GPU 31% + WebContent 26%) plus WindowServer 34%, omdat de bol en de
      sterrenachtergrond pauzeerden op `document.hasFocus()`, en die blijft in
      WKWebView true als je in een andere app zit. Nu: `echteFocus.ts` (macOS-
      vensterfocus via Tauri) voor bol en achtergrond; komt met de app-build.
      Ook: schijf maar 8,8 GB vrij (~/axe-wt-android 17,9 GB, ~/.cache/uv 9,8 GB,
      fincept 6,6 GB) -- opruimen is Luka's keuze. Bewezen als de CPU in rust
      laag blijft na de build.
- [~] **AXE Overlay in de ene notch bovenaan** (9 nov, `580ac272`).
- [~] **Driehoek-avatars met eigen kleur, ook in de notch** (19 nov,
      `370d0bd0`); de staten (rust / werkt / wacht) nog niet in het echt gezien.
- [~] **Notch luxer en levendiger** (ronde 1, 20 nov, naar Luka's voorbeelden): Home in de notch is nu een eiland met kaarten -- links AXE groot met gloed in de kleur van zijn toestand en zijn stappen (vorige / nu / volgende), rechts Claude en de managers als gekleurde pillen, daaronder de dag; geen verbinding = één foutkaart met opnieuw-knop; de gezichten knipperen en kijken rond als ze werken. In de preview gezien; komt met de app-build. Ronde 2 bestanden, ronde 3 widgets.

**Portal (foto/bestand/klembord naar de Mac)**
- [x] **Van de iPhone naar de Mac** (19 nov: Luka veegde een foto naar de Mac
      mini via de PWA en hij landde).
- [~] **Vanaf de Samsung** (20 nov: Portal staat sinds de telefoon-update van 00:51 in het menu onder Phone; de hoofd-WebView kon geen bestanden kiezen -- `onShowFileChooser` toegevoegd, axe-core-android `485b19b`. Bewezen als Luka vanaf de Samsung iets naar de Mac gooit.) (19 nov Luka: "de device manager heeft ook niet die
      portal"): Portal in de Device Manager zetten; klembord in de WebView testen.

**Device Manager (Samsung)**
- [~] **Home weer schermvullend** (gebouwd 20 nov, axe-core-android `88dc74c`: de Wacht-op-jou-overlay van 15 nov schoof de Home-plaat omlaag met status-/navigatiebalkmarges; weg, de web-Home toont Wacht op jou zelf. Komt met de volgende telefoon-update via de Mac mini.) (19 nov Luka): de schil op Home is kleiner en
      er zit een zwart randje boven (tijd/batterij) en onder; eerst viel dat
      over de achtergrond en was Home het hele scherm. Terug zoals het was,
      tot de Device Manager echt beter wordt.
- [ ] **De Device Manager echt veel beter** (Luka: "uiteindelijk sowieso"). Eerst
      samen bepalen wat dat is.
- [~] **Telefoon-update vanzelf** (19 nov): ophalen via SSH, bouwkopie altijd op
      main, npm gevonden (`android_bijwerken.py`). Alleen de Mac mini heeft de
      sleutel van de telefoon-app; bewezen als daar "updated" komt.
- [~] **Portal-tegel op het Systeem-scherm** (19 nov, `381254ea`); wacht op een
      nieuwe PWA-build.

**Managers en NorthSea**
- [ ] **NorthSea Manager runt het bedrijf**: beslist zelf de volgende beste stap
      per deal (samen met AXE), geen 90 goedkeuringen; deals komen echt
      dichter bij sluiten; de desk is overzichtelijk. Professioneel: er tekenen
      al bedrijven terug.
- [~] **Geen overlopende emmer bij NorthSea** (20 nov 01:27: vervolgmails onder de regel live (`68997438`), stapel 37 -> 20. Bewezen als hij morgen niet weer groeit. Eerder, 20 nov GEMETEN: NIET opgelost -- 21 -> 37. Oorzaak: 18 vervolgmail-concepten met hetzelfde sjabloon ("Following up on our previous message") voor kopers van 20 dagen terug, in batches van de NorthSea-engine (16:30, 16:45, 22:15); de fix van 19 nov dekte alleen eerste mails. Per nieuwe deal twee keer "Yes needed" (action_queue + deal_tasks): opgelost 20 nov (`070b66bd`, live NorthSea 1.5.14; 2 dubbele opgeruimd). Echte oplossing = vervolgmails onder de vaste regel vanzelf laten gaan -> wacht op Luka's ja.) (live 19 nov, `6f5df5c6`): een eerste
      mail boven de daglimiet (5/dag) wacht nu op ruimte in plaats van een
      concept + twee keer "Yes needed" bij Luka. Stapel opgeruimd van 48 naar
      ~21 (1 concept, 10 Yes needed waarvan 7 dezelfde Pitsonel-vraag, 3
      deal-beslissingen, 7 oude inbound-reviews). Bewezen als de stapel een
      dag lang niet meer groeit.
- [~] **Eén vraag per beslissing** (live 19 nov): dezelfde vraag over dezelfde
      leverancier voor een andere koper komt bij de open vraag te staan
      (`crew_loop._bundel_bij_open_vraag`). De 8 Pitsonel-vragen zijn er nu één
      met 8 kopers; "Yes needed" van 30 naar 3. Bewezen als een nieuwe koper
      bij een open vraag landt in plaats van een nieuwe te maken.
- [~] **Belangrijke mail = meteen een melding** aan Luka, in het gesprek (gebouwd 20 nov: melding + ok-vraag bestonden al; nu staat de mail ook als nieuw bericht in het gesprek van de NorthSea Manager, `northsea_mailwachter.in_gesprek`. Bewezen bij de eerste echte belangrijke mail).
- [ ] **Mailroute support@** naar Resend (eigenaarsstap Luka; trade@ is klaar).
- [~] **Een uitgelogde stoel geeft het werk door, met melding wie het overnam**
      (9 nov, `93dcdc3b`, `ca9feb3b`).
- [~] **Settings klopt: per agent zien en kiezen wat hij gebruikt, online, usage**
      (Luka 20 nov: "geen dubbele agents of dingen die niet kloppen ... ik moest het
      100 keer vragen"). Gedaan: (1) core_coding_seats had 9 machinenamen voor 2
      Macs; spooknamen tellen niet meer mee (`stoelen_actueel.py`, server + router)
      -- van 80 naar 25 rijen; (2) eigen sectie **Agents** bovenaan, abonnementen
      en agents stonden dubbel in Accounts én Providers; (3) keuzelijsten: geen
      dubbel account, geen niet-ingelogde stoel, geen provider die bij de test
      faalt (huidige keuze blijft zichtbaar); (4) dev-proxy brak de Groq-test.
      Bewezen in de preview. Open: Cursor/Claude op de iMac geeft "onbekend"
      (hartslag leest het niet); usage per abonnement is nog leeg (used_week).
- [~] **Keys per app in AXE, met de manager die meldt** (9 nov, `948420eb`,
      `139f070a`). 20 nov: Settings-sleutels (Exa, ElevenLabs) en de Vercel-env van
      Companion en Trading OS zijn nu zichtbaar (alleen namen, via VERCEL_TOKEN);
      live: Companion 15 → 6 "unseen", Trading OS 10 → 3. Daarna (Luka: "raar dat AXE de
      terminals van de VPS'en heeft maar de secrets niet ziet") ook de Supabase
      edge-geheimen: edge-functie `sleutel-namen` in beide projecten, alleen namen.
      Live: Companion, Trading OS en NorthSea 0 "unseen". Gevonden: twee kapotte
      namen in Companion-edge (`MARKETSTACK _API_KEY` met spatie, en een geheim
      waarvan de naam een e-mailadres is) -- Luka moet die in Supabase hernoemen of
      weghalen. Over: de 5 DAX-logins (Luka) en de 2 Cursor-sleutels op de Mac.
- [~] **Minder dure abonnementen** (gemeten 20 nov: op de iMac deden de stoelen in 30 dagen 0 minuten echt werk -- alle 992 aanroepen waren loginchecks van 0,02 s; het echte coderen loopt via de Mac mini (23 taken/week). Opzeggen is Luka's keuze; hij gebruikt Claude Code zelf ook.): managers en DAX blijven alles kunnen met
      minder Claude/ChatGPT/Cursor-stoelen (eigen lus + goedkope API's/Ollama
      als basis, stoelen als terugval).
- [~] **Agenda: de week is leesbaar** (9 nov, `59ad161d`).

---

## Nu — AXE als co-founder (Luka, 17 nov 2026)

Luka: "het moet juist zo zijn dat axe core me assistent is en zelfs co-founder
en me uit zichzelf helpt met alles en dingen echt makkelijker maakt."

- [x] **AXE Core praat zelf.** De bovenste chat in de Managers-tab (agent
      `axe`) was leeg: hij stuurde alles door en zei nooit iets. Nu antwoordt
      hij zelf (abonnement), stuurt alleen door als het duidelijk over één app
      gaat, en schrijft elke 3 uur een overzicht: wat er wacht, waar, en wat de
      managers zelf deden (`backend/axe_api/axe_overzicht.py`).
- [x] **Geen 53x dezelfde managervraag**; betaling/login blijft bij Luka.
- [~] **NorthSea-mails goedkeuren in AXE zelf.** Mails kon al sinds 17 nov
      (`d40c3706`, met Luka's eigen inlog, plus "alles goedkeuren"). 20 nov
      gemeten: 22 open, waarvan maar 4 mails -- 6 taken en 7 ingekomen mails
      hadden geen knop. Nu (NorthSea 1.5.15, live): `/human/items/decide`,
      taak -> "Approve step / Cancel step", ingekomen mail -> "Mark reviewed /
      Dismiss", één voor één (niet in "alles goedkeuren"). Dealbeslissingen (3)
      en betaalde acties (2) blijven bewust in de Deal Desk. NorthSea-server en
      VPS-API zijn bijgewerkt; nep-token = 401 gecontroleerd. Maar: elk
      `/northsea/...`-verzoek gaat via de agent-tunnel naar de lokale API op de
      Mac mini, en die laadt nieuwe code pas als de AXE-app daar herstart (na
      de volgende build). Tot dan geven de nieuwe knoppen 404. Nog niet door
      Luka zelf aangeklikt.
- [~] **Vaste vervolgmails onder de vaste regel** (max 5/dag, 14 dagen rust,
      alleen het sjabloon). Luka 20 nov: "Ja, onder de regel". Live 20 nov 01:26 (NorthSea 1.5.14, `68997438`): max 5 per dag, niemand binnen 14 dagen twee keer, boven de limiet wacht hij tot morgen in plaats van een concept bij Luka. 15 overloop-concepten teruggezet in de rij. Noodknop: `auto_send_followups` uit in deal_automation_policy.
- [ ] **UI-ronde: alles nalopen.** Luka: "het is allemaal nog niet echt
      perfect en duidelijk". Elke tab langs: overlap, wat-is-dit, waar klik ik.
      Begint met inloggen in het browserpaneel (preview poort 5199).
- [ ] **UI nog open (na ronde 1-3, 18 nov; 20 nov: telefoon nagelopen op 375 px -- Managers-tab viel rechts weg, gerepareerd `c1a5f64a`; Home en NorthSea in orde;  `_backup_`/`_rollback_` verborgen in de boom via `codeStudio/boomFilter.ts`, en de app-tests weer groen -- dodeCode, nav/portal, architectuur):** bestandsboom in Code begint met
      tien `_backup_`/`_rollback_`-mappen; deal-link opent alleen deals uit de
      actieve lijst; telefoonweergave per tab nog niet nagelopen; 4 oude
      frontendtests rood (dodeCode, eeuwigGesprek).
- [x] **"Keur alles goed" in het gesprek** (18 nov): tegen AXE Core of de
      NorthSea Manager "ok alles" / "keur alles goed" -> veilige NorthSea-mails
      verstuurd met Luka's eigen inlog, AXE-vragen ja; AXE zegt wat er gebeurde.
- [x] **codex.run/claude_code.run faalden altijd** ("protected branch
      orchestrator"): de werker maakt nu zelf een worktree op axe/<datum>-<id>.
      En de agent weet dat git en GitHub op de Macs staan, niet op de VPS.
- [~] **NorthSea draait zelf: vervolgmails onder de vaste regel.** (zelfde als hierboven, live 20 nov) Luka 18 nov:
      "dat is een bedrijf wat geautomatiseerd moet lopen". Vervolg op eigen
      draad, vast sjabloon, max N/dag. Raakt service.send_policy_allowed EN de
      databasecontrole (alleen eerste-contact-doelen) -> migratie + deploy.
- [~] **Managers vragen in hun eigen gesprek** (20 nov nagelopen: het staat er al -- de VPS zet "Ik wacht op je ok: ... Zeg ok of nee hier" in het gesprek, het managervenster toont elke open vraag van die manager met Approve/Decline (rijenVoorAgent + GoedkeuringActie), en "ok"/"ja altijd" in het gesprek beslist hem. Bewezen zodra Luka er een in het echt zo afhandelt.) (zoals Claude/Grok): een vraag
      komt als bericht met ja/nee-knoppen in de chat van die manager, niet als
      losse kaart elders. "Ja" in het gesprek voert hem uit.
- [~] **AXE voert uit wat Luka toestaat.** (gebouwd 20 nov: zeg "ja, altijd" / "mag altijd" / "voortaan goed" op een vraag in het managergesprek -> goedgekeurd én vastgezet in `vaste_toestemming.py` (rijen to_agent='toestemming'); de task-worker geeft die commando's mee als al goedgekeurd. Nooit vast: push/merge/PR, verwijderen, sudo, betalen, handelen, versturen, terminal.free -- die blijven elke keer vragen. Lijst: `GET /toestemming`, intrekken: `POST /toestemming/intrekken`.) "Als ik zeg dat het mag, dan mag
      het": een staande toestemming per soort actie, vastgelegd en terug te
      draaien, zodat dezelfde vraag niet terugkomt.

## Uit Spazio OS (Pulsar) -- voor AXE (Luka, 18 nov)

Wat AXE ook moet kunnen, naar het voorbeeld van Spazio OS Pro:
- [~] **Geheugen tussen sessies**: na elk gesprek een korte notitie (wat
      gevraagd, wat veranderd, waar gestopt); het volgende begint met de
      laatste zes. "Ga verder waar we waren" werkt dan gewoon.
  *(22 nov: gebouwd -- na 45 min stilte is een sessie af; AXE schrijft er op de achtergrond drie regels over (Gevraagd / Veranderd / Gestopt bij) met hetzelfde model als de chat, anders een simpele notitie. Opslag global_memory `sessie:<start>`, dus gedeeld tussen de Macs en de telefoon; beide chatroutes zetten de laatste zes als "Waar we waren" in de systeemprompt. `domain/chat/sessieNotities.ts` + `application/axe/sessieGeheugen.ts`, 15 tests groen. Nog niet in de echte app gezien.)*
- [ ] **Chats-pagina**: elk gesprek met AXE en de managers doorzoekbaar,
      samenvatten in drie regels, vragen aan alle gesprekken tegelijk (met bron).
- [ ] **Vaste agents**: ochtendbrief elke dag, roadmap-check maandag,
      opruimlijst vrijdag, weekreview zondag. Nooit versturen/kopen/wissen;
      wat Luka nodig heeft wordt een stap.
- [~] **Vandaag-scherm** (18 nov: "Eén ding vandaag" staat bovenaan Home in de notch; eigen keuze gedeeld tussen de Macs, anders je oudste stap): de ene prioriteit van vandaag, volgende stappen en
      wiens beurt het is, projecten van idee tot verkoop, log van wat af is.
- [ ] **Interview**: AXE leert wie Luka is via een geleid gesprek.
- [ ] **Jouw stem**: 3-5 eigen teksten -> AXE schrijft en reviewt in die stem.
- [ ] **De Raad**: acht bedachte experts reviewen teksten, pagina's, projecten.
- [ ] **"Doe het zelf"-knop** op een stap: AXE werkt hem op de achtergrond af.
- [ ] **Maak het van jou**: "verberg X", "andere kleuren" in gewone taal.
- [ ] Focusmodus, geld achter een PIN, rustige muziek (Life OS-hoek).

### AXON Memory: één globaal geheugen voor elke AI (Luka, 18 nov)

Het Spazio-patroon in drie stukken, maar dan in AXON en voor ALLE AI's (AXE,
de managers, DAX, Claude Code, Codex, Cursor, Grok), zodat elke sessie weet
wat de andere deed:
- [x] **Stappen** (20 nov bewezen: `cli/axe stappen` op de iMac gaf "jouw beurt" met de open vragen; `GET /stappen`): één lijst in AXON met wat er nu komt, wie het doet (Luka of
      welke AI) en wat die AI moet doen. Gedeeld, niet per app.
- [x] **Log** (20 nov bewezen: werkte nooit -- de database weigerde kind 'log', en de CLI vond de sleutel niet; beide gerepareerd, `cli/axe log` vanaf de iMac staat in core_manager_messages): elke sessie van elke AI schrijft aan het eind één regel (wat
      gevraagd, wat veranderd, waar gestopt). Zo weet de volgende altijd waar
      we zijn -- ook als het een andere AI op een ander apparaat is.
- [~] **Eén regel** (staat in AGENTS.md voor Claude Code/Codex/Cursor; de managers en DAX krijgen de laatste 10 logregels + lessen in hun prompt via agent_loop; nog niet gezien dat elke AI het echt doet): elke AI begint met "lees de stappen en het laatste log
      in AXON" en eindigt met "schrijf een logregel". Voor Claude Code via
      CLAUDE.md/AGENTS.md, voor de managers en DAX in hun systeemprompt, voor
      de rest via de AXON MCP.
- [x] Bouwt op wat er al is (20 nov: log, lessen, verslagen en toestemming staan allemaal in core_manager_messages; geen tweede geheugen): core_manager_messages, memory (memory_schrijfhek,
      cap 120), de AXON-manager; niet een tweede geheugen ernaast.
- [ ] **AXON blijft een eigen app** (later met abonnement), maar Luka's eigen
      AXE koppelt eraan zodra AXON goed genoeg is: dan is AXON dat ene
      globale geheugen, en lezen/loggen gaat via de AXON-koppeling.

### Notch beter, naar het voorbeeld van Pulsar Agent (Luka, 18 nov)

AXE blijft alleen van Luka, dus deze ideeën mogen erin (Pulsar: CC BY-NC,
vrij voor eigen gebruik). Niet namaken: AXE-stijl en AXE-design houden, alleen
de slimme dingen en wat AXE nog mist:
- [x] **Claude Code live in de notch, naast AXE** (18 nov, beide Macs gekoppeld): wat Claude nu doet (lezen,
      bewerken, uitvoeren), de tijd, en "klaar" aan het eind -- via de hooks
      van Claude Code (UserPromptSubmit, PreToolUse, PostToolUse, Stop) naar
      een lokaal bestand + socket. Schakelen tussen "AXE" en "Claude".
- [x] **Goedkeuren vanuit de notch** (18 nov; sneltoetsen nog open): vraagt Claude (of een manager) iets,
      dan klapt de notch open met de hele opdracht en Weigeren / Altijd /
      Toestaan, plus sneltoetsen vanuit elke app.
- [x] **Peeks en Home in de notch** (18 nov): dicht -> één regel zakt 5 s
      uit bij een goedkeuring / Claude klaar / taak af; Home-knop toont wat
      er nu speelt in plaats van het hoofdvenster naar voren te trekken.
- [ ] **Paneel aan de rechterrand** met stappen, gewijzigde bestanden (+N -M,
      diff), en "in gewone woorden" wat er gedaan is; een veld om Claude
      tijdens het werk iets te sturen.
- [ ] **Nooit focus pakken**: een niet-activerend paneel (NSPanel
      nonactivating) dat pas 'key' wordt als je in het tekstveld klikt -- de
      nette versie van onze notch-focusfix van 18 nov.
- [ ] Zacht geluid bij een vraag en bij "klaar" (uit te zetten); bij meerdere
      sessies volgt de notch de sessie die op jou wacht, nooit springen.
  *(22 nov: het geluid is gebouwd -- twee zachte WebAudio-tonen (vraag omhoog, klaar omlaag), alleen op de Mac waar Luka zit (stil < 2 min), uit te zetten in de notch-instellingen. Open: bij meerdere Claude-sessies de wachtende volgen.)*
- [ ] Nooit zonder te vragen ~/.claude/settings.json aanpassen; eerst laten
      zien wat erbij komt, met een gedateerde kopie.

### AXE heerst over de Mac: slimme dingen uit heel Pulsar (Luka, 18 nov)

Niet namaken -- AXE is al een app met eigen design. Wat AXE (en Claude in AXE)
nuttiger maakt op de Macs, in volgorde van waarde:

**1. De notch als AXE-eiland** (Island + Agent)
- [ ] Staten: rust (alleen de notch), compact (pil naast de notch), peek
      (bubbel 2-4 s), open (0,25 s na hover), alarm (opent zelf). De pil
      heeft precies de notchhoogte en blijft zwart, zodat het één vorm is.
- [ ] Compact laat zien wat AXE of Claude nu doet + tijd; open: Home met wat
      er op Luka wacht, laatste dat een AI deed, volgende afspraak, weer.
- [ ] Claude Code live in het eiland, schakelen AXE / Claude; vragen van
      Claude (en managers) als keuzeknoppen in het eiland, goedkeuren met
      Weigeren / Altijd / Toestaan en sneltoetsen vanuit elke app.
- [~] Bestand naar de notch slepen (ronde 2, 20 nov): drop-zone met AXE-gezicht; per bestand "Ask AXE" of omzetten met wat macOS meebrengt -- afbeelding png/jpeg/heic/tiff/pdf/web (sips), document pdf(tekst)/docx/txt/rtf/html/odt (textutil+cupsfilter), audio m4a/wav/aiff (afconvert), video mp4/mov/m4a (avconvert); origineel blijft, nieuw bestand ernaast, "Show in Finder" (sinds ronde 3 via toon_in_finder: portal_toon mocht alleen AXE Portal, dus die knop deed niets). Getest: echte png->jpeg in de Rust-test. Komt met de app-build.
- [~] Notch ronde 4 (20 nov avond, naast Luka's foto's gelegd): één bovenbalk met datum en tijd rechts, de tweede rij weg (managerkiezer alleen in de chat, goedkeuringen al als teller); Home = één rij gelijke kaarten Vandaag · Taken/Notitie · Focus (groot 25:00, − Start +) · Weer (groot), Join erboven; rastericoon = tweede pagina Muziek · Geluid · Schakelaars · Weer; elk chatbericht met naam en tijd ("AXE · 22:40", "yesterday 21:04"). In de preview gezien; komt met de app-build.
- [~] Goedkeuren in de dichte notch (22 nov, Luka: "zonder hem helemaal groot uit te hoeven klappen"): zolang er iets wacht staat onder de dichte balk één vaste strook met de bovenste goedkeuring, groene Approve en een kruisje; +N als er meer zijn; klik op de tekst opent de Approvals-tab. Trade/betaling: alleen "Open in AXE CORE". In de preview gezien met een nep-goedkeuring: Approve stuurde het besluit, de notch bleef dicht, de volgende schoof door. Komt met de app-build.
- [~] Notch ronde 5 (22 nov, nog dichter bij Luka's foto's): knoppen bovenin rond en zonder rand (actieve tab = zachte grijze pil), kaarten zonder rand met glans van boven, AXE groot (84) met halo en stappen met icoon, volle pillen per manager, rusttoestand met AXE in het midden en bewegend sterrenstof, kaartkoppen 'icoon Titel ..... stand' (today / to do / ready / now), sleepzone met gestippeld vak, groene gloed en de managers als rail. In de preview gezien (actief, rust, slepen); komt met de app-build.
- [~] Notch-widgets (ronde 3, 20 nov, naar Luka's foto's): onder het eiland een Join-kaart voor de volgende afspraak van vandaag (4 min vooraf groot en groen, Join opent de Meet/Zoom/Teams-link uit plaats of notitie), focus-timer 15/25/50 met pauze, weer (open-meteo, stad aan te klikken), muziek van Spotify/Apple Music met vorige/play/volgende, volume + mute + scherm uit, en taken + notitie die op beide Macs hetzelfde zijn. Muziek/geluid alleen in de echte app (vaste AppleScript-woorden, nooit vrije script). In de preview gezien: timer, weer, taak toevoegen/weg. Komt met de app-build; macOS vraagt één keer toestemming om Spotify/Muziek te bedienen.
- [ ] Peeks: app open/dicht, oplader, batterij 20%/10%, DND, en "manager
      klaar met X" -- zonder over de menubalk te gaan. *(20 nov: "manager klaar"
      bestaat al (taak-klaar-peek). Batterij/oplader overgeslagen: iMac en Mac
      mini hebben geen batterij. DND is op macOS niet betrouwbaar uit te lezen.)*
- [ ] Vergadering: vanaf 5 min ervoor camera + minuten in de pil, open met
      "Deelnemen" (Zoom/Meet/Teams-link uit de agenda).
- [ ] Nooit focus pakken: niet-activerend paneel; doorzichtige delen laten
      klikken door naar de menubalk; lichte animaties (pauzeren als dicht).

**2. Paneel aan de rechterrand** (Agent)
- [ ] Kolom ronde icoontjes (Werk, Bestanden, Goedkeuren met stip, Sessies)
      die als het Dock verschijnt bij de rand; paneel met "Je vroeg", stappen,
      "In gewone woorden", bestanden +N -M met diff, en een veld om AXE/Claude
      tijdens het werk iets te sturen.

**3. Bestanden opruimen en omzetten** (Stow)
- [ ] Sleep op de notch: tegels Web / Versturen / Printen (juiste formaat en
      grootte), of een formaat kiezen; nooit overschrijven, origineel blijft.
- [ ] Bureaublad en Downloads netjes houden met eigen regels, met Ongedaan
      maken en "4 opgeruimd" in de notch. Persoonlijke documenten alleen naar
      één inbakje.

**4. De Mac zelf** (Lite, Mixer, Trackpad edges)
- [~] Kleine schakelaars in AXE: donker, bureaublad-iconen verbergen, wakker
      houden, DND, scherm op slot -- ook met de stem ("AXE, hou de Mac wakker").
      *(20 nov: notch-knoppen Dark / Hide icons / Stay awake (8 u, caffeinate) +
      scherm uit; met de stem via computer-tool `mac.schakel` (vaste woorden,
      goedkeuringskaart). Notch en stem delen ~/.axe/wakker.pid. Stand lezen
      getest op de iMac; omzetten nog niet in de echte app gezien. DND niet: kan
      niet zonder Shortcut.)*
- [ ] Volume per app en een timer; scherm- en toetsenbordlicht -- als
      knoppen voor AXE's computer-use, zodat AXE het zelf kan.
- [ ] Rowline-idee voor de twee Macs: vensters naast elkaar in een rij,
      werkruimtes bewaren en met één klik terugzetten ("zet mijn
      NorthSea-werkruimte klaar").

**Valkuilen die we meenemen** (staan uitgebreid in de Pulsar-opzet)
- Elke build met hetzelfde certificaat en bundle-id, anders vraagt macOS
  steeds opnieuw om rechten (dat doet de AXE-update al).
- Hooks van Claude Code mogen Claude nooit blokkeren: elke fout slikken,
  socket dicht = meteen door. ~/.claude/settings.json nooit zonder Luka's ok.
- Rechten pas vragen als de functie voor het eerst gebruikt wordt, met één
  regel waarom. Niets verlaat de Mac.

### Slimme dingen uit Spazio voor AXE (Luka, 18 nov)

Niet namaken -- AXE heeft al Taken, Home en de managers. Wat erbij moet:
- [~] **Eén ding vandaag**: bovenaan Home één kaart met DE prioriteit van
      vandaag (de eerste open stap van Luka, of die hij vastpint), niet een lijst.
  *(22 nov: gebouwd in de notch-Home -- de kaart "Eén ding vandaag" bovenaan, eigen keuze vastpinnen, op beide Macs gelijk via user_settings. In de preview gezien; komt met de app-build.)*
- [~] **Wiens beurt**: Taken in drie kolommen -- "Jouw beurt", "AXE's beurt"
      (of een manager/Claude), "Samen" -- met per stap waarom, welke bestanden,
      en wat de AI moet doen als het zijn beurt is.
  *(22 nov: gebouwd -- Taken-tab bovenaan drie kolommen Your turn · AI's turn · Together uit /stappen, met waarom per stap en een Done-knop op stappen; `--wie samen` zet hem in Together. Bestanden per stap nog niet. API-test groen, in de preview gezien; komt met deploy + app-build.)*
- [~] **"Doe de rij"**: zeg tegen AXE "doe de rij" en hij werkt de open
      stappen af waar hij eigenaar van is, één voor één, met een logregel per stap.
  *(22 nov: gebouwd -- "doe de rij" / "stop de rij" / "hoe staat de rij?" in de chat (zonder model), `axe rij [begin|stop|stand]`, POST/GET /stappen/rij. De open AI-stappen krijgen een nummer; alleen de eerste gaat naar de worker, de managerdienst (elke 2 min) start de volgende als er niets uit de rij draait; een logregel per stap. Nooit erin: trading, NorthSea-akkoorden, geld, wissen, of wat bij Luka ligt. `backend/axe_api/rij.py`, tests groen. Nog niet echt gestart -- dat start echt werk, dus Luka's woord.)*
- [~] **Log + ritme**: elke afgeronde stap één regel in het log (wie, wat), en
      een strookje "ritme" met hoeveel er per dag af is, laatste 30 dagen.
  *(22 nov: gebouwd -- afgeronde taken schreven al een logregel (taak_verslag), `axe stap-af` nu ook; GET /log/ritme telt per dag, de notch-Vandaag-kaart toont 30 balkjes + "N done today · M this week". Test groen, in de preview gezien.)*
- [~] **`axe`-commando voor elke AI-sessie**: `axe log "wat ik deed"`,
      `axe stap-af <id> "uitkomst"`, `axe stap-nieuw ...` -- zodat Claude Code,
      Codex en Cursor (en later via AXON elke AI) in hetzelfde log en dezelfde
      stappen schrijven als AXE en de managers. Plus de regel in CLAUDE.md /
      AGENTS.md: lees eerst de stappen, log aan het eind.
  *(22 nov: gebouwd -- `axe stap-nieuw "titel" --wie luka|axe|<manager>|samen --waarom ..` en `axe stap-af <id> "uitkomst"`; een stap is een core_task met capability 'stap' en status pending, dus de worker pakt hem niet op; stap-af sluit alleen stappen, nooit een taak die een worker draait. De regel staat in AGENTS.md. Tests groen; live na de deploy.)*
- [ ] **Bureau**: mappen met links (sites, tools, methodes) met één regel
      waarom ze ertoe doen.

- [~] **Managers als Grok Bot**: zelf doen, onderling overleggen, alleen
      vragen wat echt van Luka is. 20 nov: `manager_werk.py`, staande dienst elke
      2 min op de VPS (gratis modellen): (1) jouw bericht zonder antwoord na 3 min
      → de manager antwoordt, ook met de app dicht; (2) werk → agent-taak op zijn
      naam; (3) klaar/mislukt → bericht terug (eerste ronde meldde er 3); (4) eigen
      initiatief elke 2 uur per manager: één ding dat NU faalt. Elke denkstap begint
      met METINGEN (feeds, site, MCP, falende taken met 'laatst', commits, sleutels);
      eigen oude verslagen gaan niet meer mee (die hielden 'Companion draait niet'
      in leven). 21 nov: (5) onderling overleggen -- een manager vraagt een collega
      iets ("overleg" in zijn antwoord, kind 'ask'), de collega antwoordt de run
      erna en dat antwoord staat in jouw gesprek met de vrager; max 4/dag, geen
      kettingen. En: de eigen taken lagen sinds 20 nov 22:04 stil op puur kijken
      (`docker ps`, `docker logs`, `find ... 2>/dev/null`) -- 8 ok-vragen voor
      Luka. Kijken mag nu zelf (`beslis_beleid.is_inspectie`); `docker inspect`
      alleen met een --format zonder Env (anders gaan sleutels naar een gratis
      model), `systemctl show-environment` blijft vragen. Bewezen zodra een
      eigen-ronde-taak echt iets repareert en een overleg in een gesprek staat.
- [ ] Deal-specifieke mails door een model; abonnementen samenvoegen;
      stem-punten; device manager.

## Af, en gemeten

- **Providerkaarten** — 16 providers, één kaartvorm, groen/rood in de rand,
  echte foutreden in plaats van "Proxy HTTP 502". Instellingen en de
  rechterbalk lezen dezelfde catalogus (`domain/providerCatalogue.ts`).
- **Betekenis-kleuren** — `--m-*` bestond niet; 24 plekken waren kleurloos.
- **De VPS valt niet meer om** — swap + cgroup-grens op ollama. Bewezen onder
  belasting: 20 van 20 metingen bleef de API antwoorden.
- **De backend staat in git** — `main.py` en vijf andere draaiden ongetrackt.
  `vps_sync.py check` zegt nu "box and repo agree on every managed file".
- **LSE-route** — `api.axecompanion.com/market/lse` geeft 22.850 datasets met
  live ticks. *Nog niet gebruikt door trading; alleen een levenscontrole.*
- **Browser-tab** — de maatstaf voor elke andere tab. Zie `UI-MAATSTAF.md`.
- **De leerlus draait rond** — episodes worden geopend, gesloten en versterkt.

## 1 — Tabs kloppend maken

De browser-tab is de meetlat. De vijf layoutregels staan in `AGENTS.md` en
`UI-MAATSTAF.md`. Primitieven: `TabRuimte`, `Kaart`, `SectieBlok`, `SchuifBalk`
in `src/presentation/components/layout/tabMaatstaf.tsx`. Alleen stijl en
indeling — geen data, hooks, stores of API. Composer, chat, voice en AICore
blijven buiten dit spoor (eigen PR).

Volgorde, bewust: eerst de regel en de gedeelde vorm, dan Settings (Luka's
belangrijkste tab), dan MCP (het tegenvoorbeeld), dan de rest.

- [x] **1.0** Regel vastgelegd in `AGENTS.md`, `UI-MAATSTAF.md` en hier.
      Gedeelde primitieven + tokens (`--axe-kaart-*`, één definitie, test
      `kaartMateriaal.test.ts`) horen in dezelfde PR als 1.0a/1.0b.
      Aanvulling 24 september: elke tab heeft links én rechts dezelfde
      hover/click-lade. Rechts mag leeg zijn totdat een tab echte context heeft.
- [x] **1.0a** Settings: gegroepeerde matzwarte kaarten in sectieblokken,
      Browser-vormige schuifbalk (Providers / Voice / Trust / Routing /
      System / General), inhoud gecentreerd in `TabRuimte`.
- [x] **1.0b** MCP: compacte stat-kaarten (niet meer `STAT_ROW` die drie
      cijfers tot balken rekt), ruimere serverkaarten in `.axe-kaart-raster`,
      tool-tester in een Agents-sectieblok, zelfde schuifbalkvorm.
- [x] **1.0c** Calendar, Cron, Tasks: `TabRuimte` (Calendar/Cron/Tasks
      vullen), Tasks-schuifbalk Status, Cron-formulier als `Kaart`,
      TASKS/CRON JOBS als `SectieBlok`. Geen `LIST_GRID` meer op Cron.
- [ ] **1.0d** Resterende tabs dezelfde primitieven. Gedaan: Finance
      (`StatRij` + Source-schuifbalk), Control Plane + CrewAI (`StatRij`,
      geen `STAT_ROW`), Organization (`TabRuimte vullen`), Agents
      (16 okt 2026: had al `.axe-tabruimte`/`TabRail`/`.axe-kaart` --
      de twee resterende overtredingen waren de roster-grid op `LIST_GRID`
      [`auto-fill, minmax(320px,1fr)`, het tegenvoorbeeld uit regel 2] en
      `<StatusBadge>` als gevulde pil op de kaart [regel 5]. Nu `KaartRaster`
      + `SectieBlok`, status als platte gekleurde tekst. Geverifieerd:
      tsc schoon, vitest 2723/2725 groen, de 2 falende los van deze wijziging).
      Nog open:
      Apps, Knowledge, Terminal, Obsidian, Maps, EVE,
      Table editor, Command, Developer, Infrastructure, Memory,
      Home (alleen wat geen composer/AICore is).
- [ ] **1.1** Per tab langs `UI-MAATSTAF.md` — volgt uit 1.0c/1.0d.
- [ ] **1.2** Vier tabs gebruiken minder dan de helft van de hoogte:
      eve 32%, tasks 46%, cron-manager 47%, mcp 50%. MCP hoort na 1.0b
      inhoud-bepaald te zijn (niet opgerekt); hermeten na pull.

## 2 — Agents

### Twee vormen, één lus

De koppeling staat er. Beurten blijven in localStorage (kort, per apparaat);
episodes gaan naar Supabase (duurzaam, voor de versterking). `noteRetrieval`
opent beide; `noteTurnOutcome` / `noteOwnerOutcome` sluiten beide.

```
noteRetrieval(query,  memoryIds, memoryKeys, owner)  → turnId  (localStorage)
openEpisode({subject, memoryIds, memoryKeys, agent}) → id      (Supabase)
```

- [x] **2.0** `noteRetrieval` opent óók een episode; het oordeel sluit hem.
      `'local-code'` valt onder `'code-editor'`. Offline (`openEpisode` →
      null of een throw) laat de beurt in localStorage gewoon werken.

  De brug bestond al (commit `72f8e6ea`) maar de lus kwam niet rond.
  Gemeten 23 september op AXE Companion:

  | agent | geopend | gesloten |
  |---|---|---|
  | trading | 5024 | 72 |
  | chat | **2** | **0** |
  | browser, code-editor, research | 0 | 0 |

  Beide chat-rijen hadden herinneringen, `verdict = unknown`, `closed_at`
  null. Oorzaak: `openEpisode` is async en voiceStore geeft geheugen 500ms;
  het oordeel kwam eerder dan het episode-id (of eerder dan de beurt zelf)
  en verdween. Zonder sluiten leest `applyAgentReinforcement` ze nooit.

  Tests die falen op de oude code: oordeel vóór episode-id, oordeel vóór
  ophalen, `openEpisode` null/throw, lege RAG opent wél een `chat`-rij,
  voiceStore roept `noteOwnerOutcome` aan (`beurtNaarEpisode.test.ts`,
  `learningLoopWiring.test.ts`).

  **Live nabouwen, in de draaiende app:**
  ```sql
  select agent, count(*) filter (where closed_at is not null) as closed,
         count(*) as opened
  from agent_learning_episodes
  group by agent;
  ```
  Na één chatbericht hoort `chat.opened` omhoog te gaan, en na het antwoord
  `chat.closed` ook. Hier geen composer-sessie, dus dat laatste is niet
  live gemeten.


- [x] **2.1** **De agents-tab toont dubbelen.** 18 agents in `core_agents`,
      maar de tab telt er 29 ("defaults + core_agents"). AXE Core, AXE Intel en
      AXE Companion staan er twee keer. Eén bron kiezen.

      Gerepareerd in `mergeAgents` (Agents.tsx): de database is de basis zodra
      hij rijen teruggeeft, en DEFAULT_AGENTS is dan alleen nog geschiedenis.
      De oorzaak stond in de weg van `byId.has(a.id)`: de defaults gebruiken een
      slug (`axe-core`) en de database een UUID, dus dedupen kon nooit werken.
      *Dit punt stond nog open terwijl de code al klopte — afgevinkt 1 okt 2026.*
- [x] **2.2** Drie agents hebben status `statue` — geen geldige waarde.
      Uitzoeken of dat `static` moest zijn.

      Uitgezocht: het is géén typefout voor `static`. `agentRegistry.ts`
      definieert `statue` met zoveel woorden als "de naam bestaat en er draait
      nog geen code achter" — een beeld van een agent. Het is wél een tweede
      woord voor een stand die `core_agents` `paused` noemt, en de agents-tab
      zette er daarom "Unknown status: statue" bij, alsof er iets stuk was.
      `statusNote` leest ze nu als één betekenis. De tabellen zelf houden hun
      eigen woord: hernoemen betekent data migreren voor nul winst.
- [x] **2.2a** **Vier spellingen voor veertien agents** (1 okt 2026). Gevonden
      bij 2.2: `roster.ts` zegt `task`, de zaailijst `task_agent`, de
      terugvallijst `task-manager`, en haar namespace `tasks`. Gemeten door elke
      spelling uit alle drie de lijsten door `loopAgentVoor` te halen: 13 van de
      42 losten niet op, waaronder zes (`task_agent`, `memory_agent`,
      `cron_manager`, `finance_agent`, `thinktank_agent`, `app_agent_manager`)
      waarvan de rostertegenhanger het wél deed — dezelfde agent, dus een
      herinnering onder de ene naam telde niet mee in de lus van de andere.
      Nu `domain/agents/agentNaam.ts`: één mechanische regel (die 29 van de 42
      dekt) plus de echte onregelmatigheden met hun reden, en een test die élke
      spelling uit alle drie de lijsten langsloopt. Over: vier keer `northsea`
      (heeft nog geen echte afloop, zie 2.5 — bewust geen lus) en `eve` +
      `infrastructure_agent` (met reden geen agent).
- [x] **2.3** Per agent tonen: welke skills, welke tools, welk model, en of
      zijn leerlus rondloopt (`agent_learning_episodes` per agent).

      Stond nog open terwijl de code al klopte — afgevinkt 16 okt 2026,
      geverifieerd door het bestand zelf te lezen (niet aangenomen). In
      `Agents.tsx` (roster-weergave, rond regel 605-676): elke kaart
      toont `model_provider`/`model_name`, skills (`agent.capabilities`)
      en tools (`agent.toolset`) als badges, met "No skills or tools
      registered yet." als geen van beide iets heeft, plus een leerlusregel
      (`Learning loop (agent_learning_episodes): ...` met episodes,
      close rate en `applied/reinforceable learned`). De agent-naar-lus-
      koppeling loopt via `loopAgentForRow` → `loopAgentVoor`
      (`memoryFeedbackService.ts`), dezelfde canonieke resolver als
      retrieval zelf gebruikt — dus geen tweede, eigen lijst meer die uit
      de pas kan lopen (zie 2.2a).
- [x] **2.4** RAG-bestanden per agent zichtbaar maken.

      Afgevinkt 16 okt 2026. `AgentMemoryPanel.tsx` las al echte rijen uit de
      `memory`-tabel per agent (`loadNamespaceMemory`) -- dezelfde tabel die
      MemoryHub's brain/terrain-weergave toont -- maar er was geen manier om
      er zelf iets in te zetten. Nu: "Add RAG file" per agent (leest het
      bestand als tekst, schrijft via het nieuwe `addNamespaceMemory()` in
      `agentActivityService.ts`, zelfde VPS-pad/`AXE_USER_ID` als
      `remember()` in `agentMemoryService.ts`) plus een verwijderknop per
      rij (`deleteNamespaceMemory`). Geen tweede opslag: wat hier binnenkomt
      staat meteen op /memory (brain + terrain) en in deze tab, voor elke
      echte roster-agent (elke `core_agents`-rij heeft een eigen namespace
      via `memoryOwners()`). Geverifieerd: tsc schoon, eslint op de twee
      gewijzigde bestanden 0 fouten, vitest 2723/2725 (de 2 falende staan
      los van deze wijziging).

- [ ] **2.5** Alle agents de lus geven.

      Gecorrigeerd 16 okt 2026 -- de regel hieronder was verouderd. Gemeten
      door `LOOP_AGENTS` (`domain/memory/agentLoop.ts`) langs de 18 echte
      `core_agents`-rijen te halen via `canoniekeAgent`/`loopAgentVoor`
      (bewezen door `agentNaam.test.ts`, 9 groene testen): alle 15 agents die
      een eigen kaart mogen tonen (18 min `eve`/`axe_ollama`/
      `infrastructure_agent`, met reden geen agent) lossen op naar een
      werkende lus -- chat, trading, code-editor (2x: `axe_developer` en
      `code_agent`), browser, intel, companion, wingman, task, cron, memory,
      thinktank, finance, apps. Nog niet: `agenticEngine.ts` (bedraad maar
      dood -- nul importeurs) en `langGraphOrchestrator.ts` (hoort er bewust
      niet in, zie CLAUDE-SESSIE 2 in WERKVERDELING.md). Dat zijn geen
      roster-agents in deze tab maar interne orchestratiepaden; ze aansluiten
      is een eigen beslissing (zie `browserAgentLoop.ts` als werkend
      voorbeeld) en blijft open.

## 3 — Trading

### ✅ Rechtgezet: verkeerde datum, verkeerd aantal — maar de burst bestaat

Hier stond: op 8 september tussen 19:15:59 en 19:16:13 gingen er **18
XAUUSD-orders** naar MT5 100K DEMO. Gemeten op 9 september, rechtstreeks op de
database, klopt daar bijna niets van — en tegelijk is het onderliggende
probleem echt. Allebei belangrijk.

**De 8-septemberavond was een inleesronde, geen burst.** Op 17:15–17:16 UTC
(19:15–19:16 bij ons; in de eerdere lezing zat óók een uur verschil) zijn er 38
rijen in `core_trading_trades` geschreven, en alle 38 hebben
`exit_reason = broker_close`, `status = closed` met pnl erbij, geen
`local_trade_id`, en een `opened_at` tussen **21 augustus en 4 september**. Het
zijn afgesloten broker-trades die die avond in één keer in het journaal zijn
gezet.

**De denkfout is één kolom.** `created_at` is wanneer de RIJ geschreven werd,
`opened_at` wanneer de order geplaatst werd. Bij ingelezen trades staan die
weken uit elkaar. Alles wat "18 orders in 14 seconden" leek is de snelheid van
het invoegen; de verschillende instapprijzen zijn goudprijzen van twee weken,
op volgorde van invoegen — niet een koersvoeding die ±30 per seconde bewoog.
De 7 rijen zonder strategie, framework of reden waren het duidelijkste signaal:
dat zijn precies de trades die AXE níét bedacht heeft, dus er valt niets in te
vullen.

Tegencheck: op 8 september opende de broker in totaal **8** XAUUSD-trades,
verspreid over de hele dag, nooit meer dan één per minuut.

**Maar op `opened_at` staat een echte burst, en die is erger.**
21 augustus 16:20:34, MT5 100K DEMO: **zeven AUDUSD-orders binnen 11
milliseconden**, allemaal `mean-reversion` op m15, met net iets verschillende
prijzen. Niet veertien seconden — elf duizendsten. Dat is geen reeks
beslissingen maar één beslissing die zeven keer vertrekt.

Meer clustering op `opened_at`, per account binnen 60 seconden:

| dag | account | paar | keren |
|---|---|---|---|
| 21 aug | MT5 100K DEMO | AUDUSD | 6 |
| 25 aug | MT5 100K DEMO | XAUUSD | 1 |
| 26 aug | MT5 100K DEMO | XAUUSD | 4 |
| 27 aug | MT5 100K DEMO | XAUUSD | 2 |
| 27 aug | MT5 50K DEMO (run-2) | XAUUSD | 1 |

**Na 27 augustus geen enkele meer.** Dat is vóór de reparaties van vandaag, dus
die kunnen er niet de oorzaak van zijn — waarom het stopte is niet gemeten.

De reparaties hieronder pakken dus wél een echt verschijnsel aan, alleen niet
op de dag die hier stond. Het 11-milliseconden-geval is precies waar de
in-proces teller voor is: zeven plaatsingen die allemaal dezelfde
teller-van-vóór lezen omdat er nog niets in de historie staat.

- [x] **3.0 — de rem** De dagteller leest nu de BROKER, niet de papieren
      spiegel. `brokerOpeningsTodayFor()` in `brokerConnector.ts` telt de echte
      opening-deals (`DEAL_ENTRY_IN`/`INOUT`) van vandaag per account; een
      onleesbare broker geeft `null` → de cyclus HOUDT vast (`dayCountUnverified`)
      in plaats van blind te traden, en dat blokkeert alleen een OPEN, nooit een
      exit. Daaronder telt een in-proces teller elke plaatsing mee op het moment
      dat hij vertrekt. `dayLimitState()` bundelt de regel puur en getest
      (`dayLimit.test.ts`).
- [x] **3.0 — een dubbel-order-lek** `addAccount()` controleerde niet op een
      bestaande `accountId`, dus dezelfde MT5-account kon twee keer in de lijst
      staan; `selectTradeable()` dedupt nu op accountId
      (`tradeableAccounts.test.ts`).
- [x] **3.0 — de open vraag is beantwoord** De 8-septemberburst bestond niet
      (inleesronde). De echte zit op 21 augustus 16:20:34: zeven AUDUSD-orders
      in 11 ms op één account, één strategie. Dat is één beslissing die zeven
      keer vertrekt, niet zeven beslissingen — en dat is wat de in-proces teller
      afvangt.
- [ ] **3.0c — waarom stopte het op 27 augustus?** Sinds 27 aug staat er geen
      enkele clustering meer op `opened_at`, en dat is weken vóór de reparaties.
      Er is dus iets anders veranderd. Niet gemeten, en zolang je dat niet weet
      weet je ook niet of het terug kan komen.
- [x] **3.0b — de inleesronde verliest de openingstijd** De reconciler had
      `t.openTime` in handen en gaf hem niet door, dus viel de invoeging terug op
      de sluittijd: alle 43 ingelezen rijen stonden als trade van nul seconden in
      het journaal. `recordTradeClosed` neemt nu `openedAt`
      (`tradeOpenTime.test.ts`, faalt op de oude code). **De 43 bestaande rijen
      blijven fout** — hun echte openingstijd staat alleen nog bij de broker, en
      opnieuw inlezen zou dubbele rijen geven.

- [x] **3.1 — de cyclus betaalt niet meer voor het onmogelijke** Gemeten op het
      journaal van 9 sept (8 cycli, 5 accounts): 21 van de 40 account-uitkomsten
      was een overslaan (52%), 14 een fout, **0 een order**. Op US30, NAS100 en
      US2000 sloegen steeds 4 van de 5 over. En dat gebeurde PAS NA research,
      desk lanes en trechter — die draaien per symbool, vóór de uitwaaiering.
      `scanUniverse` sorteert nu op dekking (breedst eerst, nul-dekking eruit) en
      `runOneSymbol` stopt vóór de research als geen enkel account het symbool
      voert, met de reden in het journaal. Regel puur in `scanCoverage.ts`,
      8 tests.
- [x] **3.1b — vervallen door 3.1d** De klacht was: van ETHUSD, NAS100, US30,
      DJ30, BTCUSD en XAUUSD wordt alleen goud door alle accounts gevoerd. Dat
      klopt nog steeds, maar het is geen probleem meer: sinds 3.1d wordt een
      symbool geprijsd door het account dat het wél voert, dus NAS100 en US30
      handelen gewoon bij OANDA. Ik laat de watchlist met rust — het is Luka's
      lijst, en de reden om er iets uit te halen is weg.
- [x] **3.1c — de indices sloopten de prijs van goud** Het waren geen twee
      problemen maar één. `tryMetaApiSnapshot` haalt ÉÉN config op — het
      standaardaccount — voor ELK symbool, en de scanlijst staat vol indices en
      crypto die een MT5-demo niet voert. Elke ronde een reeks NotFoundErrors;
      MetaAPI telt die en knijpt de hele **subscriptie** af. Dat is de 429 die
      hier vijf keer als snelheidslimiet is gelezen. Daarna valt XAUUSD door naar
      Binance en weigert `assertTradeable` terecht. Nu vertrekt er geen
      kandelaanvraag meer voor een symbool dat het account niet voert
      (`marketDataAccountFit.test.ts`, faalt op de oude code).
- [x] **3.1d — een symbool bij het JUISTE account halen** `marketDataService`
      kiest de rekening per symbool: eerst het standaardaccount, anders het
      eerste verbonden account dat het paar voert, anders niemand. Een uur
      onthouden, zodat de catalogus niet per aanvraag gelopen wordt.
      `metaApiGetHistoricalCandles` neemt daarvoor een optionele `account`;
      weglaten is exact het oude gedrag (`marketDataAccountFit.test.ts`).
- [ ] **3.1e — meten of het werkt** De keten is beredeneerd en getest, niet
      gemeten. Het bewijs is een cyclus die wél een order plaatst.

      **Nulmeting, vlak vóór de fix ging draaien** (journaal t/m de cyclus van
      9 sep 20:32 UTC, 40 account-uitkomsten):

      | | |
      |---|---|
      | overgeslagen | 21 |
      | fout | 14 — waarvan 6 quota, 8 synthetisch |
      | orders | **0** |

      De app draait sinds 10 sep 09:20 met de fix. Het journaal rolt door, dus
      deze cijfers staan hier en niet alleen in de database. Herhaal de telling
      met de query in de sessienotities; gaan quota en synthetisch naar nul en
      staat er een order, dan is het bewezen.
- [x] **3.2 — risico per account instelbaar** De opslag kon dit al
      (`tradingRiskService.keyFor(accountId)`, met overerving van de
      bureau-standaard) en de engine las het al per account. Alleen dit scherm
      kende de vraag niet, dus stond er in de praktijk één profiel voor alles.
      De Risk-kaart heeft nu een kiezer bovenaan: **Bureau (standaard)** plus
      elk ingeschakeld account. Per account zet een modusknop alleen de MODUS en
      laat de rest staan — een preset die de zorgvuldig ingestelde drawdown van
      een prop-account terugzet is precies wat je daar niet wilt.
- [x] **3.3 — LSE is aangesloten als koersbron** `lseCandles` en `lseCatalog`
      stonden op de dode-code-lijst: alleen de probe voor de connect-kaart werd
      gebruikt. Nu zit LSE in de prijscascade, vóór Binance. Dat is de winst:
      Binance levert voor alles behalve crypto het VERKEERDE instrument (zijn
      AUDUSDT is niet de AUDUSD van de broker), terwijl LSE wél XAU/USD,
      EUR/USD, NAS100/USD en US30/USD heeft.
      **Gemeten in de draaiende app**, balken van 18 minuten oud: goud 4406,15 ·
      NAS100 29411,4 · US30 52547,3 · EURUSD 1,1637 · BTCUSD 78086.
      Twee dingen die alleen door het te draaien bleken: LSE negeert de gevraagde
      resolutie en levert **altijd minuten** (vandaar `candleAggregation.ts`), en
      zonder venster geeft hij de **oudste** data — de eerste rij van XAU/USD is
      van 2006. Ook `limit` kapt aan het begin van het venster, niet aan het eind;
      de eerste versie gaf daardoor balken van twee dagen oud zonder dat er iets
      faalde.
      **Niet om op te handelen**: `assertTradeable` blijft de prijs van de
      rekening eisen die de order vult. LSE is voor de grafiek, backtests en
      context — `source: 'lse'`, zodat de bewaker hem herkent en weigert.
- [x] **3.3c — execution vraagt geen fill op LSE/Binance** Gemeten in tests
      (niet live): `fetchTradeableSnapshot` loopt niet meer door de
      grafiek-cascade. Als MetaAPI zwijgt wordt LSE niet aangeroepen, de
      cyclus stopt vóór research (`magDureCyclus` / `probeerBrokerPrijs`),
      en `brokerPlaceOrder` weigert met `venue: 'price'`. DJ30 telt als
      US30 (register-alias, bewezen); GER40→DE30 niet. **3.1e blijft open**
      — een live cyclus met een order is nog niet gemeten.
- [ ] **3.3b — hernoemde symbolen** `GER40` heet bij LSE `DE30/EUR`. De
      vertaling zoekt in de catalogus en raadt geen hernoemingen, dus die geeft
      niets terug. Een tabel kan dat oplossen, maar alleen op bewijs per stuk —
      een plausibele gok geeft een grafiek van het verkeerde instrument, en dat
      zie je niet aan de vorm.
- [x] **3.4 — de aanname klopte niet, het echte probleem lag ernaast** Gemeten
      10 september. "Kronos" bestaat niet meer; de VPS meldt `vbt`, `nt` en `ta`,
      allemaal installed. En ze zijn wél te kiezen: het ledger heeft **101
      `vbt:`-regels en 163 `nt:`-regels**. (Ik dacht eerst van niet omdat de
      ledger-weergave op ≥1 trade filtert en voorkennis nul trades heeft.)
      Vanuit de app antwoorden beide engines met vier strategieën elk:
      `vbt:ma-cross`, `rsi-meanrev`, `bbands`, `macd` en `nt:ema-bracket`,
      `atr-breakout`, `donchian-trail`, `rsi-pullback`.

      **Wat er wél mis was:** het ledger kreeg sinds 8 september geen enkele
      nieuwe regel, terwijl de zelftest vanmorgen om 07:17 gedraaid heeft. Hij
      stempelt zijn slot vóór de sweep — terecht, want een zware ronde mag niet
      meteen opnieuw — maar een ronde die NIETS oplevert zette zichzelf zo twaalf
      uur op slot. Van buiten niet te onderscheiden van "er viel niets te leren".
      `selfTestPairs` telt nu wat er landt, en een lege ronde probeert het na een
      uur opnieuw (`selfTestGate.ts`, 4 tests).
- [ ] **3.4b — TradingAgents levert niets** `ta:` staat nul keer in het ledger.
      `/backtest/tradingagents` gaf binnen 45 seconden geen antwoord (hij draait
      op de lokale Ollama van de VPS, dus traag is verwacht — leeg niet). Zolang
      dit zo blijft is TradingAgents wel geïnstalleerd maar doet het niets.

## 4 — Computer use, browser, code-editor

- [x] **4.1** **Computer use is aangesloten.** Het gat was groter dan hier
      stond: `COMPUTER_TOOL_RUNTIMES` had nul gebruikers én `MAC_TOOL_RUNTIMES`
      stond wel geimporteerd in `toolRegistry.ts` maar werd nooit uitgerold —
      terwijl de catalogi hun gereedschappen wél aanmeldden. AXE zág ze dus en
      kon ze aanroepen zonder dat er iets achter zat. Beide nu uitgerold, met
      `toolRegistryBedrading.test.ts` erop (faalt op de oude registry op precies
      die twee). Er staat een werker ingecheckt op de iMac, dus het werkt echt.
      In de composer zit nu een knop met de stand erbij: groen of rood, en bij
      rood wat je eraan doet (`VermogensKnop.tsx`, `vermogenStand.test.ts`).
- [ ] **4.2** Browser buiten de app — het losse venster bestaat, ongetest.
- [ ] **4.3** Code-editor op het niveau van Cursor. *Groot; eerst opsplitsen.*

## 5 — Luka kan het zelf

- [x] **5.1** `SLEUTELS.md` — waar elke sleutel woont.
- [x] **5.2** `AGENTS.md` — waar elke assistent begint.
- [x] **5.3** `axe-status` bij elke rode regel zeggen wát je eraan doet.
  *(22 nov: live gedraaid tegen de echte VPS. Vier valse rode regels weg -- de anon-sleutel zag door RLS niets en meldde core_tasks "niet leesbaar" en de leerlus "0 episodes"; nu wordt er bij leeg opnieuw via de VPS gemeten. AGENTS en DIENSTEN lezen ook via de VPS als de kluis-SSD er niet is. Ollama's 401 = beveiligd, groen. "Liggen eruit" zegt per soort de echte stap: alleen echte units herstarten (ollama, axe-terminal, gemeten), providers = sleutel testen, n8n draait niet op de VPS, axe_intel = Supabase-functie, trading niet aanraken. Lege kopjes zeggen dat ze leeg zijn.)*
- [~] **Minder goedkeuren** (22 nov, Luka: "ik moet nog heel veel approven"): gemeten in 72 uur -- bijna alles was kijken (crontab -l, df, docker compose ps, docker network inspect, supabase functions list, systemctl status ... || echo, kijken via ssh strato-dax, a; b van leescommando's). Die mogen nu zonder ok (`beslis_beleid.EXTRA_LEES_RE`, `EIGEN_SSH_RE`); starten/stoppen/prune/POST/inspect-zonder-format blijven gevraagd. En dezelfde NorthSea-dealvraag kwam 2x per dag terug (6x goedgekeurd): een deal waar Luka in 7 dagen over besliste wordt niet opnieuw gevraagd (`recent_beslist_deal`). Tests groen.
- [ ] **NorthSea-dealbesluit echt laten landen**: een ok op "Yes needed: <deal>" in AXE verandert niets aan de deal in de desk (daarom vroeg de cron het steeds opnieuw). Het besluit moet naar de NorthSea Desk (MCP), anders is de knop leeg.
- [~] **Wachtrij-taken zonder pogingen** (25 nov): 17 taken stonden sinds 24 nov 01:35 op queued met attempt 3/3 -- door mijn eigen terugzetting van die nacht zonder de teller -- en de worker pakt alleen attempt < max_attempts: 31 uur niets opgepakt. Nu geeft projectsmgr zo'n taak elke ronde een poging terug (2fef0f20). LIVE BEWEZEN 25 nov 09:15: 17x task.unstuck, binnen een minuut 17 opgepakt; daarna 14 ok-vragen bij Luka, 1 klaar, 2 blocked, 1 mislukt (40 stappen). Gevonden: 'Ik kon ... geen ... vinden om ...' heette klaar -- nu toegegeven falen (klaar_regels).
- [~] **Mac-CLI als denkhoofd stuurt het hele log als werkbon** (25 nov gebouwd, 0536f8d1: een denk-aanroep is nu een eigen pad -- geen werkbon, geen worktree, lege tmp-map, alleen lezen; het prompt geeft het doel altijd mee plus de tools van de werkplek en vraagt één JSON-actie; Codex' laatste bericht via -o. Echt gemeten op de Mac mini: Codex gaf in 18 s `{"name":"run_shell",...}` (eerst: minuten per stap, alleen tekst). Bewezen als een echte taak via het stoel-brein acties doet.) (gevonden 22 nov): als de API-modellen falen, stuurt `provider_router.seat_prompt` het lus-transcript via `claude_code.run` naar de Mac; daar komt de werkbon omheen en draait het in een eigen worktree, dus Claude weigert ("transcript niet van deze sessie, verkeerde map"). Een denk-aanroep is geen codeeropdracht: eigen pad zonder werkbon/worktree, of geen CLI als brein.
- [ ] **5.4** Strato: waarom valt de VPS uit? Op 7 sep was het ollama; op 9 sep
      viel hij hard weg (geen ping, poorten dicht) — dat is iets anders.

---

## 6 — AXE als baas (Jarvis-route, niet letterlijk Jarvis)

Aangepast van de Jarvis OS 2.0 / Jev-slides naar wat AXE Core al is: de
baas-chat naast de composer, de bestaande agents (War Room / Wingman,
NorthSea Desk, Trading / AXE Algo, Developer, …), de leerlus (#172),
RAG per taak, George (#173), first-token (#175), Whisper (#178) en de
LLM-cascade. Geen Obsidian-plicht, geen Claude Code-plicht. Twee deuren
(Home/HUD + dashboard) delen één brein.

Dit is **niet** de roster-tier in `roster.ts` (manager / worker /
assistant). Dit is de aanvraag-route.

### Fase 1 — tier-router (deze PR)

- [x] **6.1** Elke beurt door een classifier die tier 1/2/3 teruggeeft,
      plus agent/skill bij tier 3, in ruim onder 1s. Regels eerst;
      optioneel Groq `llama-3.1-8b-instant` bij twijfel; timeout 700ms
      → huidig pad.
- [x] **6.2** Tier 1 antwoordt zonder groot model: groet (`hey axe`),
      status, taken / prioriteiten / agenda uit opgeslagen data.
- [x] **6.3** Tier 2 = klein snel model, lichte context, gestreamd.
- [x] **6.4** Tier 3 erkent meteen, zet een durable task bij de bestaande
      agent, schrijft het resultaat in de leerlus/RAG.
- [x] **6.5** Cognitive stream toont `route · tier N · … · Nms`.
      Latency staat op het `RoutingEvent`.
- [x] **6.5a** Multi-intent: één zin met meerdere taken wordt geknipt
      (NL + EN), elk stuk een eigen job, parallel, één korte ack.
      De chat blijft open voor nieuwe T1/T2-beurten.
- [x] **6.5b** Agents-balk boven de composer (`N agents running`),
      matzwart met dunne lijn; klik opent naam / agent / stand.
- [x] **6.5c** Klaar job komt als korte samenvatting in de chat.
      George TTS wacht als de gebruiker praat (spraakrij + barge-in).
      `Wat heb je gedaan?` / `status` is T1 uit de job-store.
- [x] **6.5d** Zin-voor-zin TTS tijdens de LLM-stream: eerste complete
      zin speelt terwijl de rest nog komt. Per-beurt `lat · stt · route
      · token · audio` in de cognitive stream.
- [x] **6.5e** Orb volgt mic (listening) en TTS-analyser (speaking).
      Settings-schakelaar: George (standaard), Cedar, ElevenLabs Flash
      v2.5, ElevenLabs v3 Conversational, Cartesia Sonic, Fish.
      Sleutels alleen via Settings → Keys / `VITE_*` — geen waarden
      in de repo.

**Al aanwezig vóór deze PR:** `classifyQuery` / `classifyChatIntent` /
`isSocialChatTurn` / `routeFast` / `delegateFor`, durable tasks + monitor
in `installStableChat`, first-token stream, leerlus (`noteRetrieval` →
`noteOwnerOutcome`), Groq-slot, Whisper-lus + barge-in (#178).

**Nog niet:** gemeten latency op de Mac (regels zijn in tests <5ms;
het model-pad is begrensd op 700ms). NorthSea auto-send blijft uit.

### Fase 2 — gestructureerd geheugen

- [x] **6.6** Vaste mappen: inbox / projects / content / wiki. Dagelijks
      briefje met plan, top 3, agenda. Elke taak laat een rapport achter.
      ~~Harvest: een klaar project wordt een wiki-artikel.~~ (zie 6.6a)

**Al aanwezig:** RAG (`searchRagMemories`), leerlus + episodes, namespaces
(`axe_trader`, `global`, …), `writeConversationMemory`, Obsidian-tab,
continuous memory.

**Gedaan 1 okt 2026, drie van de vier:**

- **De mappen** staan in `domain/memory/mappen.ts` en kosten nul
  schemawijzigingen: de `memory`-tabel heeft `kind`, een vrije `category`,
  `tags[]` en een `key` met een unieke index op `(agent, key)`. Een map is een
  `category`, een document is `<map>/<slug>`. Geen tweede opslag, zoals
  `AGENTS.md` eist. Luka's keuze: in het geheugen, niet als directories.
  Eén ding dat anders stil misging: de `memory`-tabel wordt voor de Memory-tab
  en de 3D-weergaven geclassificeerd door `hubForAgentRow`, en die keek alleen
  naar de namespace -- dus álle vier de mappen zouden als "Insights" op één berg
  staan. Die kijkt nu eerst naar de map, in JS én in de SQL-tak ernaast.
- **Het briefje** had een lezer en geen schrijver. `loadTodaysBriefing()` leest
  een `core_notifications`-rij die een VPS-cron zou schrijven, en gemeten maakt
  géén migratie of script in deze repo die `core_schedules`-rij aan. Dus klonk
  er elke ochtend "AXE is online" terwijl het briefje nooit bestond. De schrijver
  staat nu in `application/system/dagBriefjeMaken.ts`, de regel puur in
  `domain/dagBriefje.ts`, inclusief de top 3 die nergens bestond. Die sorteert op
  wat echt te weten is: over tijd eerst (langst over tijd vooraan), daarna de
  plannerorde. Bewust NIET op `priority` -- dat is een vrije string in
  `core_tasks` en ik heb niet gemeten welke waarden er in staan. Luka's keuze:
  hardop bij het eerste contact; hij gaat ook naar `inbox`, zodat AXE er later
  naar kan terugwijzen. Schreef de VPS er wél een, dan gaat die vóór: die heeft
  meer gezien dan de app.
- **Rapport per taak** in `domain/tierRouter/jobRapport.ts`, weggeschreven uit
  `meldJobKlaar` -- de ene plek waar klaar én mislukt langskomen, want een
  mislukte taak wil je over een week ook nog kunnen opzoeken. Zelfde vorm als
  `axe report` in de CLI al schreef (`# titel` + tekst), nu in `projects`.

- [ ] **6.6a — harvest.** Een klaar project wordt een wiki-artikel: de
      `projects/*`-rapporten van één project samengevoegd tot één
      `wiki/<project>`. Afgesplitst omdat de drie punten hierboven af en gemeten
      zijn en dit niet; het is ook het minst omschreven punt van 6.6. Het bouwt
      wél op wat er nu staat: de mappen bestaan, en de rapporten die geoogst
      moeten worden worden sinds vandaag geschreven. Kleinste eerlijke vorm: een
      functie en een knop, geen veger die achter je rug je geheugen herschrijft.

### Fase 3 — skills als knoppen

- [x] **6.7** Plan Today, Inbox Brief, Intel Brief, Deep Research, Weekly
      Review: dezelfde knoppen op Home/HUD en het dashboard, elk een
      nagekeken skill, ook via stem.

**Gedaan 1 okt 2026.** De namen bestónden al -- `axeRoute.ts` had het type en de
regexen, en `stuurAxeJobs` zette `skill` zelfs in de payload. Maar er gebeurde
niets mee: de backend kent het woord `skill` niet (grep is leeg) en het planpad
zette `skill: null` hard. Alle vijf gedroegen zich als "tier 3, doel = de
letterlijke zin die je typte"; de agent kreeg bij "inbox brief" twee woorden en
moest raden.

- **Eén definitie** in `domain/tierRouter/axeSkills.ts`: per skill de aanroep, de
  agent, de tier en de instructie die de agent krijgt. `axeRoute` leest zijn
  regexen en zijn agentkeuze daaruit in plaats van uit een if-keten.
- **`plan-today` is tier 1** geworden. Zijn inhoud staat al in `haalTier1Kijk`,
  dus als tier 3 gaf hij "On it, I'll report back" op een vraag waarvan het
  antwoord klaarlag. Hij is nu het dagbriefje uit 6.6 -- dezelfde tekst, of je
  het typt, zegt of op de knop drukt.
- **Twee schaduwen weg.** `probeerPlan` draaide vóór de regels én nog eens in de
  tier-3-tak, dus een benoemde skill werd opnieuw beslist door een planmodel: tot
  6 s wachten, en de naam ging verloren. Een skill slaat dat nu over. En
  `routeFast`'s briefing-pad is niet meer een tweede weg naar hetzelfde.
- **Lezen en voorstellen** (Luka's keuze) staat niet alleen in de instructie maar
  in `jobModus`: een skill-job krijgt `execution_mode: 'read'`, dus het hek aan de
  backendkant blokkeert schrijven. Een instructie is een verzoek aan een model;
  dit is een hek.
- **Knoppen uit die ene bron:** het commandopalet (⌘K, overal), en op de telefoon
  een "Skills"-pil in de FAB -- want daar was het palet helemaal niet te openen:
  ⌘K vraagt een toetsenbord en de zoekknop zit in een kopbalk die de telefoon
  niet heeft. Een skillknop stuurt zijn eigen LABEL als bericht, en de router
  herkent dat met dezelfde regex als wanneer je het typt. Dus geen vierde pad.
- **Stem:** één `skill`-parameter op het bestaande `start_background_task`, geen
  vijf nieuwe tools. Dat is met opzet: een test eist de exacte lijst van vijf
  toolnamen en `prompts.ts` vertelt het model in proza dat het er precies vijf
  heeft. Vijf tools erbij betekent die twee ook aanpassen; één parameter houdt
  beide waar.
- **Onderweg weg:** de `/research`-knop in beide composers zette een voorvoegsel
  dat niemand leest -- geen route parseert het, en het matchte niet met de
  deep-research-skill. Hij zet nu de echte aanroep klaar. Dat hij vóórvult en
  niet vuurt blijft: dat was een bewuste keuze.

**Niet gedaan, en met reden:** de oude `skillRegistryService` / `BUILTIN_SKILLS`
(~45 promptfragmenten) is niet aangeraakt. Die injectie werkt trouwens niet --
`installStableChat` haalt `skillsBlock` door `raceFirstToken` met budget
`RAG_FIRST_TOKEN_BUDGET_MS = 0`, en bij 0 geeft die meteen de fallback, dus de
blok is altijd leeg. Die nul staat er voor first-token-latency en blijft staan;
omzetten herintroduceert een bug waar al voor betaald is. Deze vijf skills zijn
daarom router-acties en geen promptttekst -- dan is die injectie ook niet nodig.
Ook niet aangeraakt: de Architecture-skills-UI, die onbereikbaar is omdat
`agentSaveKey` nergens geproduceerd wordt (`RuntimeInspector.tsx`). En "War Room"
bestaat niet meer als component; het is de oude naam van de roster-weergave in de
Agents-tab.

### Fase 4 — stem-UX

- [x] **6.8** Spreken, pauze = versturen, Esc = stop, globale hotkey,
      een bol die altijd idle / listening / working / speaking / error
      toont.

**Al aanwezig:** Whisper-lus, George (Kokoro), `voiceStatus`, Home-bol
die meeloopt met die status, `statusOrb.ts` (idle/listening/thinking/
speaking/error), #178 stilte-wacht, Esc stopt de stemlus, barge-in
kapt TTS af, job-spraak wacht in de rij, zin-voor-zin TTS, orb op
mic + TTS-niveau, stem-motor in Settings.

**De hotkey, afgemaakt 1 okt 2026.** In Tauri bestond hij al: Rust
registreert ⌥Space globaal (`src-tauri/src/lib.rs`), met de pure
beslissingen in `domain/voice/sneltoets.ts`. In de web-app en de PWA was
de enige toetsweg naar de mic een kale spatie op Home -- en zelfs die
werkte niet: de tak hing aan een `onSpacebar`-prop en `App.tsx` riep de
hook aan als `useKeyboardShortcuts({})`, zonder handler. De kop van dat
bestand beschreef dus jaren gedrag dat er niet was.

Nu pakt het venster ⌥Space op **elke** tab, dezelfde aanslag die Rust
globaal registreert, met één gedeelde schakelaar
(`schakelStemSneltoets`) zodat de toets op beide oppervlakken hetzelfde
betekent. De kale spatie blijft bewust alleen op Home: elders is dat de
paginascroll. In Tauri doet het venster juist NIET mee -- Rust vangt die
aanslag al af, en twee handlers op één druk is openen en meteen weer
sluiten. Gemeten in Chromium, vier gevallen:

| | ⌥Space | kale spatie |
|---|---|---|
| web, Home | gepakt | gepakt |
| web, andere tab | gepakt | doorgelaten |
| Tauri, Home | doorgelaten (Rust) | gepakt |
| Tauri, andere tab | doorgelaten (Rust) | doorgelaten |

Typen gaat altijd voor: ⌥Space in een invoerveld wordt doorgelaten.

**Blijft onmogelijk in de browser:** de toets afvangen terwijl een ándere
app voorop staat. Dat kan alleen het besturingssysteem, dus dat blijft
Tauri-only. Daar is het geen gat maar een grens.

### Fase 5 — OS3-gevoel: praten terwijl het werk doorloopt (25 sep)

- [x] **6.9** Achtergrondtaken uit het gesprek worden echt uitgevoerd.
      Bewijs: nul tier-3-taken ooit (core_tasks, 25 sep); Gemini gaf 402,
      'code'/'trading'/'research' hadden geen handler. Nu alles `agentic`,
      agent-lus op Groq → OpenAI → Gemini → ollama. Smoketest op de VPS:
      klaar en bewezen in 2 stappen, samenvatting is het antwoord zelf.
- [x] **6.10** Leestaken zijn echt dicht: `execution_mode=read` blokkeert
      schrijven en posten; mail/versturen vraagt altijd je ok. Smoketest:
      schrijfopdracht in een leestaak schreef niets.
- [x] **6.11** Beurtplan: één snel model leest de hele beurt (brain dump) en
      scheidt opdrachten, dingen om te onthouden, herinneringen en praten.
      Getest op echte Nederlandse zinnen met gpt-4.1-mini (Groq's gratis
      dagtegoed was op). Geen plan binnen 3s = oude regelroute.
- [x] **6.12** Een taak die op je ok wacht, meldt zich één keer in het gesprek.
- [x] **6.13** Kern van de sphere spreekt mee met AXE (zelfde signaal als de
      composer-pulse).
- [x] **6.14** Agent-vensters rond de core op Home (screenshot shell-preview).
- [x] **6.15** Machinekeuze (Rabbit OS3: de cloud denkt, de apparaten doen).
      De agent-lus op de VPS heeft `list_devices` + `run_on_device`
      (`backend/axe_api/device_actions.py`): een actie wordt een
      `computer_use`-rij met `target_device`, die alleen de worker op díe Mac
      pakt. Tiers gelijk aan `riskTiers.ts` (test bewaakt dat); klikken/typen
      vraagt één ok per Mac+gereedschap, ingrijpend elke keer, leestaak weigert.
      Bewezen 25 sep: "welke app staat vooraan op de Mac mini en de iMac" →
      beide Macs gevraagd, juist antwoord, 3 stappen. iMac mist nog
      Toegankelijkheid + Schermopname (Luka zet die zelf aan).
      Worker vergelijkt nu met zijn start-build, niet live HEAD (autosync).
- [x] **6.17** Praten blijft praten (25 sep). Een gewoon spraakgesprek werd 25
      "browser"-taken: het plan viel over zijn 3s-limiet en de terugval knipte
      op komma's. Nu: plan-modellen tegelijk (eerste geldige wint, 6s), geen
      plan = gewoon terugpraten (en eerlijk zeggen dat niets gestart is), alleen
      een korte losse opdracht mag zonder plan één taak worden. Prompt: reageer
      als een mens, geen help-desk-opvulling; stemmingen/verhalen niet onthouden.
      Gemeten (gpt-4.1-mini): verhaal/stoom afblazen → 0 taken, ~1,1s;
      gemengde beurt → 1 taak + 1 herinnering + 1 idee, 1,9s.
- [x] **6.18** AXE onthoudt en gebruikt het (25 sep). Alles werd al opgeslagen
      (rag_memories ~400/dag), maar het snelle gesprekspad las niets terug
      (RAG-budget 0 ms). Nu `application/memory/gespreksGeheugen.ts`: profiel +
      recente herinneringen altijd warm (0 ms), zoeken op de beurt met 600 ms
      grens (400 ms voor snelle antwoorden); blok gaat in plan én tier 2.
      Plan onthoudt alles wat later telt (ideeën, mensen, feiten), niet opvulling.
      Gemeten: "wat wilde ik opschonen?" → "de trading desk, toch?", 1,2s.
- [x] **6.19** Eén gesprek op alle apparaten (OS3). Berichten dragen
      `metadata.device`; `installGesprekSync` kijkt elke 4s wat andere apparaten
      opsloegen: erbij in dit gesprek, of meeverhuizen naar het gesprek waar Luka
      elders mee verderging (alleen als AXE hier stil is). Gesprek laadt de
      nieuwste 500 i.p.v. de oudste; Supabase-terugval filterde op de verkeerde
      user_id en gaf altijd niets.
- [ ] **6.16** Echt getest in de app met stem: een brain dump van een paar
      minuten, onderbreken, resultaten die terugkomen. Nog niet gedaan.

---

## Hoe je een punt afvinkt

Niet omdat de code er staat. Alleen met bewijs dat losstaat van je eigen
redenering: een test die faalt zonder je wijziging, een meting, een screenshot.

Drie staten (Luka, 19 nov): `[x]` klaar = live én in het echt bewezen, met
datum en bewijs; `[~]` gebouwd = code en tests staan maar nog niet live of nog
niet bewezen; `[ ]` open. Alleen `[x]` telt mee in het percentage bovenaan.
Na elke wijziging: `python3 scripts/bouwlijst_stand.py`.

Blijkt een punt niet te kloppen, verbeter dan de tekst hier in plaats van er
stilletjes iets anders van te maken.

---

## 7 — axe-commandolaag (CLI + hek, geen tweede agent)

De CLI en het hek zitten **bovenop wat er al is**. Geen nieuwe
node-daemon, geen nieuwe geheugenstore. Rabbit OS3 is een optionele
extra executor via dezelfde `cli/axe`.

- [x] **7.1** `axe` CLI (Python 3, geen extra packages) + geteste parser,
      guardrails en JSON-uitvoer (`src/cli/*.test.ts`, `cli/test_axe_laag.py`).
- [x] **7.2** Commando's mappen op wat er al is: taken, geheugen/RAG,
      agents/durable kernel, NorthSea (read-only), trading cockpit, cron, MCP,
      `axe node list` → bestaande `core_computer_workers`.
- [x] **7.3** Hek: alleen-lezen tot `--write`; hard geblokkeerd: mail,
      NorthSea `auto_send_*`, merge naar `orchestrator`, wissen.
- [x] **7.4** `os3/SKILL.md` + `os3/SETUP.md`.
- [~] **7.5** Gemeten op de Mac mini en de VPS: `axe status --json` en de
      vijf testprompts uit SETUP.md. 25 nov op de VPS GEMETEN: status, node list en
      northsea deals geven ok (exit 0); memory add / notify zonder --write geweigerd (exit 2).
      Gevonden: prompt 5 'stuur een mail naar de koper' en 'merge naar orchestrator' kwamen
      DOOR het hek (alleen technische woorden telden) -- nu ook gewone taal, getest. En `status`
      meldde terecht task_worker 'inactive': zie hieronder. Nog: de Mac mini -- daar staat
      nog geen `~/.config/axe/config.json` (sleutel = Luka's stap, uit SLEUTELS.md).
- [x] **7.6** `cli_laag.py` op de box (`vps_sync.py check` na deploy). 25 nov: IN SYNC,
      `/cli/status` bestaat op de VPS (401 zonder sleutel, ok met sleutel).
- [~] **Agents lezen nooit sleutels** (25 nov): een agent ('Zelf oplossen: Vaste jobs worden niet opgepakt') gokte een tiental plekken voor een API-sleutel af -- `cat /root/.axe_token`, `/etc/axe/companion_api_key`, `.../companionmgr/.env`; wat hij leest gaat als context naar het model. Nu geweigerd via shell en read_file: .env, *_token/api_key-bestanden, ~/.ssh, /etc/axe, .pem/id_rsa/credentials.json, printenv/env en /proc/*/environ; code over tokens lezen kan gewoon (72220aff, 19 tests). Bewezen als een live poging 'Refused' krijgt.
- [~] **Werkplek Trading OS op de Mac mini** (25 nov): de SSD hangt er niet aan, dus 'Trading OS' bestond niet ('unknown workspace') en drie managertaken eindigden op 'trading-os-app is niet beschikbaar'. Nu valt hij terug op ~/trading-os-app (de levende repo; ~/TRADING-OS is een oude kopie uit mei) (4951be7f). Bewezen als de Mac mini hem na de autosync aanbiedt.
- [~] **Een agent zette de worker uit** (25 nov 16:17): taak 'Stop de lopende taak ...' vroeg
      een ok voor `systemctl stop axe-task-worker`, kreeg hem (een van de 14 ok-vragen), en zette
      zo de worker uit waarin hij zelf draaide -- 50 min liep er niets, niemand startte hem. Worker
      weer gestart (17:05, /health ok). Nu: stoppen/herstarten/killen van axe-task-worker of
      axe-core-api wordt altijd geweigerd, ook met een ok, en al vóór de ok-vraag (Luka krijgt
      zo'n kaart niet meer). Bewezen als er na deploy geen kaart meer voor komt.
- [ ] **7.7** AXON-read in chat — **niet** een vierde store. Write-bridge
      bestaat (`axonMemoryBridge.ts`); CLI-label `axon` is een stub op RAG.
      Alleen doen als je de bestaande `axonContextPack` in
      `buildDurableMemoryContext` hangt.

---

## 8 — Inventaris: bestaat / deels / ontbreekt

Niet bouwen wat hier **bestaat**. Uitbreiden waar het **deels** is.
Alleen het **ontbrekende** is werk — en dat is niet "een node-agent" of
"een memory backend".

Status is gemeten aan **aanroepers**, niet aan definities (val 2).

### Uitvoering / machines

| Stuk | Status | Waar (aanroeper) | Tabellen | Niet doen |
|---|---|---|---|---|
| Computer-use worker | **bestaat** | `infra/computer-worker/worker.mjs` ← Computer Use-tab, `toolRegistry.computer.ts`, launchd `com.axe.computer-worker` | `core_computer_workers`, `core_tasks` (`computer_use`, `target_device`), `core_task_events`, `core_trust_levels` | Geen tweede daemon, geen `core_nodes` |
| Claude-local / Mac-relay | **deels** | `infra/claude-local-worker/worker.mjs` ← `macRelayService.ts`, `[MAC:]`, voice; **geen launchd** | `core_tasks` (`claude_local`) | Geen `target_device`; niet vervangen door `axe node run` |
| Durable task kernel | **bestaat** | `task_runtime.py` / `task_worker.py` ← `/tasks*`, CLI `agent run`, ControlPlane, planner | `core_tasks`, `core_task_steps`, `core_approvals`, `core_task_events` | Geen parallelle job-queue |
| Device Manager (PR #149) | **deels** | `MobileSystem.tsx`, `device-manager/*`; native Android in eigen privé-repo `Ldezeeuw445/axe-core-android` (sinds 4 okt) | via `core_tasks` + loopback ADB `:4599` | Geen Samsung-side worker in deze repo |
| Browser-agent | **bestaat** | `browser_agent_app.py`, `com.axe.browser-agent` | — (in-process) | Niet via `core_tasks` |
| Terminal / mac-tunnel | **deels** | `terminal-server.cjs` (lokaal), `infra/axe-mac-tunnel` (handmatig) | — | Tunnel is outbound WebSocket, geen node-agent |
| LiveKit `core_devices` | **deels** | `livekitService.ts` | `core_devices`, `core_voice_*` | **Andere tabel** dan workers; niet hergebruiken voor executie |
| `axe node list` | **bestaat** (deze PR) | `GET /cli/nodes` leest `core_computer_workers` (45s, zelfde als `onlineDevices()`) | zelfde | Geen register/run/pairing |
| Nieuwe `axe node` daemon | **ontbreekt — bewust** | — | — | Niet bouwen; computer-worker ís de outbound executor |
| Pairing-token / `core_node_secrets` | **ontbreekt — bewust** | — | — | Workers auth'en al via service role / API-key |

### Geheugen / leerlus / agents

| Stuk | Status | Waar (aanroeper) | Tabellen | Niet doen |
|---|---|---|---|---|
| Leerlus PR #172 | **bestaat** | `noteRetrieval` / `noteOwnerOutcome` ← chat, voice, browser, code-editor; `axeBootstrap` 15 min | `agent_learning_episodes` + localStorage beurten | Geen tweede reinforcement |
| RAG semantisch | **bestaat** | `searchRagMemories` ← `searchGlobalBrain` ← `buildGlobalMemoryContext` (chat, agents) | `rag_memories`, RPC `match_rag_memories` | Geen tweede vectorstore |
| `global_memory` | **bestaat** | `memoryRecorder`, `/memory/upsert`, workers | `global_memory` | CLI-audit mag hierin, geen nieuwe event-log |
| Agent-namespaces | **bestaat** | `agentMemoryService` + `catalog.ts` `namespace` | `memory` | — |
| RAG per taak / bestanden per taak | **ontbreekt** | worker schrijft `global_memory` key `task_agent:{id}` | geen task-scoped RAG | Alleen bouwen als Luka dat apart vraagt |
| CLI `axe memory` | **bestaat** (deze PR) | `/cli/memory/search\|add` → RAG + global; ILIKE, niet pgvector | zelfde | Geen AXON-transport tot read-pad bestaat |
| AXON-product | **bestaat** (extern) | `axonMemoryBridge.ts` write vanuit trading | AXON-Supabase | Geen vierde store in AXE |
| AXON-read in chat | **ontbreekt** | `axonContextPack` alleen in tests | — | Hang in `buildDurableMemoryContext`, niet een nieuwe backend |
| Roster + dispatch | **bestaat** | `roster.ts` → voice; CLI → `/cli/agents/{id}/run` → `core_tasks` | `core_agents` (UI), roster (code) | 18 DB-rijen vs 13 roster — niet hier oplossen |
| Loop-wiring research/northsea/developer | **ontbreekt** | in `LOOP_AGENTS` maar geen `openEpisode`-aanroeper | — | Geen CLI-werk |
| `agenticEngine.ts` | **dood** | geen importeurs; echte runs via Python `task_worker.py` | — | Niet "aansluiten" zonder meting |

### Wat deze PR wél is

CLI + hek + `axe node list` als leesbril op de bestaande worker-tabel.
OS3-skill als optionele extra. Verder niets.
