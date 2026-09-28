# AXE CORE Native — single runtime contract

This is the production rule for the desktop app.

## One app

The only user-facing desktop bundle is:

`/Applications/AXE CORE.app`

Do not rename the product/bundle identifier just to distinguish a new build. Keeping the stable `com.axe.core` identity preserves macOS permissions and signing/TCC continuity.

Feature branches use `npm run tauri:dev` for interactive testing or `npm run tauri:check` for a native compile check. `npm run tauri:build` is guarded and refuses to create an installable bundle unless the canonical updater invokes it on `orchestrator`.

The canonical update path is:

`npm run bijwerken`

and it refuses to run unless the checkout is exactly `orchestrator`.

## What one canonical update owns

A successful canonical update now owns the whole local AXE runtime:

1. clean `orchestrator` checkout + pull;
2. npm dependencies;
3. stable AXE code-signing identity (no adhoc canonical builds);
4. AXE Computer Use native helper;
5. AXE Camera helper;
6. local Python runtime used by AXE API/browser agent;
7. Tauri release build;
8. `/Applications/AXE CORE.app` replacement;
9. removal of the duplicate release .app inside the build directory;
10. `com.axe.computer-worker` launchd registration pointing at this checkout;
11. `com.axe.browser-agent` launchd registration pointing at this checkout;
12. worker health;
13. launch of the one `/Applications/AXE CORE.app`.

The Tauri process itself owns and monitors the local terminal server and local AXE API.

## Fail closed

The update aborts instead of opening a half-current AXE when:

- the working tree is dirty;
- the checkout is not `orchestrator`;
- the stable AXE signing identity is unavailable;
- native helper compilation/signing fails;
- local runtime dependency preparation fails;
- the Tauri build fails;
- the installed app signature or embedded build stamp is wrong;
- a canonical launchd worker cannot be registered/running.

Local Tauri Computer Use tasks carry the running app build SHA. The computer worker compares it with its own source SHA and refuses the task on mismatch. Remote phone/web clients are exempt because remote control intentionally crosses deployments.

## Personal Computer Use contract

Personal Computer Use is device-scoped, not git-workspace-scoped.

Observe:
- current screen via a fresh capture + vision;
- displays;
- pointer position;
- visible apps/windows;
- Desktop/Documents/Downloads;
- camera snapshot;
- Screen Recording / Accessibility readiness.

Act (approval-gated):
- pointer move/click/double/right-click/drag/scroll;
- keyboard typing / key combinations;
- app open/focus.

Every meaningful GUI sequence is:

`observe current pixels → choose one bounded action → execute → observe current pixels again`.

Screen captures are placed only in private storage long enough for vision and are deleted best-effort immediately after inspection.

## macOS permissions

The stable helper identity is `com.axe.core.computer-use`.

It owns:
- Screen Recording
- Accessibility

The camera remains the stable `AXE Camera.app` helper and owns Camera permission.

Permissions are per Mac. Granting them on the iMac does not grant them on the Mac mini.

## Presence contract

Every canonical AXE composer:

- silent/idle: existing colorful outer `pulse-outside`;
- actual mic/TTS audio energy: outer pulse smoothly yields to inner VoiceBeam;
- silence: VoiceBeam releases and colorful outer pulse returns.

Personal Computer Use additionally has its separate mono outer shell pulse.

The transition is based on measured RMS audio energy, not merely the boolean listening/speaking state.
