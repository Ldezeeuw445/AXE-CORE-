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
from collections.abc import Awaitable, Callable
from typing import Any

from task_runtime import TaskRepository

log = logging.getLogger("axe_task_worker")

TaskHandler = Callable[[dict[str, Any], "TaskContext"], Awaitable[dict[str, Any]]]


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
        except Exception as exc:
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
            await context.checkpoint(context.task.get("checkpoint") or {})


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
    from agent_loop import MAX_STEPS, run_agent_loop

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

    try:
        output = await run_agent_loop(request_text, task["id"], on_event)
        await asyncio.to_thread(context.repo.update_step, plan["id"], "completed", output=output)
        await context.checkpoint({"stage": "agent_completed", "step_id": plan["id"]})
        await context.event(
            "axe.progress",
            f"AXE finished in {output.get('steps_used')} steps and proved the result.",
        )
        return output
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

    worker = TaskWorker(
        TaskRepository(db),
        {"agentic": agentic_handler, "task_manage": task_manage_handler},
        lease_seconds=int(os.environ.get("TASK_LEASE_SECONDS", "90")),
    )
    # Found live 2026-08-17: db()'s 15s postgrest timeout makes a transient
    # Supabase hiccup during claim() an *expected*, routine event — but
    # nothing here caught it, so every single occurrence killed the whole
    # process. systemd restarted it in a tight loop (69 restarts observed in
    # minutes) instead of the worker just trying again next tick. A crashed
    # worker also means no durable task — including chat's own delegated
    # work — ever gets picked up until the next restart lands.
    consecutive_errors = 0
    while True:
        try:
            worked = await worker.run_once()
            consecutive_errors = 0
            if not worked:
                await asyncio.sleep(2)
        except Exception as exc:
            consecutive_errors += 1
            log.error(f"[task_worker] run_once failed (consecutive={consecutive_errors}): {exc}")
            # Back off further on sustained failure (e.g. Supabase actually
            # down) instead of hammering it every 2s, capped at 30s.
            await asyncio.sleep(min(2 * consecutive_errors, 30))


if __name__ == "__main__":
    asyncio.run(run_forever())
