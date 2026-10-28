# Device Manager native notifications

AXE Core events must arrive in `com.axecore.core` (Samsung A17) and in the
Tauri Mac app. They must **not** go through browser/PWA web-push
(`core_push_subscriptions` is empty; Settings "Turn on for this device" is
the wrong path).

This folder is a drop-in for the private `Ldezeeuw445/axe-core-android` repo.
This cloud session cannot clone that repo.

## What the phone hears

Four events, same rule as HQ `src/domain/nativeMelding.ts`:

| Event | Typical `core_notifications.message` |
|---|---|
| Approval needed | `Goedkeuring nodig: …` / `needs your OK` |
| Failed task | `Stuck: …` |
| Agent / task done | `Done: …` |
| NorthSea needs-your-OK | `Yes needed: DEAL-002 — …` |

No Settings opt-in. Android 13+ shows the system `POST_NOTIFICATIONS` prompt
once on first launch.

## Path (no paid service)

1. **App open** — HQ `NotificationContext` sees a new unread row (Supabase
   realtime + 30s poll), filters the four kinds, calls
   `__AXE_ANDROID__.notify(title, body, id)`.
2. **App closed** — `NotifyPollWorker` (WorkManager, every 15 min, network
   required) reads `/device/notifications` on the AXE Core API with a
   device token (hash in `core_axe_devices`). Dedup by row id. The anon
   key never leaves HQ.

Tauri (Mac) already posts via `tauri-plugin-notification` from the same
`kiesSysteemMeldingen` path. Unchanged, no Settings opt-in there either.

## Drop into axe-core-android

Copy:

- `AxePush.kt`
- `NotifyPollWorker.kt`
- `AxePushBridge.kt`

onto the existing `com.axecore.core.notify` package (replace the stub
`AxePush.kt` that notes there is no FCM sender).

On the existing `__AXE_ANDROID__` JavascriptInterface, add the three methods
from `AxePushBridge.kt` (or attach `AxePushBridge` next to the current
bridge).

In `Application.onCreate` or `MainActivity.onCreate`:

```kotlin
AxePush.ensureChannel(this)
AxePush.requestPermission(this) // first launch only; system prompt
AxePush.schedule(this)
```

`AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.INTERNET" />
```

Gradle (if missing):

```gradle
implementation "androidx.work:work-runtime-ktx:2.9.1"
implementation "androidx.core:core-ktx:1.13.1"
```

Replace `setSmallIcon(android.R.drawable.ic_dialog_info)` with the AXE
notification glyph when you have one (`R.drawable.ic_stat_axe`).

## Rebuild and install on the A17

HQ must already contain this commit (`orchestrator` after merge, or this PR
branch for a trial APK):

```bash
git clone https://github.com/Ldezeeuw445/axe-core-android.git
cd axe-core-android
# paste AxePush.kt, NotifyPollWorker.kt, wire AxePushBridge
./build-web.sh          # bundles current HQ into the APK
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Package id: `com.axecore.core`.

First launch: Android permission sheet → Allow. Open HQ once while signed in
so `__AXE_ANDROID__.setNotifyPoll` stores the device token. After that the
worker runs with the screen off.

Prove it: in Settings (desktop) or by inserting a row:

```
Yes needed: DEAL-002 — test: if this reaches the A17 shade, native poll is live.
```

Do **not** use Settings → "Turn on for this device" on the phone. That is
web-push and there is still no sender with subscriptions.

## Also deploy

| Where | What |
|---|---|
| HQ `orchestrator` | this commit (autosync rebuilds the Mac app) |
| VPS `api.axecompanion.com` | `python3 scripts/vps_sync.py deploy` — `/device/notifications` must be live before the new APK |
| A17 APK | rebuild as above; web-only HQ deploy does **not** change the installed Device Manager |
| Supabase | `core_axe_devices.device_token_hash`; apply `20261028120000_core_anon_dicht.sql` **after** HQ + APK + API |
