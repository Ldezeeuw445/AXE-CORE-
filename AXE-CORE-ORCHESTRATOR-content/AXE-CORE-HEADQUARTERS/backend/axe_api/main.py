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
ALLOWED_ORIGINS  = os.environ.get(
    "ALLOWED_ORIGINS",
    "https://axe-core-rust.vercel.app,http://localhost:5173"
).split(",")

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
