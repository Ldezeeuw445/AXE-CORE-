# ONTWERP — de Samsung als AXE device manager

Luka's vraag: *"een AXE Core device manager voor mijn Samsung — die heeft het er
al op, maar het is nog lang niet goed — zoals de nieuwe black look, en zodat ik
met die telefoon ook alles kan."*

Dit is de spec bij de maquettes in deze map. Open `index.html`; de schermen in
`schermen/` zijn de bewijsschoten op 1728×1080 in black. Alles hieronder is uit
code en docs in deze repo afgeleid; wat een vermoeden is staat als vermoeden.

---

## Wat er nu op de telefoon staat

Gemeten in de repo (ECOSYSTEM.md, `docs/archief/MOBILE_SYSTEM.md`,
`SESSION_HANDOFF_2026-08-19.md`, `src/**`). Niet gemeten: de telefoon zelf.

| Laag | Wat het is | Waar de code staat |
|---|---|---|
| **Native schil** | Kotlin/Compose-app `com.axecore.core`. Bevat de web-bundel van deze repo (build met `ANDROID_SHELL=1` via `build-web.sh`) en serveert die op `appassets.androidplatform.net`. Injecteert `__AXE_ANDROID__` (openApp, hasApp, openHomeScreen, axeCoreApiKey). | `~/Downloads/AxeCore` op Luka's Mac — **geen git remote, niet in deze repo** |
| **Zes tabs in Kotlin** | `CORE CHART ALGO WEB CODE APPS`. Vijf openen een route van de web-bundel; **APPS is `MoreScreen()`**, een native launcher (eigen apps in kleur via `AXE_PACKAGES`, pins, "not installed yet" met Play-zoekopdracht, widgets pinnen, wallpaper `#030405`). De app opent op APPS. | Kotlin, alleen op de Mac |
| **Lock screen** | `AxeLockHeader`: kaarten met open taken/goedkeuringen, Algo-equity met leeftijd; verdwijnen niet bij nul ("All clear"). Telling via `taskStatus.ts`, gespiegeld in `Awareness.kt`. | Kotlin + `src/domain/tasks/taskStatus.ts` |
| **Offline brein** | Gemma 3 1B q4 (657 MB) op het toestel; VPS wint altijd, dit is alleen fallback. `OfflineQueue` bewaart verzoeken zonder signaal als durable tasks. | Kotlin; `src/infrastructure/gateways/onDeviceModel.ts` |
| **Sleutel** | De API-sleutel zit niet in de APK; de schil haalt hem na inloggen en biometrische poort uit Supabase en geeft hem via de bridge. | `src/infrastructure/config/apiUrl.ts` |
| **`#/mobile` in de web-bundel** | `MobileSystem.tsx`: vier tabs Trade / Crew / Code / System. Trading-desk-status, Algo arm/stop met `window.confirm`, trading crew via `/crew/run`, live infrastructuurchecks, links naar Code Studio, Settings en Memory Terrain. Ook `start_url` van `public/manifest.json` (PWA). | `src/presentation/pages/MobileSystem.tsx` |
| **Telefoon als tool** | `PHONE_LOOK` / `PHONE_DO`: kijken en tikken op de Samsung via adb, vanaf de **Mac** (`infra/axe-local-bridge/adb.mjs`). Kan per definitie niet vanaf de telefoon zelf. | `src/domain/tools/phoneCatalog.ts`, `phoneBridgeService.ts` |
| **Claude op de Mac** | Relay via `core_tasks` (`capability='claude_local'`): de telefoon schrijft een taak, de Mac claimt en antwoordt. Geen inbound poort. | `infra/claude-local-worker` |
| **Andere apps op het toestel** | `com.axonmemory.app` (TWA), Companion-TWA gebouwd maar wacht op Luka's signering. | ECOSYSTEM.md |

Het toestel heet in de docs een **Galaxy A17** (viewport 384 px breed);
de opdracht zegt S24-klasse. De maquettes zijn op 412×915 getekend, één kolom,
en overleven 384 zonder aanpassing.

### Wat er "nog lang niet goed" aan is — afgeleid, niet gemeten op het toestel

1. **Twee UI-talen door elkaar.** `MobileSystem.tsx` heeft een eigen zwart
   (`#000`), eigen kaartkleur (`#080a0b`), gevulde cyaan knoppen en een nav met
   gevulde vlakken — precies wat `UI-MAATSTAF.md` regel 4 en 5 verbieden. De
   Kotlin-launcher heeft weer een eigen stijl. Niets daarvan is de black look.
2. **Twee navigaties in elkaar.** Zes Kotlin-tabs onderin, en binnen CORE nog
   eens de vier web-tabs van `#/mobile`. Wat de telefoon toont is niet wat de
   web-app toont (ECOSYSTEM: "The phone's tabs are not the web app's tabs").
3. **De nav van `#/mobile` breekt waarschijnlijk op een telefoon.** De vier
   tabknoppen staan in `repeat(auto-fill, minmax(230px, 1fr))`; op 360 px
   binnenbreedte past er één kolom, dus vier knoppen van 56 px onder elkaar.
   Vermoeden uit de code — niet op het toestel gezien.
4. **De rest van de desktop is er niet.** Memory, Agents, Settings, Link
   bestaan op de telefoon alleen als link naar de desktoppagina, die niet voor
   een duim is gemaakt.
5. **Geen device manager-inhoud.** Accu, netwerk, opslag, welke AXE-diensten
   op het toestel draaien: nergens zichtbaar. Alleen de launcher en de
   lock-kaarten zijn echt "beheer".
6. **De native code staat op één Mac, zonder git.** Elke wijziging daar is
   onzichtbaar voor deze repo en voor andere sessies.

---

## Wat de device manager is, en wat niet

**Is:** de laag die op de Samsung staat en drie dingen doet — tonen wat de
Mac en de VPS aan het doen zijn, goedkeuren wat op Luka wacht, en de telefoon
zelf beheren (launcher, lock-kaarten, widgets, status van het toestel). Dezelfde
web-bundel, hetzelfde geheugen, dezelfde providers via de VPS. Zelfde materiaal
als de desktop: plaat, kaart, ruit; kleur in letters en stippen; onderglow
alleen op wat actief is.

**Is niet:** een tweede AXE. Er draait geen agent op de telefoon, er staat geen
sleutel in de APK, er gaat geen provideraanroep rechtstreeks naar buiten.
Gemma 3 op het toestel blijft fallback. De telefoon kan de Mac niet besturen
(adb loopt andersom) en hoeft dat ook niet.

---

## De schermen

Vijf tabs, in web en native dezelfde: **Device · Chat · Core · Link · Settings**.
Alles wat op de desktop een eigen tab is, is hier een kaart binnen een van die
vijf. Composer met stem-orb onderin op elke tab; de orb is violet en gloeit
alleen als hij luistert.

| Pagina | Schermen | Wat het laat zien |
|---|---|---|
| `device.html` | Lock screen · Device · Apps | Op het slot: klok, de bol, "Waiting on you", Algo, Tasks — nooit weg bij nul. Device: bol klein als "live", accu/opslag/netwerk, wat AXE op het toestel draait (bundel, Gemma, offline queue, lock-kaarten), eigen apps als tegels. Apps: de huidige launcher behouden — eigen apps in kleur, pins, "not installed yet" via Play-zoek, widgets en wallpaper. |
| `chat.html` | Chat · Voice · Approve | Dezelfde chat als op de desktop: antwoorden zijn kaarten met knoppen; tool-chips boven de composer. Voice: de bol als scène, luistervenster in ruit erover. Approve: de hoofdtaak van de telefoon — één kaart met alle cijfers en redenen, Approve/Reject in letters. |
| `werk.html` | Core · Trading · Agents | Overzicht: Trading OS-status en equity, geheugenteller met de vier lenzen (Core/Neural/Terrain/Architecture), agents die draaien, vandaag. Detail: één paar met lijn, Algo 24/7 arm/stop, posities, en de ledger-rij met de waarschuwing over het run-label (`brain/handel.md`). Agents: wie draait waar, Claude-relay, de leerlus die alleen van trading leert. |
| `verbinding.html` | Link · Pair · notitie | VPS eerst (val 5: alles gaat erdoorheen; rood zegt "jouw box"), Mac via relay, Supabase, wat lokaal blijft. Koppelen in vier stappen: zelfde account → biometrie → sleutel na ontgrendelen → toestel vertrouwen. De notitie naast de telefoons is de tabel "wat waar draait". |
| `instellingen.html` | Providers · Voice & alerts · Look & security | `settings.html` gevouwen tot een lijst: rood met reden en actie; lokaal model op het toestel; stem en meldingen (goedkeuringen komen altijd door); look volgt de Mac; biometrie, goedkeuren vanaf dit toestel, vergeten. |

Toestel: Galaxy S24-klasse, 412×915 CSS px, gecentreerde punch-hole, gelijke
randen, hoek 30/38. Frame en telefooncomponenten staan in `mobiel.css`; het
chroom (statusbalk, composer, dok van vijf, gebarenbalk) in `mobiel.js`.
`tokens.css` en `toekomst.js` zijn ongewijzigd hergebruikt.

---

## Hoe het gebouwd kan worden

Drie routes; de eerste is de aanbeveling.

### A. De bestaande Kotlin-schil houden, de web-bundel doet het werk (aanbevolen)

De schil is er al, werkt, en doet precies wat een browser niet kan: launcher,
lock-kaarten, widgets, biometrie, sleutelbeheer, Gemma, offline queue. De
web-bundel is dezelfde als op de Mac, dus alles wat in `src/` in black wordt
gezet komt gratis mee.

Wat er verandert:
- **Eén navigatie.** De Kotlin-bottom-nav wordt vijf tabs (Device · Chat ·
  Core · Link · Settings) of verdwijnt en laat de web-bundel de dok tekenen.
  De launcher (`MoreScreen`) wordt de Apps-kaart binnen Device, of blijft
  native maar in het nieuwe materiaal.
- **`#/mobile` wordt de Device-tab** en krijgt de tokens uit `axe-look.css` in
  plaats van eigen kleuren. Chat, Core, Link, Settings zijn mobiele
  weergaven van bestaande pagina's, niet nieuwe pagina's.
- **De bridge krijgt drie lezende methoden bij:** `deviceStatus()` (accu,
  netwerk, opslag, geheugen), `axeServices()` (Gemma geladen, queue-lengte,
  widgets gepind) en `installedApps()` — zodat de Device-tab in de web-bundel
  kan tekenen wat nu alleen Kotlin ziet. Alleen lezen; tikken blijft via de
  Mac.

Voor: geen nieuwe stack, pariteit blijft automatisch, alles wat native al klopt
blijft. Tegen: de Android-code moet **eerst in git** (nieuwe repo of map in
deze repo), anders is elke wijziging onzichtbaar en niet te reviewen; bouwen
kan alleen op de Mac met Android Studio's JDK.

### B. Capacitor of Tauri Mobile om dezelfde bundel

Dezelfde React-bundel in een generieke schil, met plugins voor accu, netwerk,
biometrie, widgets.

Voor: schil in TypeScript, in deze repo, door elke sessie te bouwen. Tegen: wat
de Kotlin-schil nu al doet (lock-kaarten, launcher met PackageManager,
widgets, on-device Gemma, sleutel na biometrie) bestaat in Capacitor niet
kant-en-klaar en moet opnieuw als plugin; Tauri Mobile is voor Android nog
jong. Netto: herbouw van wat werkt.

### C. PWA op Android

`public/manifest.json` wijst al naar `#/mobile`; installeren via Chrome kan nu.

Voor: nul native code, elke deploy is meteen live. Tegen: geen launcher, geen
lock-kaarten, geen widgets, geen biometrische poort voor de sleutel, geen
on-device model, geen pakket-zichtbaarheid. Dat is precies het "device
manager"-deel. Bruikbaar als noodknop, niet als de weg.

---

## Wat op de telefoon lokaal moet, wat via de VPS

| Wat | Waar | Waarom |
|---|---|---|
| Chat, agents, geheugen, provideraanroepen | **VPS** (`api.axecompanion.com`) | val 5 uit AGENTS.md; sleutels wonen daar |
| Trading-engines, ledger, Algo 24/7 | **VPS** | draaien er al; de telefoon toont en keurt goed |
| Claude Code, adb-acties op de telefoon | **Mac**, via `core_tasks`-relay / adb | loopback-only bij ontwerp; de telefoon schrijft een taak |
| Sessie, instellingen, taken, goedkeuringen | **Supabase** (gedeeld project) | zo volgt de telefoon de Mac zonder eigen sync |
| Launcher, lock-kaarten, widgets, wallpaper | **telefoon**, native | alleen Kotlin kan bij PackageManager, lock screen, AppWidget |
| Accu, netwerk, opslag | **telefoon**, native → bridge | alleen lezen; de web-bundel tekent het |
| Gemma 3 1B, offline queue | **telefoon**, native | fallback en buffer; nooit een peer van de VPS |
| API-sleutel | **telefoon**, in geheugen na biometrie | nooit in de APK, nooit op schijf |

---

## Fasering

1. **Android-code in git.** `~/Downloads/AxeCore` als repo (of `android/` in
   deze repo), met `build-web.sh` erbij. Zonder dit is stap 2–4 niet te
   reviewen. Bewijs: `git remote -v` op de Mac toont een remote.
2. **Tokens op de telefoon.** `MobileSystem.tsx` en de Kotlin-launcher naar
   `axe-look.css`-tokens; de nav van `#/mobile` repareren (één rij van vijf).
   Bewijs: screenshot van de Device-tab op het toestel naast
   `schermen/device-black.webp`.
3. **Eén navigatie.** Vijf tabs, in Kotlin en web hetzelfde; `MoreScreen` in
   het nieuwe materiaal of als kaart binnen Device. Bewijs: de tab die je op de
   telefoon aantikt is de route die de web-bundel toont (log in
   `AxeWebView.kt`).
4. **De bridge leest het toestel.** `deviceStatus`, `axeServices`,
   `installedApps` op `__AXE_ANDROID__`, gewrapt in `androidAppsBridge.ts`,
   met `androidShellAvailable()` als poort zodat de desktop niets toont dat
   niet werkt. Bewijs: de accu-waarde op het scherm verandert als je de lader
   eruit trekt.
5. **Approve als eerste burger.** Goedkeuringskaart (trade, patch) in Chat en
   op het slot, met push-melding. Bewijs: een `PHONE_DO`- of trade-goedkeuring
   vanaf de Mac verschijnt binnen vijf seconden op de telefoon en het antwoord
   komt terug in `core_tasks`.
6. **Core, Link, Settings mobiel.** Mobiele weergaven van bestaande pagina's,
   tegen de maquettes gehouden. Bewijs: screenshot per tab naast de webp.

Elke fase eindigt met een schot van het echte toestel naast de maquette. Klopt
het niet, dan is de maquette de maatstaf.

---

## Wat ik niet weet

- **Of de native app nu werkt zoals ECOSYSTEM.md beschrijft.** Alles over de
  Kotlin-schil komt uit docs van 19–22 augustus; de code zelf staat niet in
  deze repo en is niet gelezen.
- **Welk toestel het is.** Docs zeggen Galaxy A17 (384 px breed); de opdracht
  zegt S24. Het ontwerp is één kolom en past op beide, maar de frame-tekening
  is S24.
- **Of de nav van `#/mobile` echt stapelt op de telefoon.** Afgeleid uit
  `minmax(230px, 1fr)` op een viewport van 384; niet gezien.
- **Of `build-web.sh` en de bridge-methoden nog dezelfde namen hebben** als in
  `apiUrl.ts` en `androidAppsBridge.ts` verwacht wordt — te controleren op de
  Mac met `adb shell dumpsys package com.axecore.core`.
- **Hoe de lock-kaarten en widgets precies getekend worden.** Ik ken hun
  inhoud (ECOSYSTEM.md), niet hun huidige uiterlijk; de maquette tekent ze in
  het nieuwe materiaal.
- **Of de Companion-TWA inmiddels gesigneerd en geïnstalleerd is.** Op 22
  augustus wachtte hij op Luka's keystore-wachtwoord.
