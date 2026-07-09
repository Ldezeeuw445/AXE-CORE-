"""
AXE Core API — God Mode Backend Service
========================================
Runs on VPS (89.167.78.6) alongside n8n.
Gives AXE CORE frontend privileged access to:
  • Supabase   — service_role key (bypasses ALL RLS)
  • n8n        — workflow CRUD + triggers
  • GitHub     — file read/write, commits, PRs

All write operations are audit-logged to core_audit_log.
Protected by Bearer token auth (AXE_API_KEY env var).
CORS restricted to axe-core-rust.vercel.app.

Future: Cloudflare, Vercel, Railway, MetaAPI
"""

from __future__ import annotations
import base64
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

from dotenv import load_dotenv
load_dotenv()  # Load .env from current directory automatically

import httpx
from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from supabase import Client, create_client

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("axe_core_api")

# ── Config ────────────────────────────────────────────────────────────────────
AXE_API_KEY      = os.environ["AXE_API_KEY"]            # Secret bearer token
SUPABASE_URL     = os.environ["SUPABASE_URL"]            # https://xxx.supabase.co
SUPABASE_SRK     = os.environ["SUPABASE_SERVICE_ROLE"]   # service_role key
N8N_URL          = os.environ.get("N8N_URL", "http://localhost:5678")
N8N_API_KEY      = os.environ.get("N8N_API_KEY", "")
GITHUB_TOKEN     = os.environ.get("GITHUB_TOKEN", "")
LANGGRAPH_URL    = os.environ.get("LANGGRAPH_URL", "")
OPENHANDS_URL    = os.environ.get("OPENHANDS_URL", "")
OPENJARVIS_URL   = os.environ.get("OPENJARVIS_URL", "")
OPENCLAW_URL     = os.environ.get("OPENCLAW_URL", "")
KILOCODE_URL     = os.environ.get("KILOCODE_URL", "")
CREWAI_URL       = os.environ.get("CREWAI_URL", "")
HERMES_URL       = os.environ.get("HERMES_URL", "")
TERMINAL_HEALTH_URL = os.environ.get("TERMINAL_HEALTH_URL", "http://127.0.0.1:4022/health")
ALLOWED_ORIGINS  = os.environ.get(
    "ALLOWED_ORIGINS",
    "https://axe-core-rust.vercel.app,http://localhost:5173"
).split(",")

INTEGRATION_ENDPOINTS: dict[str, str] = {
    "openhands": OPENHANDS_URL,
    "openjarvis": OPENJARVIS_URL,
    "openclaw": OPENCLAW_URL,
    "kilocode": KILOCODE_URL,
    "crewai": CREWAI_URL,
    "hermes": HERMES_URL,
}

LANGGRAPH_SPECIALIST_FALLBACKS: dict[str, str] = {
    "code": "openhands",
    "patch": "openhands",
    "execute": "openhands",
    "build": "openhands",
    "debug": "openhands",
    "research": "openjarvis",
    "analysis": "openjarvis",
    "reasoning": "openjarvis",
    "automation": "n8n",
    "workflow": "n8n",
    "journal": "openjarvis",
    "productivity": "openjarvis",
}

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AXE Core API",
    version="1.0.0",
    docs_url=None,   # Disable public docs
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=86400,
)

# ── Auth ──────────────────────────────────────────────────────────────────────
_security = HTTPBearer()

def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> str:
    if credentials.credentials != AXE_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return credentials.credentials

AUTH = Depends(require_auth)

# ── Supabase (service_role) ───────────────────────────────────────────────────
def sb() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SRK)

# ── Audit logging ─────────────────────────────────────────────────────────────
async def audit(action: str, resource: str, details: dict, ip: str = ""):
    try:
        sb().table("core_audit_log").insert({
            "action": action,
            "resource": resource,
            "details": details,
            "performed_by": "axe_core_api",
            "ip_address": ip,
        }).execute()
    except Exception as e:
        log.warning(f"Audit log failed: {e}")

async def record_event(
    event_type: str,
    source: str,
    message: str,
    *,
    severity: str = "info",
    task_id: Optional[str] = None,
    route_path: Optional[str] = None,
    data: Optional[dict[str, Any]] = None,
    metadata: Optional[dict[str, Any]] = None,
):
    payload = {
        "event_type": event_type,
        "source": source,
        "severity": severity,
        "message": message,
        "task_id": task_id,
        "route_path": route_path,
        "data": data or {},
        "metadata": metadata or {},
    }
    try:
        sb().table("core_events").insert(payload).execute()
    except Exception as e:
        log.warning(f"Event log failed: {e}")

async def fetch_related_task_bundle(task_id: str) -> dict[str, Any]:
    task = sb().table("core_tasks").select("*").eq("id", task_id).single().execute().data
    if not task:
        raise HTTPException(404, "Task not found")
    steps = sb().table("core_task_steps").select("*").eq("task_id", task_id).order("step_order").execute().data or []
    tool_calls = sb().table("core_tool_calls").select("*").eq("task_id", task_id).order("created_at", desc=True).execute().data or []
    approvals = sb().table("core_approvals").select("*").eq("task_id", task_id).order("created_at", desc=True).execute().data or []
    patches = sb().table("core_patches").select("*").eq("task_id", task_id).order("created_at", desc=True).execute().data or []
    events = sb().table("core_events").select("*").eq("task_id", task_id).order("created_at", desc=True).limit(50).execute().data or []
    return {
        "task": task,
        "steps": steps,
        "tool_calls": tool_calls,
        "approvals": approvals,
        "patches": patches,
        "events": events,
    }

# ── Models ────────────────────────────────────────────────────────────────────
class SqlRequest(BaseModel):
    sql: str

class RowData(BaseModel):
    data: dict[str, Any]

class FileUpdate(BaseModel):
    repo: str        # "owner/repo"
    path: str        # "src/foo.tsx"
    content: str     # file content (plain text)
    message: str     # commit message
    branch: str = "main"

class PrRequest(BaseModel):
    repo: str
    title: str
    body: str
    head: str
    base: str = "main"

class TaskStepInput(BaseModel):
    title: str
    status: str = "pending"
    notes: str | None = None
    tool_name: str | None = None
    metadata: dict[str, Any] = {}

class TaskCreateRequest(BaseModel):
    title: str
    description: str | None = None
    priority: str = "medium"
    source_app: str = "axe_core"
    requested_by: str | None = None
    assignee: str | None = None
    capability: str | None = None
    execution_mode: str = "read"
    route_path: str | None = None
    payload: dict[str, Any] = {}
    metadata: dict[str, Any] = {}
    steps: list[TaskStepInput] = []

class TaskActionRequest(BaseModel):
    decided_by: str | None = None
    notes: str | None = None
    metadata: dict[str, Any] = {}

class HookRequest(BaseModel):
    task_id: str | None = None
    event_type: str = "callback"
    source: str | None = None
    message: str | None = None
    payload: dict[str, Any] = {}

class InternalDispatchRequest(BaseModel):
    task_id: str | None = None
    route_path: str | None = None
    payload: dict[str, Any] = {}
    metadata: dict[str, Any] = {}

# ══════════════════════════════════════════════════════════════════════════════
# HEALTH
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "axe-core-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "supabase": bool(SUPABASE_URL),
        "n8n": bool(N8N_API_KEY),
        "github": bool(GITHUB_TOKEN),
        "langgraph": True,
        "langgraph_mode": "external" if LANGGRAPH_URL else "internal",
        "integrations": {name: bool(url) for name, url in INTEGRATION_ENDPOINTS.items()},
    }

@app.get("/terminal-health")
async def terminal_health():
    t = datetime.now(timezone.utc)
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(TERMINAL_HEALTH_URL)
            data = res.json() if res.content else {}
            return {
                "status": "ok" if res.ok else "error",
                "service": "terminal",
                "timestamp": t.isoformat(),
                "upstream": TERMINAL_HEALTH_URL,
                "response": data,
                "http_status": res.status_code,
            }
    except Exception as exc:
        return {
            "status": "error",
            "service": "terminal",
            "timestamp": t.isoformat(),
            "upstream": TERMINAL_HEALTH_URL,
            "error": str(exc),
        }

# ══════════════════════════════════════════════════════════════════════════════
# SUPABASE — Full read/write via service_role (bypasses RLS)
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/supabase/tables", dependencies=[AUTH])
async def list_tables():
    """All tables with row counts (via get_table_stats RPC)."""
    result = sb().rpc("get_table_stats").execute()
    return result.data or []

@app.post("/supabase/sql", dependencies=[AUTH])
async def run_sql(req: SqlRequest, request: Request):
    """Execute arbitrary SQL via exec_sql RPC (SELECT or write)."""
    result = sb().rpc("exec_sql", {"query": req.sql}).execute()
    await audit("sql", "supabase", {"sql": req.sql[:500]}, request.client.host if request.client else "")
    return result.data

@app.get("/supabase/table/{table_name}", dependencies=[AUTH])
async def get_table_rows(
    table_name: str,
    limit: int = 50,
    offset: int = 0,
    order_by: Optional[str] = None,
    order_dir: str = "desc",
    filter_col: Optional[str] = None,
    filter_val: Optional[str] = None,
):
    """Get rows from any table. Supports basic filter + order."""
    q = sb().table(table_name).select("*").limit(limit).offset(offset)
    if order_by:
        q = q.order(order_by, desc=(order_dir == "desc"))
    if filter_col and filter_val is not None:
        q = q.eq(filter_col, filter_val)
    result = q.execute()
    return result.data or []

@app.post("/supabase/table/{table_name}", dependencies=[AUTH])
async def insert_row(table_name: str, req: RowData, request: Request):
    """Insert a row into any table."""
    result = sb().table(table_name).insert(req.data).execute()
    await audit("insert", table_name, {"data": req.data}, request.client.host if request.client else "")
    return result.data

@app.patch("/supabase/table/{table_name}/{row_id}", dependencies=[AUTH])
async def update_row(table_name: str, row_id: str, req: RowData, request: Request):
    """Update a row by ID."""
    result = sb().table(table_name).update(req.data).eq("id", row_id).execute()
    await audit("update", f"{table_name}/{row_id}", {"data": req.data}, request.client.host if request.client else "")
    return result.data

@app.delete("/supabase/table/{table_name}/{row_id}", dependencies=[AUTH])
async def delete_row(table_name: str, row_id: str, request: Request):
    """Delete a row by ID."""
    sb().table(table_name).delete().eq("id", row_id).execute()
    await audit("delete", f"{table_name}/{row_id}", {}, request.client.host if request.client else "")
    return {"deleted": True}

# ══════════════════════════════════════════════════════════════════════════════
# N8N — Workflow management
# ══════════════════════════════════════════════════════════════════════════════

async def _n8n(method: str, path: str, data: dict | None = None) -> Any:
    if not N8N_API_KEY:
        raise HTTPException(503, "n8n API key not configured (N8N_API_KEY)")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.request(
            method,
            f"{N8N_URL}/api/v1{path}",
            json=data,
            headers={"X-N8N-API-KEY": N8N_API_KEY},
        )
        if not r.is_success:
            raise HTTPException(r.status_code, f"n8n error: {r.text[:200]}")
        return r.json() if r.content else {}

@app.get("/n8n/workflows", dependencies=[AUTH])
async def list_workflows():
    data = await _n8n("GET", "/workflows?limit=50")
    return data.get("data", data)

@app.get("/n8n/workflows/{wf_id}", dependencies=[AUTH])
async def get_workflow(wf_id: str):
    return await _n8n("GET", f"/workflows/{wf_id}")

@app.put("/n8n/workflows/{wf_id}", dependencies=[AUTH])
async def update_workflow(wf_id: str, payload: dict = Body(...), request: Request = None):
    result = await _n8n("PUT", f"/workflows/{wf_id}", payload)
    await audit("workflow_update", f"n8n/{wf_id}", {"keys": list(payload.keys())})
    return result

@app.post("/n8n/workflows/{wf_id}/activate", dependencies=[AUTH])
async def activate_workflow(wf_id: str):
    result = await _n8n("POST", f"/workflows/{wf_id}/activate")
    await audit("workflow_activate", f"n8n/{wf_id}", {})
    return result

@app.post("/n8n/workflows/{wf_id}/deactivate", dependencies=[AUTH])
async def deactivate_workflow(wf_id: str):
    result = await _n8n("POST", f"/workflows/{wf_id}/deactivate")
    await audit("workflow_deactivate", f"n8n/{wf_id}", {})
    return result

@app.post("/n8n/workflows/{wf_id}/execute", dependencies=[AUTH])
async def execute_workflow(wf_id: str):
    result = await _n8n("POST", f"/executions", {"workflowId": wf_id})
    await audit("workflow_execute", f"n8n/{wf_id}", {})
    return result

@app.get("/n8n/executions", dependencies=[AUTH])
async def list_executions(wf_id: Optional[str] = None, limit: int = 20):
    path = f"/executions?limit={limit}"
    if wf_id:
        path += f"&workflowId={wf_id}"
    data = await _n8n("GET", path)
    return data.get("data", data)

# ══════════════════════════════════════════════════════════════════════════════
# GITHUB — Code read/write
# ══════════════════════════════════════════════════════════════════════════════

async def _gh(method: str, path: str, data: dict | None = None) -> Any:
    if not GITHUB_TOKEN:
        raise HTTPException(503, "GitHub token not configured (GITHUB_TOKEN)")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.request(
            method,
            f"https://api.github.com{path}",
            json=data,
            headers={
                "Authorization": f"token {GITHUB_TOKEN}",
                "Accept": "application/vnd.github.v3+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        if not r.is_success:
            raise HTTPException(r.status_code, f"GitHub error: {r.text[:200]}")
        return r.json() if r.content else {}

@app.get("/github/repos", dependencies=[AUTH])
async def list_repos():
    return await _gh("GET", "/user/repos?per_page=50&sort=updated&type=owner")

@app.get("/github/file", dependencies=[AUTH])
async def get_file(repo: str, path: str, branch: str = "main"):
    """Get decoded file content. repo = 'owner/repo'"""
    data = await _gh("GET", f"/repos/{repo}/contents/{path}?ref={branch}")
    content = base64.b64decode(data["content"].replace("\n", "")).decode("utf-8")
    return {"path": path, "content": content, "sha": data["sha"], "size": data["size"]}

@app.put("/github/file", dependencies=[AUTH])
async def update_file(req: FileUpdate, request: Request):
    """Create or update a file (makes a commit)."""
    sha: str | None = None
    try:
        existing = await _gh("GET", f"/repos/{req.repo}/contents/{req.path}?ref={req.branch}")
        sha = existing.get("sha")
    except HTTPException:
        pass  # New file

    payload: dict = {
        "message": req.message,
        "content": base64.b64encode(req.content.encode()).decode(),
        "branch": req.branch,
    }
    if sha:
        payload["sha"] = sha

    result = await _gh("PUT", f"/repos/{req.repo}/contents/{req.path}", payload)
    await audit("github_file_update", f"{req.repo}/{req.path}", {"message": req.message}, request.client.host if request.client else "")
    return {
        "committed": True,
        "sha": result.get("commit", {}).get("sha"),
        "url": result.get("content", {}).get("html_url"),
    }

@app.post("/github/pr", dependencies=[AUTH])
async def create_pr(req: PrRequest, request: Request):
    """Create a pull request."""
    result = await _gh("POST", f"/repos/{req.repo}/pulls", {
        "title": req.title,
        "body": req.body,
        "head": req.head,
        "base": req.base,
    })
    await audit("github_pr", req.repo, {"title": req.title}, request.client.host if request.client else "")
    return {"pr_url": result.get("html_url"), "number": result.get("number")}

@app.get("/github/branches", dependencies=[AUTH])
async def list_branches(repo: str):
    return await _gh("GET", f"/repos/{repo}/branches")

@app.get("/github/tree", dependencies=[AUTH])
async def get_tree(repo: str, branch: str = "main"):
    """Get full file tree of a repo."""
    data = await _gh("GET", f"/repos/{repo}/git/trees/{branch}?recursive=1")
    return [f["path"] for f in data.get("tree", []) if f["type"] == "blob"]

# ══════════════════════════════════════════════════════════════════════════════
# CONTROL PLANE — tasks, approvals, patches, hooks, route registry
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/routes", dependencies=[AUTH])
async def list_routes(kind: Optional[str] = None):
    q = sb().table("core_route_registry").select("*").order("kind").order("path")
    if kind:
        q = q.eq("kind", kind)
    result = q.execute()
    return result.data or []

@app.get("/api/tasks", dependencies=[AUTH])
async def list_tasks(limit: int = 50, status: Optional[str] = None):
    q = sb().table("core_tasks").select("*").order("created_at", desc=True).limit(limit)
    if status:
        q = q.eq("status", status)
    result = q.execute()
    return result.data or []

@app.post("/api/tasks", dependencies=[AUTH])
async def create_task(req: TaskCreateRequest, request: Request):
    payload = {
        "title": req.title,
        "description": req.description,
        "priority": req.priority,
        "source_app": req.source_app,
        "requested_by": req.requested_by,
        "assignee": req.assignee,
        "capability": req.capability,
        "execution_mode": req.execution_mode,
        "route_path": req.route_path,
        "payload": req.payload,
        "metadata": req.metadata,
    }
    created = sb().table("core_tasks").insert(payload).select("*").single().execute().data
    if not created:
        raise HTTPException(500, "Task create failed")
    if req.steps:
        step_rows = [{
            "task_id": created["id"],
            "step_order": index,
            "title": step.title,
            "status": step.status,
            "notes": step.notes,
            "tool_name": step.tool_name,
            "metadata": step.metadata,
        } for index, step in enumerate(req.steps, start=1)]
        sb().table("core_task_steps").insert(step_rows).execute()
    await record_event(
        "task_created",
        "axe_core_api",
        f"Task created: {req.title}",
        task_id=created["id"],
        route_path=req.route_path,
        data=payload,
        metadata={"requested_by": req.requested_by, "ip": request.client.host if request.client else ""},
    )
    await audit("task_create", "core_tasks", {"title": req.title, "priority": req.priority}, request.client.host if request.client else "")
    return await fetch_related_task_bundle(created["id"])

@app.get("/api/tasks/{task_id}", dependencies=[AUTH])
async def get_task(task_id: str):
    return await fetch_related_task_bundle(task_id)

@app.post("/api/tasks/{task_id}/approve", dependencies=[AUTH])
async def approve_task(task_id: str, req: TaskActionRequest, request: Request):
    task = sb().table("core_tasks").select("*").eq("id", task_id).single().execute().data
    if not task:
        raise HTTPException(404, "Task not found")
    sb().table("core_tasks").update({"status": "approved", "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", task_id).execute()
    approval = {
        "task_id": task_id,
        "target_type": "task",
        "target_id": task_id,
        "status": "approved",
        "requested_by": task.get("requested_by"),
        "decided_by": req.decided_by,
        "decided_at": datetime.now(timezone.utc).isoformat(),
        "notes": req.notes,
        "metadata": req.metadata,
    }
    sb().table("core_approvals").insert(approval).execute()
    await record_event("task_approved", "axe_core_api", f"Task approved: {task.get('title')}", task_id=task_id, route_path="/api/tasks/:id/approve", data=approval)
    await audit("task_approve", f"core_tasks/{task_id}", approval, request.client.host if request.client else "")
    return await fetch_related_task_bundle(task_id)

@app.post("/api/tasks/{task_id}/reject", dependencies=[AUTH])
async def reject_task(task_id: str, req: TaskActionRequest, request: Request):
    task = sb().table("core_tasks").select("*").eq("id", task_id).single().execute().data
    if not task:
        raise HTTPException(404, "Task not found")
    sb().table("core_tasks").update({"status": "rejected", "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", task_id).execute()
    approval = {
        "task_id": task_id,
        "target_type": "task",
        "target_id": task_id,
        "status": "rejected",
        "requested_by": task.get("requested_by"),
        "decided_by": req.decided_by,
        "decided_at": datetime.now(timezone.utc).isoformat(),
        "notes": req.notes,
        "metadata": req.metadata,
    }
    sb().table("core_approvals").insert(approval).execute()
    await record_event("task_rejected", "axe_core_api", f"Task rejected: {task.get('title')}", severity="warn", task_id=task_id, route_path="/api/tasks/:id/reject", data=approval)
    await audit("task_reject", f"core_tasks/{task_id}", approval, request.client.host if request.client else "")
    return await fetch_related_task_bundle(task_id)

@app.get("/api/patches/{patch_id}", dependencies=[AUTH])
async def get_patch(patch_id: str):
    result = sb().table("core_patches").select("*").eq("id", patch_id).single().execute()
    if not result.data:
        raise HTTPException(404, "Patch not found")
    return result.data

@app.post("/api/hooks/n8n", dependencies=[AUTH])
async def hook_n8n(req: HookRequest, request: Request):
    await record_event("hook_n8n", req.source or "n8n", req.message or "n8n hook received", task_id=req.task_id, route_path="/api/hooks/n8n", data=req.payload, metadata={"ip": request.client.host if request.client else ""})
    await audit("hook_n8n", "n8n", req.model_dump(), request.client.host if request.client else "")
    return {"ok": True, "accepted": True}

@app.post("/api/hooks/langgraph", dependencies=[AUTH])
async def hook_langgraph(req: HookRequest, request: Request):
    await record_event("hook_langgraph", req.source or "langgraph", req.message or "langgraph hook received", task_id=req.task_id, route_path="/api/hooks/langgraph", data=req.payload, metadata={"ip": request.client.host if request.client else ""})
    await audit("hook_langgraph", "langgraph", req.model_dump(), request.client.host if request.client else "")
    return {"ok": True, "accepted": True}

async def _dispatch_optional(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    if not url:
        return {"dispatched": False, "reason": "downstream_not_configured"}
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(url, json=payload)
        body = res.json() if res.content else {}
        return {"dispatched": True, "status_code": res.status_code, "body": body}

async def _dispatch_integration(service: str, payload: dict[str, Any]) -> dict[str, Any]:
    return await _dispatch_optional(INTEGRATION_ENDPOINTS.get(service, ""), payload)

def _pick_langgraph_target(payload: dict[str, Any]) -> str | None:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    body = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}

    for key in ("target_service", "specialist", "service", "agent"):
        candidate = metadata.get(key) or body.get(key) or payload.get(key)
        if isinstance(candidate, str) and candidate in INTEGRATION_ENDPOINTS:
            return candidate

    route_path = " ".join(
        str(part)
        for part in (
            payload.get("route_path"),
            metadata.get("route_path"),
            body.get("route_path"),
        )
        if part
    ).lower()
    for service in INTEGRATION_ENDPOINTS:
        if service in route_path:
            return service

    text = " ".join(
        str(part)
        for part in (
            payload.get("capability"),
            metadata.get("capability"),
            body.get("capability"),
            body.get("task"),
            body.get("message"),
        )
        if part
    ).lower()
    for token, service in LANGGRAPH_SPECIALIST_FALLBACKS.items():
        if token in text:
            return service

    return None

@app.post("/internal/langgraph/run", dependencies=[AUTH])
async def internal_langgraph_run(req: InternalDispatchRequest, request: Request):
    payload = req.model_dump()
    await record_event("internal_langgraph_run", "axe_core_api", "Internal LangGraph dispatch", task_id=req.task_id, route_path="/internal/langgraph/run", data=payload, metadata={"ip": request.client.host if request.client else ""})
    if LANGGRAPH_URL:
        dispatched = await _dispatch_optional(LANGGRAPH_URL, payload)
        return {"ok": True, "mode": "external", **dispatched}

    target = _pick_langgraph_target(payload)
    if target:
        dispatched = await _dispatch_integration(target, payload)
        return {"ok": True, "mode": "internal-route", "target": target, **dispatched}

    return {
        "ok": True,
        "mode": "internal-orchestrator",
        "dispatched": True,
        "status_code": 200,
        "body": {
            "message": "LangGraph orchestrator is running inside AXE Core API.",
            "route_path": payload.get("route_path"),
            "task_id": payload.get("task_id"),
        },
    }

@app.post("/internal/openhands/execute", dependencies=[AUTH])
async def internal_openhands_execute(req: InternalDispatchRequest, request: Request):
    payload = req.model_dump()
    await record_event("internal_openhands_execute", "axe_core_api", "Internal OpenHands dispatch", task_id=req.task_id, route_path="/internal/openhands/execute", data=payload, metadata={"ip": request.client.host if request.client else ""})
    dispatched = await _dispatch_optional(OPENHANDS_URL, payload)
    return {"ok": True, **dispatched}

@app.post("/internal/openjarvis/execute", dependencies=[AUTH])
async def internal_openjarvis_execute(req: InternalDispatchRequest, request: Request):
    payload = req.model_dump()
    await record_event("internal_openjarvis_execute", "axe_core_api", "Internal OpenJarvis dispatch", task_id=req.task_id, route_path="/internal/openjarvis/execute", data=payload, metadata={"ip": request.client.host if request.client else ""})
    dispatched = await _dispatch_integration("openjarvis", payload)
    return {"ok": True, **dispatched}

@app.post("/internal/openclaw/execute", dependencies=[AUTH])
async def internal_openclaw_execute(req: InternalDispatchRequest, request: Request):
    payload = req.model_dump()
    await record_event("internal_openclaw_execute", "axe_core_api", "Internal OpenClaw dispatch", task_id=req.task_id, route_path="/internal/openclaw/execute", data=payload, metadata={"ip": request.client.host if request.client else ""})
    dispatched = await _dispatch_integration("openclaw", payload)
    return {"ok": True, **dispatched}

@app.post("/internal/kilocode/execute", dependencies=[AUTH])
async def internal_kilocode_execute(req: InternalDispatchRequest, request: Request):
    payload = req.model_dump()
    await record_event("internal_kilocode_execute", "axe_core_api", "Internal Kilo Code dispatch", task_id=req.task_id, route_path="/internal/kilocode/execute", data=payload, metadata={"ip": request.client.host if request.client else ""})
    dispatched = await _dispatch_integration("kilocode", payload)
    return {"ok": True, **dispatched}

@app.post("/internal/crewai/execute", dependencies=[AUTH])
async def internal_crewai_execute(req: InternalDispatchRequest, request: Request):
    payload = req.model_dump()
    await record_event("internal_crewai_execute", "axe_core_api", "Internal CrewAI dispatch", task_id=req.task_id, route_path="/internal/crewai/execute", data=payload, metadata={"ip": request.client.host if request.client else ""})
    dispatched = await _dispatch_integration("crewai", payload)
    return {"ok": True, **dispatched}

@app.post("/internal/hermes/execute", dependencies=[AUTH])
async def internal_hermes_execute(req: InternalDispatchRequest, request: Request):
    payload = req.model_dump()
    await record_event("internal_hermes_execute", "axe_core_api", "Internal Hermes dispatch", task_id=req.task_id, route_path="/internal/hermes/execute", data=payload, metadata={"ip": request.client.host if request.client else ""})
    dispatched = await _dispatch_integration("hermes", payload)
    return {"ok": True, **dispatched}

@app.post("/internal/n8n/trigger", dependencies=[AUTH])
async def internal_n8n_trigger(req: InternalDispatchRequest, request: Request):
    payload = req.model_dump()
    await record_event("internal_n8n_trigger", "axe_core_api", "Internal n8n trigger", task_id=req.task_id, route_path="/internal/n8n/trigger", data=payload, metadata={"ip": request.client.host if request.client else ""})
    workflow_id = payload.get("payload", {}).get("workflow_id") or payload.get("payload", {}).get("workflowId")
    if workflow_id:
        result = await _n8n("POST", "/executions", {"workflowId": workflow_id})
        return {"ok": True, "dispatched": True, "body": result}
    return {"ok": True, "dispatched": False, "reason": "workflow_id_missing"}
