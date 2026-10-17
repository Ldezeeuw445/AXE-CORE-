# Device Manager — telefoonontwerp

Status: **ontwerp only**. Geen productcode in dit document. De native A17-lockscreen
is **final** en blijft buiten deze bouw.

Doel: Luka kan vanaf de Samsung A17 (384×832 CSS-px, `com.axecore.core` WebView)
alles doen wat hij op de Tauri-desktop doet, behalve geld: **geen orders, geen
sends, geen transfers**.

De app is dezelfde HQ-bundel (`build-web.sh` kopieert deze build). De schil is
native (lockscreen, process, WebView-vlag `__AXE_ANDROID__`). Alles ná swipe is
web. Daarom moet de web-laag aanvoelen als één Android-app: randloos, 44px
tikdoelen, matzwarte kaarten, geen tweede particle-bol.

---

## 1. Navigatiemodel

Vijf primaire tabs onderin, overal hetzelfde, plus **More**:

| Tab | Route | Wat |
|---|---|---|
| Home | `/mobile` | Telefoon-Home: één `TelefoonSphere`, agents, chat/composer |
| Desk | `/maps-3d` | NorthSea Desk |
| Agents | `/agents` | Live status, wat ze doen, Approve/Decline |
| Trading | `/trading` | Read-only markten en posities |
| More | sheet | Alle overige tabs, groepen, zoek |

Regels:

- Maximaal vijf primaire items. Nooit een zesde in de onderbalk.
- More is een onderblad (niet een tab met eigen route). Zoek + groepen uit
  `mobileMenu.ts`.
- Tikdoel ≥ 44 CSS-px. Safe-area alleen: boven statusbalk, onder home-indicator.
- Geen platen/kaders om tabs. Alleen Home mag de bestaande glasplaat houden
  (die is final). Andere tabs: edge-to-edge.
- Composer blijft op Home. Op andere tabs: dezelfde composer als dock, mic
  alleen op tik.

Unlock:

```
native lockscreen (final)  --swipe up-->
  [cijfer-PIN, alleen als ingesteld]  -->
  /mobile
```

Geen PIN, gebaar-restant of dichte opslag: swipe gaat meteen naar Home.
Nooit een particle-canvas na het slot.

---

## 2. Router → mobiel scherm

Bron: `src/app/App.tsx` (AppShell-routes) + `navRegistry.ts`.

| Desktop-route | Label | Mobiel scherm | Primaire plek |
|---|---|---|---|
| `/` | Home (desktop) | Redirect naar `/mobile` | — |
| `/mobile` | Phone Home | Home | Tab Home |
| `/lock` | Lock Screen | Native glance is de lock; web-glance alleen preview | More → Phone |
| `/lock/pin` | Android PIN | Cijfer-keypad, geen canvas | Na swipe, indien PIN |
| `/agents` | Agents | Lijst + live status + OK-kaart | Tab Agents |
| `/maps-3d` | Northsea Desk | Deal-lijst, geen 3D-plaat | Tab Desk |
| `/trading` | Trading | Read-only posities/koersen | Tab Trading |
| `/trading-intel` | Trading Intel | Research, geen orderknop | More → Trading |
| `/tasks` | Tasks | Open / over tijd / follow-ups | More → Command |
| `/calendar` | Calendar | Agenda, daglijst | More → Command |
| `/cron-manager` | Cron Manager | Schema's, pause/run | More → Command |
| `/ledger` | Ledger | Run-log, read-only | More → Command |
| `/crewai` | CrewAI | Crew-status | More → Command |
| `/ai-core` | AI Core | Core-status, geen tweede bol | More → Intelligence |
| `/memory` | Memory | Hubs, recente herinneringen | More → Intelligence |
| `/memory/explore` | Memory explore | Terrain-lijst i.p.v. 3D | More (via Memory) |
| `/memory/trading` | Trading Memory | Lessen/beslissingen | More → Intelligence |
| `/obsidian` | Obsidian | Vault-lijst, recente notes | More → Intelligence |
| `/knowledge` | Knowledge Base | Docs-lijst | More → Intelligence |
| `/thinkthanks` | THINKTHANKS | Inbox / drops | More → Intelligence |
| `/eve` | EVE | Skills, geen editor | More → Intelligence |
| `/finance` | Finance | Saldi, geen send | More → Trading |
| `/mcp` | MCP | Servers + health | More → Systems |
| `/infrastructure` | Infrastructure | Mac mini / iMac / VPS | Tab via Systems in More |
| `/control-plane` | Control Plane | Schedules + taken | More → Systems |
| `/table-editor` | Table Editor | Tabellen, read-first | More → Systems |
| `/terminals` | Terminals | Hosts + remote acties | More → Systems |
| `/terminal` | Terminal | Alias; zelfde als `/terminals` | verborgen |
| `/computer-use` | Computer Use | Remote Mac-acties | More → Systems |
| `/developer` | Command Center | Status, geen zware IDE | More → Systems |
| `/code-editor` | Code Editor | Bestanden lezen; edits via taak | More → Build |
| `/browser` | Browser | URL + snapshot, geen viewport-in-viewport | More → Build |
| `/organization` | Organization | Org-boom | More → Build |
| `/apps` | Apps | App-grid | More |
| `/status` | Status | Health one-pager | More |
| `/device` | Device Manager (ADB) | Dit toestel | More → Phone |
| `/devices` | Devices | Inventory Mac/VPS/phone | More → Systems |
| `/settings` | Settings | Look, PIN, mic, keys | More → Phone |
| `/login` | Login | Buiten de schil | — |

Buiten de schil (geen telefoon-tab): `/float/notes`, `/float/phone`,
`/northsea-desktop`, `/browser-desktop`, `/computer-use-overlay`, alle
`/dev-*`. Die blijven desktop-vensters.

---

## 3. Per-scherm layout

Gemeenschappelijke schil (elke tab behalve lock/PIN):

```
[ safe-area top ]
[ titel 44px     look-toggle 44px ]
[ inhoud, scroll ]
[ composer-dock, alleen als de tab chat toelaat ]
[ tab bar 56px + safe-area bottom ]
```

Kaarten: matzwart (`--axe-kaart-vlak`), 1px lichte rand, bovenrand iets
helderder, zachte schaduw. Kleur in letters, niet in vlakken. Geen neon.

### Home (`/mobile`) — **visueel final, niet herontwerpen**

Bestaande TelefoonSphere, zes agent-tegels, chat, composer, onderbalk.
Mic alleen op tik. Composer-gloed volgt `voiceStatus`.

### PIN (`/lock/pin`)

Vol scherm, geen bol, geen canvas. Titel “Enter PIN”, vier stippen, 3×4
toetsen ≥ 56px. Continue alleen als opslag faalt.

### Agents

Secties: Waiting (Approve/Decline 44px), Working (wat ze doen), Idle.
Tik op een rij → detail: model, taak, laatste regel, OK-knoppen.

### Desk (NorthSea)

Lijst van deals: titel, stadium, bedrag, next action. Filterchips.
Geen 3D-kaart op 384px. Tik → dealkaart, geen send.

### Trading (read-only)

Markten (XAUUSD, BTCUSD, SPY, QQQ), open posities, P/L. **Geen Buy/Sell,
geen order-sheet, geen “send”.** Intel-link in More.

### Tasks / notifications

Open, over tijd, follow-ups. Bel opent hetzelfde onderblad. Elke rij kan
een agent-OK dragen: echte Approve/Decline, zelfde `GoedkeuringActie`.

### Systems (`/infrastructure` + `/devices` + `/terminals`)

Vier kaarten zoals de lockscreen: Mac mini, iMac, VPS API, VPS Models.
Per host: CPU/RAM/Disk, online-dot, last seen.

Remote acties (elk ≥ 44px, met bevestiging):

| Host | Acties |
|---|---|
| Mac mini | Wake, screenshot, open AXE, herstart worker |
| iMac | Zelfde |
| VPS API | Health, logs (tail), restart service |
| VPS Models | Health, welk model, **geen** model-load > limiet |

Geen SSH-console als primaire UI; Terminals is een lijst + “run command”
die een taak start, niet een tty op 384px.

### Memory

Hub-chips + recente episodes. Terrain/Neural als 3D blijven op Home achter
de wereldknoppen; More → Memory is de lijst.

### Settings

- Dark / light (`axe_look`: `black` / `glass`)
- Achtergrond-transparantie **per stand** (`axe_wp_dim_black`,
  `axe_wp_dim_glass`, blur idem) — bestaat in `useWallpaper`, moet hier
  een eerste-klas slider krijgen
- PIN zetten / wissen (cijfers)
- Mic: nooit auto; Hey AXE opt-in
- Wallpaper-preset

### More

Zoekveld, favourites, groepen (Command / Intelligence / Trading & deals /
Systems / Build / Phone). Elke rij 44px.

### Chat / voice

- Composer op Home + dock op andere tabs
- Mic start **alleen** op tik (of bestaande sneltoets op desktop)
- `voiceStatus=listening` → composer-gloed (`--axe-voice-alpha`)
- Barge-in stopt TTS; 12s stilte hangt op
- Geen tweede orb

---

## 4. Wat er is vs wat ontbreekt

| Onderdeel | Nu | Gat |
|---|---|---|
| Native lockscreen | Final, in de Android-app | Niet in deze repo aanraken |
| Swipe → Home | WebView startte `/lock/pin` (particle) | Gerepareerd: cijfer-PIN of Home |
| Telefoon-Home + één bol | `/mobile` + `TelefoonSphere` | Blijft |
| Onderbalk 5 tabs | `PHONE_TABS` | More-sheet is er, visueel ruw |
| Approve/Decline | `GoedkeuringActie`, 44px | Op Agents als primaire lijst, niet alleen bel |
| Look dark/light | `useLook` + zon/maan | OK |
| Transparantie per stand | `useWallpaper` keys per look | Geen duidelijke Settings-slider op telefoon |
| Cijfer-PIN | Net gebouwd | Geen Settings-UI om PIN te zetten |
| Systems-kaarten | Lockscreen-widget (native) + `/devices` | Remote acties (wake/restart) ontbreken |
| Trading | Volle desk met order-UI | Moet op telefoon read-only zijn (geen knop) |
| NorthSea | 3D/desk op smal scherm | Deal-lijst i.p.v. kaart |
| Memory 3D | Neural/Terrain op Home | Lijst-tab in More |
| Chat/voice | Composer + mic-tik | Gloed-koppeling testen op A17 |
| Computer Use | Desktop-overlay | Remote-actiekaarten, geen overlay |
| Code editor / browser | Desktop-breed | Alleen lijst + taak, geen IDE |
| Finance sends | Grootboek/finance | **Nooit** send/order op telefoon |

---

## 5. Gefaseerd bouwplan

Geen kalender. Volgorde op risico en wat Luka onderweg nodig heeft.

### Fase 0 — binnenkomen (deze wijziging)

Unlock zonder tweede bol. Cijfer-PIN als die er is. Guard-test op 384×832.

### Fase 1 — command from the pocket

1. Agents-tab als live lijst + Approve/Decline op de rij (zelfde component).
2. Bel → notifications-sheet (taken + OKs).
3. Systems-kaarten met health; remote acties achter bevestiging.
4. Settings: look + transparantie-sliders per stand + PIN zetten.

### Fase 2 — geld kijken, niet sturen

1. Trading-tab: koersen + posities; orderknoppen verbergen achter
   `isAndroidShellRuntime() \|\| isMobile`.
2. Finance: saldi only.
3. NorthSea: deal-lijst, geen send.

### Fase 3 — geheugen en desk

1. Memory-lijst in More.
2. Desk-tab: deals first, kaart later optioneel.
3. Cron/Tasks als dezelfde lijst-taal.

### Fase 4 — zware desktop-tabs

Code editor, browser, table editor, computer-use: alleen starten als taak
op mini/iMac, resultaat terug in chat. Geen tweede IDE op 384px.

Elke fase: Playwright A17 (één bol op Home, nul elders), geen nieuwe
particle-canvas, lockscreen en Home visueel ongewijzigd.

---

## 6. Visuele regels (niet onderhandelen)

1. Lockscreen-screenshot van Luka is de glance. Niet nabouwen in web.
2. Phone Home blijft de huidige `/mobile`.
3. Geen particle/canvas-bol behalve `TelefoonSphere` op Home.
4. Geen platen om niet-Home-tabs.
5. Matzwarte kaarten, dunne lichte rand, kleur in letters.
6. 44px tikdoelen. Approve/Decline interpunctie, geen icoon-only.
7. Engels in de UI. Nederlands in commits.
8. Geen orders, geen sends, geen money-move.

Mockups: `docs/device-manager/mockups/*.html` (statisch, 384×832).
PNG’s ernaast, dark (`*-dark.png`) en light (`*-light.png`). Regenereren:
`node docs/device-manager/mockups/shot.mjs`.

Unlock-flow (Playwright A17, echte app): `docs/device-manager/unlock-flow/`.
