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

Allowed commands: `build`, `typecheck`, `test`, `git.status`, `git.pull`
(fast-forward only, so it cannot rewrite local work), `git.diff`,
`tauri.build`.

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
