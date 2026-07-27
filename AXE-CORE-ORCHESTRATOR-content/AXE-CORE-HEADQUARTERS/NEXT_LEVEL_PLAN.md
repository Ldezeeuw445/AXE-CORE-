# AXE CORE — Next Level Plan
### Claude + AXE + Luka als trio. Geschreven 2026-07-27, aan het eind van de sessie die de fundamenten legde (self-hosted cron, echte Memory, Architecture v2, agentic Code Editor, Tauri-parity, cross-app awareness).

Dit is een uitwerk-plan, geen uitvoerplan — bedoeld om te lezen en tegen te verzamelen vóór de volgende sessie. Niets hieronder is al gebouwd tenzij expliciet vermeld als "al gedaan".

---

## 0. Het idee in één zin
AXE wordt een écht persoonlijk, altijd-beschikbaar co-founder-niveau AI: een goede stem, herkenbaar overal (Mac/iMac via VPS), een geheugen dat blijft bestaan ongeacht welke sessie (deze cloud-sessie, je lokale Mac-sessie, een toekomstige sessie) je opent, een code-editor die Cursor/Replit voorbijstreeft, en een browser die écht kan handelen — niet alleen praten.

**Basisprincipe dat door dit hele plan heen loopt:** alles wat "wij" (Claude, of AXE zelf) kunnen doen binnen de app, moet ook gewoon aan AXE gevraagd kunnen worden en dan gebeuren — geen functie die alleen via een handmatige klik bestaat terwijl AXE het ook zou kunnen uitvoeren als je erom vraagt. Multi-window hieronder is het eerste concrete voorbeeld hiervan: iets wat jij handmatig zou kunnen instellen (een tab op een ander scherm openen), moet AXE ook gewoon kunnen doen omdat je het vraagt.

---

## 1. Stem — betrouwbaar én goed

**Wat al gefixt is (deze sessie):** ElevenLabs self-heal itereert nu over échte stemmen (niet meer vast op de kapotte), audio-unlock voor iOS, max_tokens verhoogd (geen afgekapte zinnen meer).

**Nog te doen:**
- **Stem-keuze/tuning**: een echte JARVIS-achtige stem selecteren en testen — niet de default, een bewuste keuze. Actie: ElevenLabs-quota checken (gratis tier limiet?), 2-3 stemmen shortlisten, in Settings testen.
- **3 klappen als wake-gesture**: technisch eerlijk verhaal — dit kán **niet** werken als de app volledig gesloten is (dat is OS-level "launch on gesture", geen enkele web/Tauri-app kan dat starten terwijl hij niet draait, macOS geeft geen achtergrond-microfoontoegang aan gesloten apps). Wat **wel** haalbaar is via de Tauri desktop-app: de app blijft als achtergrondproces actief (system tray/menubalk-icoon), luistert continu naar een kort geluidspatroon (3 scherpe pieken kort na elkaar, via Web Audio API amplitude-detectie), en activeert dan het luister-scherm. Dat is de realistische versie van "3 klappen wekt Axe" — vraagt een macOS-microfoon-permissie + een always-on achtergrond-listener in de Tauri-shell (Rust-kant: system tray + blijven draaien na venster-sluiten).
- **Tauri-app openen activeert Axe meteen**: bij opstarten van de desktop-app automatisch de voice-store initialiseren en een korte "ik ben er"-begroeting geven (niet pas na een klik).

---

## 2. Betrouwbaarheid — providers die het écht doen

**Bekend probleem (moet gecheckt/gefixt worden, niet door mij vanaf hier — ik heb geen live inzicht in je keys):**
- Gemini-key gecanceld door Google Cloud → nieuwe key aanmaken in Google AI Studio, invullen in Settings.
- Groq-key werkte, doet het nu niet → key checken/regenereren op console.groq.com.
- OpenRouter → onduidelijk of nog gekoppeld, checken in Settings → Keys.
- Ollama op de VPS → checken of de service nog draait (`systemctl status ollama` oid) en welke modellen er nog staan.

**Structureel fixen (dit ís het echte werk):** de LangGraph-orchestrator doet al failover, maar met 3 van de 4 providers stuk was er kennelijk geen goede vangnet-ervaring. Voorstel: een duidelijke **prioriteitsvolgorde + gezondheidscheck** die niet stil faalt — als de eerste 2 providers falen, moet de UI dat zichtbaar maken (welke geprobeerd, welke gelukt) in plaats van gewoon traag/stil te worden. Dit sluit aan bij de "geen mock, alles waar" lijn: als een provider stuk is, laat dat zien, verzin geen antwoord.

---

## 3. UI/UX — echt next-level, mat/puur zwart

- Eén consistente donkere visuele taal doortrekken over **alle** pagina's die nu nog verschillende zwart-tinten/achtergronden gebruiken — met name Architecture (deels al gedaan met de holografische upgrade), Maps3D, Memory, Code Studio.
- Concreet: definieer één "mat zwart" kleurtoken (niet puur `#000`, een subtiele mat variant zoals we bij Architecture al gebruikten) en pas 'm overal consistent toe, i.p.v. per pagina losse zwarttinten.
- Architecture-knoppen/visuals: al gedaan qua canvas zelf; de knoppen errond (toggle, refresh, zoom-controls) verdienen dezelfde mat-zwarte stijl-taal in plaats van de huidige losse per-component styling.

---

## 4. Obsidian — het geheugen dat overal meegaat

Dit is het belangrijkste stuk voor "co-founder, ongeacht welke sessie". Het probleem: deze cloud-sessie kan nooit bij jouw Mac's bestandssysteem (bevestigd deze sessie — geen SSH, geen lokale toegang). Dus Obsidian zelf (de vault-bestanden) kan nooit de **enige** bron van waarheid zijn voor elke sessie — er moet een brug zijn die **overal** bereikbaar is: Supabase (die kan letterlijk elke sessie-vorm bereiken, cloud of lokaal).

**Architectuur:**
1. Nieuwe Supabase-tabel `core_obsidian_notes` (path, title, content markdown, tags, wikilinks, updated_at) — dit is de bron die **elke** sessie kan lezen/schrijven, ongeacht waar hij draait.
2. AXE schrijft belangrijke memory (beslissingen, feiten, taken die het waard zijn) hiernaartoe — vanuit elke sessie, via Supabase, altijd bereikbaar.
3. Een kleine sync-brug (draait op je Mac, via `launchd`/cron, of handmatig getriggerd door je lokale sessie) leest nieuwe/gewijzigde rijen en schrijft ze als echte `.md`-bestanden in je Obsidian-vault-map — dat geeft je de mooie, doorbladerbare graph-view in Obsidian zelf.
4. Elke sessie (deze cloud-sessie, je lokale sessie, een toekomstige) query't bij het opstarten `core_obsidian_notes` (+ bestaande `core_memory`/`agent_memory`) voor context — dát is het mechanisme waardoor "welke sessie je ook opent, hij weet dat hij co-founder is en wat er speelt."
5. **Eenzijdig beginnen** (Core → Obsidian), zoals al besproken — terugschrijven vanuit Obsidian is complexer (vraagt de "Local REST API"-plugin draaiend op je Mac) en kan later.

**Wat dit oplevert:** een Obsidian-vault die je kunt openen en zien groeien met AXE's eigen genomen beslissingen, gekoppeld via wikilinks — een echte, visuele, doorzoekbare geschiedenis van jullie samenwerking.

---

## 5. Code Editor — voorbij Cursor/Replit

**Al gedaan deze sessie:** multi-file agentic loop (Agent Mode: leest/schrijft meerdere bestanden, draait echte commando's, itereert op echte fouten, tot 5 beurten), plus een OpenHands-keuze-optie als zwaardere engine.

**Volgende lagen:**
- **Live preview-paneel**: een draaiend voorbeeld van de app zien in Code Studio zelf. Vraagt een VPS-stapje: nginx-routing die een dev-server-poort netjes doorzet naar een URL, plus een iframe-paneel in Code Studio dat daarnaartoe wijst.
- **Visuele/3D-feedback**: de agent die zijn eigen resultaat "ziet" — na een wijziging een screenshot maken (Playwright, headless) en die teruggeven aan een vision-model voor de volgende beurt. Vraagt Playwright op de VPS (nog niet geïnstalleerd, bevestigd deze sessie).
- **Scaffolding-flow**: "bouw een nieuwe app" als keten (beschrijving → repo scaffolden → code+preview-loop → Vercel-preview-deploy → jouw approval → merge) — de losse stukken (GitHub-tools, Vercel-tools) bestaan al, dit is vooral het aan elkaar knopen.

---

## 6. Browser + agent — echt kunnen handelen, niet alleen praten

**Al gedaan deze sessie:** de browser-AI-chat is echt (praat met je geconfigureerde model, leest paginatekst, geeft geen nep-antwoorden meer).

**Wat nog ontbreekt voor een "Comet-stijl" agent:** de agent kan nu lezen en praten, maar niet **klikken, typen, navigeren** namens jou binnen een pagina. Dat is een grotere stap — realistisch pad: een headless browser (Playwright, weer die VPS-afhankelijkheid) die de agent server-side aanstuurt (klik hier, typ daar, lees het resultaat), met de zichtbare browser in de app als "kijkvenster" op wat er gebeurt. Dit is bewust als aparte, grotere fase gemarkeerd — geen kleine toevoeging.

---

## 7. Multi-monitor — AXE opent zelf vensters op gekoppelde schermen

Nieuw idee, past bij het basisprincipe hierboven: als er meerdere schermen aan de Mac/iMac hangen, moet je Home op scherm 1 kunnen hebben en tegelijk bijvoorbeeld Cron Manager of Trading OS in een eigen venster op scherm 2 — zelf ingesteld, óf gewoon door het aan AXE te vragen ("open de cron manager op het tweede scherm").

**Waarom dit alleen via Tauri kan (niet in de browser/PWA):** een gewone webpagina/PWA mag om veiligheidsredenen nooit zelf weten hoeveel schermen er zijn of daar een venster op plaatsen — dat kan alleen een desktop-shell met OS-toegang. Tauri (die we al gebruiken) heeft dit al ingebouwd:
- `availableMonitors()` / `currentMonitor()` (Tauri's window/monitor-API) geeft de echte lijst gekoppelde schermen + hun positie/resolutie terug.
- `new WebviewWindow(label, { url, x, y, width, height })` opent een echt nieuw OS-venster, te positioneren op exact het scherm dat je (of AXE) kiest — met een eigen route erin (bv. `/cron-manager`, `/trading`) zodat het los van het hoofdvenster leeft.

**Twee manieren om 'm te openen:**
1. **Handmatig**: een "open in nieuw venster op scherm..."-optie in elke tab (rechtsklik of een klein icoon in de tab-header), met een schermkeuze als er meer dan 1 gekoppeld is.
2. **Via AXE zelf (de belangrijkste, want dat is het hele punt)**: nieuwe tool-marker `[OPEN_WINDOW:pagina,scherm]` (auto-gated — het opent alleen een venster, muteert geen data) die AXE kan gebruiken zodra je het vraagt in de chat/voice ("zet Trading open op het tweede scherm"). AXE vertaalt de gevraagde pagina naar een route en het gevraagde scherm naar een monitor-index uit `availableMonitors()`, en roept de Tauri-window-API aan.
3. Onthoudt de laatste indeling (welke pagina op welk scherm) in `localStorage`, zodat het bij het opnieuw opstarten van de Tauri-app automatisch weer zo staat.

**Wat dit vraagt:** alleen frontend/Tauri-werk (Rust-shell heeft de monitor/window-API al standaard, hoeft niet los geïnstalleerd te worden op de VPS) — geen VPS-stap nodig voor dit onderdeel.

---

## 8. Van tool naar co-founder — wat AXE écht "ongekend" zou maken

Dit gaat niet over nieuwe features, maar over bestaande infrastructuur (cron-scheduler, `core_notifications`, `core_tasks`, approval-gates, Obsidian-brug) een graad slimmer met elkaar laten praten. Vijf dingen, in volgorde van hoeveel ze op elkaar voortbouwen:

1. **Reflectie-loop — AXE die écht leert, niet alleen onthoudt.** Na elke afgeronde taak/goedkeuring schrijft AXE een kort "wat werkte, wat corrigeerde jij" terug naar memory. Dit is het verschil tussen *self-editing* (kan al, sinds de self-improvement PR-loop) en *self-improving* (wordt daadwerkelijk beter). Landt straks in Obsidian, zodat het doorbladerbaar wordt.

2. **Zelfoptimaliserend geheugen.** Memory die niet alleen groeit maar ook prioriteert: een entry die nooit meer relevant blijkt verzwakt, een entry die herhaald terugkomt wordt sterker. Bouwbaar op de bestaande `core_memory`-tabellen + een wekelijkse cron-job (scheduler bestaat al) die de decay/reinforce-pass draait.

3. **Capability ladder — vertrouwen dat je kunt zien, geen zwart-wit "mag AXE dit of niet".** Nu is elke approval-gated actie (EXEC, GIT_WRITE, …) altijd "vraag het eerst". Een trust-niveau per categorie (0 = altijd vragen → hoger = zelfstandiger, alleen omhoog te zetten door jou, nooit door AXE zelf) maakt autonomie geleidelijk en zichtbaar verdiend — en geeft de mission-control-strook op Home meteen een concreet "hoe goed gaat dit eigenlijk"-signaal in plaats van alleen een teller.

4. **Proactief zelf iets opmerken.** Niet alleen de 08:00-briefing, maar een vaker draaiende check (dezelfde scheduler, hogere frequentie) die afwijkingen signaleert — een cron die 3× faalde, een taak die een week overtijd is — en zelf een melding stuurt zonder dat je erom vraagt. Zelfde principe voor de VPS/providers zelf: een self-check die eigen gezondheid (keys, schijfruimte, error-rates) in de gaten houdt, zodat AXE het volgende keer dat een Gemini-key wordt ingetrokken zelf signaleert in plaats van dat jij het ontdekt.

5. **Cross-app redeneren, niet alleen cross-app lezen.** AXE kan nu Companion en Trading OS uitlezen; de volgende stap is ze combineren tot één inzicht ("Trading OS staat rood én je hebt 3 calls vandaag — zal ik de calls voorbereiden met dat in het achterhoofd?"). Dat is het moment dat het voelt als één brein i.p.v. drie dashboards.

**Bewust NIET meegenomen:** ideeën die een systeem veronderstellen dat er nog niet is (bijv. een autonome trading-scanner die zelf posities beoordeelt) — AXE Core heeft nu alleen leestoegang tot Trading OS, geen eigen trading-engine. Zulke dingen horen pas op deze lijst zodra ze op een echte integratie steunen, niet als losstaand verzonnen feature.

**Waarom Obsidian (sectie 4) de spil is:** alle vijf punten hierboven produceren iets dat de moeite waard is om te bewaren en terug te lezen — reflecties, geheugen-decay-beslissingen, trust-level-veranderingen, proactieve signalen. Zonder Obsidian verdwijnt dat in tabellen die niemand opent; mét Obsidian wordt het een groeiende, doorbladerbare geschiedenis van AXE's eigen ontwikkeling — precies zoals "visual memory" net zo nuttig moet worden als de Architecture-visual.

---

## 9. VPS-checklist — wat je vast kunt klaarzetten vóór de volgende sessie

- [ ] `CRON_SECRET` invullen in `/opt/axe-core-api/.env` + `deploy.sh` opnieuw draaien (staat al klaar, wacht op deze stap)
- [ ] Nieuwe Gemini-key (Google Cloud) aanmaken en in Settings zetten
- [ ] Groq-key checken/regenereren
- [ ] OpenRouter-koppeling verifiëren in Settings
- [ ] Ollama-status checken op de VPS
- [ ] OpenHands: je lokale sessie zoekt de actuele deploy-instructies op en zet 'm neer (in progress)
- [ ] **Live preview** (code al gemerged): `git pull` op de VPS, nieuwe `nginx_api.conf` toepassen + reload, `PREVIEW_PUBLIC_URL` zetten in `.env`, axe_api redeployen — zie `SESSION_HANDOFF.md` voor de exacte stappen
- [ ] **Browser Agent** (code al gemerged): `pip install -r requirements.txt` (voegt `playwright` toe) + `playwright install chromium` op de VPS — zonder dit geeft de Browser Agent een eerlijke 503, geen nep-resultaat
- [ ] Voor Obsidian: een vault-map kiezen/aanmaken op je Mac, en beslissen hoe je 'm synct (iCloud/Syncthing) — de Supabase-kant bouwen we samen
- [ ] Lokaal: `git pull origin orchestrator` + `npm run tauri:build` opnieuw draaien om al het bovenstaande in de Tauri-app te zien (geen auto-updater, zie sectie 1)

---

## Volgorde-advies voor de volgende sessie
1. Providers weer stabiel (kort, hoog-impact — Axe moet weer snel/goed antwoorden).
2. Obsidian-brug (`core_obsidian_notes` + eerste sync) — dit is de basis onder "altijd co-founder, welke sessie dan ook," én de plek waar sectie 8 (reflectie-loop, geheugen-decay, capability ladder) zijn zichtbare geschiedenis krijgt.
3. Sectie 8 uitwerken, te beginnen met de reflectie-loop (1) en capability ladder (3) — bouwen allebei direct op wat er al staat (self-improvement PR-loop, approval-gates).
4. Multi-monitor (`[OPEN_WINDOW:]`) — relatief klein, puur Tauri/frontend.
5. Chat-driven tool-markers voor de Browser Agent, zodat je 'm ook gewoon in de hoofd-AXE-chat kunt vragen, niet alleen op de Browser-pagina.

~~UI/UX mat-zwart-consistentie-pas~~, ~~live preview~~ en ~~browser-agent met echte page-acties~~ zijn deze sessie al afgerond (zie Execution log-stijl commits/PR's #78 t/m #86).

Dit hele plan hoeft niet in één sessie — pak 'm in deze volgorde, elke stap blijft op zichzelf waardevol.
