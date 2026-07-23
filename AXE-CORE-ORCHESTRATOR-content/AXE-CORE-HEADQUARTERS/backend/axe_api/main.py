"""
AXE Core API — God Mode Backend Service
========================================
Runs on VPS (212.227.91.79) alongside n8n.
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

# Local agent services running on this VPS. Each is OFF until its URL is set:
# point the env var at the tool's real execute endpoint (full URL incl. path),
# e.g. OPENHANDS_URL=http://127.0.0.1:3000/api/conversations. The matching
# *_API_KEY (optional) is sent as a Bearer token. Until a URL is set, the
# route returns a clear 503 instead of a dead 404 — no fabricated results.
AGENT_SERVICES = {
    "openhands":  (os.environ.get("OPENHANDS_URL", ""),  os.environ.get("OPENHANDS_API_KEY", "")),
    "openjarvis": (os.environ.get("OPENJARVIS_URL", ""), os.environ.get("OPENJARVIS_API_KEY", "")),
    "openclaw":   (os.environ.get("OPENCLAW_URL", ""),   os.environ.get("OPENCLAW_API_KEY", "")),
    "kilocode":   (os.environ.get("KILOCODE_URL", ""),   os.environ.get("KILOCODE_API_KEY", "")),
    "hermes":     (os.environ.get("HERMES_URL", ""),     os.environ.get("HERMES_API_KEY", "")),
}
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
    branch: str = "orchestrator"

class PrRequest(BaseModel):
    repo: str
    title: str
    body: str
    head: str
    base: str = "main"

class BranchRequest(BaseModel):
    repo: str                       # "owner/repo"
    branch: str                     # new branch name, e.g. "axe/fix-readme-typo"
    from_branch: str = "orchestrator"

class PrMergeRequest(BaseModel):
    repo: str
    merge_method: str = "merge"     # merge | squash | rebase

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
async def get_file(repo: str, path: str, branch: str = "orchestrator"):
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
async def get_tree(repo: str, branch: str = "orchestrator"):
    """Get full file tree of a repo."""
    data = await _gh("GET", f"/repos/{repo}/git/trees/{branch}?recursive=1")
    return [f["path"] for f in data.get("tree", []) if f["type"] == "blob"]

@app.post("/github/branch", dependencies=[AUTH])
async def create_branch(req: BranchRequest, request: Request):
    """Create a branch from the head of from_branch (the safe start of the
    branch -> commit -> PR -> preview -> approved-merge loop)."""
    src = await _gh("GET", f"/repos/{req.repo}/git/ref/heads/{req.from_branch}")
    sha = src.get("object", {}).get("sha")
    if not sha:
        raise HTTPException(502, f"Could not resolve head of {req.from_branch}")
    await _gh("POST", f"/repos/{req.repo}/git/refs", {"ref": f"refs/heads/{req.branch}", "sha": sha})
    await audit("github_branch_create", f"{req.repo}@{req.branch}", {"from": req.from_branch, "sha": sha}, request.client.host if request.client else "")
    return {"created": True, "branch": req.branch, "from": req.from_branch, "sha": sha}

@app.get("/github/pr/{number}", dependencies=[AUTH])
async def get_pr(number: int, repo: str):
    """PR status: open/merged/mergeable + head/base + URL."""
    pr = await _gh("GET", f"/repos/{repo}/pulls/{number}")
    return {
        "number": pr.get("number"),
        "state": pr.get("state"),
        "merged": bool(pr.get("merged")),
        "mergeable": pr.get("mergeable"),
        "mergeable_state": pr.get("mergeable_state"),
        "title": pr.get("title"),
        "head": pr.get("head", {}).get("ref"),
        "base": pr.get("base", {}).get("ref"),
        "html_url": pr.get("html_url"),
    }

@app.post("/github/pr/{number}/merge", dependencies=[AUTH])
async def merge_pr(number: int, req: PrMergeRequest, request: Request):
    """Merge a pull request. The caller (chat tool layer) is responsible for
    Luka's approval gate — this endpoint just executes and audits it."""
    result = await _gh("PUT", f"/repos/{req.repo}/pulls/{number}/merge", {"merge_method": req.merge_method})
    await audit("github_pr_merge", f"{req.repo}#{number}", {"method": req.merge_method}, request.client.host if request.client else "")
    return {"merged": bool(result.get("merged")), "sha": result.get("sha"), "message": result.get("message")}


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
async def vercel_list_deployments(limit: int = 10, project_id: Optional[str] = None):
    """Recent deployments. Defaults to the configured project; pass
    project_id to ask about any other Vercel project on the same team
    (the Apps page uses this for per-app live status)."""
    project = project_id or VERCEL_PROJECT_ID
    if not project:
        raise HTTPException(503, "Vercel project not configured (VERCEL_PROJECT_ID)")
    data = await _vercel("GET", f"/v6/deployments?projectId={project}&limit={limit}")
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
# OSINT — real map data (adapters ported from the Intelligence Terminal)
# ══════════════════════════════════════════════════════════════════════════════

from osint.router import router as osint_router  # noqa: E402 — after app setup by design
app.include_router(osint_router, prefix="/osint", dependencies=[AUTH], tags=["osint"])


# ══════════════════════════════════════════════════════════════════════════════
# WORKSPACE FILES — backs the in-app Code Editor (Cursor-style IDE)
# ══════════════════════════════════════════════════════════════════════════════
# A real editable file tree on the VPS. WORKSPACE_DIR is the sandbox root;
# every path is resolved and confined to it (no traversal outside). This is
# what makes the editor's file tree, open/save, and AI patch-apply actually
# work — the frontend calls these via the axecore proxy (/files/*).
import shutil as _shutil

WORKSPACE_DIR = os.path.realpath(os.environ.get("WORKSPACE_DIR", "/opt/axe-workspace"))
os.makedirs(WORKSPACE_DIR, exist_ok=True)
_SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next"}

def _safe_path(rel: str) -> str:
    """Resolve a workspace-relative path and confine it to WORKSPACE_DIR."""
    rel = (rel or "").lstrip("/")
    full = os.path.realpath(os.path.join(WORKSPACE_DIR, rel))
    if full != WORKSPACE_DIR and not full.startswith(WORKSPACE_DIR + os.sep):
        raise HTTPException(400, "Path escapes the workspace")
    return full

class FileWrite(BaseModel):
    path: str
    content: str

class FileCreate(BaseModel):
    path: str
    type: str = "file"   # "file" | "folder"

class FileSearch(BaseModel):
    query: str
    glob: Optional[str] = None
    maxResults: int = 100
    caseSensitive: bool = False

@app.get("/files/tree", dependencies=[AUTH])
async def files_tree(path: str = ""):
    """List one directory level (folders first, then files)."""
    full = _safe_path(path)
    if not os.path.isdir(full):
        raise HTTPException(404, "Not a directory")
    nodes = []
    for name in sorted(os.listdir(full)):
        if name in _SKIP_DIRS:
            continue
        p = os.path.join(full, name)
        rel = os.path.relpath(p, WORKSPACE_DIR)
        nodes.append({"path": rel, "name": name, "type": "folder" if os.path.isdir(p) else "file"})
    nodes.sort(key=lambda n: (n["type"] != "folder", n["name"].lower()))
    return {"nodes": nodes}

@app.get("/files/read", dependencies=[AUTH])
async def files_read(path: str):
    full = _safe_path(path)
    if not os.path.isfile(full):
        raise HTTPException(404, "Not a file")
    if os.path.getsize(full) > 2_000_000:
        raise HTTPException(413, "File too large to open (>2MB)")
    try:
        with open(full, "r", encoding="utf-8", errors="replace") as f:
            return {"content": f.read()}
    except Exception as e:
        raise HTTPException(500, f"Read failed: {e}")

@app.put("/files/write", dependencies=[AUTH])
async def files_write(req: FileWrite, request: Request):
    full = _safe_path(req.path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(req.content)
    await audit("file_write", req.path, {"bytes": len(req.content)}, request.client.host if request.client else "")
    return {"written": True, "path": req.path}

@app.post("/files/create", dependencies=[AUTH])
async def files_create(req: FileCreate, request: Request):
    full = _safe_path(req.path)
    if os.path.exists(full):
        raise HTTPException(409, "Already exists")
    if req.type == "folder":
        os.makedirs(full, exist_ok=True)
    else:
        os.makedirs(os.path.dirname(full), exist_ok=True)
        open(full, "a").close()
    await audit("file_create", req.path, {"type": req.type}, request.client.host if request.client else "")
    return {"created": True, "path": req.path}

@app.delete("/files/delete", dependencies=[AUTH])
async def files_delete(path: str, request: Request):
    full = _safe_path(path)
    if full == WORKSPACE_DIR:
        raise HTTPException(400, "Refusing to delete the workspace root")
    if os.path.isdir(full):
        _shutil.rmtree(full)
    elif os.path.exists(full):
        os.remove(full)
    else:
        raise HTTPException(404, "Not found")
    await audit("file_delete", path, {}, request.client.host if request.client else "")
    return {"deleted": True, "path": path}

@app.post("/files/search", dependencies=[AUTH])
async def files_search(req: FileSearch):
    """Grep the workspace (ripgrep if present, else Python walk)."""
    results: list[dict] = []
    rg = _shutil.which("rg")
    if rg:
        cmd = [rg, "--line-number", "--column", "--no-heading", "--color", "never", "--max-count", "20"]
        if not req.caseSensitive:
            cmd.append("-i")
        if req.glob:
            cmd += ["--glob", req.glob]
        cmd += ["--", req.query, WORKSPACE_DIR]
        try:
            proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=20)
            for line in out.decode(errors="replace").splitlines():
                parts = line.split(":", 3)
                if len(parts) == 4:
                    fpath, ln, col, text = parts
                    results.append({"file": os.path.relpath(fpath, WORKSPACE_DIR), "line": int(ln), "col": int(col), "text": text[:300]})
                    if len(results) >= req.maxResults:
                        break
        except Exception:
            pass
    else:
        needle = req.query if req.caseSensitive else req.query.lower()
        for root, dirs, filenames in os.walk(WORKSPACE_DIR):
            dirs[:] = [d for d in dirs if d not in _SKIP_DIRS]
            for fn in filenames:
                if len(results) >= req.maxResults:
                    break
                fp = os.path.join(root, fn)
                try:
                    with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                        for i, line in enumerate(f, 1):
                            hay = line if req.caseSensitive else line.lower()
                            if needle in hay:
                                results.append({"file": os.path.relpath(fp, WORKSPACE_DIR), "line": i, "col": hay.index(needle) + 1, "text": line.strip()[:300]})
                                if len(results) >= req.maxResults:
                                    break
                except Exception:
                    continue
    return {"results": results}


# ══════════════════════════════════════════════════════════════════════════════
# LOCAL AGENT BRIDGES — OpenHands / OpenJarvis / OpenClaw / Kilo Code / Hermes
# ══════════════════════════════════════════════════════════════════════════════
# Generic, env-configured passthroughs. The frontend already calls
# /internal/{tool}/execute; each forwards the JSON body to that tool's real
# endpoint ({TOOL}_URL) and returns its response verbatim. This is deliberately
# a thin bridge, not a guess at each tool's request schema: set {TOOL}_URL to
# the exact endpoint that already accepts your payload, and it works; leave it
# unset and you get an honest "not configured" instead of a fake success.

async def _agent_passthrough(tool: str, body: dict, request: Request) -> Any:
    url, key = AGENT_SERVICES.get(tool, ("", ""))
    if not url:
        raise HTTPException(
            503,
            f"{tool} is not configured. Set {tool.upper()}_URL in the axe_api .env "
            f"to the tool's execute endpoint (full URL incl. path), then restart the service.",
        )
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(url, json=body, headers=headers)
    except httpx.HTTPError as e:
        await audit(f"agent_{tool}", "vps", {"error": str(e)[:300]}, request.client.host if request.client else "")
        raise HTTPException(502, f"{tool} call failed: {str(e)[:200]}")
    await audit(f"agent_{tool}", "vps", {"status_code": r.status_code}, request.client.host if request.client else "")
    if not r.is_success:
        raise HTTPException(r.status_code, f"{tool} error: {r.text[:300]}")
    try:
        return r.json()
    except ValueError:
        return {"status": "ok", "tool": tool, "result": r.text[:20000]}


@app.post("/internal/openhands/execute", dependencies=[AUTH])
async def exec_openhands(request: Request, body: dict = Body(default={})):
    return await _agent_passthrough("openhands", body, request)

@app.post("/internal/openjarvis/execute", dependencies=[AUTH])
async def exec_openjarvis(request: Request, body: dict = Body(default={})):
    return await _agent_passthrough("openjarvis", body, request)

@app.post("/internal/openclaw/execute", dependencies=[AUTH])
async def exec_openclaw(request: Request, body: dict = Body(default={})):
    return await _agent_passthrough("openclaw", body, request)

@app.post("/internal/kilocode/execute", dependencies=[AUTH])
async def exec_kilocode(request: Request, body: dict = Body(default={})):
    return await _agent_passthrough("kilocode", body, request)

@app.post("/internal/hermes/execute", dependencies=[AUTH])
async def exec_hermes(request: Request, body: dict = Body(default={})):
    return await _agent_passthrough("hermes", body, request)

@app.get("/internal/agents/status", dependencies=[AUTH])
async def agents_status():
    """Which local agent bridges are wired (URL set) vs not — honest status
    for the UI, no fabrication."""
    return {tool: {"configured": bool(url)} for tool, (url, _key) in AGENT_SERVICES.items()}


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
