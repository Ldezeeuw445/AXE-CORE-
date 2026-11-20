# AXE CORE: alle functies, en wat je er met je stem mee kunt

Gemaakt 20 nov 2026 uit de code; de tab- en stemroutes zijn gemeten (zie
"Gemeten" onderaan). Werk hem bij als er een functie bijkomt.

**Twee manieren om tegen AXE te praten, en ze zijn niet hetzelfde:**

- **Stem** (mic, ⌥Space, "hey axe", 3x klappen): een live gesprek met
  OpenAI Realtime. AXE kan alleen wat zijn tools kunnen (lijst hieronder).
- **Typen** in de chat: eerst Home-commando's (weergave, notch), dan de
  bol (kaart/grafiek), dan de tier-router (1 = regels, 2 = snel model zonder
  tools, 3 = echte taak op de VPS bij een agent).

Legenda: **stem** = met je stem te gebruiken · **typen** = getypt ·
**klik** = alleen met klikken · *stil* = gebeurt vanzelf.

## Praten en de dag

| Functie | Werkt | Hoe | Voorbeeld |
|---|---|---|---|
| Live gesprek met AXE | ja | stem | "Hey AXE, hoe gaat het?" |
| Wekwoord "hey axe" | ja, staat standaard uit | stem (aanzetten: klik in Settings) | "hey axe" |
| 3x klappen | ja, staat standaard uit | stem (aanzetten: klik) | |
| Status / wat heb je gedaan | ja | stem + typen | "wat heb je gedaan?" |
| Snel antwoord op een korte vraag | ja | stem + typen | "wat is een ETF?" |
| Meerdere dingen in één zin (antwoord + taken + onthouden + herinneringen) | ja | typen; stem doet het met zijn eigen tools | "plan mijn dag, onthoud dat Jan maandag belt, en herinner me morgen om 9 aan de offerte" |
| Onthouden | ja | stem + typen, *stil* | "onthoud dat ik geen calls voor 10 uur wil" |
| Geheugen doorzoeken | ja | stem + typen | "wat zei ik vorige week over Hetzner?" |
| Plan mijn dag / inbox / intel / deep research / weekreview | ja | stem + typen | "plan mijn dag", "doe deep research naar lithiumprijzen" |
| Prioriteiten | ja | stem + typen | "wat zijn mijn prioriteiten?" |
| Eén gesprek op alle apparaten | ja | *stil* | |
| Delen vanuit een andere app naar AXE | ja | klik (deelmenu) | |
| Foto/camera of bestand in de chat | ja | klik | |

## Werk laten doen (agents en managers)

| Functie | Werkt | Hoe | Voorbeeld |
|---|---|---|---|
| Echt werk bij een agent starten | ja | stem + typen | "check de NorthSea deals", "fix de login-bug in AXE Core" |
| Kiezen op welke machine | ja | typen | "doe dit op de iMac: ..." |
| Vragen wat er loopt | ja | stem + typen | "wat loopt er?" |
| Een taak stoppen | ja | stem + typen | "stop de northsea-taak" |
| Een taak bijsturen | ja | typen | "doe het toch op de Mac mini" |
| Ja/nee op een vraag van AXE | ja (ingrijpende dingen alleen met klik) | stem + typen | "ja, doe maar" |
| "Ja, altijd" (vaste toestemming) | ja, sinds 20 nov | typen in een managergesprek | "ja, altijd" |
| Managers-tab: per manager een gesprek | ja | klik, daarna typen of de mic in dat venster | |
| Wacht op jou | ja | stem leest voor ("wat wacht er op mij?"); goedkeuren met klik | |
| CrewAI (team van specialisten) | ja | stem + typen | "zet de crew op een launchplan voor Trading OS" |
| DAX-bots, missies, grootboek | ja | klik | |

## Home, bol en notch

| Functie | Werkt | Hoe | Voorbeeld |
|---|---|---|---|
| Kaart van een plek op de bol | ja | stem + typen | "laat de kaart van New York zien" |
| Grafiek van een markt | ja | stem + typen | "show BTC chart" |
| Web, foto, document of mockup op Home | ja | stem | "laat een foto van de Eiffeltoren zien" |
| Plekken in de buurt / waar ben ik | ja | stem | "waar is de dichtstbijzijnde apotheek?" |
| Home-weergave kiezen (bol / Neural / Terrain / Runtime) | ja | typen, **en sinds 20 nov stem** | "zet Home op terrein" |
| Notch open/dicht | ja | typen, **en sinds 20 nov stem** | "open de notch" |
| Een tab van AXE openen | ja, **sinds 20 nov ook echt** (was: een taak) | typen + stem | "open trading", "ga naar de agenda" |
| Pagina op een ander scherm openen | ja | stem | "zet NorthSea op mijn andere scherm" |
| Vergrendelscherm | ja | klik | |

## Je Macs (computer use)

| Functie | Werkt | Hoe | Voorbeeld |
|---|---|---|---|
| Kijken: scherm, apps, bestanden, git | ja | stem + typen | "wat staat er nu op mijn scherm?" |
| App openen | ja | stem + typen | "open Safari" |
| Klikken, typen, scrollen | ja, met goedkeuring | stem + typen | "klik op Send" |
| Tests / build draaien | ja | stem + typen | "draai de tests van AXE Core" |
| Claude Code / Codex / Cursor laten coderen | ja, met goedkeuring | stem + typen | "laat Claude Code de dark-mode toggle bouwen" |
| Pushen, mergen, verwijderen | ja, **altijd met klik** | vragen met stem, goedkeuren met klik | |
| Terminals, Command Center, Computer Use-pagina | ja | klik | |

## Browser en web

| Functie | Werkt | Hoe | Voorbeeld |
|---|---|---|---|
| Zoeken op internet | ja | stem | "zoek het laatste nieuws over Nvidia" |
| Pagina lezen | ja | stem | "lees nos.nl voor me" |
| Onderzoek met bronnen | ja | stem | "wat drijft goud deze week, met bronnen" |
| Browser-agent (meerdere stappen) | ja, met goedkeuring | stem + typen | "boek een tafel voor 2 vanavond" |
| AXE Browser-tab | ja | klik | |

## Code en systeem

| Functie | Werkt | Hoe | Voorbeeld |
|---|---|---|---|
| Code Editor | ja | klik; werk via de developer met stem | |
| Git, PR-status | ja | stem + typen | "wat is de status van PR 180?" |
| VPS-commando | ja, met goedkeuring | stem + typen | "check de schijfruimte op de VPS" |
| Database lezen | ja | stem | "hoeveel open taken staan er?" |
| Overzicht: draait alles? | ja | stem + typen | "draait alles?" |
| Gekoppelde diensten (Supabase, GitHub, mail, NorthSea) | ja | stem | "welke services zijn gekoppeld?" |
| `axe` in de terminal | ja (sinds 20 nov vindt hij de sleutel) | terminal | `axe stappen`, `axe log "..."` |

## NorthSea, trading, agenda, de rest

| Functie | Werkt | Hoe | Voorbeeld |
|---|---|---|---|
| NorthSea-vragen (deals, blokkades) | ja | stem + typen | "welke deals zitten vast en waarom?" |
| NorthSea Desk, mail goedkeuren | ja | klik, of "ok alles" in het NorthSea-gesprek | |
| Vervolgmails onder de vaste regel | ja, sinds 20 nov | *stil* (max 5/dag) | |
| Schepen, vliegtuigen, nieuws op de kaart (OSINT) | ja | stem | "welke schepen liggen bij Rotterdam?" |
| Trading-agent (posities, onderzoek) | ja | stem + typen | "check mijn open posities" |
| Echte orders, kill switch | ja | **klik** | |
| Agenda voorlezen | ja | stem + typen | "wat staat er vandaag in mijn agenda?" |
| Afspraak toevoegen | ja | stem + typen (**getypt sinds 20 nov**) | "zet vrijdag 19:30 diner in mijn agenda" |
| Afspraak wijzigen/annuleren | ja | stem | "verzet het diner naar 20:00" |
| Taak maken | ja | stem + typen | "maak een taak voor morgen: offerte sturen" |
| Obsidian: notitie schrijven/zoeken | ja | stem | "schrijf een notitie over het Strato-plan" |
| Telefoon bekijken/bedienen | ja, met goedkeuring | stem | "wat staat er op mijn telefoon?" |
| Lampen (SmartThings), ring, gewoontes, inkomsten | ja | stem | "log 12,50 van Prime Opinion" |
| Portal (foto/bestand/klembord naar de Mac) | ja | klik/slepen; geen stem | |

## Nog niet met je stem (de gaten)

- Instellingen, inclusief het wekwoord aanzetten.
- Portal: iets naar de Mac gooien.
- Goedkeuren van ingrijpende dingen (bewust: klik).
- Een workflow (n8n) bouwen en de directe GitHub-wijziging: de code is er,
  maar elke route komt er niet meer bij.

## Gemeten (20 nov 2026)

- Getypt "open settings", "open managers", "open de taken" werd een
  developer-taak op de VPS; "open trading" een Trading Agent-taak. Opgelost
  (`07a2fad0`): in de preview opende "open trading" de Trading-tab.
- De stem had geen tool om een tab, de Home-weergave of de notch te openen.
  Opgelost (`1f80a058`, tool `open_tab`): "agenda" opende Calendar,
  "terrain" zette Home op Terrain.
- "zet vrijdag 19:30 diner in mijn agenda" getypt: alleen de agenda
  voorgelezen (tier 1). Opgelost: in de preview gaf hij "Done: ... is in
  your calendar" en de afspraak stond op vrijdag 19:30 (testafspraak daarna
  weer weggehaald).
