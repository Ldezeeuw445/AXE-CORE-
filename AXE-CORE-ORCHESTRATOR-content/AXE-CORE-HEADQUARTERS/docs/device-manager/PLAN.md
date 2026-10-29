# Device Manager — plan om hem de beste mobiele device manager voor AXE te maken

Opgesteld 29 okt 2026, op Luka's vraag: "kijken of de Device Manager wel echt de
nieuwste heeft, en een plan om hem een nog betere mobile device manager te maken
voor alles in AXE Core". DESIGN.md blijft het ontwerp van de schermen; dit is de
volgorde van bouwen, met wat er nu gemeten is.

## Waar hij nu staat (gemeten, niet aangenomen)

| | Stand | Bron |
|---|---|---|
| De APK op de A17 | Bundel van commit `4422452` (branch `cursor/phone-mobile-ui-39fb`). Die commit bestaat niet meer op GitHub en zat nooit op `orchestrator`. **Niet de nieuwste.** | `axe-core-android/PHONE.md`, GitHub |
| Welke build draait er | Was niet te zien: elke heartbeat zei `app_version 1.0.0`. Sinds `baf5c7a5` is het `1.0.0+<commit>`, zichtbaar vanaf de volgende APK. | `core_axe_devices` |
| Android-CI | Alle 12 runs `startup_failure`: de workflow start niet eens (waarschijnlijk het Actions-tegoed van de privé-repo). Er komt dus geen APK vanzelf. | GitHub Actions |
| Meldingen | Polling (`NotifyPollWorker`): 30 s op de voorgrond, 15 min op de achtergrond. Geen push. | `PHONE.md` |
| Mac mini (Tauri) | Stond sinds 28 okt stil op `axe-agent` / `2598a21e`; opgelost in `64fef881` (eigen worktree voor de bouwlus) en zichtbaar gemaakt in `39a07b21`. | computer-worker `system.info`, `git.status` |
| iMac (Tauri) | Actueel: `main-imac-luka`, `1.0.0+e9a79d93`. | `core_axe_devices` |

## P0 — altijd de nieuwste, vanzelf (deze week)

1. **De telefoon werkt zichzelf bij vanaf de Mac mini.** Een stap in
   `axe-autosync.sh`: staat de A17 aan via draadloze ADB (Android 11+:
   *Ontwikkelaarsopties → Draadloze foutopsporing*, eenmalig koppelen, daarna
   geen kabel meer) of USB, en zegt zijn heartbeat een andere commit dan
   `orchestrator`, dan `./build-web.sh --apk` en `adb install -r` met dezelfde
   sleutel. Alleen als de Mac stil is (zoals de app-build), en één melding:
   "Phone updated to <commit>" of waarom niet.
2. **Achterstand zichtbaar.** Device Manager en de Daily Brief tonen per toestel
   "draait X, N commits achter" in geel of rood, uit `app_version`.
3. **Android-CI weer aan** (Actions-tegoed of de build verplaatsen naar de Mac
   mini). Dan staat er bij elke merge een getekende APK klaar.

## P1 — één beheerscherm voor alle toestellen

4. **Elk toestel op één plek**: A17, Mac mini, iMac, iPhone-PWA, VPS, modelbox,
   DAX-containers. Per toestel: online, build en achterstand, schijf/cpu/geheugen
   (bestaat al via de tunnel), laatste fout, en knoppen.
5. **Knoppen die echt iets doen**, via de bestaande transporten (`core_tasks`,
   geen open poorten): app openen op dat toestel (`axe_shell`, bestaat sinds
   `baf5c7a5`), AXE herstarten, bijwerken nu, opruimen nu (`mac_opruimen.py`),
   worker herstarten.
6. **Echte push in plaats van polling**: UnifiedPush met een eigen ntfy op de VPS
   (geen Google-account nodig) of FCM. Meldingen binnen een seconde, minder
   batterij.

## P2 — de telefoon als volwaardig AXE-toestel

7. **Daily Brief en goedkeuringen op het slotscherm en als widget**: de kleuren
   van `/brief` (groen, blauw, geel, rood) in één oogopslag, met Approve/Decline.
8. **Offline eerlijk**: Gemma 1B op het toestel bestaat; de app toont wat in de
   wachtrij staat en wat al verstuurd is.
9. **Toestel-vermogens voor agenten**: camera naar geheugen (bestaat), deel-menu
   "Send to AXE", locatie als Luka het aanzet.

## P3 — klaar voor gebruikers (SaaS)

10. Koppelen met een QR-code, toestel-tokens per gebruiker die roteren,
    toestelregels per gebruiker, en dezelfde Device Manager voor AXE Developer.

## Wat Luka nu één keer moet doen

- De Mac mini losmaken (eenmalig, daarna doet `64fef881` het zelf):
  `cd ~/AXE-CORE- && git checkout orchestrator && git pull --ff-only`
- Voor P0.1: op de A17 *Draadloze foutopsporing* aan en eenmalig koppelen met de
  Mac mini (`adb pair`), dan kan het bijwerken zonder kabel.
