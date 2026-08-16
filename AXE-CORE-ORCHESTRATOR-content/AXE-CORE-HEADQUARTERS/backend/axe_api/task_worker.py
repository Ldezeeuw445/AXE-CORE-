"""Worker primitives for the durable AXE execution kernel.

This module intentionally does not auto-start from FastAPI. A deployment can
run it as a separate systemd process once concrete planner/tool handlers are
registered. Keeping workers out of the API process prevents long agent work
from starving health/chat endpoints.
"""
from __future__ import annotations

import asyncio
import socket
from collections.abc import Awaitable, Callable
from typing import Any

from task_runtime import TaskRepository

TaskHandler = Callable[[dict[str, Any], "TaskContext"], Awaitable[dict[str, Any]]]


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
        try:
            result = await handler(task, context)
            await asyncio.to_thread(
                self.repo.transition,
                task["id"],
                "verifying",
                worker_id=self.worker_id,
                lease_token=context.task["lease_token"],
                checkpoint=context.task.get("checkpoint") or {},
                result=result,
            )
        except Exception as exc:
            await asyncio.to_thread(
                self.repo.transition,
                task["id"],
                "retrying" if task["attempt"] < task["max_attempts"] else "failed",
                worker_id=self.worker_id,
                lease_token=context.task["lease_token"],
                checkpoint=context.task.get("checkpoint") or {},
                error={"code": "handler_error", "message": str(exc)[:1000]},
            )
        return True
