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
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request, Response
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
# Self-hosted scheduler secret. The VPS crontab pings /cron/tick every minute
# with this secret (X-Cron-Secret header) — no n8n, no third-party account.
# Named CRON_SECRET to match AXE Companion / Trading OS so the SAME secret works
# across all three (CRON_KEY still read as a fallback for older .env files).
CRON_SECRET      = os.environ.get("CRON_SECRET") or os.environ.get("CRON_KEY", "")
GITHUB_TOKEN     = os.environ.get("GITHUB_TOKEN", "")
VERCEL_TOKEN     = os.environ.get("VERCEL_TOKEN", "")
VERCEL_PROJECT_ID = os.environ.get("VERCEL_PROJECT_ID", "")
VERCEL_TEAM_ID   = os.environ.get("VERCEL_TEAM_ID", "")
SMARTTHINGS_TOKEN = os.environ.get("SMARTTHINGS_TOKEN", "")

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
    "https://axe-core-rust.vercel.app,https://www.axeheadquarters.com,https://axeheadquarters.com,"
    "http://localhost:5173,http://localhost:5001,tauri://localhost,http://tauri.localhost"
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
        "cron": bool(CRON_SECRET),
    }

# ══════════════════════════════════════════════════════════════════════════════
# OPEN PROXIES — LLM providers + Exa search
# ══════════════════════════════════════════════════════════════════════════════
# Mirrors api/proxy/ai.ts and api/exa.ts (the Vercel versions) exactly, incl.
# their security model: no AXE_API_KEY / AUTH here, on purpose. The caller's
# own provider key travels in the request body (same as it already does
# against Vercel) — these routes only exist to dodge the browser-CORS wall
# each provider puts up, not to guard a secret of ours. That's what lets the
# packaged Tauri app reach a real LLM without embedding the master AXE_API_KEY
# (Supabase service_role + GitHub write + /internal/exec) into a distributed
# app bundle just to get chat working. Not gated behind Vercel either, so
# this keeps working even while the Vercel deployment is billing-disabled.

@app.post("/proxy/ai")
async def proxy_ai(body: dict = Body(...)):
    provider = body.get("provider")
    key = body.get("key", "")
    model = body.get("model")
    fmt = body.get("format")
    base_url = (body.get("baseUrl") or "").rstrip("/")
    messages = body.get("messages")
    if not all([provider, model, fmt, base_url]) or not isinstance(messages, list):
        raise HTTPException(400, "Missing required fields: provider, model, format, baseUrl, messages")

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            if fmt == "anthropic":
                sys_msg = next((m["content"] for m in messages if m.get("role") == "system"), None)
                r = await client.post(
                    f"{base_url}/v1/messages",
                    headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={
                        "model": model, "max_tokens": 4096,
                        **({"system": sys_msg} if sys_msg else {}),
                        "messages": [m for m in messages if m.get("role") != "system"],
                    },
                )
                if r.is_error:
                    err = r.json().get("error", {}).get("message", f"Anthropic HTTP {r.status_code}") if r.headers.get("content-type", "").startswith("application/json") else f"Anthropic HTTP {r.status_code}"
                    raise HTTPException(502, err)
                text = (r.json().get("content") or [{}])[0].get("text", "")

            elif fmt == "google":
                sys_msg = next((m["content"] for m in messages if m.get("role") == "system"), None)
                r = await client.post(
                    f"{base_url}/v1beta/models/{model}:generateContent",
                    params={"key": key},
                    json={
                        "contents": [
                            {"role": "user" if m.get("role") == "user" else "model", "parts": [{"text": m.get("content", "")}]}
                            for m in messages if m.get("role") != "system"
                        ],
                        **({"systemInstruction": {"parts": [{"text": sys_msg}]}} if sys_msg else {}),
                        "generationConfig": {"maxOutputTokens": 8192},
                    },
                )
                if r.is_error:
                    err = r.json().get("error", {}).get("message", f"Google HTTP {r.status_code}") if r.headers.get("content-type", "").startswith("application/json") else f"Google HTTP {r.status_code}"
                    raise HTTPException(502, err)
                cands = r.json().get("candidates") or [{}]
                text = ((cands[0].get("content") or {}).get("parts") or [{}])[0].get("text", "")

            else:  # openai-compatible: OpenAI, OpenRouter, Groq, xAI, Krater, Ollama
                chat_url = f"{base_url}/chat/completions" if provider == "groq" else f"{base_url}/v1/chat/completions"
                headers = {"Content-Type": "application/json"}
                if key:
                    headers["Authorization"] = f"Bearer {key}"
                r = await client.post(chat_url, headers=headers, json={"model": model, "messages": messages, "max_tokens": 4096, "temperature": 0.7})
                if r.is_error:
                    err = r.json().get("error", {}).get("message", f"{provider} HTTP {r.status_code}") if r.headers.get("content-type", "").startswith("application/json") else f"{provider} HTTP {r.status_code}"
                    raise HTTPException(502, err)
                text = ((r.json().get("choices") or [{}])[0].get("message") or {}).get("content", "")

        return {"text": text}
    except httpx.HTTPError as e:
        raise HTTPException(502, str(e)[:300])


@app.post("/proxy/exa")
async def proxy_exa(body: dict = Body(...)):
    key = os.environ.get("EXA_API_KEY") or body.get("key", "")
    query = (body.get("query") or "").strip()
    if not key:
        raise HTTPException(503, "Exa not configured (set EXA_API_KEY on the server, or save your key in the app).")
    if not query:
        raise HTTPException(400, "Missing query")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.exa.ai/search",
                headers={"Content-Type": "application/json", "x-api-key": key},
                json={
                    "query": query,
                    "numResults": body.get("numResults") or 5,
                    "type": "auto",
                    "contents": {"text": {"maxCharacters": 500}},
                },
            )
        return Response(content=r.content, status_code=r.status_code, media_type="application/json")
    except httpx.HTTPError as e:
        raise HTTPException(502, str(e)[:300])

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

# ══════════════════════════════════════════════════════════════════════════════
# SMARTTHINGS — server-side token, so every client (Mac app, future phone
# app, anything else calling this VPS) controls devices without holding its
# own copy of the token. Same AUTH gate as /internal/exec — this executes
# real actions in the physical world, treated with the same care.
# ══════════════════════════════════════════════════════════════════════════════

ST_API = "https://api.smartthings.com/v1"

class StCommandBody(BaseModel):
    capability: str
    command: str
    arguments: list = []
    component: str = "main"

def _st_headers() -> dict:
    if not SMARTTHINGS_TOKEN:
        raise HTTPException(503, "SmartThings not configured on the VPS (set SMARTTHINGS_TOKEN in .env)")
    return {"Authorization": f"Bearer {SMARTTHINGS_TOKEN}"}

@app.get("/smartthings/devices", dependencies=[AUTH])
async def st_list_devices():
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{ST_API}/devices", headers=_st_headers())
        if r.is_error:
            raise HTTPException(r.status_code, r.text[:500])
        return r.json()

@app.get("/smartthings/devices/{device_id}/status", dependencies=[AUTH])
async def st_device_status(device_id: str):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{ST_API}/devices/{device_id}/status", headers=_st_headers())
        if r.is_error:
            raise HTTPException(r.status_code, r.text[:500])
        return r.json()

@app.post("/smartthings/devices/{device_id}/commands", dependencies=[AUTH])
async def st_device_command(device_id: str, body: StCommandBody, request: Request):
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{ST_API}/devices/{device_id}/commands",
            headers={**_st_headers(), "Content-Type": "application/json"},
            json={"commands": [{"component": body.component, "capability": body.capability, "command": body.command, "arguments": body.arguments}]},
        )
        if r.is_error:
            raise HTTPException(r.status_code, r.text[:500])
    await audit("smart_home_command", device_id, {"capability": body.capability, "command": body.command}, request.client.host if request.client else "")
    return r.json()

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
# LIVE PREVIEW — a real dev-server process for the Code Editor's Preview tab
# ══════════════════════════════════════════════════════════════════════════════
# Unlike /internal/exec (which blocks until the command exits, capped at
# 120s), this spawns a long-running process and returns immediately, so a
# real `npm run dev` can keep serving while the caller polls /preview/status.
# One preview at a time on a fixed port, so nginx can proxy it at a stable
# path (see the /preview location in nginx_api.conf) instead of needing a
# new rule per run. PREVIEW_PUBLIC_URL is unset until that nginx step is
# done — /preview/status reports that honestly via "configured".
PREVIEW_PORT = int(os.environ.get("PREVIEW_PORT", "4700"))
PREVIEW_PUBLIC_URL = os.environ.get("PREVIEW_PUBLIC_URL", "")  # e.g. https://api.axecompanion.com/preview/
_preview_proc: Optional[asyncio.subprocess.Process] = None
_preview_log: list[str] = []
_preview_command: str = ""
MAX_PREVIEW_LOG = 200

class PreviewStartBody(BaseModel):
    command: Optional[str] = None  # defaults to a Vite/CRA-style dev server on PREVIEW_PORT

async def _drain_preview_output(stream: asyncio.StreamReader) -> None:
    while True:
        line = await stream.readline()
        if not line:
            break
        _preview_log.append(line.decode(errors="replace").rstrip())
        _preview_log[:] = _preview_log[-MAX_PREVIEW_LOG:]

@app.post("/preview/start", dependencies=[AUTH])
async def preview_start(body: PreviewStartBody):
    global _preview_proc, _preview_command
    if _preview_proc is not None and _preview_proc.returncode is None:
        raise HTTPException(409, "Preview server already running — stop it first")
    command = body.command or f"npm run dev -- --host 0.0.0.0 --port {PREVIEW_PORT}"
    _preview_log.clear()
    _preview_command = command
    try:
        _preview_proc = await asyncio.create_subprocess_shell(
            command, cwd=WORKSPACE_DIR,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
    except Exception as e:
        raise HTTPException(500, f"Could not start preview server: {e}")
    asyncio.create_task(_drain_preview_output(_preview_proc.stdout))
    return {"started": True, "command": command, "port": PREVIEW_PORT, "url": PREVIEW_PUBLIC_URL or None}

@app.post("/preview/stop", dependencies=[AUTH])
async def preview_stop():
    global _preview_proc
    if _preview_proc is None or _preview_proc.returncode is not None:
        _preview_proc = None
        return {"stopped": True, "was_running": False}
    _preview_proc.terminate()
    try:
        await asyncio.wait_for(_preview_proc.wait(), timeout=5)
    except asyncio.TimeoutError:
        _preview_proc.kill()
    _preview_proc = None
    return {"stopped": True, "was_running": True}

@app.get("/preview/status", dependencies=[AUTH])
async def preview_status():
    running = _preview_proc is not None and _preview_proc.returncode is None
    return {
        "running": running,
        "command": _preview_command,
        "port": PREVIEW_PORT,
        "url": PREVIEW_PUBLIC_URL or None,
        "log": _preview_log[-40:],
        "configured": bool(PREVIEW_PUBLIC_URL),
    }


# ══════════════════════════════════════════════════════════════════════════════
# BROWSER AGENT — real Playwright-driven browser control
# ══════════════════════════════════════════════════════════════════════════════
from browser_agent import router as browser_agent_router  # noqa: E402 — after app setup by design
app.include_router(browser_agent_router, prefix="/browser/agent", dependencies=[AUTH], tags=["browser-agent"])


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
    # OpenHands' own /api/v1/app-conversations schema takes initial_message as a
    # {role, content: [...]} block, not the {task, context} shape every other
    # AXE tool call sends. Translate here (only for this tool — the others stay
    # a true passthrough) so the task text actually reaches the agent instead
    # of silently starting an empty conversation.
    if "task" in body and "initial_message" not in body:
        parts = [{"type": "text", "text": body["task"]}]
        if body.get("context"):
            parts.append({"type": "text", "text": f"Context: {body['context']}"})
        body = {
            **{k: v for k, v in body.items() if k not in ("task", "context")},
            # run:true is required — SendMessageRequest defaults it to false,
            # which creates the conversation but never starts the agent loop
            # (silently, no error) so the task text sits there unexecuted.
            "initial_message": {"role": "user", "content": parts, "run": True},
            "agent_type": body.get("agent_type", "default"),
        }
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


# Origins known to have a real /health endpoint, for the VPS-side agents each
# report against. These are 127.0.0.1-only ports — the browser can never
# reach them directly (no public route, no CORS story), so this has to run
# server-side, where axe-core-api already sits next to every one of them.
_HEALTH_OVERRIDE = {
    "openhands": "http://127.0.0.1:3000/health",
}

async def _check_vps_services() -> dict:
    """Live-reachability status for every VPS-hosted agent bridge + Ollama —
    the actual check logic behind /status/vps-agents, pulled out so the
    self-heal background job (below) can reuse it without an HTTP round-trip
    to itself."""
    async def check(name: str, url: str) -> dict:
        if not url:
            return {"configured": False, "reachable": False}
        health_url = _HEALTH_OVERRIDE.get(name)
        if not health_url:
            try:
                from urllib.parse import urlparse
                p = urlparse(url)
                health_url = f"{p.scheme}://{p.netloc}/health"
            except Exception:
                return {"configured": True, "reachable": False, "error": "could not derive health URL"}
        t0 = asyncio.get_event_loop().time()
        try:
            async with httpx.AsyncClient(timeout=4) as client:
                r = await client.get(health_url)
            return {"configured": True, "reachable": r.status_code < 500, "latency_ms": round((asyncio.get_event_loop().time() - t0) * 1000)}
        except Exception as e:
            return {"configured": True, "reachable": False, "error": str(e)[:150]}

    results = {}
    for tool, (url, _key) in AGENT_SERVICES.items():
        results[tool] = await check(tool, url)
    # CrewAI isn't a URL-based bridge (see AGENT_SERVICES) — it shells out to
    # an isolated venv (crew_runner.py). "Reachable" here means the venv's
    # python actually exists, not a network probe.
    crew_venv = os.environ.get("CREW_VENV_PY", "/opt/axe-crew-venv/bin/python3")
    results["crewai"] = {"configured": True, "reachable": os.path.exists(crew_venv), "note": f"isolated venv at {crew_venv}, not a network service"}
    # OpenClaw is a real running service but a messaging gateway, not the
    # browsing/computer-use agent AXE's [AGENT:] tool describes — flagged
    # here so the UI can show "reachable" honestly without implying it's
    # wired as an AXE agent (see toolCatalog.ts's [AGENT:] promptDoc).
    if "openclaw" in results:
        results["openclaw"]["note"] = "messaging gateway (Telegram/WhatsApp/...), not wired as an AXE agent yet"
    try:
        async with httpx.AsyncClient(timeout=4) as client:
            t0 = asyncio.get_event_loop().time()
            r = await client.get("http://127.0.0.1:11434/api/tags")
            results["ollama"] = {"configured": True, "reachable": r.status_code < 500, "latency_ms": round((asyncio.get_event_loop().time() - t0) * 1000)}
    except Exception as e:
        results["ollama"] = {"configured": True, "reachable": False, "error": str(e)[:150]}
    return results


@app.get("/status/vps-agents")
async def vps_agents_status():
    """Open (no AXE_API_KEY) live-reachability status for every VPS-hosted
    agent bridge + Ollama — booleans and latency only, nothing sensitive, so
    the packaged Tauri app (and AXE itself) can always show real status
    instead of the browser trying and failing to reach a 127.0.0.1 port that
    was never publicly routable in the first place."""
    return await _check_vps_services()


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


# ══════════════════════════════════════════════════════════════════════════════
# SELF-HOSTED SCHEDULER (replaces n8n for cron)
# ══════════════════════════════════════════════════════════════════════════════
# Schedules live in Supabase (core_schedules). The VPS system crontab pings
# POST /cron/tick every minute with the CRON_SECRET; that runs every schedule whose
# next_run_at is due, then re-computes the next run. CRUD is bearer-authed like
# the rest of the API. No n8n, no third-party account — AXE owns the whole loop.
from croniter import croniter  # noqa: E402
try:
    from zoneinfo import ZoneInfo  # py3.9+
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

CRON_ACTIONS = ("prompt", "exec", "webhook", "crew")


class ScheduleBody(BaseModel):
    name: str
    cron_expr: str
    timezone: str = "UTC"
    action_type: str = "prompt"
    action_payload: dict[str, Any] = {}
    enabled: bool = True
    metadata: dict[str, Any] = {}


class ScheduleUpdate(BaseModel):
    name: Optional[str] = None
    cron_expr: Optional[str] = None
    timezone: Optional[str] = None
    action_type: Optional[str] = None
    action_payload: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None
    metadata: Optional[dict[str, Any]] = None


def _compute_next_run(cron_expr: str, tz_name: str = "UTC") -> str:
    """Next fire time for a 5-field cron expression, returned as a UTC ISO string.
    Raises ValueError on a bad expression so the caller can 400."""
    if not croniter.is_valid(cron_expr):
        raise ValueError(f"Invalid cron expression: {cron_expr!r}")
    tz = None
    if ZoneInfo is not None and tz_name and tz_name != "UTC":
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = None
    base = datetime.now(tz) if tz else datetime.now(timezone.utc)
    nxt = croniter(cron_expr, base).get_next(datetime)
    if nxt.tzinfo is None:
        nxt = nxt.replace(tzinfo=tz or timezone.utc)
    return nxt.astimezone(timezone.utc).isoformat()


async def _run_schedule_action(action_type: str, payload: dict) -> dict:
    """Execute one schedule's action. Returns {status, output}. Never raises —
    a failing job records last_status='fail' and keeps the scheduler alive."""
    payload = payload or {}
    try:
        if action_type == "exec":
            command = (payload.get("command") or "").strip()
            if not command:
                return {"status": "fail", "output": "exec: no command in payload"}
            timeout = min(max(int(payload.get("timeout") or 60), 1), 300)
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                out_b, err_b = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                proc.kill(); await proc.wait()
                return {"status": "fail", "output": f"timed out after {timeout}s"}
            out = (out_b.decode(errors="replace") + err_b.decode(errors="replace")).strip()
            ok = proc.returncode == 0
            return {"status": "ok" if ok else "fail", "output": f"exit={proc.returncode}\n{out}"[:4000]}

        if action_type == "webhook":
            url = (payload.get("url") or "").strip()
            if not url:
                return {"status": "fail", "output": "webhook: no url in payload"}
            method = (payload.get("method") or "POST").upper()
            headers = payload.get("headers") or {}
            # Convenience: forward the shared CRON_SECRET to your own apps so a
            # webhook can hit AXE Companion / Trading OS cron endpoints that
            # expect it. Sent as `Authorization: Bearer <secret>` — the Vercel
            # Cron convention those apps use (CRON_SECRET). (Accepts the older
            # include_cron_key flag name too.)
            if (payload.get("include_cron_secret") or payload.get("include_cron_key")) and CRON_SECRET:
                headers = {**headers, "Authorization": f"Bearer {CRON_SECRET}"}
            body = payload.get("body")
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.request(method, url, json=body if body is not None else None, headers=headers)
            ok = r.status_code < 400
            return {"status": "ok" if ok else "fail", "output": f"{r.status_code} {r.text[:1000]}"}

        if action_type in ("crew", "prompt"):
            task = (payload.get("task") or payload.get("prompt") or "").strip()
            if not task:
                return {"status": "fail", "output": f"{action_type}: no task/prompt in payload"}
            loop = asyncio.get_event_loop()
            res = await loop.run_in_executor(
                None, lambda: run_crew(task, payload.get("context"), None)
            )
            status = res.get("status", "ok") if isinstance(res, dict) else "ok"
            output = str(res.get("result") if isinstance(res, dict) else res)[:4000]
            return {"status": "ok" if status not in ("fail", "error") else "fail", "output": output}

        return {"status": "fail", "output": f"unknown action_type: {action_type}"}
    except Exception as e:  # noqa: BLE001 — a bad job must not kill the tick loop
        return {"status": "fail", "output": str(e)[:2000]}


def _notify_if_requested(schedule_name: str, payload: dict, result: dict) -> None:
    """A schedule's payload can carry `"notify": true` to surface its result
    as a real in-app notification (core_notifications), not just a value
    sitting in core_schedules.last_result that nobody looks at. This is the
    generic wingman hook — the Daily Briefing schedule uses it, but so can
    any future notify-worthy schedule without new backend code."""
    if not payload.get("notify"):
        return
    try:
        sb().table("core_notifications").insert({
            "type": "success" if result["status"] == "ok" else "error",
            "title": schedule_name,
            "message": result["output"][:2000],
            "source": "schedule",
        }).execute()
    except Exception as e:  # noqa: BLE001 — a notify failure must not fail the run
        log.warning(f"notify insert failed: {e}")


@app.get("/cron/schedules", dependencies=[AUTH])
async def cron_list_schedules():
    data = sb().table("core_schedules").select("*").order("created_at", desc=True).limit(200).execute()
    return {"schedules": data.data or []}


@app.post("/cron/schedules", dependencies=[AUTH])
async def cron_create_schedule(body: ScheduleBody, request: Request):
    if body.action_type not in CRON_ACTIONS:
        raise HTTPException(400, f"action_type must be one of {CRON_ACTIONS}")
    try:
        next_run = _compute_next_run(body.cron_expr, body.timezone) if body.enabled else None
    except ValueError as e:
        raise HTTPException(400, str(e))
    row = {
        "name": body.name,
        "cron_expr": body.cron_expr,
        "timezone": body.timezone,
        "action_type": body.action_type,
        "action_payload": body.action_payload,
        "enabled": body.enabled,
        "next_run_at": next_run,
        "metadata": body.metadata,
    }
    res = sb().table("core_schedules").insert(row).execute()
    await audit("schedule_create", "cron", {"name": body.name, "cron": body.cron_expr}, request.client.host if request.client else "")
    return {"schedule": (res.data or [None])[0]}


@app.put("/cron/schedules/{schedule_id}", dependencies=[AUTH])
async def cron_update_schedule(schedule_id: str, body: ScheduleUpdate):
    patch: dict[str, Any] = {}
    for field in ("name", "cron_expr", "timezone", "action_type", "action_payload", "enabled", "metadata"):
        val = getattr(body, field)
        if val is not None:
            patch[field] = val
    if not patch:
        raise HTTPException(400, "nothing to update")
    if patch.get("action_type") and patch["action_type"] not in CRON_ACTIONS:
        raise HTTPException(400, f"action_type must be one of {CRON_ACTIONS}")
    # Recompute next_run_at when the schedule or its enabled state changes.
    if "cron_expr" in patch or "timezone" in patch or "enabled" in patch:
        cur = sb().table("core_schedules").select("cron_expr, timezone, enabled").eq("id", schedule_id).single().execute()
        base = cur.data or {}
        enabled = patch.get("enabled", base.get("enabled", True))
        if enabled:
            try:
                patch["next_run_at"] = _compute_next_run(
                    patch.get("cron_expr", base.get("cron_expr")),
                    patch.get("timezone", base.get("timezone") or "UTC"),
                )
            except ValueError as e:
                raise HTTPException(400, str(e))
        else:
            patch["next_run_at"] = None
    res = sb().table("core_schedules").update(patch).eq("id", schedule_id).execute()
    return {"schedule": (res.data or [None])[0]}


@app.delete("/cron/schedules/{schedule_id}", dependencies=[AUTH])
async def cron_delete_schedule(schedule_id: str):
    sb().table("core_schedules").delete().eq("id", schedule_id).execute()
    return {"deleted": True}


@app.post("/cron/schedules/{schedule_id}/run", dependencies=[AUTH])
async def cron_run_now(schedule_id: str):
    """Manually fire a schedule right now (does not change its next_run_at)."""
    cur = sb().table("core_schedules").select("*").eq("id", schedule_id).single().execute()
    if not cur.data:
        raise HTTPException(404, "schedule not found")
    s = cur.data
    payload = s.get("action_payload") or {}
    result = await _run_schedule_action(s["action_type"], payload)
    sb().table("core_schedules").update({
        "last_run_at": datetime.now(timezone.utc).isoformat(),
        "last_status": result["status"],
        "last_result": result["output"][:4000],
    }).eq("id", schedule_id).execute()
    _notify_if_requested(s["name"], payload, result)
    return {"result": result}


# ══════════════════════════════════════════════════════════════════════════════
# ALWAYS-AWAKE BACKGROUND JOBS — server-side port of conversationReviewService.ts
# (client-side, Tauri-app-open-gated). Checked every /cron/tick (already
# ticking every minute via the VPS crontab independent of the app — see
# LOCAL_DEV.md), so self-review now runs on a day the app is never opened,
# closing the single biggest gap in "AXE is awake even when you're not
# looking at it". The client version still exists for on-demand / Settings-
# panel runs; this is additive, not a replacement.
#
# Memory decay does NOT need a Python port: a Postgres-native
# run_memory_decay_pass() already exists (SECURITY DEFINER function,
# functionally identical to memoryDecayService.ts) and is scheduled directly
# via pg_cron ('axe-memory-decay-weekly', Sundays 03:00 UTC) — see
# cron.job in Supabase. That runs inside Postgres itself, independent of
# even the VPS being up, which is strictly more "always awake" than an HTTP
# round-trip from here would be. Duplicating it here would just mean two
# systems decaying the same rows.
# ══════════════════════════════════════════════════════════════════════════════


def _claim_job_run(job_name: str, run_key: str) -> bool:
    """Atomic claim via the (job_name, run_key) primary key — a real mutual
    exclusion regardless of which uvicorn worker/connection gets there first,
    unlike a read-then-write "does a marker exist" check (which has a race
    window a ~90s job easily falls into when cron ticks every 60s)."""
    try:
        sb().table("core_background_job_runs").insert(
            {"job_name": job_name, "run_key": run_key}
        ).execute()
        return True
    except Exception:
        return False  # primary key conflict = another worker already claimed it


_REVIEW_SYSTEM_PROMPT = (
    "You are AXE's self-review process. You will be shown one real exchange — "
    "the user's actual message and AXE's actual reply. Score it honestly, without flattery:\n"
    '{"clarity": 1-5, "correctness": 1-5, "proactiveness": 1-5, "flagged": true|false, '
    '"notes": "one sentence, only when flagged, describing what a better reply would have done differently"}\n'
    "Flag it (flagged: true) if ANY score is 3 or lower. Respond ONLY with the JSON object, "
    "no markdown fences, no other text."
)


async def _score_exchange(user_text: str, axe_text: str) -> Optional[dict]:
    """Local Ollama does the scoring — a real scorer with no dependency on the
    user's own cloud provider keys (which only ever live in the app, not on
    the VPS)."""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "http://127.0.0.1:11434/api/chat",
                json={
                    "model": "hermes3:8b",
                    "messages": [
                        {"role": "system", "content": _REVIEW_SYSTEM_PROMPT},
                        {"role": "user", "content": f"User message:\n{user_text}\n\nAXE's reply:\n{axe_text}"},
                    ],
                    "stream": False,
                    "format": "json",
                },
            )
        if r.is_error:
            return None
        raw = (r.json().get("message") or {}).get("content", "").strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
        if all(isinstance(parsed.get(k), (int, float)) for k in ("clarity", "correctness", "proactiveness")):
            return parsed
    except Exception:
        pass
    return None


async def run_conversation_review(limit: int = 6) -> dict:
    """Same algorithm as conversationReviewService.ts's runConversationReview()."""
    reviewed = 0
    flagged = 0
    try:
        rows = (
            sb().table("messages")
            .select("conversation_id,role,content,created_at")
            .order("created_at", desc=True)
            .limit(300)
            .execute()
        ).data or []
    except Exception as e:
        logging.warning(f"[conversation_review] load failed: {e}")
        return {"reviewed": 0, "flagged": 0}

    by_conv: dict[str, list[dict]] = {}
    for r in rows:
        by_conv.setdefault(r["conversation_id"], []).append(r)

    exchanges = []
    for conv_id, msgs in by_conv.items():
        chrono = list(reversed(msgs))
        for i in range(len(chrono) - 1):
            if chrono[i]["role"] == "user" and chrono[i + 1]["role"] == "assistant":
                exchanges.append({
                    "conversation_id": conv_id,
                    "user_text": (chrono[i]["content"] or "")[:1500],
                    "axe_text": (chrono[i + 1]["content"] or "")[:1500],
                    "created_at": chrono[i + 1]["created_at"],
                })
    exchanges.sort(key=lambda e: e["created_at"], reverse=True)
    exchanges = exchanges[:limit]

    for ex in exchanges:
        review = await _score_exchange(ex["user_text"], ex["axe_text"])
        if not review:
            continue
        reviewed += 1
        try:
            sb().table("core_conversation_reviews").insert({
                "conversation_id": ex["conversation_id"],
                "user_excerpt": ex["user_text"][:500],
                "axe_excerpt": ex["axe_text"][:500],
                "clarity_score": review["clarity"],
                "correctness_score": review["correctness"],
                "proactiveness_score": review["proactiveness"],
                "flagged": bool(review.get("flagged")),
                "notes": review.get("notes"),
            }).execute()
        except Exception as e:
            logging.warning(f"[conversation_review] insert failed: {e}")
            continue

        if review.get("flagged"):
            flagged += 1
            try:
                at = datetime.now(timezone.utc).isoformat()
                body = "\n".join([
                    f"## Self-review flagged a reply (clarity {review['clarity']}, "
                    f"correctness {review['correctness']}, proactiveness {review['proactiveness']})",
                    "",
                    f"**When:** {at}",
                    "**Outcome:** failed",
                    "**Category:** conversation_quality",
                    "",
                    "### What happened",
                    f'User asked: "{ex["user_text"][:300]}"\nAXE replied: "{ex["axe_text"][:300]}"',
                    "",
                    "### Lesson",
                    review.get("notes") or "Below AXE's own bar on at least one axis.",
                    "",
                    "[[Reflections]]",
                ])
                sb().table("core_obsidian_notes").insert({
                    "path": f"AXE/Reflections/self-review-flagged-{int(datetime.now(timezone.utc).timestamp())}.md",
                    "title": "Reflection: Self-review flagged a reply",
                    "content": body,
                    "tags": ["reflection", "failed", "conversation_quality"],
                    "wikilinks": ["Reflections"],
                    "source": "reflection",
                    "metadata": {"outcome": "failed", "category": "conversation_quality", "at": at},
                    "updated_at": at,
                }).execute()
            except Exception as e:
                logging.warning(f"[conversation_review] reflection write failed: {e}")
    return {"reviewed": reviewed, "flagged": flagged}


async def _nightly_review_due() -> bool:
    try:
        today = datetime.now(timezone.utc).date().isoformat()
        rows = (
            sb().table("core_conversation_reviews")
            .select("created_at")
            .gte("created_at", f"{today}T00:00:00+00:00")
            .limit(1)
            .execute()
        ).data
        return not rows
    except Exception as e:
        logging.warning(f"[conversation_review] due-check failed, skipping this tick: {e}")
        return False


async def run_self_heal_check() -> dict:
    """Re-runs the same reachability check /status/vps-agents does, but
    diffs it against the last check and only writes an Obsidian note when
    something FLIPS from reachable to unreachable — a service that was
    already known-broken doesn't spam a new note every hour. This is the
    "AXE would have caught the Gemini key revocation / Groq outage itself"
    piece: previously this only surfaced if you happened to open Settings.
    Scoped to VPS-hosted services on purpose — the cloud provider keys
    (Gemini/OpenAI/Anthropic/...) only ever live in the app's localStorage,
    never sent to or stored on the VPS, so those can't be checked from here
    without a much bigger (and worse) trust trade-off; the app itself now
    does the equivalent check client-side for those."""
    current = await _check_vps_services()
    try:
        prev_rows = (
            sb().table("core_obsidian_notes")
            .select("metadata")
            .eq("path", "AXE/System/self-heal-last-check.md")
            .limit(1)
            .execute()
        ).data
        prev = (prev_rows[0]["metadata"] if prev_rows else {}) or {}
    except Exception as e:
        logging.warning(f"[self_heal] could not load previous check: {e}")
        prev = {}

    newly_broken = [
        name for name, status in current.items()
        if status.get("configured") and not status.get("reachable")
        and (prev.get(name) or {}).get("reachable") is True
    ]
    recovered = [
        name for name, status in current.items()
        if status.get("reachable")
        and (prev.get(name) or {}).get("reachable") is False
    ]

    def _status_line(name: str, s: dict) -> str:
        if s.get("reachable"):
            return f"- **{name}**: ✅ reachable"
        err = s.get("error")
        return f"- **{name}**: ❌ unreachable" + (f" — {err}" if err else "")

    at = datetime.now(timezone.utc).isoformat()
    try:
        sb().table("core_obsidian_notes").upsert({
            "path": "AXE/System/self-heal-last-check.md",
            "title": "Self-heal — last VPS service check",
            "content": "\n".join([
                "## VPS service health (self-heal check)",
                f"**At:** {at}",
                "",
                *(_status_line(name, s) for name, s in current.items()),
            ]),
            "tags": ["system", "self-heal"],
            "source": "system",
            "metadata": current,
            "updated_at": at,
        }, on_conflict="path").execute()
    except Exception as e:
        logging.warning(f"[self_heal] status note write failed: {e}")

    if newly_broken:
        try:
            sb().table("core_obsidian_notes").insert({
                "path": f"AXE/Reflections/self-heal-alert-{int(datetime.now(timezone.utc).timestamp())}.md",
                "title": f"Self-heal alert: {', '.join(newly_broken)} went down",
                "content": "\n".join([
                    f"## Service(s) that stopped responding: {', '.join(newly_broken)}",
                    "",
                    f"**When:** {at}",
                    "**Outcome:** failed",
                    "**Category:** self_heal",
                    "",
                    "### What happened",
                    *(f"- **{name}**: {current[name].get('error', 'no longer reachable')}" for name in newly_broken),
                    "",
                    "### Lesson",
                    "This was working on the previous hourly check and isn't now — surface it to Luka rather than silently retrying, he needs to know a service he's relying on just broke.",
                    "",
                    "[[Reflections]]",
                ]),
                "tags": ["reflection", "failed", "self_heal"],
                "source": "reflection",
                "metadata": {"outcome": "failed", "category": "self_heal", "newly_broken": newly_broken, "at": at},
                "updated_at": at,
            }).execute()
        except Exception as e:
            logging.warning(f"[self_heal] alert write failed: {e}")

    return {"newly_broken": newly_broken, "recovered": recovered}


async def run_always_awake_jobs() -> None:
    """Called from every /cron/tick. The due-check is one cheap indexed
    query; the heavy pass only runs when actually due AND this tick wins the
    atomic claim, so ticking this every minute is fine — including with
    multiple uvicorn workers. (Memory decay isn't here — see the module
    docstring above; it's pg_cron's job, not this process's.)"""
    today = datetime.now(timezone.utc).date().isoformat()
    this_hour = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")
    try:
        if _claim_job_run("self_heal_check", this_hour):
            await run_self_heal_check()
    except Exception as e:
        logging.warning(f"[always_awake] self-heal check failed: {e}")
    try:
        if await _nightly_review_due() and _claim_job_run("conversation_review", today):
            await run_conversation_review(6)
    except Exception as e:
        logging.warning(f"[always_awake] nightly review failed: {e}")


@app.post("/cron/tick")
async def cron_tick(
    x_cron_secret: str = Header(default=""),
    x_cron_key: str = Header(default=""),
):
    """Run all due schedules. Called every minute by the VPS crontab with the
    CRON_SECRET. Secured by that shared secret, NOT the bearer key, so the
    crontab line doesn't need the full API key. Accepts X-Cron-Secret (new) or
    X-Cron-Key (legacy)."""
    provided = x_cron_secret or x_cron_key
    if not CRON_SECRET or provided != CRON_SECRET:
        raise HTTPException(401, "Invalid cron secret")
    now = datetime.now(timezone.utc)
    due = (
        sb().table("core_schedules")
        .select("*")
        .eq("enabled", True)
        .lte("next_run_at", now.isoformat())
        .limit(50)
        .execute()
    )
    ran = []
    for s in due.data or []:
        payload = s.get("action_payload") or {}
        result = await _run_schedule_action(s["action_type"], payload)
        update = {
            "last_run_at": now.isoformat(),
            "last_status": result["status"],
            "last_result": result["output"][:4000],
        }
        try:
            update["next_run_at"] = _compute_next_run(s["cron_expr"], s.get("timezone") or "UTC")
        except ValueError:
            # A schedule with a corrupt cron expr is disabled rather than retried
            # every minute forever.
            update["enabled"] = False
            update["next_run_at"] = None
        sb().table("core_schedules").update(update).eq("id", s["id"]).execute()
        _notify_if_requested(s["name"], payload, result)
        ran.append({"id": s["id"], "name": s["name"], "status": result["status"]})
    await audit("cron_tick", "cron", {"ran": len(ran), "details": ran})
    await run_always_awake_jobs()
    return {"ran": len(ran), "at": now.isoformat(), "details": ran}
