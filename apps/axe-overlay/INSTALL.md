# AXE Overlay — installatie (Mac mini + iMac)

**Agent installeert dit niet.** Alleen jij (of een latere expliciete opdracht).

## Optie A — via AXE HQ (snel)

1. Bouw/update HQ zoals gebruikelijk (`npm run tauri:build` in HEADQUARTERS).
2. Start HQ één keer, open radial dock → AXE overlay (of `openZwevend('axe')`).
3. Venster: always-on-top, zichtbaar op alle Spaces. Plek wordt onthouden.

## Optie B — Login Items standalone

1. Op de Mac: `cd apps/axe-overlay` → volg README build.
2. Zet `.app` in Applications.
3. System Settings → General → Login Items → AXE Overlay.
4. Herstart of open de app; notch verschijnt bovenaan.

## Check

- Notch ~54px hoog, starry dark, witte blob in het midden.
- Klik blob of chat-icoon → panel met PDF-chip + Continue….
- Always on top boven Safari/Slack.
