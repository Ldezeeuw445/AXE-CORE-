"""Worker primitives for the durable AXE execution kernel.

It runs separately from FastAPI. Keeping long agent work out of the API
process prevents it from starving health/chat endpoints.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import os
import socket
from collections.abc import Awaitable, Callable
from typing import Any

from task_runtime import TaskRepository

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
    """Only claim checks for evidence the worker actually possesses."""
    checks = [
        {"name": "agent_result_present", "passed": bool(result.get("summary"))},
        {"name": "openhands_run_identified", "passed": bool(result.get("openhands_task_id"))},
        {"name": "result_persisted", "passed": True},
    ]
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
    """Dispatch one durable action request to the configured OpenHands bridge."""
    import httpx

    request_text = str((task.get("payload") or {}).get("request") or task.get("goal") or "").strip()
    if not request_text:
        raise ValueError("task payload has no request")

    plan = await asyncio.to_thread(
        context.repo.create_step,
        task["id"],
        "execute_agent",
        "Execute the request with AXE's coding agent",
        step_order=0,
        kind="agent",
        input_data={"request": request_text},
    )
    await asyncio.to_thread(context.repo.update_step, plan["id"], "running")
    checkpoint = context.task.get("checkpoint") or {}
    openhands_task_id = checkpoint.get("openhands_task_id")
    await context.checkpoint({
        **checkpoint, "stage": "agent_running", "step_id": plan["id"],
    })
    await context.event("axe.progress", "AXE delegated the work to its coding agent.")

    api_key = os.environ["AXE_API_KEY"]
    try:
        async with httpx.AsyncClient(timeout=600) as client:
            response = await client.post(
                "http://127.0.0.1:8001/internal/openhands/execute",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "task": request_text,
                    "context": f"Durable AXE task {task['id']}",
                    "openhands_task_id": openhands_task_id,
                },
            )
        response.raise_for_status()
        data = response.json()
        returned_task_id = data.get("openhands_task_id") or openhands_task_id
        if data.get("status") == "running":
            await context.checkpoint({
                "stage": "agent_running",
                "step_id": plan["id"],
                "openhands_task_id": returned_task_id,
                "openhands_conversation_id": data.get("conversation_id"),
            })
            await context.event(
                "axe.progress",
                "AXE's coding agent is still working; the durable run will resume it.",
                {"openhands_task_id": returned_task_id},
            )
            raise RuntimeError("coding agent is still running")
        result_text = normalize_agent_result(data.get("result") or data.get("response"))
        if not result_text:
            raise RuntimeError("coding agent returned no result")
        output = {
            "summary": result_text,
            "openhands_task_id": returned_task_id,
            "openhands_conversation_id": data.get("conversation_id"),
        }
        await asyncio.to_thread(context.repo.update_step, plan["id"], "completed", output=output)
        await context.checkpoint({"stage": "agent_completed", "step_id": plan["id"]})
        await context.event("axe.progress", "AXE's coding agent finished; verification is starting.")
        return output
    except Exception as exc:
        await asyncio.to_thread(
            context.repo.update_step,
            plan["id"],
            "failed",
            error={"message": str(exc)[:1000]},
        )
        raise


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
        {"agentic": agentic_handler},
        lease_seconds=int(os.environ.get("TASK_LEASE_SECONDS", "90")),
    )
    while True:
        worked = await worker.run_once()
        if not worked:
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(run_forever())
