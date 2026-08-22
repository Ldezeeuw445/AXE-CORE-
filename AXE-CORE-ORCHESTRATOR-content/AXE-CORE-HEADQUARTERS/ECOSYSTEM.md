# Luka's apps — what exists, where it lives, how it ships

**Read this before touching anything.** Every fact here was measured on
2026-08-22, not remembered. Where something is a guess it says so.

This file exists because the same misunderstandings kept costing whole
afternoons: work done in the wrong repo, a "deploy" that deployed nothing,
"Vercel" long after Vercel stopped being used, and a green CI badge taken as
proof that a site was up.

---

## The four apps at a glance

| App | What it is | Source of truth | Ships to |
|---|---|---|---|
| **AXE CORE** | The hub. Desktop app (Tauri) + Android device manager | `Ldezeeuw445/AXE-CORE-`, branch **`orchestrator`** | Tauri `.app` on the Mac, APK on the Samsung |
| **AXE Companion** | Trading/intel web app, Next.js | `Ldezeeuw445/AXE-COMPANION-OS-`, `main` | Vercel today — **being moved to Cloudflare** |
| **Trading OS** | Bloomberg-grade desktop trading terminal | `Ldezeeuw445/TRADING-OS-`, `main` | *(not confirmed — last push 2026-05-03)* |
| **Axon Memory** | Standalone product: one memory layer for every AI | **two separate codebases**, see below | Cloudflare Pages |

**Nothing here is on Vercel by choice any more.** AXE Companion is the last one
still on it and it is mid-migration. Do not add Vercel to anything.

---

## Which Supabase

Measured from the `.env` files, because this is the one that gets assumed wrong:

```
AXE CORE        pqnngpcgbdwxavbatbia   ← shared
AXE Companion   pqnngpcgbdwxavbatbia   ← shared, same project
Trading OS      pqnngpcgbdwxavbatbia   ← shared (per Luka; not verified in a file)
Axon Memory     ktaditgtbubonrahyiig   ← its OWN project
```

The first three share one database on purpose: that is what lets AXE CORE work
on the other two — read their data, write their code, drive them. Axon Memory
is a separate product with separate customers and does not belong in that
database.

Two user ids exist in the shared project and mixing them yields a bare 500:

- `AXE_USER_UUID` — for `uuid` columns (`messages`, `user_settings`, `core_tasks`)
- `AXE_USER_ID` (suffixed `-axe-core`) — **only** for `global_memory`'s text column

---

## AXE CORE

The hub. Everything else is worked on *from* here.

**Where the code actually is.** Not the repo root — a kilo worktree:

```
/Volumes/EagetSSD/AXE-CORE-/.kilo/worktrees/unequaled-louse/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
```

Branch **`orchestrator`**, not `main`. There is also
`/Volumes/EagetSSD/AXE-CORE--1/` and `~/Downloads/AXE-CORE-desktop` — **older
copies**. Editing those changes nothing anyone will ever see.

### Two VPSes, and only one runs the API

| Host | Domain | Runs | Notes |
|---|---|---|---|
| **212.227.91.79** | `api.axecompanion.com` | The real `axe-core-api` (12 uvicorn workers), the task worker, the browser agent, all four trading engines | This is production |
| **89.167.78.6** | `ollama.axecompanion.com` | Ollama, 16 models | Its stale July copy of `axe-core-api` was stopped and disabled 2026-08-20 — do not revive it |

SSH goes through the config entry, not the bare IP (the IP has no
`IdentityFile` and will fail with `Permission denied (publickey)`):

```bash
ssh api.axecompanion.com
```

### Deploying to the VPS

```bash
python3 scripts/vps_sync.py check     # always first
python3 scripts/vps_sync.py deploy
```

**Never** `infra/axe-core-api/deploy.sh` — it ships a stale directory and drops
`agent_loop.py`, which the running worker imports.

The guard maps each remote file to exactly one repo path and refuses to deploy
over box-side edits. `check` states IN SYNC / REPO AHEAD / BOX DRIFT / MISSING.

### Services on the API box

```
axe-core-api          12 workers, port 8001
axe-task-worker       durable task kernel
axe-browser-agent     port 8002, ONE worker — see below
```

`axe-browser-agent` is a separate single-worker service and must stay that way.
A Playwright page is a live connection held in process memory; when it ran
inside the 12-worker API, a session created on one worker was invisible to the
other eleven and the browser tab failed 92% of the time.

### The Android app

Separate repo at `~/Downloads/AxeCore`, **no git remote** — it exists on this
Mac only. It is a Kotlin/Compose shell that embeds the *same* web bundle as the
desktop app, so feature parity is automatic. It is also the **device manager**
for the Samsung.

```bash
cd ~/Downloads/AxeCore
./build-web.sh                       # builds the worktree, copies into assets
./gradlew assembleDebug
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`build-web.sh` sets flags that are not optional; building by hand ships a
service worker that cannot register on the WebView origin. Do not run the Vite
build directly for the APK.

Package id is `com.axecore.core` (not `com.axe.core` — an `adb` command aimed
at the wrong one fails silently).

### The Apps tab

`registered_apps` in the shared Supabase drives it. Four product surfaces ship
with the app; anything Luka adds himself carries `user_added = true`.

| Column | What it does |
|---|---|
| `icon_url` | The real logo. Falls back to initials, never a broken-image glyph |
| `android_package` | Launches the actual app on the Samsung via the Kotlin bridge |
| `prod_url` | Opened off-device, and used for the online check when there is no Vercel project |
| `user_added` | Hides "Improve", shows "Remove". Sorts to the end via `sort_order` 500 |

**A native app is not a deployment.** Ledger, Tangem and a bank app have no web
version worth opening — a link lands on a marketing page. The tile launches
them by package, and its badge says *Installed* / *Not installed* rather than
*Online* / *Failed*, because that is the only thing actually observable.

**A wrong package name fails exactly like an uninstalled app.** Android's
`getLaunchIntentForPackage` returns null for both, so the Add-app dialog checks
live on the phone and says which — before the row is saved.

Bridge methods on `__AXE_ANDROID__` (see `AxeWebView.kt`), wrapped for the web
in `src/infrastructure/gateways/androidAppsBridge.ts`:

```
openApp(pkg)      launch by package        → false when not installed
hasApp(pkg)       is it installed?
openHomeScreen()  the phone's own home screen, where the AXE widgets live
```

None of these exist on the desktop, and that is not a failure —
`androidShellAvailable()` is how the page hides a button instead of offering
one that silently does nothing.

### "Open tasks" — the trap that made the lock screen lie

`core_tasks.status` allows `done`, but **the durable worker never writes it.**
It writes `completed`. So the obvious filter —

```
.neq('status', 'done')
```

— looks like it excludes finished work and excludes **nothing**. A table of 6
completed, 3 failed and 1 cancelled task reported **"10 open"** on the phone's
lock screen, and the one genuinely stuck task was hidden inside that number
rather than standing out as the single thing waiting.

One definition now, in `src/domain/tasks/taskStatus.ts`, mirrored in
`Awareness.kt` because Kotlin cannot import it. **Change both together.**
It is stated as the *terminal* set, not the open set: a status added later is
far more likely to be a new kind of in-flight work, and for an awareness
counter the safer failure is showing something finished — not hiding work.

Full CHECK constraint, measured 2026-08-22:

```
pending queued planning in_progress running blocked waiting_approval
approved rejected verifying retrying done completed failed cancelled
```

### Building the APK needs a JDK that is not on PATH

`./gradlew` fails with *Unable to locate a Java Runtime* in a plain shell.
There is no system JDK; the one that works is Android Studio's:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
```

That is JDK 25, and it builds this app fine — worth remembering, because when
the Axon TWA failed on *Unsupported class file major version 69* the JDK was
blamed for four rounds. It was Gradle. This app was the working counter-example
sitting right next to it.

### The phone's tabs are not the web app's tabs

This one cost a whole round of work on 2026-08-22: the Apps tab in the web
bundle was rebuilt, shipped to the phone, and **nothing changed on the phone**,
because the phone was never showing that page.

`MainActivity.kt` routes the bottom nav — `CORE CHART ALGO WEB CODE APPS` —
and only five of the six open the web bundle:

```kotlin
"CORE"  -> AxeWebView(route = "")
"CHART" -> AxeWebView(route = "trading-intel?tab=chart&bare=1")
"ALGO"  -> AxeWebView(route = "trading-intel?tab=brain&nochart=1")
"WEB"   -> AxeWebView(route = "browser")
"CODE"  -> AxeWebView(route = "code-editor")
else    -> MoreScreen()          // ← APPS lands here. Native Kotlin.
```

**APPS is `MoreScreen()`** — a native launcher surface showing `AxeLockHeader`
plus every installed app from PackageManager, AXE's own in colour and the rest
desaturated. It is also the tab the app opens on. So:

- Changing `src/presentation/pages/AppsPage.tsx` changes the **desktop** Apps
  tab and nothing the phone displays.
- Putting an app in the phone's grid means **installing it on the phone**, not
  adding a row to `registered_apps`.
- To make it stand out there, its package id must be in `AXE_PACKAGES` in
  `launcher/InstalledApps.kt`.

A wrong id in that set fails silently and completely: the app still appears,
just desaturated and alphabetical among two hundred others — which reads as
"not installed" rather than "that string is wrong". Axon sat like that as
`com.axon.memory` while the installed TWA is **`com.axonmemory.app`**, the id
`registered_apps` already had right. Always check against the phone:

```bash
adb shell pm list packages | grep -i axon
```

Installed on the Samsung as of 2026-08-22: `com.axecore.core`,
`com.axonmemory.app`. Companion and Trading OS are listed in `AXE_PACKAGES`
ahead of time so they light up the day they land.

### Lock-screen cards must not hide at zero

`AxeLockHeader` cards used `takeIf { it.hasAnything }`. That is invisible while
a count is broken and never reaches zero — and the moment the awareness count
was fixed, the card vanished from the lock screen entirely and read as a
regression. Cards that answer a question ("what is waiting?") now render "All
clear" instead of disappearing.

### The Trading tab is not Trading OS

Worth stating plainly, because the names invite the mistake: the Trading tab
inside AXE CORE has **nothing to do** with AXE Companion or Trading OS. It
exists to build and test **AXE Algo** against Luka's own broker accounts.
Different product, different purpose.

---

## AXE Companion

Next.js 16 App Router. 78 API routes, 8 cron jobs, `middleware.ts`.

- Repo: `Ldezeeuw445/AXE-COMPANION-OS-`, `main`
- Migration branch: **`cloudflare-migration`**
- Manifest fix branch: `pwa-scope-fix`

**It is currently OFFLINE.** `axecompanion.com` answers:

```
HTTP 402 Payment required
x-vercel-error: DEPLOYMENT_DISABLED
```

Vercel disabled the deployment over billing. The site is not broken, it is
switched off. That also blocks the Play Store plan, because a TWA points at a
live origin.

Portability was measured before starting the migration:

- `middleware.ts` imports only `@supabase/ssr` and `next/server` — no Node APIs,
  which matters because Node-in-middleware is the one thing the adapter cannot do
- 0 of 78 API routes import `fs`, `node:` or use `process.cwd()`
- 46 routes declare `runtime = "nodejs"` — `nodejs_compat` covers them

Adapter is **`@opennextjs/cloudflare`**. `@cloudflare/next-on-pages` is gone
from the docs entirely. Next had to move 16.2.1 → 16.2.12: the adapter's peer
range is `>=15.5.21 <16 || >=16.2.11` and 16.2.1 sits in the gap.

Still to do: a scheduled handler (Cloudflare fires an event where Vercel hit a
URL), then deploy to `*.workers.dev`, verify, then move DNS.

---

## Axon Memory — TWO codebases, and this is the trap

This cost real work on 2026-08-22. They are different apps.

| | The APP | The LANDING PAGE |
|---|---|---|
| Repo | `Ldezeeuw445/axon-memory-app` (**private**), branch `main` | `Ldezeeuw445/axon-memory`, branch `main` |
| Working copy | `/Volumes/EagetSSD/axon-memory-2` | clone anywhere |
| Domain | `app.axon-memory.com` | `axon-memory.com`, `www.axon-memory.com` |
| CF project | `axon-app` | `axon-memory` |
| Page title | "AXON — Universal AI Memory" | "AXON — One memory layer. Every AI you use." |

The page title is how to tell them apart in one command.

### Neither is connected to GitHub

```
$ npx wrangler pages project list
axon-app      app.axon-memory.com      Git Provider: No
axon-memory   axon-memory.com, www.…   Git Provider: No
```

**`git push` deploys nothing.** Both are direct uploads. That is exactly how
the live site drifted away from its source and stayed there for months while CI
was green the whole time.

```bash
cd /Volumes/EagetSSD/axon-memory-2
npm run lint && npm run build
npx wrangler pages deploy dist --project-name axon-app --branch main
```

Then verify **against the site**, never a dashboard:

```bash
curl -s https://app.axon-memory.com | grep -o '<link[^>]*manifest[^>]*>'
```

See `axon-memory-2/ANDROID.md` for the phone.

---

## The Samsung

Three apps should end up in the Apps tab, opening as real apps:

| App | How | State |
|---|---|---|
| **AXE CORE** | Native Kotlin shell embedding the web bundle | Installed and working |
| **Axon Memory** | TWA via Bubblewrap → `app.axon-memory.com` | Config written, waiting on Luka's signing key |
| **AXE Companion** | TWA → its Cloudflare URL | Blocked until the migration lands |

A **TWA** holds no copy of the site — it is a signed shell around a live URL.
So for anything that is HTML, CSS or JS you **never rebuild the APK**: deploy,
reopen the app. Only the icon, name, package id or target URL need a rebuild.

`assetlinks.json` is the step that gets skipped. Without it the app opens with a
browser address bar across the top — it works, which is why nobody calls it a
bug. With it, tapping a link to that domain anywhere on the phone opens the
app instead of Chrome.

---

### A TWA aimed one route deep opens somewhere the website never opens

The Axon app on the Samsung dropped straight into the dashboard and skipped
the whole intro — the distant sphere, "Experience AXON", then Neural Link with
Connect Source / View Constellation. Nothing was broken. Bubblewrap had been
given `startUrl: "/dashboard"`, and:

```
/           -> <Landing />                      the intro
/dashboard  -> <FacetRedirect facet="dashboard" />   straight past it
```

So the installed app opened at a URL the website itself never opens on a cold
visit, and that reads as "the app is broken" rather than "it is aimed one route
too deep". Fixed to `/` in **both** `app/build.gradle` (what actually builds)
and `twa-manifest.json` (so a regeneration does not undo it).

`~/Downloads/AxonAndroid` is the Bubblewrap project. **Do not rebuild it with
`bubblewrap build`** — that asks "apply changes to the project?", and yes
regenerates from the template, reverting the Gradle fixes: Gradle falls back to
8.11.1, `jcenter()` returns, and you land on *Unsupported class file major
version 69* again. There is no twa-manifest field for the Gradle version, so
this cannot be configured away. Edit the generated project and run Gradle:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd ~/Downloads/AxonAndroid && ./gradlew assembleRelease
```

Then zipalign, sign with `android.keystore` (alias `axon`), and install. The
signature must keep matching the fingerprint in the live `assetlinks.json` —
`71:BC:D8:70:…:37:8C` — or the app loses its verified status and reopens with
browser chrome.

**"Running in Chrome" at the bottom is not a bug.** It is the one-time TWA
disclosure. Verify the real state instead of reading the UI:

```bash
adb shell pm get-app-links com.axonmemory.app     # want: verified
```

### One app, three spellings, all failing silently

Axon Memory was missing from the phone's launcher grid. It took three fixes
because the same package id was wrong in three places, and **every one of them
failed without an error**:

| Where | Said | Effect |
|---|---|---|
| `AndroidManifest.xml` `<queries>` | `com.axoncore.memory` | AXE CORE could not see the app at all |
| `launcher/InstalledApps.kt` | `com.axon.memory` | Seen, but desaturated and sorted with everything else |
| `registered_apps` (Supabase) | `com.axonmemory.app` | correct all along |

The phone reports **`com.axonmemory.app`**. Always check before typing one:

```bash
adb shell pm list packages | grep -i axon
```

**Package visibility is the part that surprises people.** On Android 11+
`queryIntentActivities` returns only what `<queries>` declares. A launcher
without a `MAIN` / `LAUNCHER` intent there sees almost nothing — and it does
not throw, the list just comes back near-empty, which reads as "those apps are
not installed". The narrow intent form is enough and avoids
`QUERY_ALL_PACKAGES`, which Play requires a declaration for:

```xml
<intent>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.LAUNCHER" />
</intent>
```

Two smaller traps hit on the way, both worth a minute of someone's life:

- **`--` is illegal inside an XML comment.** A dash used as punctuation in a
  manifest comment fails the build with only
  `ManifestMerger2$MergeFailureException: Error parsing …`, naming no reason.
- **A failed Gradle build leaves the previous APK in `outputs/`,** so
  `adb install` right after says `Success` and installs the *old* binary.
  Check `BUILD SUCCESSFUL`, or verify the change landed:
  `adb shell dumpsys package com.axecore.core | grep queriesPackages`.

### The APPS tab: pins, suggestions, and the phone's home screen

The native launcher (`MoreScreen` + `launcher/`) now has three layers:

1. **AXE's own**, in colour, from `AXE_PACKAGES` — core, axon, companion,
   trading-os, and **Claude** as the fourth in that row. Claude's id
   (`com.anthropic.claude`) is *unverified*: nothing Anthropic is installed on
   this phone. If its tile comes up grey, check `pm list packages` first.
2. **PINNED** — hold any tile to pin it. Order is the order pinned and
   survives a restart (`AppPins`, SharedPreferences, stored as a list not a
   set so the arrangement is kept). Pins for uninstalled apps are pruned from
   what the launcher already found, costing no extra query.
3. **NOT INSTALLED YET** — `SuggestedApps`, for apps Luka named that are not on
   the device. Opens a Play **search**, never `market://details?id=`: a direct
   link needs an exact package id, and a wrong one lands on "item not found"
   or on someone else's similarly named app. Given this repo's history with
   Axon's id, searching is the safer default.

**The phone's own home screen** can be set up from that tab: `requestPinAppWidget`
for the Core and Algo widgets (Android shows its own confirm dialog — that
prompt is the feature, not an obstacle) and a `#030405` wallpaper, the canvas
colour the rest of AXE draws on. Not pure black: against the cards' `#0B0C0D`
the widgets need a visible edge. `FLAG_SYSTEM` only, since the lock screen is
already AXE's own surface. Neither runs at startup.

### Scrollbars are hidden everywhere; scrolling still works

`index.css` used to give **every** element an 8px bar. This app nests
scrollers — a panel inside a tab inside a page — so several stacked on one
screen, each costing 2% of a 384px phone's width permanently. It also made
short lists look broken: a track appears the moment content is one pixel too
tall, so two extra rows read as "this is cut off".

- `.show-scrollbar` opts one element back in. Never make it global again.
- `.scroll-x` is the sideways row: momentum plus overscroll containment.
- Existing `overflow-x-auto` rows get the same manners via an attribute
  selector, rather than retrofitting a class into eight files and missing one.

Without `overscroll-behavior-x: contain`, flicking the Trading tab's row to
its end keeps going and starts dragging the page behind it.

**Anything with a hard pixel width must be capped.** Three dialogs carried
`w-[420px]` / `w-[380px]` on a 384px viewport. Cap with
`max-w-[calc(100vw-2rem)]` rather than adding breakpoints — the desktop size
is right, it just must never exceed the screen. The same class of bug put the
AI panel 20px past the right edge of every page: CSS parked it at
`translate-x-[380px]` while GSAP animated it to `x: 360`.

### Claude on the Mac, reachable from the phone

The Claude app on Android talks to Anthropic, **not** to the Claude Code on
this Mac — so installing it does not give "a local session I can reach from my
phone". `axe-local-bridge` cannot either: it is loopback-only by design.

`infra/claude-local-worker` relays through `core_tasks` instead, because both
ends already reach Supabase:

```
phone  →  core_tasks(capability='claude_local', status='pending')
mac    ←  claims it, runs `claude -p --continue`, writes result back
phone  ←  status='completed', result.text
```

No inbound port, nothing on the LAN, works anywhere the phone has signal.
Read-only tools by default (`AXE_CLAUDE_ALLOW_BASH=1` opts into Bash/Edit/Write),
one directory, started by hand, hard per-turn timeout. The claim is a
conditional PATCH on `status=eq.pending`; that filter is the lock that stops
two workers running the same prompt.

**First failure seen was not the relay:** `Failed to authenticate: OAuth
session expired`. That is the CLI on the Mac being signed out — run `claude`
once interactively, sign in, restart the worker.

### AXE Companion cannot be an app yet, and this is why

A TWA is a signed shell around a **live URL**. `axecompanion.com` answers:

```
HTTP 402  x-vercel-error: DEPLOYMENT_DISABLED
```

Vercel switched the deployment off over billing, so there is nothing for a TWA
to point at. Its package id (`com.axecompanion.app`) is already in
`AXE_PACKAGES` and in `<queries>`, so the tile lights up by itself the day it
is installed — no further app work is needed, and none is possible before then.

Also measured 2026-08-22: **the `cloudflare-migration` branch no longer exists**,
locally or on origin, and `main` has no `open-next.config.*` or `wrangler.*`.
The migration described earlier in this file is not in the checkout. Finishing
it means starting it: Next 16 App Router, 78 API routes, 8 cron jobs, with
`@opennextjs/cloudflare`.

## Rules learned the hard way

- **A 200 proves nothing on an SPA.** Every unmatched path returns
  `index.html`. `curl -s URL/manifest.json` returning 200 was read as "the
  manifest exists"; it was the fallback page.
- **A status must come from an observation.** "Configured" is not "answering",
  "Autopilot ON" is not "trading", "wired" is not "installed", and a green CI
  badge is not "deployed".
- **An error that does not say where it came from will be mis-attributed.**
  "The quota has been exceeded" was read as rate limiting and answered with
  five rounds of pacing work. It was MetaAPI's penalty for calling account ids
  that do not exist.
- **Check which copy of a repo you are in.** There are older clones of AXE CORE
  and two entirely different Axon codebases.
- **Never diagnose from a query whose shape you have not checked.** A
  `union all … order by 3 desc limit 3` silently dropped the rows being
  reasoned about and produced a confident wrong conclusion.

---

## Not verified

Stated so nobody repeats it as fact:

- **Trading OS** — repo exists (`Ldezeeuw445/TRADING-OS-`, `main`, last push
  2026-05-03) and Luka says it shares the AXE CORE Supabase and carries the AXE
  Companion + AXE Intel assistants. No local checkout was found on this Mac and
  no deployment target is known.
- Nothing outstanding here as of 2026-08-22. The app used to live on one disk
  behind a `gitsafe-backup` remote that does not answer; it now has its own
  private GitHub repo and all four branches are pushed. That dead remote is
  still configured — left in place rather than removed, since it may work on a
  different network, but it is not a backup you can rely on.
