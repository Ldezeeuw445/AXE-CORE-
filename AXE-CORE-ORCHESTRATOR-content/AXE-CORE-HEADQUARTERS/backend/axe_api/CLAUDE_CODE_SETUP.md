# Branch C — Claude Code on the host

`POST /claude/run` starts a real Claude Code session inside one whitelisted
repository checkout on whatever host axe_api runs on. Branch A (`/crew/run`)
sends work to CrewAI specialists on Ollama and Branch B is the KiloCode
cloud-key gateway; this is the one that writes to a working tree, so the setup
below is not optional decoration.

## Do NOT set ANTHROPIC_API_KEY

The CLI prefers an API key in its environment over a `claude login` session.
Set one on this box and every run silently bills the metered API instead of the
subscription — and nothing in the response, the logs or the audit trail says
which one paid.

`claude_runner._subprocess_env()` therefore strips `ANTHROPIC_API_KEY` and
`ANTHROPIC_AUTH_TOKEN` from the subprocess environment before the CLI starts.
It is enforced in code rather than written down here, because a checklist item
only protects the person who reads it.

Authenticate the host once, interactively:

```bash
npm i -g @anthropic-ai/claude-code
claude login          # OAuth flow in a browser — tied to your account
```

To confirm afterwards that a run really is on the subscription, poison the
environment on purpose and watch it still succeed:

```bash
ANTHROPIC_API_KEY=sk-ant-garbage-not-a-real-key \
  curl -sS -X POST "$AXE_API/claude/run" \
    -H "Authorization: Bearer $AXE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{"repo":"axe-core","prompt":"say hello"}'
```

A success here means the key was ignored. A failure means it was not, and the
strip is not doing its job.

## Whitelist the repositories

Nothing is reachable by default. `CLAUDE_CODE_REPOS` is a comma-separated list
of `name=/absolute/path`:

```
CLAUDE_CODE_REPOS=axe-core=/opt/repos/AXE-CORE-,axon=/opt/repos/axon-memory-app
```

A repo that is not listed is refused by name, with the allowed names in the
error. There is no "any path" mode, and the request body cannot supply a path.

## What is refused, before anything starts

| Condition | Result |
|---|---|
| repo not in `CLAUDE_CODE_REPOS` | refused, allowed names listed |
| path missing, or not a git checkout | refused |
| checkout is on `main` or `master` | refused, branch named |
| `permission_mode` outside `default`/`acceptEdits`/`plan` | refused |
| empty prompt | refused |

The branch is read with `git rev-parse --abbrev-ref HEAD` in the checkout at
call time — it is never taken from the request. `bypassPermissions` is
deliberately not an allowed mode: an unattended run that can edit and execute
with no gate at all should be a separate, explicitly named endpoint, not a
string somebody can put in a request body.

Refusals come back as HTTP 200 with `{"status":"error", ...}`, matching
`/crew/run`'s convention. Missing or wrong bearer auth is a real 401.

## Other environment

| Var | Default | Meaning |
|---|---|---|
| `CLAUDE_CODE_REPOS` | *(empty)* | the whitelist; empty means nothing runs |
| `CLAUDE_BIN` | `claude` | CLI to invoke, if it is not on `PATH` |
| `CLAUDE_TIMEOUT` | `900` | seconds before a run is killed |

## Checking it from outside

- `GET /claude/repos` (authed) — every whitelisted repo, its path, its current
  branch, and whether it is runnable right now.
- `GET /status/vps-agents` (open) — `claude_code` with counts only. Paths and
  branch names stay behind the authed endpoint, since this one needs no key.

## Where a run shows up

`core_audit_log` (action `claude_run`), and the same memory/RAG layer chat and
crew runs already use, tagged `tab:code`. A memory-write failure is logged and
does not fail the response — the run already happened, and pretending otherwise
would be worse than a gap in the index.
