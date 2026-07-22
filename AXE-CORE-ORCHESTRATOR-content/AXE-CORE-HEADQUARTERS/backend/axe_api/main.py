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

import asyncio
import httpx
from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from supabase import Client, create_client

from crew_runner import run_crew

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
VERCEL_TOKEN     = os.environ.get("VERCEL_TOKEN", "")
VERCEL_PROJECT_ID = os.environ.get("VERCEL_PROJECT_ID", "")
VERCEL_TEAM_ID   = os.environ.get("VERCEL_TEAM_ID", "")
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

# ── CrewAI (Branch A: VPS Ollama → 9 specialist agents) ───────────────────
class CrewRunRequest(BaseModel):
    task: str
    context: Optional[str] = None
    conversation: Optional[list] = None

class ExecRequest(BaseModel):
    command: str
    timeout: Optional[int] = 30  # seconds; capped at 120 below

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
        "vercel": bool(VERCEL_TOKEN and VERCEL_PROJECT_ID),
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
# VERCEL — Deployment status + production promotion
# ══════════════════════════════════════════════════════════════════════════════

async def _vercel(method: str, path: str, data: dict | None = None) -> Any:
    if not VERCEL_TOKEN:
        raise HTTPException(503, "Vercel token not configured (VERCEL_TOKEN)")
    params = {"teamId": VERCEL_TEAM_ID} if VERCEL_TEAM_ID else {}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.request(
            method,
            f"https://api.vercel.com{path}",
            json=data,
            params=params,
            headers={"Authorization": f"Bearer {VERCEL_TOKEN}"},
        )
        if not r.is_success:
            raise HTTPException(r.status_code, f"Vercel error: {r.text[:200]}")
        return r.json() if r.content else {}

@app.get("/vercel/deployments", dependencies=[AUTH])
async def vercel_list_deployments(limit: int = 10):
    """Recent deployments for the configured project."""
    if not VERCEL_PROJECT_ID:
        raise HTTPException(503, "Vercel project not configured (VERCEL_PROJECT_ID)")
    data = await _vercel("GET", f"/v6/deployments?projectId={VERCEL_PROJECT_ID}&limit={limit}")
    return [
        {
            "id": d.get("uid"),
            "url": d.get("url"),
            "state": d.get("state"),
            "target": d.get("target"),
            "createdAt": d.get("createdAt"),
            "commitMessage": (d.get("meta") or {}).get("githubCommitMessage", "")[:120],
            "commitSha": (d.get("meta") or {}).get("githubCommitSha", "")[:7],
        }
        for d in data.get("deployments", [])
    ]

@app.get("/vercel/deployment/{deployment_id}", dependencies=[AUTH])
async def vercel_get_deployment(deployment_id: str):
    """Full status for one deployment."""
    data = await _vercel("GET", f"/v13/deployments/{deployment_id}")
    return {
        "id": data.get("id"),
        "url": data.get("url"),
        "state": data.get("readyState"),
        "target": data.get("target"),
        "createdAt": data.get("createdAt"),
        "ready": data.get("ready"),
        "aliasError": data.get("aliasError"),
    }

@app.post("/vercel/promote/{deployment_id}", dependencies=[AUTH])
async def vercel_promote(deployment_id: str, request: Request):
    """Promote an existing (already-built) deployment to production —
    the exact 'production branch didn't auto-promote' problem this exists
    to fix. Does NOT trigger a new build; only re-points production at a
    deployment that's already READY."""
    if not VERCEL_PROJECT_ID:
        raise HTTPException(503, "Vercel project not configured (VERCEL_PROJECT_ID)")
    result = await _vercel("POST", f"/v10/projects/{VERCEL_PROJECT_ID}/promote/{deployment_id}")
    await audit("vercel_promote", VERCEL_PROJECT_ID, {"deployment_id": deployment_id}, request.client.host if request.client else "")
    return {"promoted": True, "deployment_id": deployment_id, "result": result}


# ══════════════════════════════════════════════════════════════════════════════
# CREWAI — Branch A: VPS Ollama → 9 specialist agents
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/crew/run", dependencies=[AUTH])
async def crew_run(req: CrewRunRequest, request: Request):
    """
    Run the AXE CORE CrewAI crew (9 specialist agents) on the VPS against Ollama.

    Body: { "task": "...", "context": "...", "conversation": [...] }
    The crew runs in an isolated venv (see crew_runner.py) so it never touches
    this FastAPI/Supabase venv. Heavy work is offloaded to a thread so the
    event loop stays free.
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, lambda: run_crew(req.task, req.context, req.conversation)
    )
    await audit(
        "crew_run", "crewai",
        {"task": (req.task or "")[:200], "status": result.get("status")},
        request.client.host if request.client else "",
    )
    return result


# ══════════════════════════════════════════════════════════════════════════════
# EXEC — arbitrary shell execution on this VPS
# ══════════════════════════════════════════════════════════════════════════════
# Deliberately unrestricted (no allowlist) per explicit decision: full shell
# access, not a curated command set. The tradeoff (prompt injection or a
# wrong instruction can run anything as whatever user this service runs as)
# was accepted knowingly. What this endpoint still guarantees:
#   - real stdout/stderr/exit code back to the caller, never fabricated
#   - every call audit-logged (command, exit code, truncated output) to
#     core_audit_log before returning, so there's always a real record
#   - a hard timeout so a hung command can't block the worker forever
#   - output size capped so one call can't blow up the response/DB row
MAX_EXEC_OUTPUT = 20_000  # chars, per stream

@app.post("/internal/exec", dependencies=[AUTH])
async def internal_exec(req: ExecRequest, request: Request):
    """
    Run an arbitrary shell command on this VPS and return real output.

    Body: { "command": "...", "timeout": 30 }
    No allowlist, no confirmation step - this is intentionally full access.
    """
    timeout = min(max(req.timeout or 30, 1), 120)
    try:
        proc = await asyncio.create_subprocess_shell(
            req.command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            timed_out = False
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            stdout_b, stderr_b = b"", b""
            timed_out = True
        stdout = stdout_b.decode(errors="replace")[:MAX_EXEC_OUTPUT]
        stderr = stderr_b.decode(errors="replace")[:MAX_EXEC_OUTPUT]
        exit_code = proc.returncode
    except Exception as e:
        stdout, stderr, exit_code, timed_out = "", str(e), None, False

    await audit(
        "internal_exec", "vps",
        {
            "command": req.command[:500],
            "exit_code": exit_code,
            "timed_out": timed_out,
            "stdout_preview": stdout[:500],
            "stderr_preview": stderr[:500],
        },
        request.client.host if request.client else "",
    )

    return {
        "command": req.command,
        "exit_code": exit_code,
        "timed_out": timed_out,
        "stdout": stdout,
        "stderr": stderr,
    }


# ══════════════════════════════════════════════════════════════════════════════
# MCP — Model Context Protocol server management + tool execution
# ══════════════════════════════════════════════════════════════════════════════

class McpServerUpdate(BaseModel):
    id: str
    status: Optional[str] = None
    latency: Optional[int] = None
    envKey: Optional[str] = None
    baseUrl: Optional[str] = None

@app.get("/mcp/servers", dependencies=[AUTH])
async def list_mcp_servers():
    """List all configured MCP servers from Supabase."""
    try:
        result = sb().table("core_mcp_servers").select("*").order("display_name").execute()
        return result.data or []
    except Exception as e:
        log.warning(f"MCP list failed: {e}")
        return []

@app.post("/mcp/servers", dependencies=[AUTH])
async def save_mcp_servers(servers: list[dict], request: Request):
    """Upsert MCP server configurations."""
    try:
        sb().table("core_mcp_servers").upsert(servers, on_conflict="name").execute()
        await audit("mcp_servers_update", "mcp", {"count": len(servers)}, request.client.host if request.client else "")
        return {"saved": True, "count": len(servers)}
    except Exception as e:
        raise HTTPException(500, f"MCP save failed: {e}")

@app.post("/mcp/servers/{server_id}/test", dependencies=[AUTH])
async def test_mcp_server(server_id: str, request: Request):
    """Test connectivity to an MCP server with real verification."""
    try:
        row = sb().table("core_mcp_servers").select("*").eq("name", server_id).single().execute()
        server = row.data
        if not server:
            raise HTTPException(404, "MCP server not found")

        meta = server.get("metadata") or {}
        base_url = meta.get("baseUrl") or meta.get("url")
        if not base_url:
            return {"status": "not_configured", "latency": None, "error": "No endpoint configured"}

        start = datetime.now(timezone.utc)
        async with httpx.AsyncClient(timeout=15) as client:
            paths_to_try = ["/", "/health", "/sse", "/tools/list"]
            best = None
            for path in paths_to_try:
                try:
                    r = await client.get(base_url.rstrip("/") + path, follow_redirects=True)
                    if r.is_success:
                        best = r
                        break
                except Exception:
                    continue
            latency = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
            if best:
                return {"status": "online", "latency": latency, "http": best.status_code, "path": str(best.url.path)}
            return {"status": "offline", "latency": latency, "error": "No response from any endpoint"}
    except HTTPException:
        raise
    except Exception as e:
        return {"status": "offline", "latency": None, "error": str(e)[:200]}

@app.post("/mcp/tools/call", dependencies=[AUTH])
async def call_mcp_tool(server_name: str = Body(...), tool_name: str = Body(...), arguments: dict = Body(default_factory=dict), request: Request = None):
    """
    Execute an MCP tool call through the backend.
    Currently supports: direct HTTP proxy to MCP server endpoints.
    """
    try:
        row = sb().table("core_mcp_servers").select("*").eq("name", server_name).single().execute()
        server = row.data
        if not server:
            raise HTTPException(404, f"MCP server '{server_name}' not found")

        meta = server.get("metadata") or {}
        base_url = meta.get("baseUrl") or meta.get("url")
        if not base_url:
            raise HTTPException(400, "MCP server has no endpoint configured")

        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{base_url.rstrip('/')}/tools/call",
                json={"name": tool_name, "arguments": arguments},
                headers={"Content-Type": "application/json"},
            )
            if not r.is_success:
                return {"status": "error", "error": f"HTTP {r.status_code}: {r.text[:300]}"}
            return {"status": "ok", "result": r.json() if r.content else {}}
    except HTTPException:
        raise
    except Exception as e:
        return {"status": "error", "error": str(e)[:300]}


# ══════════════════════════════════════════════════════════════════════════════
# TERMINAL — WebSocket proxy to local terminal-server (Docker 4022)
# ══════════════════════════════════════════════════════════════════════════════

from fastapi import WebSocket, WebSocketDisconnect
import websockets

TERMINAL_WS = "ws://axe-terminal-server:4022/"

@app.websocket("/terminal/ws")
async def terminal_proxy(ws: WebSocket):
    await ws.accept()
    try:
        async with websockets.connect(TERMINAL_WS, max_size=None) as backend:
            async def client_to_backend():
                try:
                    while True:
                        msg = await ws.receive_text()
                        await backend.send(msg)
                except WebSocketDisconnect:
                    pass
                except Exception:
                    pass

            async def backend_to_client():
                try:
                    async for msg in backend:
                        if msg.__class__.__name__ == "str":
                            await ws.send_text(msg)
                        else:
                            await ws.send_bytes(msg.data if hasattr(msg, "data") else bytes(msg))
                except Exception:
                    pass

            import asyncio
            await asyncio.gather(client_to_backend(), backend_to_client())
    except Exception:
        pass
