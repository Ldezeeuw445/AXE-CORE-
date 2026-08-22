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
