"""Worker primitives for the durable AXE execution kernel.

It runs separately from FastAPI. Keeping long agent work out of the API
process prevents it from starving health/chat endpoints.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import socket
import time
from collections.abc import Awaitable, Callable
from typing import Any

from agent_loop import ApprovalRequired
from task_runtime import TaskRepository

try:  # agent_loop levert deze klasse volgens het gedeelde contract.
    from agent_loop import TaskCancelled
except ImportError:  # pragma: no cover
    # Vangnet zodat dit bestand importeerbaar blijft zolang agent_loop hem nog
    # niet heeft. Zodra hij er staat, wint de echte import hierboven vanzelf.
    class TaskCancelled(Exception):
        """Een taak is onderweg geannuleerd; de lus is netjes gestopt."""

log = logging.getLogger("axe_task_worker")

TaskHandler = Callable[[dict[str, Any], "TaskContext"], Awaitable[dict[str, Any]]]

# Hetzelfde geval, alleen gezien via de repo: iemand heeft de taak op
# 'cancelled' gezet terwijl wij hem draaiden, dus require_transition weigert
# elke volgende overgang. Dat is geen fout van de handler en zeker geen reden
# om te retryen -- de taak is met opzet gestopt.
CANCELLED_TRANSITION_PREFIX = "invalid task transition: cancelled ->"


def is_cancelled_race(exc: BaseException) -> bool:
    """True als deze fout betekent: de taak is onder ons vandaan geannuleerd."""
    return isinstance(exc, ValueError) and str(exc).startswith(CANCELLED_TRANSITION_PREFIX)


# Hoe vaak de agent-lus hoogstens echt naar de status van zijn eigen taak vraagt.
STOP_CHECK_SECONDS = 5.0


def normalize_agent_result(value: Any) -> str:
    """Turn OpenHands' several finish envelopes into one AXE-facing message."""
    if isinstance(value, dict):
        if value.get("name") == "finish":
            params = value.get("parameters") or {}
            return str(params.get("message") or value.get("message") or "").strip()
        return str(value.get("message") or value.get("response") or value.get("result") or "").strip()
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        decoded = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return text
    normalized = normalize_agent_result(decoded)
    return normalized or text


def verification_evidence(result: dict[str, Any]) -> dict[str, Any]:
    """Only claim checks for evidence the worker actually possesses.

    The openhands_run_identified check only applies when a handler's result
    actually claims to come from OpenHands (the key is present at all) —
    task_manage_handler's results have no such key and would otherwise fail
    verification for every non-agentic task, forever.
    """
    # A handler that proved its own work outranks anything inferable here.
    # agent_loop runs a command that demonstrates the result exists and puts the
    # outcome in result["verification"]; re-deriving a verdict from the shape of
    # the dict would only ever weaken it. Before this existed, the checks below
    # were the ONLY gate, and "is there a summary string?" passes for a plan that
    # built nothing — which is how a request to create an Obsidian vault
    # completed while creating no vault.
    proven = result.get("verification")
    if isinstance(proven, dict) and "passed" in proven:
        return proven

    checks = [{"name": "agent_result_present", "passed": bool(result.get("summary"))}]
    if "openhands_task_id" in result:
        checks.append({"name": "openhands_run_identified", "passed": bool(result.get("openhands_task_id"))})
    checks.append({"name": "result_persisted", "passed": True})
    return {"passed": all(item["passed"] for item in checks), "checks": checks}


class TaskContext:
    def __init__(self, repo: TaskRepository, task: dict[str, Any], lease_seconds: int):
        self.repo = repo
        self.task = task
        self.lease_seconds = lease_seconds

    async def checkpoint(self, value: dict[str, Any]) -> None:
        self.task = await asyncio.to_thread(
            self.repo.heartbeat,
            self.task["id"],
            self.task["worker_id"],
            self.task["lease_token"],
            self.lease_seconds,
            value,
        )

    async def event(self, event_type: str, message: str, data: dict[str, Any] | None = None) -> None:
        await asyncio.to_thread(
            self.repo.append_event,
            self.task["id"],
            event_type,
            actor_type="axe",
            actor_id="axe",
            message=message,
            data=data,
        )


class TaskWorker:
    def __init__(
        self,
        repo: TaskRepository,
        handlers: dict[str, TaskHandler],
        *,
        worker_id: str | None = None,
        lease_seconds: int = 60,
    ):
        self.repo = repo
        self.handlers = handlers
        self.worker_id = worker_id or f"{socket.gethostname()}:{id(self):x}"
        self.lease_seconds = lease_seconds

    async def run_once(self) -> bool:
        task = await asyncio.to_thread(self.repo.claim, self.worker_id, self.lease_seconds)
        if not task:
            return False
        handler = self.handlers.get(task.get("capability") or "general")
        if not handler:
            await asyncio.to_thread(
                self.repo.transition,
                task["id"],
                "failed",
                worker_id=self.worker_id,
                lease_token=task["lease_token"],
                error={"code": "no_handler", "message": f"No handler for {task.get('capability') or 'general'}"},
            )
            return True

        context = TaskContext(self.repo, task, self.lease_seconds)
        heartbeat = asyncio.create_task(self._keep_lease(context))
        try:
            result = await handler(task, context)
            verifying = await asyncio.to_thread(
                self.repo.transition,
                task["id"],
                "verifying",
                worker_id=self.worker_id,
                lease_token=context.task["lease_token"],
                checkpoint=context.task.get("checkpoint") or {},
                result=result,
            )
            context.task = verifying
            evidence = verification_evidence(result)
            if not evidence["passed"]:
                raise RuntimeError("worker result did not satisfy its verification recipe")
            await context.event(
                "verification.passed",
                "AXE verified the persisted coding-agent evidence.",
                evidence,
            )
            await asyncio.to_thread(
                self.repo.transition,
                task["id"],
                "completed",
                worker_id=self.worker_id,
                lease_token=context.task["lease_token"],
                checkpoint=context.task.get("checkpoint") or {},
                result={**result, "verification": evidence},
            )
        except ApprovalRequired:
            # The handler already parked this task in waiting_approval and gave
            # up its lease. Falling through to the generic branch below would
            # overwrite that with retrying/failed and lose the pending question.
            log.info("[task_worker] task %s is waiting for approval", task["id"])
        except TaskCancelled:
            # Annuleren is geen mislukking. De taak staat al op 'cancelled' en
            # heeft geen lease meer; verifying of retrying proberen zou alleen
            # maar een "invalid task transition" opleveren en de taak daarna
            # opnieuw in de wachtrij zetten -- precies wat de gebruiker net
            # afzette.
            log.info("[task_worker] task %s was cancelled while it ran", task["id"])
        except Exception as exc:
            if is_cancelled_race(exc):
                # Dezelfde situatie, alleen zag de repo het eerder dan de lus.
                log.info("[task_worker] task %s was cancelled while it ran", task["id"])
                return True
            target = "retrying" if task["attempt"] < task["max_attempts"] else "failed"
            latest_checkpoint = context.task.get("checkpoint") or {}
            retried = await asyncio.to_thread(
                self.repo.transition,
                task["id"],
                target,
                worker_id=self.worker_id,
                lease_token=context.task["lease_token"],
                checkpoint=latest_checkpoint,
                error={"code": "handler_error", "message": str(exc)[:1000]},
            )
            if target == "retrying":
                await asyncio.to_thread(
                    self.repo.transition,
                    task["id"],
                    "queued",
                    checkpoint=retried.get("checkpoint") or latest_checkpoint,
                    error={"code": "handler_error", "message": str(exc)[:1000]},
                )
        finally:
            heartbeat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat
        return True

    async def _keep_lease(self, context: TaskContext) -> None:
        while True:
            await asyncio.sleep(max(5, self.lease_seconds // 3))
            try:
                await context.checkpoint(context.task.get("checkpoint") or {})
            except Exception as exc:
                # A heartbeat can arrive just after the task released its lease
                # on purpose -- parking for approval does exactly that. Dying
                # here would surface as a task failure in the `finally` that
                # awaits this coroutine, turning a normal pause into an error.
                log.debug("[task_worker] heartbeat skipped: %s", exc)
                return


async def agentic_handler(task: dict[str, Any], context: TaskContext) -> dict[str, Any]:
    """Run one durable action request as a real tool-using agent loop.

    This used to POST the whole request to the OpenHands sandbox once and store
    whatever text came back. That failed in two ways at the same time, and both
    are recorded in core_tasks:

      * The sandbox 504'd on every smoke test, so nothing ran at all.
      * When it did answer, a *plan* came back ("1. Create a folder named
        Trading, 2. Organize subfolders...") and the plan was filed as the
        finished work. No folder was ever created.

    A single request/response cannot do real work: looking at the result of a
    command and deciding what to do next IS the job. So the loop lives here now
    (see agent_loop.py), with a shell and a filesystem, and finishing requires
    running a command that proves the result exists.

    OpenHands stays reachable as a tool bridge for callers that ask for it by
    name; it is simply no longer the only road, and no longer a road that has to
    boot a sandbox before anything can happen.
    """
    from agent_loop import MAX_STEPS, ApprovalRequired, run_agent_loop

    request_text = str((task.get("payload") or {}).get("request") or task.get("goal") or "").strip()
    if not request_text:
        raise ValueError("task payload has no request")

    plan = await asyncio.to_thread(
        context.repo.create_step,
        task["id"],
        "execute_agent",
        "Execute the request with AXE's agent loop",
        step_order=0,
        kind="agent",
        input_data={"request": request_text},
    )
    await asyncio.to_thread(context.repo.update_step, plan["id"], "running")
    checkpoint = context.task.get("checkpoint") or {}
    await context.checkpoint({
        **checkpoint, "stage": "agent_running", "step_id": plan["id"],
    })
    await context.event(
        "axe.progress",
        f"AXE started working directly, with a budget of {MAX_STEPS} steps.",
    )

    async def on_event(kind: str, message: str, data: dict[str, Any] | None = None) -> None:
        # Every step is streamed, not just the outcome. Without this a task is a
        # black box for however long it runs, which is most of why the old one
        # felt like nothing was happening.
        await context.event(kind, message, data or {})

    # Commands Luka already approved on this task, so a resumed attempt runs
    # straight through what it stopped on last time instead of asking again.
    snapshot = await asyncio.to_thread(context.repo.get, task["id"])
    approved = tuple(
        str((a.get("metadata") or {}).get("command") or "")
        for a in ((snapshot or {}).get("approvals") or [])
        if a.get("status") == "approved" and (a.get("metadata") or {}).get("command")
    )
    if approved:
        await context.event(
            "axe.progress",
            f"Resuming with {len(approved)} approved command(s).",
        )

    # Annuleren moet ONDERWEG aankomen. Zonder dit loopt een taak van een half
    # uur gewoon door nadat hij is afgezet, en pas aan het eind blijkt dat er
    # niets meer te schrijven valt. Daarom vraagt de lus dit zelf tussen de
    # stappen door.
    #
    # Goedkoop houden is hier het hele punt: één kolom van één rij (niet
    # repo.get, die haalt ook alle steps, approvals en events op), en hoogstens
    # eens per STOP_CHECK_SECONDS echt naar de database. De agent-lus mag dit
    # dus elke stap aanroepen zonder de database te belasten.
    laatste_check: dict[str, Any] = {"tijd": 0.0, "gestopt": False}

    async def should_stop() -> bool:
        nu = time.monotonic()
        if laatste_check["tijd"] and nu - laatste_check["tijd"] < STOP_CHECK_SECONDS:
            return bool(laatste_check["gestopt"])
        laatste_check["tijd"] = nu
        try:
            rows = await asyncio.to_thread(
                lambda: context.repo._db().table("core_tasks")
                .select("status").eq("id", task["id"]).limit(1).execute().data
            )
        except Exception as exc:  # noqa: BLE001 — een hapering mag niets afbreken
            log.debug("[task_worker] stop-check skipped: %s", exc)
            return bool(laatste_check["gestopt"])
        laatste_check["gestopt"] = bool(rows) and (rows[0] or {}).get("status") == "cancelled"
        return bool(laatste_check["gestopt"])

    try:
        output = await run_agent_loop(
            request_text, task["id"], on_event, approved,
            read_only=task.get("execution_mode") == "read",
            should_stop=should_stop,
        )
        await asyncio.to_thread(context.repo.update_step, plan["id"], "completed", output=output)
        await context.checkpoint({"stage": "agent_completed", "step_id": plan["id"]})
        await context.event(
            "axe.progress",
            f"AXE finished in {output.get('steps_used')} steps and proved the result.",
        )
        return output
    except ApprovalRequired as pause:
        # Not a failure: park the task and ask. request_approval flips it to
        # waiting_approval and drops the lease; deciding it puts the task back
        # to queued, so the worker resumes it on its own.
        await asyncio.to_thread(
            context.repo.update_step, plan["id"], "waiting_approval",
        )
        await asyncio.to_thread(
            context.repo.request_approval,
            task["id"],
            {
                "kind": "shell_command",
                "title": f"AXE wants to run: {pause.command[:120]}",
                "detail": (
                    f"This command {pause.reason}, so it is outside what AXE may "
                    f"do unattended.\n\nCommand:\n{pause.command}"
                ),
                "requested_by": "axe",
                "target_type": "task",
                "target_id": task["id"],
                "metadata": {"command": pause.command, "reason": pause.reason},
            },
        )
        raise
    except TaskCancelled:
        # Afgebroken, niet mislukt. Een stap op 'failed' zou bij een volgende
        # poging ook nog eens door reset_steps_for_retry op pending gezet
        # worden, alsof er niets aan de hand was.
        await asyncio.to_thread(context.repo.update_step, plan["id"], "cancelled")
        raise
    except Exception as exc:
        await asyncio.to_thread(
            context.repo.update_step,
            plan["id"],
            "failed",
            error={"message": str(exc)[:1000]},
        )
        raise


AXE_CORE_DEFAULT_USER_ID = "acff7a12-1111-481d-a7a9-cc07583b8069-axe-core"


async def task_manage_handler(task: dict[str, Any], context: TaskContext) -> dict[str, Any]:
    """capability='task_manage' — the Task Agent's own work, distinct from
    'agentic' (which always delegates to the OpenHands coding sandbox). Most
    tasks created from the Tasks tab are plain tracked items ("remember to
    renew the domain"), not coding work; routing them through OpenHands would
    be dishonest (nothing there can act on them) and wasteful (spins up a
    sandbox for nothing). This handler is what makes task_agent a real agent
    instead of a name with no logic behind it: it acknowledges the task, logs
    one tracked step, and leaves a real memory entry tagged agentId
    'task_agent' — the same write-site pattern cron_manager and
    crewai_manager already use, so Task Agent's activity shows up in its own
    Neural/Memory hub bucket instead of nowhere.
    """
    goal = str(task.get("goal") or task.get("title") or "").strip()
    if not goal:
        raise ValueError("task has no goal or title")

    step = await asyncio.to_thread(
        context.repo.create_step, task["id"], "acknowledge",
        "Task Agent acknowledged and is tracking this task", step_order=0,
        kind="action", input_data={"goal": goal},
    )
    await asyncio.to_thread(context.repo.update_step, step["id"], "running")
    await context.event("axe.progress", "Task Agent picked this up and is tracking it.")

    summary = f"Tracking: {goal[:200]}"
    try:
        db = context.repo._db()
        await asyncio.to_thread(
            lambda: db.table("global_memory").upsert({
                "user_id": AXE_CORE_DEFAULT_USER_ID,
                "category": "task",
                "key": f"task_agent:{task['id']}",
                "value": json.dumps({"title": task.get("title"), "goal": goal, "status": "acknowledged"}),
                "confidence": 1,
                "metadata": {"kind": "agent_run", "agentId": "task_agent", "summary": summary, "task_id": task["id"]},
            }, on_conflict="user_id,key").execute()
        )
    except Exception as exc:  # noqa: BLE001 — a memory-write failure must not fail the task
        log.warning(f"[task_agent] memory write failed: {exc}")

    output = {"summary": summary}
    await asyncio.to_thread(context.repo.update_step, step["id"], "completed", output=output)
    return output


# --- De lus die de VPS draait -------------------------------------------------
#
# Idle backoff.
#
# Dit sliep een vlakke 2s zodra er niets te claimen viel, dus één
# claim_next_core_task per twee seconden, voor altijd. Gemeten 2026-08-19 in
# Supabase's edge logs: 1565 aanroepen in één uur -- meer dan al het andere
# verkeer naar de database bij elkaar (de nummer twee stond op 172).
#
# claim_next_core_task neemt een row lock. Dat 26x per minuut doen tegen een
# Nano-tier Postgres is wat de ShareLock-waits en statement timeouts in de
# postgres-logs opleverde, en als de database stokt, stokt auth mee -- daarom
# kon Luka steeds niet inloggen terwijl Supabase én de VPS er van buiten gezond
# uitzagen. Dat waren ze ook: AXE verhongerde zijn eigen database.
#
# Terugzakken tijdens stilte kost niets wat ertoe doet -- er is per definitie
# geen werk -- en zodra er wél iets is, staat de vertraging weer op 2s.
IDLE_MIN, IDLE_MAX = 2, 30

# Sinds er meer dan één slot draait, geldt die meting dubbel: K slots die
# allemaal om de 30s pollen zijn K keer zoveel lockverkeer op een stille bak,
# en dat is precies wat hierboven de database omver duwde. Daarom pollt alleen
# slot 0 (de verkenner) op het snelle tempo; de andere slots liggen stil op
# SLEEPING_SECONDS en gaan pas mee in het snelle tempo nadat ze zélf iets
# geclaimd hebben. Ze hoeven ook niet te pollen om werk op tijd te zien: wie
# iets claimt port de rest meteen wakker (WorkSignal). Het lange interval is
# alleen het vangnet voor het geval de verkenner zelf een taak van een half uur
# draait en dus even niemand kijkt.
SLEEPING_SECONDS = 120


class WorkSignal:
    """Het portje van het slot dat werk vond naar de slapende slots.

    Eén Event per slot, want met één gedeelde Event weet niemand wie hem mag
    wissen en blijft er altijd iemand achter.
    """

    def __init__(self, count: int):
        self._events = [asyncio.Event() for _ in range(max(1, count))]

    def wake_others(self, index: int) -> None:
        for i, event in enumerate(self._events):
            if i != index:
                event.set()

    async def wait(self, index: int) -> None:
        event = self._events[index]
        await event.wait()
        event.clear()


async def _idle(
    signal: WorkSignal | None,
    index: int,
    seconds: float,
    sleep: Callable[[float], Awaitable[None]],
) -> None:
    """Wacht `seconds`, maar kom meteen terug als een ander slot werk vond."""
    if signal is None:
        await sleep(seconds)
        return
    tick = asyncio.ensure_future(sleep(seconds))
    poke = asyncio.ensure_future(signal.wait(index))
    try:
        await asyncio.wait({tick, poke}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for pending in (tick, poke):
            if not pending.done():
                pending.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await pending


async def run_slot(
    worker: TaskWorker,
    *,
    scout: bool = True,
    signal: WorkSignal | None = None,
    index: int = 0,
    stop: Callable[[], bool] | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    """Eén claim-lus. Blijft claimen en draaien tot `stop()` True zegt."""
    # Gevonden live 2026-08-17: de 15s postgrest-timeout maakt van een
    # voorbijgaande Supabase-hik tijdens claim() een *verwachte*, gewone
    # gebeurtenis -- maar niets ving hem op, dus elke keer ging het hele proces
    # eraan. systemd herstartte in een strakke lus (69 herstarts in enkele
    # minuten) in plaats van dat de worker het een tik later nog eens probeerde.
    # Een gecrashte worker betekent bovendien dat geen enkele duurzame taak --
    # ook het werk dat chat uitbesteedt -- opgepakt wordt tot de volgende start.
    consecutive_errors = 0
    ceiling = IDLE_MAX if scout else SLEEPING_SECONDS
    idle_delay: float = IDLE_MIN if scout else ceiling
    while stop is None or not stop():
        try:
            worked = await worker.run_once()
        except Exception as exc:
            consecutive_errors += 1
            log.error(
                f"[task_worker] run_once failed on {worker.worker_id} "
                f"(consecutive={consecutive_errors}): {exc}"
            )
            # Verder terugzakken bij aanhoudende fouten (Supabase echt plat)
            # in plaats van er elke 2s tegenaan te blijven beuken.
            await sleep(min(2 * consecutive_errors, IDLE_MAX))
            continue
        consecutive_errors = 0
        if worked:
            idle_delay = IDLE_MIN
            if signal is not None:
                # Er was werk, dus er is waarschijnlijk meer. De slapers hoeven
                # niet tot hun volgende ronde te wachten.
                signal.wake_others(index)
            continue
        await _idle(signal, index, idle_delay, sleep)
        idle_delay = ceiling if idle_delay >= IDLE_MAX else min(idle_delay * 2, IDLE_MAX)


async def run_slots(
    repo: TaskRepository,
    handlers: dict[str, TaskHandler],
    *,
    concurrency: int | None = None,
    lease_seconds: int = 90,
    stop: Callable[[], bool] | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    """K onafhankelijke claim-lussen in één proces.

    Hiervoor bouwde run_forever één TaskWorker en await'te run_once() in een
    lus. Drie taken die de app tegelijk uitzette, toonden "3 agents running"
    terwijl ze op de server keurig achter elkaar stonden te wachten: een taak
    van dertig minuten hield alles erachter tegen. Elk slot heeft zijn eigen
    worker_id ("<host>:slot-N"), zodat lease en heartbeat per taak blijven
    kloppen.
    """
    count = concurrency if concurrency is not None else int(os.environ.get("AXE_TASK_CONCURRENCY", "3"))
    count = max(1, count)
    host = socket.gethostname()
    signal = WorkSignal(count)
    workers = [
        TaskWorker(repo, handlers, worker_id=f"{host}:slot-{n}", lease_seconds=lease_seconds)
        for n in range(count)
    ]
    await asyncio.gather(*[
        run_slot(worker, scout=(n == 0), signal=signal, index=n, stop=stop, sleep=sleep)
        for n, worker in enumerate(workers)
    ])


async def run_forever() -> None:
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv()
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE"]

    def db():
        client = create_client(url, key)
        client.options.postgrest_client_timeout = 15
        return client

    await run_slots(
        TaskRepository(db),
        {"agentic": agentic_handler, "task_manage": task_manage_handler},
        lease_seconds=int(os.environ.get("TASK_LEASE_SECONDS", "90")),
    )


if __name__ == "__main__":
    asyncio.run(run_forever())
