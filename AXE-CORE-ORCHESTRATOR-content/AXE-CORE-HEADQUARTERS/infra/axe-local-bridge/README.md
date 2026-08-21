# axe-local-bridge

The channel AXE was missing to the machine it runs on.

## Why this exists

AXE could already commit to GitHub (`[GIT_WRITE:]`) and run shell on the VPS
(`[EXEC:]`). Neither touches the worktree on the SSD that the running app is
served from. So "change X in AXE CORE" could not work however it was phrased —
a commit lands on a branch nobody pulled, and the VPS is a different computer
in Germany. There was no path from AXE to the app in front of Luka.

That is also why AXE could say it removed the Smart Home button and nothing
happened: it had no way to, and nothing checked.

With the bridge running, `[LOCAL_WRITE:]` edits the real file. With the dev
server up, the change is on screen within a second.

## Running it

```bash
AXE_BRIDGE_TOKEN=$(openssl rand -hex 24) node infra/axe-local-bridge/server.mjs
```

Put the same token in the app's `.env` as `VITE_AXE_BRIDGE_TOKEN` and restart
the dev server. Without it the local tools report themselves unavailable
rather than failing halfway — AXE will say it cannot, instead of pretending.

Optional:

| Variable | Default |
|---|---|
| `AXE_BRIDGE_PORT` | `4599` |
| `AXE_BRIDGE_ROOTS` | `/Volumes/EagetSSD/AXE-CORE-` (comma-separated) |

## Safety

This is the most dangerous component in the system: anything able to write the
worktree can write anything, and it runs with Luka's own privileges. So it is
deliberately small, and limited four independent ways — no single mistake is
enough on its own:

1. **Loopback only.** Binds `127.0.0.1`. Not reachable from the network, the
   VPS, or anywhere else.
2. **Token required.** Every request except `/health` needs
   `Authorization: Bearer $AXE_BRIDGE_TOKEN`. The service refuses to start
   without one rather than defaulting to open.
3. **Path jail.** Every path is fully resolved and must sit inside an allowed
   root, which stops `../` traversal and symlinks pointing out. Verified: both
   `/etc/hosts` and `…/AXE-CORE-/../../etc/passwd` are refused.
4. **Command allowlist.** `/run` takes a key, not a command string, and each
   maps to a fixed argv executed without a shell — so there is no quoting bug
   that could become an injection. Verified: `rm -rf /` is refused.

5. **Denylist, carved out of the roots.** Widening `AXE_BRIDGE_ROOTS` to the
   whole SSD is convenient — every project reachable at once — but that disk
   also holds `AXE-VAULT`, the VPS SSH key and personal documents. Everything
   AXE reads becomes context sent to whichever model answers, so one careless
   "look around the SSD" would put the vault into a third party's chat log.
   `AXE_BRIDGE_DENY` excludes those paths regardless of the roots, and any
   file named like a credential (`.env*`, `*.key`, `*.pem`, `id_rsa`, `*_key`)
   is refused wherever it lives. Verified: vault, SSH key and `.env` all
   refused while `AXE-COMPANION-OS-` lists fine.

   Note the failure mode this was found by: a stale bridge from an earlier
   run still held port 4599, so the new instance never bound and the old one
   — no denylist, narrow roots — answered every probe. The test looked like a
   security failure and was really a process left running. Kill port 4599
   before trusting any result from it.

Allowed commands: `build`, `typecheck`, `test`, `git.status`, `git.pull`
(fast-forward only, so it cannot rewrite local work), `git.diff`,
`tauri.build`.

## The phone (`/adb`)

`POST /adb {action, params, serial}` and `GET /adb/devices` reach the Samsung
over adb. This is deliberately **not** part of `/run`: that endpoint is safe
because a key maps to a fixed argv, and a tap needs coordinates. The rails are
in `adb.mjs` instead — one validator per action, narrow shapes, and an
allowlist for anything that is never user prose (keycodes, package names).

**The trap that shapes that file:** `adb shell <args>` does not execute argv on
the phone. adb joins the arguments into one string and hands it to the device's
`sh`, so passing argv through `execFile` — what makes the rest of this service
injection-proof — buys nothing here. `input text "a; reboot"` really would
reboot the phone. Every value crossing to the device shell is single-quote
escaped by `q()`.

| Action | Changes the phone? |
|---|---|
| `screenshot`, `ui_dump`, `current_app`, `screen_size` | no — run unattended |
| `tap`, `swipe`, `text`, `key`, `open_url`, `launch` | yes — approval-gated in the app |

`ui_dump` returns a parsed element list, not the XML. Measured on a Google
results page the raw dump was over 200 KB — past this service's own output cap,
so the model would have received XML truncated mid-node. Parsed to what a
finger can reach it is 3 KB.

`POWER` and `SLEEP` are not in the keycode allowlist on purpose: anything that
can turn the screen off can make itself unobservable, and the screenshot loop
is the only reason you can see what it did.

adb is found at `AXE_ADB_PATH`, else the usual SDK locations. On this Mac it is
**not** on `PATH` — a bridge shelling out to a bare `adb` would report "no
phone" for a phone that is plugged in and fine.

`/write` returns the previous contents, so a change can be shown as a diff and
undone. A write nobody can inspect is a write nobody should trust.

## What it does not do

- No delete, move, or rename — the blast radius is not worth the convenience.
- No arbitrary shell. Adding a command means editing the allowlist here,
  which is the point: the review happens in the repo, not in a chat turn.
- No network access on AXE's behalf.

## Stopping it

Ctrl-C, or don't start it. Every local tool checks the bridge first and
reports it as unavailable, so the app degrades to exactly the behaviour it had
before this existed.
