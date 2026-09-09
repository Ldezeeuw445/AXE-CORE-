# Wat AXE Core is

Eén desktop-app waarin Luka al zijn werk laat doen door agents. Eén gebruiker:
hijzelf. Geen klanten, geen team, geen meerdere accounts — dat scheelt een hoop
werk dat je anders per reflex inbouwt.

Tauri met React aan de voorkant, een Python-backend op een eigen VPS. De app is
géén website in een venster: in de gebouwde app gaat **elke** provideraanroep
via die VPS, nooit rechtstreeks naar OpenAI of Anthropic.

## Waar het uit bestaat

Onderin staat één rij tabs — Home, Apps, AI Core, Memory, Obsidian, Knowledge
Base, MCP, Infrastructure, Control Plane, Table Editor, Cron Manager, Browser,
Agents, CrewAI, Calendar, Tasks, Finance, Trading Intel, 3D Maps, Code Editor,
EVE, THINKTHANKS, Settings.

Ze zijn er allemaal met opzet. Luka gebruikt ze allemaal; er hoeft er geen weg.

Home heeft daarbinnen vier weergaven van hetzelfde geheugen, via de schakelaar
bovenin: **Core** (de bol en de chat), **Neural** (de puntenwolk), **Terrain**
(het landschap met heuvels per hub) en **Architecture** (de radiale kaart van
wat er draait). Ze tekenen dezelfde data, anders gerangschikt.

## Wanneer het goed is

Dit is de lat, en hij is bewust laag te controleren:

- **Eén ding staat op één plek.** Geen twee agents die hetzelfde doen, geen twee
  knoppen voor dezelfde handeling, geen twee bestanden die `main.py` heten
  waarvan je moet raden welke draait.
- **In één oogopslag zie je of iets werkt.** Groen als het werkt, rood als het
  faalt, en bij rood staat erbij waaróm en wat je eraan doet. "Connected" zonder
  kleur is geen antwoord.
- **Elke tab ziet er hetzelfde uit.** De browser-tab is de maatstaf; zie
  `UI-MAATSTAF.md` in de app-map.
- **Wat de app zegt te doen, doet hij ook.** Code die bestaat maar door niemand
  wordt aangeroepen telt niet als af.

## Wat het niet is

Geen product om te verkopen. Geen platform voor meerdere gebruikers. Geen
verzameling losse tools die toevallig in één venster staan — de schil bezit de
indeling, een pagina levert alleen inhoud aan.
