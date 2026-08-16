# axe-core-api

The FastAPI service on the Strato VPS (`212.227.91.79`), served at
`api.axecompanion.com` and deployed to `/opt/axe-core-api`.

It exists because parts of AXE need credentials the browser must never hold —
the Supabase `service_role` key above all. The anon key ships inside the JS
bundle, so anything anon can do, anyone with the URL can do. Writes that must
not be public go through here instead, gated by `AXE_API_KEY`.

This directory is the source of truth. It was added after the service had been
edited in place for months with only `.bak` files as history — by then it held
the whole memory layer, and losing the box would have lost the lot.

## Layout

| File | Purpose |
|---|---|
| `main.py` | The service: memory, tasks, Supabase, n8n, agent bridges, proxies. |
| `task_runtime.py` | Durable task state machine, leases, checkpoints, events, approvals. |
| `task_worker.py` | Standalone worker primitives; handlers are registered per capability. |
| `prune_memory.sh` | Nightly retention job. Installed as a cron at 04:15. |
| `axe-core-api.service` | systemd unit. |
| `deploy.sh` | Copy up, restart, verify. |

## Deploying

```bash
./deploy.sh
```

Checks syntax locally, backs up the running `main.py` with a timestamp, copies,
restarts, then confirms the unit is active **and** `/health` answers 200 — a
unit can be "active" while uvicorn serves an app that failed to import, so the
HTTP check is the one that matters. On failure it prints the last 30 journal
lines and exits non-zero.

To roll back, move the timestamped backup over `main.py` and restart.

## Configuration

Secrets live only in `/opt/axe-core-api/.env` on the host, loaded by systemd
via `EnvironmentFile`. **They are deliberately not in this repo**, and
`deploy.sh` never touches that file.

Required — the service will not start without these:

- `AXE_API_KEY` — bearer token for every privileged endpoint
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE`

Optional, each enabling one feature; absent means that feature returns 503:

`CRON_KEY`, `CRON_SECRET`, `EXA_API_KEY`, `FISH_AUDIO_API_KEY`, `GITHUB_TOKEN`,
`N8N_URL`, `N8N_API_KEY`, `SMARTTHINGS_TOKEN`, `VERCEL_TOKEN`,
`VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `WORKSPACE_DIR`, `CREW_VENV_PY`,
`PREVIEW_PORT`, `PREVIEW_PUBLIC_URL`, and the agent bridges
(`OPENHANDS_*`, `OPENJARVIS_*`, `OPENCLAW_*`, `KILOCODE_*`, `HERMES_*`).

The canonical list is wherever `main.py` reads `os.environ` — that is the
authority, not this table.

## Memory endpoints

Added when it turned out nothing was reaching `global_memory` at all. Two write
paths had been failing silently, one after the other: direct Supabase writes
with the anon key (rejected by RLS, `42501`), then writes through
`/supabase/sql`, whose `exec_sql` RPC is read-only and answers an `INSERT` with
`syntax error at or near "into"`. Both caught the failure and fell back to
localStorage, so the app looked like it was remembering while the table stayed
empty.

- `POST /memory/upsert` — upsert entries, keyed on `(user_id, key)`. Writes via
  PostgREST, not `exec_sql`, and takes JSON so nothing is escaped into SQL.
- `GET /memory` — read entries, newest first; filter by category or key prefix.
- `GET /memory/stats` — per-category counts and last write. Powers the brain view.
- `POST /memory/prune` — retention. **Defaults to `dry_run=true`.**

### Retention

One distinction decides everything: is an entry something AXE *learns from*, or
merely something that *happened*?

Never expires — preferences, reflections (Luka's corrections), insights, and
anything keyed `ta:` (the trading journal, whose whole value is the long
record).

Ages out:

| kind | keep |
|---|---|
| `session` | 14 days |
| `tool_call` | 30 days |
| `agent_run` | 45 days |
| `resource`, `error` | 90 days |
| `conversation` | 180 days |

Two rails, because deletion is not reversible: `dry_run` defaults to true, and
a floor of 50 rows per kind is kept regardless of age, so a quiet month can
never empty a category and leave recall blind.

The nightly job logs each run to `/var/log/axe-memory-prune.log`.

## Durable task kernel

The `/tasks` API is the persistence boundary for long-running AXE work. A task
can survive the Tauri window closing, a frontend reload, or a worker restart:

- `POST /tasks` — idempotently enqueue a task.
- `POST /tasks/claim` — atomically lease one due task to a worker.
- `POST /tasks/:id/heartbeat` — extend the lease and save a checkpoint.
- `POST /tasks/:id/transition` — guarded state transition with optimistic revision.
- `GET /tasks/:id` — task, steps, approvals and ordered event stream.
- `POST /tasks/:id/approvals` and `/decision` — approval state that survives reload.

Run migration `20260816_durable_task_kernel.sql` before deploying these routes.
Workers should run separately from uvicorn and import `TaskWorker`; the first
follow-up slice registers real planner/tool handlers and the narrator event
stream.
