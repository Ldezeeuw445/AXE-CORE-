"""Durable AXE task-run state machine and Supabase repository."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable
from uuid import UUID

TERMINAL = {"completed", "done", "failed", "cancelled", "rejected"}
ACTIVE = {"planning", "running", "in_progress", "verifying"}
TRANSITIONS: dict[str, set[str]] = {
    "pending": {"queued", "cancelled"},
    "queued": {"planning", "running", "cancelled"},
    "planning": {"running", "waiting_approval", "retrying", "failed", "cancelled"},
    "running": {"in_progress", "waiting_approval", "verifying", "retrying", "completed", "failed", "cancelled"},
    "in_progress": {"waiting_approval", "verifying", "retrying", "completed", "failed", "cancelled"},
    "waiting_approval": {"queued", "running", "rejected", "cancelled"},
    "approved": {"queued", "running", "cancelled"},
    "verifying": {"running", "retrying", "completed", "failed", "cancelled"},
    "retrying": {"queued", "running", "failed", "cancelled"},
    "blocked": {"queued", "waiting_approval", "failed", "cancelled"},
}


def require_transition(current: str, target: str) -> None:
    if current == target:
        return
    if current in TERMINAL or target not in TRANSITIONS.get(current, set()):
        raise ValueError(f"invalid task transition: {current} -> {target}")


def redact_event_data(data: dict[str, Any] | None) -> dict[str, Any]:
    """Defense in depth: event streams must not become a secret store."""
    blocked = ("secret", "password", "token", "api_key", "authorization", "cookie")
    clean: dict[str, Any] = {}
    for key, value in (data or {}).items():
        clean[key] = "[REDACTED]" if any(word in key.lower() for word in blocked) else value
    return clean


@dataclass(frozen=True)
class Lease:
    task_id: str
    worker_id: str
    token: str
    expires_at: str


class TaskRepository:
    def __init__(self, client_factory: Callable[[], Any]):
        self._client_factory = client_factory

    def _db(self) -> Any:
        return self._client_factory()

    def append_event(
        self,
        task_id: str,
        event_type: str,
        *,
        actor_type: str = "system",
        actor_id: str | None = None,
        step_id: str | None = None,
        message: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        row = {
            "task_id": task_id,
            "step_id": step_id,
            "event_type": event_type,
            "actor_type": actor_type,
            "actor_id": actor_id,
            "message": message,
            "data": redact_event_data(data),
        }
        return self._db().table("core_task_events").insert(row).execute().data[0]

    def create_step(
        self,
        task_id: str,
        step_key: str,
        title: str,
        *,
        step_order: int,
        kind: str = "action",
        input_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        existing = (
            self._db().table("core_task_steps").select("*")
            .eq("task_id", task_id).eq("step_key", step_key).limit(1).execute().data
        )
        if existing:
            return existing[0]
        rows = self._db().table("core_task_steps").insert({
            "task_id": task_id,
            "step_key": step_key,
            "step_order": step_order,
            "title": title,
            "kind": kind,
            "status": "pending",
            "input": input_data or {},
        }).execute().data
        return rows[0]

    def update_step(
        self,
        step_id: str,
        status: str,
        *,
        output: dict[str, Any] | None = None,
        error: dict[str, Any] | None = None,
        checkpoint: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        changes: dict[str, Any] = {"status": status, "updated_at": now}
        if status in {"running", "in_progress"}:
            changes["started_at"] = now
        if status in {"completed", "done", "failed", "cancelled", "skipped"}:
            changes["completed_at"] = now
        if output is not None:
            changes["output"] = output
        if error is not None:
            changes["error"] = error
        elif status in {"completed", "done"}:
            changes["error"] = None
        if checkpoint is not None:
            changes["checkpoint"] = checkpoint
        rows = self._db().table("core_task_steps").update(changes).eq("id", step_id).execute().data
        if not rows:
            raise KeyError(step_id)
        return rows[0]

    def reset_steps_for_retry(self, task_id: str) -> None:
        self._db().table("core_task_steps").update({
            "status": "pending",
            "error": None,
            "completed_at": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("task_id", task_id).eq("status", "failed").execute()

    def create(self, payload: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        requester = payload.get("requested_by") or "luka"
        idem = payload.get("idempotency_key")
        if idem:
            found = (
                self._db().table("core_tasks").select("*")
                .eq("requested_by", requester).eq("idempotency_key", idem)
                .limit(1).execute().data
            )
            if found:
                return found[0], False
        row = {
            "title": payload["title"],
            "goal": payload["goal"],
            "description": payload.get("description"),
            "status": "queued",
            "priority": payload.get("priority", "medium"),
            "assignee": payload.get("assignee"),
            "source_app": payload.get("source_app", "axe_core"),
            "requested_by": requester,
            "capability": payload.get("capability"),
            "execution_mode": payload.get("execution_mode", "execute"),
            "idempotency_key": idem,
            "parent_task_id": payload.get("parent_task_id"),
            "payload": payload.get("payload") or {},
            "metadata": payload.get("metadata") or {},
        }
        task = self._db().table("core_tasks").insert(row).execute().data[0]
        self.append_event(
            task["id"], "task.queued", actor_type="user", actor_id=requester,
            message=task["title"], data={"priority": task["priority"]},
        )
        return task, True

    def list(self, status: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        q = self._db().table("core_tasks").select("*").order("created_at", desc=True).limit(min(limit, 200))
        if status:
            q = q.eq("status", status)
        return q.execute().data or []

    def update_fields(self, task_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        """Non-execution edits (title/description/priority/assignee, and a
        metadata *merge*) — deliberately separate from transition(), which
        only ever changes `status` under the worker/lease state machine.
        Tasks.tsx's simple kanban view needs to edit plain fields without
        touching that machine at all (see its 'todo'/'in-progress' UI status,
        which lives in metadata and was never a real `core_tasks.status`
        value the CHECK constraint would even accept)."""
        UUID(task_id)
        allowed = {"title", "description", "priority", "assignee"}
        changes: dict[str, Any] = {k: v for k, v in fields.items() if k in allowed}
        metadata_patch = fields.get("metadata")
        if metadata_patch is not None:
            current = self._db().table("core_tasks").select("metadata").eq("id", task_id).limit(1).execute().data
            if not current:
                raise KeyError(task_id)
            merged = {**(current[0].get("metadata") or {}), **metadata_patch}
            changes["metadata"] = merged
        if not changes:
            raise ValueError("no editable fields provided")
        rows = self._db().table("core_tasks").update(changes).eq("id", task_id).execute().data
        if not rows:
            raise KeyError(task_id)
        return rows[0]

    def delete(self, task_id: str) -> bool:
        """Hard delete — for the Tasks tab's plain tracked items, which have
        no worker lease to worry about. `on delete cascade` on
        core_task_steps/core_approvals/core_task_events (see the migration)
        takes the rest with it."""
        UUID(task_id)
        rows = self._db().table("core_tasks").delete().eq("id", task_id).execute().data
        return bool(rows)

    def get(self, task_id: str, after_sequence: int = 0) -> dict[str, Any] | None:
        UUID(task_id)
        tasks = self._db().table("core_tasks").select("*").eq("id", task_id).limit(1).execute().data
        if not tasks:
            return None
        steps = (
            self._db().table("core_task_steps").select("*")
            .eq("task_id", task_id).order("step_order").execute().data
        )
        approvals = (
            self._db().table("core_approvals").select("*")
            .eq("task_id", task_id).order("created_at").execute().data
        )
        events = (
            self._db().table("core_task_events").select("*")
            .eq("task_id", task_id).gt("sequence", after_sequence)
            .order("sequence").limit(500).execute().data
        )
        return {"task": tasks[0], "steps": steps, "approvals": approvals, "events": events}

    def claim(self, worker_id: str, lease_seconds: int) -> dict[str, Any] | None:
        rows = self._db().rpc(
            "claim_next_core_task",
            {"p_worker_id": worker_id, "p_lease_seconds": lease_seconds},
        ).execute().data
        if not rows:
            return None
        task = rows[0]
        self.append_event(
            task["id"], "task.claimed", actor_type="worker", actor_id=worker_id,
            data={"attempt": task["attempt"], "lease_expires_at": task["lease_expires_at"]},
        )
        return task

    def heartbeat(
        self, task_id: str, worker_id: str, lease_token: str,
        lease_seconds: int, checkpoint: dict[str, Any] | None,
    ) -> dict[str, Any]:
        UUID(task_id)
        UUID(lease_token)
        return self._db().rpc("heartbeat_core_task", {
            "p_task_id": task_id,
            "p_worker_id": worker_id,
            "p_lease_token": lease_token,
            "p_lease_seconds": lease_seconds,
            "p_checkpoint": checkpoint,
        }).execute().data

    def transition(
        self, task_id: str, status: str, *, worker_id: str | None = None,
        lease_token: str | None = None, result: dict[str, Any] | None = None,
        error: dict[str, Any] | None = None, checkpoint: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        current_rows = self._db().table("core_tasks").select("*").eq("id", task_id).limit(1).execute().data
        if not current_rows:
            raise KeyError(task_id)
        current = current_rows[0]
        require_transition(current["status"], status)
        if current["status"] in ACTIVE:
            if not worker_id or not lease_token:
                raise PermissionError("active task transition requires its worker lease")
            if current.get("worker_id") != worker_id or current.get("lease_token") != lease_token:
                raise PermissionError("lease lost")

        now = datetime.now(timezone.utc).isoformat()
        changes: dict[str, Any] = {
            "status": status,
            "revision": int(current.get("revision") or 0) + 1,
        }
        if checkpoint is not None:
            changes["checkpoint"] = checkpoint
        if result is not None:
            changes["result"] = result
        if error is not None:
            changes["error"] = error
        if status in {"completed", "done"}:
            changes["completed_at"] = now
            changes["error"] = None
        if status == "cancelled":
            changes["cancelled_at"] = now
        if status in TERMINAL or status == "waiting_approval":
            changes.update({"worker_id": None, "lease_token": None, "lease_expires_at": None})

        query = self._db().table("core_tasks").update(changes).eq("id", task_id).eq("revision", current["revision"])
        rows = query.execute().data
        if not rows:
            raise RuntimeError("task changed concurrently")
        if status == "retrying":
            self.reset_steps_for_retry(task_id)
        updated = rows[0]
        self.append_event(
            task_id, f"task.{status}", actor_type="worker" if worker_id else "system",
            actor_id=worker_id, data={"revision": updated["revision"]},
        )
        return updated

    def request_approval(self, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        row = {
            "task_id": task_id,
            "target_type": payload.get("target_type", "task"),
            "target_id": payload.get("target_id"),
            "kind": payload["kind"],
            "title": payload["title"],
            "detail": payload["detail"],
            "requested_by": payload.get("requested_by", "axe"),
            "expires_at": payload.get("expires_at"),
            "metadata": payload.get("metadata") or {},
        }
        approval = self._db().table("core_approvals").insert(row).execute().data[0]
        self._db().table("core_tasks").update({
            "status": "waiting_approval",
            "worker_id": None, "lease_token": None, "lease_expires_at": None,
        }).eq("id", task_id).execute()
        self.append_event(
            task_id, "approval.requested", actor_type="axe", actor_id="axe",
            message=payload["title"], data={"approval_id": approval["id"], "kind": payload["kind"]},
        )
        return approval

    def decide_approval(
        self, task_id: str, approval_id: str, approved: bool,
        decided_by: str, reason: str | None,
    ) -> dict[str, Any]:
        pending = (
            self._db().table("core_approvals").select("*")
            .eq("id", approval_id).eq("task_id", task_id).eq("status", "pending")
            .limit(1).execute().data
        )
        if not pending:
            raise KeyError(approval_id)
        status = "approved" if approved else "rejected"
        rows = self._db().table("core_approvals").update({
            "status": status,
            "decided_by": decided_by,
            "decided_at": datetime.now(timezone.utc).isoformat(),
            "decision_reason": reason,
            "revision": int(pending[0].get("revision") or 0) + 1,
        }).eq("id", approval_id).eq("status", "pending").execute().data
        if not rows:
            raise RuntimeError("approval changed concurrently")
        self._db().table("core_tasks").update({
            "status": "queued" if approved else "rejected",
            "next_attempt_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", task_id).eq("status", "waiting_approval").execute()
        self.append_event(
            task_id, f"approval.{status}", actor_type="user", actor_id=decided_by,
            data={"approval_id": approval_id},
        )
        return rows[0]
