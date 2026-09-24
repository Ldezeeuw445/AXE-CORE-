"""Gedeelde taakstatus voor Browser Use en Camofox.

De API draait met twee uvicorn-workers. Een dict in het proces is dan
onzichtbaar voor de andere worker: de browser-tab pollt /task/{id} en krijgt
404 terwijl de taak op de worker loopt die de POST aannam.
"""
from __future__ import annotations

import fcntl
import json
import os
from pathlib import Path
from typing import Any

PATH = Path(os.getenv("AXE_BROWSER_TASK_STORE", "/tmp/axe-browser-tasks.json"))
MAX_TASKS = 40


def _locked(mutate) -> Any:
    PATH.parent.mkdir(parents=True, exist_ok=True)
    with PATH.open("a+") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            handle.seek(0)
            raw = handle.read()
            data: dict[str, dict[str, Any]] = json.loads(raw) if raw.strip() else {}
            result = mutate(data)
            # De oudste taken weg, anders groeit het bestand bij elke opdracht.
            if len(data) > MAX_TASKS:
                ordered = sorted(data.items(), key=lambda item: item[1].get("created_at", 0))
                for key, _ in ordered[: len(data) - MAX_TASKS]:
                    data.pop(key, None)
            handle.seek(0)
            handle.truncate()
            handle.write(json.dumps(data))
            return result
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def put_task(task: dict[str, Any]) -> dict[str, Any]:
    def mutate(data: dict[str, dict[str, Any]]) -> dict[str, Any]:
        data[task["id"]] = task
        return task

    return _locked(mutate)


def patch_task(task_id: str, **fields: Any) -> None:
    def mutate(data: dict[str, dict[str, Any]]) -> None:
        current = data.get(task_id)
        if current is not None:
            current.update(fields)

    _locked(mutate)


def get_task(task_id: str) -> dict[str, Any] | None:
    def mutate(data: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
        task = data.get(task_id)
        return dict(task) if task else None

    return _locked(mutate)


def list_tasks() -> list[dict[str, Any]]:
    def mutate(data: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        rows = sorted(data.values(), key=lambda item: item.get("created_at", 0), reverse=True)
        return [
            {
                "id": row.get("id"),
                "provider": row.get("provider"),
                "status": row.get("status"),
                "message": str(row.get("message", ""))[:200],
                "created_at": row.get("created_at"),
            }
            for row in rows[:20]
        ]

    return _locked(mutate)

