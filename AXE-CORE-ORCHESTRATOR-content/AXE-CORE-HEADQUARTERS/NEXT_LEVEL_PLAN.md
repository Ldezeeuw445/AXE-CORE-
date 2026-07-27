# AXE CORE — Next Level Plan
### Claude + AXE + Luka als trio. Geschreven 2026-07-27, aan het eind van de sessie die de fundamenten legde (self-hosted cron, echte Memory, Architecture v2, agentic Code Editor, Tauri-parity, cross-app awareness).

Dit is een uitwerk-plan, geen uitvoerplan — bedoeld om te lezen en tegen te verzamelen vóór de volgende sessie. Niets hieronder is al gebouwd tenzij expliciet vermeld als "al gedaan".

---

## 0. Het idee in één zin
AXE wordt een écht persoonlijk, altijd-beschikbaar co-founder-niveau AI: een goede stem, herkenbaar overal (Mac/iMac via VPS), een geheugen dat blijft bestaan ongeacht welke sessie (deze cloud-sessie, je lokale Mac-sessie, een toekomstige sessie) je opent, een code-editor die Cursor/Replit voorbijstreeft, en een browser die écht kan handelen — niet alleen praten.

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

## 7. VPS-checklist — wat je vast kunt klaarzetten vóór de volgende sessie

- [ ] `CRON_SECRET` invullen in `/opt/axe-core-api/.env` + `deploy.sh` opnieuw draaien (staat al klaar, wacht op deze stap)
- [ ] Nieuwe Gemini-key (Google Cloud) aanmaken en in Settings zetten
- [ ] Groq-key checken/regenereren
- [ ] OpenRouter-koppeling verifiëren in Settings
- [ ] Ollama-status checken op de VPS
- [ ] OpenHands: je lokale sessie zoekt de actuele deploy-instructies op en zet 'm neer (in progress)
- [ ] Voor live preview: geen actie nu nodig, dit plannen we samen in de volgende sessie
- [ ] Voor Playwright (visuele feedback + browser-agent): `sudo npx playwright install --with-deps chromium` op de VPS — kan alvast, kost geen risico
- [ ] Voor Obsidian: een vault-map kiezen/aanmaken op je Mac, en beslissen hoe je 'm synct (iCloud/Syncthing) — de Supabase-kant bouwen we samen

---

## Volgorde-advies voor de volgende sessie
1. Providers weer stabiel (kort, hoog-impact — Axe moet weer snel/goed antwoorden).
2. Obsidian-brug (`core_obsidian_notes` + eerste sync) — dit is de basis onder "altijd co-founder, welke sessie dan ook."
3. UI/UX mat-zwart-consistentie-pas.
4. Live preview in Code Studio.
5. Browser-agent met echte page-acties (grootste stuk, laatst).

Dit hele plan hoeft niet in één sessie — pak 'm in deze volgorde, elke stap blijft op zichzelf waardevol.
