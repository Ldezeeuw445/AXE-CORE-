# Handoff — 2026-08-18/19

The night AXE stopped describing work and started doing it.

The older `SESSION_HANDOFF.md` (2026-07-28, voice/Fish Audio) is still valid on its
own subject and was left untouched.

---

## The one-line version

AXE's agent could never actually do anything, for four measurable reasons. All four
are fixed and verified. Separately, three faults that had been costing days turned
out to be silent failures reporting the wrong cause.

---

## 1. The agent now works, and has to prove it

**Was:** `agentic_handler` in `backend/axe_api/task_worker.py` posted the whole
request to the OpenHands sandbox in ONE call and filed whatever text came back as
the result. Verification was `bool(result.get("summary"))` — "is there a sentence?".

That combination produced this, which is still in `core_tasks`: a request to build
an Obsidian vault returned a numbered *plan* ("1. Create a folder named Trading…")
and was marked `completed`. No folder was ever created. A separate run 504'd on the
sandbox and *also* completed, because the model called `finish` saying "Task
completed successfully".

**Now:** `backend/axe_api/agent_loop.py` is a real loop — shell, file read/write,
40 steps, 30 minutes — and `finish` must supply a command proving the work exists.
The worker runs that command itself. If the proof fails, the failure goes back to
the model and the loop continues. The model cannot mark its own homework.

Verified: a task created `/opt/axe-workspace/proof/hello.txt` in 6 steps, proved it
with `cat`, and the file was confirmed to exist independently of the task's claim.

**Also fixed:** `MAX_ITERATIONS = 10` / `TIMEOUT_MS = 120_000` in
`src/application/agents/agenticEngine.ts` — ten steps and two minutes is not enough
for any real job.

**Model:** `gemini-pro-latest` (a stable alias, deliberately). Pinning
`gemini-2.5-pro` broke on the first run — Google had already closed it to new
callers. `ListModels` still advertises models that `generateContent` refuses.

## 2. Approvals — AXE asks, you answer from your pocket

The agent runs freely inside its own workspace and stops when a command reaches
beyond it (`systemctl`, `git push`, package installs, anything writing outside
`/opt/axe-workspace`). The task parks itself in `waiting_approval`, the question
lands in `core_approvals`, and answering it puts the task back on the queue so the
worker resumes from where it stopped.

The approved command is remembered per task (`normalize_command`), otherwise the
resumed attempt asks again forever.

Verified end to end, including from the phone: approved `systemctl status nginx`
from a notification, task resumed and finished in 2 steps.

`core_approvals` had **zero rows** before this. The API, the client and the table
all existed; nothing ever requested an approval.

> **Scope:** this is AXE Core, the agent. The trading autopilot is untouched and
> asks nothing — that was a deliberate decision.

## 3. Three silent failures, and what each really was

None of these produced an error. That is why they cost weeks.

**"The quota has been exceeded" is MetaAPI, not Google.** It appears on every
autopilot symbol and reads like an LLM problem. It is MetaAPI rate-limiting — four
polling timers in `useLiveChartPolling.ts` at ~60 req/min from one open chart.

**The Google key is dead AND cannot be replaced in place.** 401
`ACCOUNT_STATE_INVALID` — the service account behind it was deleted. And Luka's org
policy shows *"API Keys are Disallowed — use Application Default Credentials"*, so
no new key can be made on that account. Needs a personal AI Studio key, or the key
stays server-side. The VPS's own `GEMINI_API_KEY` works and is from elsewhere.

**`saveSetting` wrote to localStorage and said nothing.** With no Supabase session
it returned void, so a pasted API key looked saved while `user_settings` stayed days
stale and every background agent kept using the old value. Now returns a
`SaveOutcome`, fires `SETTING_UNSYNCED_EVENT`, and the Settings page shows a red
"Saved on this device only" banner.

## 4. One broken source no longer kills the cycle

`runTradingAgent` used `Promise.all` over seven sources. One throwing source killed
the run for *every* symbol and recorded nothing — no decision, no trace, nothing to
learn from.

Now `Promise.allSettled`. Market snapshot, paper mirror and risk profile stay fatal
(each already has internal fallbacks). Intel, memory, learning stats and the live
account degrade, and a `Degraded — N source(s) unavailable` step is written into the
trace so it is visible rather than quiet.

## 5. The phone

See `axe-phone-offline-brain` in the memory folder for full detail.

- **Gemma 3 1B q4** (657MB) runs on the A17. Loads ~2.8s, answers ~6s.
- It **will** invent market data if only told not to, so
  `stripInventedMarketClaims()` strips those sentences in code.
- `AxeBrain` routes: VPS wins always; the phone model is a fallback, never a peer.
- `OfflineQueue` keeps requests made with no signal and sends them as durable tasks.
- The algo widget and lock-screen card read equity/fill/price out of the decision's
  own steps, always show the age, and grey out past an hour.

> ⚠️ **The Android project is not a git repo.** Everything above exists only on the
> Mac at `/Users/luka/Downloads/AxeCore`. Back it up.

---

## Open, and who has to do it

| | |
|---|---|
| Personal Google AI Studio key | **Luka** — org policy blocks keys on the current account |
| MetaAPI account 404 (`08c9aa65-…`) | **Luka** — the account path is not found; broker shows `connected: false` |
| Supabase compute upgrade | **Luka** — Nano is where the login failures come from |
| Voice hands-free, camera into memory | not started |
| Terminal 1006 | infrastructure verified healthy; WebView `onopen` never fires |

## Two things worth not forgetting

**The repo drifts from the VPS.** `task_worker.py` on the server was ahead of the
repo and contained `task_manage_handler`, which the repo did not have at all —
running `deploy.sh` would have deleted it from the server. Fixed, but check before
deploying. `deploy.sh` copies from `backend/axe_api/`, so a server-only edit always
loses. This already happened once today with a CORS header, twice.

**SSH from the Mac does not work** (`Permission denied (publickey)`). Deploy by
base64 through `POST /internal/exec` with `AXE_CORE_API_KEY` — that path works, and
files over ~30KB of base64 must be sent in chunks or the request silently fails.
