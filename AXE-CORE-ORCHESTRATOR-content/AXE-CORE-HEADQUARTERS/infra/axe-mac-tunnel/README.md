# axe-mac-tunnel

A shell on the Mac, reachable from the phone, with no inbound port on the Mac.

## Why not just use the VPS terminal

The VPS terminal works and should stay. But the VPS holds a *copy* of the API;
the worktree that is actually being edited is on the Mac. A terminal that
cannot see the files you are changing is a terminal you keep having to deploy
around.

## Why not the Supabase relay

`claude-local-worker` reaches the Mac by polling `core_tasks` every five
seconds. For "read that file and answer" that is fine. For a shell it is
useless: you type `ls` and wait five seconds a line. A terminal needs a stream,
not a queue.

## The shape

```
Mac  --outbound ws-->  VPS relay  <--inbound ws--  phone / browser
```

The Mac dials out and holds the socket open, so nothing has to be reachable
*at* the Mac. The relay is a letterbox: it owns no shells and keeps no state
beyond which client belongs to which session.

| Piece | Where | What |
|---|---|---|
| `relay.cjs` | VPS, `axe-tunnel-relay.service`, 127.0.0.1:4023 | pairs clients to the agent |
| `agent.cjs` | Mac | dials out, spawns the shells |
| nginx | `/mac-terminal/` on api.axecompanion.com | fronts the relay, 24h timeouts |

The client protocol is identical to `terminal-server.cjs` — `{type:'input'}`
in, `{type:'output'}` out — so the app's existing terminal talks to it without
a new client.

## Running the agent

```bash
AXE_TUNNEL_TOKEN=$(grep '^AXE_TUNNEL_TOKEN=' .env | cut -d= -f2-) \
  node infra/axe-mac-tunnel/agent.cjs
```

| Variable | Default |
|---|---|
| `AXE_TUNNEL_URL` | `wss://api.axecompanion.com/mac-terminal/agent` |
| `AXE_AGENT_CWD` | the AXE CORE worktree |
| `AXE_AGENT_SHELL` | `$SHELL`, else zsh |
| `AXE_AGENT_BOOTSTRAP` | `git pull --ff-only …; git status -sb` |

## Always the right checkout

Every new session runs the bootstrap before handing over, and its output is
shown rather than hidden. Doing the pull by hand fails the way all by-hand
steps fail: fine for a week, then one session is quietly a commit behind and
you spend an afternoon on a bug that was fixed yesterday.

`--ff-only` on purpose. A pull that could rewrite local work is not something
a terminal should do on your behalf while you watch. If it refuses, you see
why, and `git status -sb` on the next line tells you where you stand.

## Safety

- The token is compared with `timingSafeEqual`. A plain `!==` leaks it one
  character at a time to anyone patient enough to measure, and this token
  opens a shell.
- One agent at a time. A second connection replaces the first rather than
  running beside it — two agents would both answer every session and
  interleave their output into nonsense.
- Sessions are tagged. Without that a second terminal tab receives the first
  tab's output, which is worse than not working: it looks fine until two
  things are open.
- The relay never spawns anything. It cannot run a command even if it wanted
  to; every shell lives in the agent, on the Mac, as Luka.
- Stop it with Ctrl-C. There is no way in from outside while it is not
  running, and `/health` says `agent: false` so the app can say so rather
  than hanging on a black screen.

## Verified

2026-08-23, from the public internet through `wss://api.axecompanion.com`:

```
[AXE mac agent — Mac-mini-van-Luka-4.local]
Already up to date.
## orchestrator...origin/orchestrator [ahead 19]
Mac-mini-van-Luka-4.local
/Volumes/EagetSSD/.../AXE-CORE-HEADQUARTERS
695f2a9
```
