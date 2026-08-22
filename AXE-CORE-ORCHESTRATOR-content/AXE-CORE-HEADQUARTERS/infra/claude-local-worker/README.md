# claude-local-worker

A Claude Code session that runs on the Mac and answers from the phone.

## Why this exists

"Een sessie die lokaal op me computer is maar waar ik op me telefoon bij kan."

The Claude app on Android does not do that — it talks to Anthropic, not to the
Claude Code installed on this Mac. And `axe-local-bridge` is loopback-only by
design, so the phone cannot reach it either. Both of those are correct; they
just leave the thing Luka wanted with no route.

## How it works

Both ends already reach Supabase, so nothing new has to be exposed:

```
phone  →  core_tasks(capability='claude_local', status='pending')
mac    ←  claims it, runs `claude -p`, writes result back
phone  ←  reads status='completed', result.text
```

No inbound port on the Mac. Nothing on the LAN. It works from anywhere the
phone has signal, not just the home wifi. It reuses `core_tasks` because that
table already has leases, attempts and results — a second queue would have
been a worse copy of it.

`--continue` resumes the newest session in the working directory, so
consecutive prompts are one conversation. The first ever run has nothing to
continue and Claude errors; the worker detects that and retries once without
the flag, because "no previous session" is a normal first message.

## Running it

```bash
node infra/claude-local-worker/worker.mjs
```

| Variable | Default |
|---|---|
| `AXE_CLAUDE_BIN` | `/opt/homebrew/bin/claude` |
| `AXE_CLAUDE_DIR` | the AXE CORE worktree |
| `AXE_CLAUDE_POLL_MS` | `5000` |
| `AXE_CLAUDE_TIMEOUT_MS` | `600000` |
| `AXE_CLAUDE_ALLOW_BASH` | unset — set to `1` to allow Bash/Edit/Write |

## Safety

This runs Claude Code with Luka's own privileges, so anything able to write a
row to `core_tasks` can make this Mac do work. Four limits, none of which is
the only one:

1. **Started by hand.** It is not a service and does not survive a reboot.
   Ctrl-C is the off switch.
2. **One directory.** `AXE_CLAUDE_DIR`, not the whole disk.
3. **Read-only tools by default** — `Read,Glob,Grep`. A typo'd prompt sent
   from a phone should not be able to rewrite the worktree while nobody is
   looking at the screen. `AXE_CLAUDE_ALLOW_BASH=1` opts into
   `Bash,Edit,Write` deliberately.
4. **A hard per-turn timeout,** so one bad prompt cannot pin a core all night.

The claim is a conditional PATCH — `status=eq.pending` is the lock. Two workers
(a second terminal, a process left running) race on the same row and exactly
one wins. Without it both would run the prompt and the second would overwrite
the first's answer.

## If a task comes back `failed`

The error column carries Claude's own words. The one seen first:

```
Failed to authenticate: OAuth session expired and could not be refreshed
```

That is the CLI on the Mac being signed out, not a fault in the relay. Fix it
where it lives:

```bash
claude
```

Sign in once in that interactive session, quit, and restart the worker. The
plumbing was verified end to end on 2026-08-22 — polled, claimed by
`mac-39690`, ran, and wrote the real reason back to the row rather than
reporting a success it did not have.
