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
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from dotenv import load_dotenv
load_dotenv()  # Load .env from current directory automatically

import asyncio
import httpx
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from supabase import Client, create_client

from crew_runner import run_crew
from task_runtime import TaskRepository

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
# This VPS has 6 cores / 7.7GB RAM — it cannot run more than one OpenHands
# sandbox at a time (2026-07-28: concurrent sandboxes from overlapping test
# calls hung the entire VPS network stack twice, each requiring a hard
# reboot). A second call while one is in flight waits here rather than
# spawning a competing sandbox.
_OPENHANDS_SEMAPHORE = asyncio.Semaphore(1)
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
#
# Found live 2026-08-11: supabase-py's default postgrest_client_timeout is
# 120 SECONDS. /cron/tick is called every 60s by the VPS crontab and does an
# unguarded sb().table(...).execute(). During a real Supabase-side outage
# (Cloudflare 522s on the origin — confirmed in Supabase's own dashboard,
# unrelated to this app), each tick's query could hang for up to 120s instead
# of failing fast. With the crontab firing every 60s regardless of whether the
# previous tick finished, and only 2 uvicorn workers, that stacks up faster
# than it drains: within a few minutes every worker slot is pinned on a
# 120s-timeout call, and the ENTIRE API — every endpoint, not just cron,
# including the memory/agent-tagging work built this session — goes
# unresponsive. Confirmed via journalctl: a genuine traceback from this exact
# path, timestamped during a live Supabase 522.
#
# 15s is generous for a real query against this project's tables and turns a
# hung request into a fast, loud failure instead of a slow-motion worker leak.
#
# The timeout is set AFTER construction, not via ClientOptions(...) — that was
# the first attempt and it broke every endpoint. dataclasses.fields() on this
# installed version's ClientOptions shows no `storage` field, yet
# Client.__init__'s own no-args default path builds one with a storage kwarg,
# and passing our own ClientOptions() skips that path entirely: auth-client
# init then reads client_options.storage unconditionally and throws
# AttributeError. Letting create_client() build its normal, working default
# client and mutating .options.postgrest_client_timeout on the result sidesteps
# that entirely — confirmed live: the value takes effect (a deliberately slow
# query genuinely timed out at 15s instead of hanging toward 120s) and nothing
# else about client construction changes.
def sb() -> Client:
    client = create_client(SUPABASE_URL, SUPABASE_SRK)
    client.options.postgrest_client_timeout = 15
    return client

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

class TaskCreateRequest(BaseModel):
    title: str
    goal: str
    description: Optional[str] = None
    priority: str = "medium"
    requested_by: str = "luka"
    source_app: str = "axe_core"
    capability: Optional[str] = None
    execution_mode: str = "execute"
    idempotency_key: Optional[str] = None
    parent_task_id: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)

class TaskClaimRequest(BaseModel):
    worker_id: str
    lease_seconds: int = 60

class TaskHeartbeatRequest(BaseModel):
    worker_id: str
    lease_token: str
    lease_seconds: int = 60
    checkpoint: Optional[dict[str, Any]] = None

class TaskTransitionRequest(BaseModel):
    status: str
    worker_id: Optional[str] = None
    lease_token: Optional[str] = None
    checkpoint: Optional[dict[str, Any]] = None
    result: Optional[dict[str, Any]] = None
    error: Optional[dict[str, Any]] = None

class TaskApprovalRequest(BaseModel):
    kind: str
    title: str
    detail: str
    target_type: str = "task"
    target_id: Optional[str] = None
    requested_by: str = "axe"
    expires_at: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

class TaskApprovalDecision(BaseModel):
    approved: bool
    decided_by: str = "luka"
    reason: Optional[str] = None

class MemoryEntry(BaseModel):
    user_id: str
    category: str
    key: str
    value: str
    confidence: float = 1.0
    metadata: Optional[dict] = None

class WebhookIngest(BaseModel):
    user_id: str = "webhook"
    payload: dict

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
# DURABLE TASK KERNEL
# ══════════════════════════════════════════════════════════════════════════════

def task_repo() -> TaskRepository:
    return TaskRepository(sb)

@app.post("/tasks", dependencies=[AUTH], status_code=202)
async def create_task(req: TaskCreateRequest, request: Request):
    if not req.title.strip() or not req.goal.strip():
        raise HTTPException(422, "title and goal are required")
    try:
        task, created = task_repo().create(req.model_dump())
    except Exception as exc:
        log.exception("create_task failed")
        raise HTTPException(503, f"Task store unavailable: {exc}") from exc
    await audit("task_create", task["id"], {
        "created": created, "priority": task["priority"], "capability": task.get("capability"),
    }, request.client.host if request.client else "")
    return {"task": task, "created": created}

@app.get("/tasks/{task_id}", dependencies=[AUTH])
async def get_task(task_id: str, after_sequence: int = 0):
    try:
        snapshot = task_repo().get(task_id, max(after_sequence, 0))
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, "Invalid task id") from exc
    if snapshot is None:
        raise HTTPException(404, "Task not found")
    return snapshot

@app.post("/tasks/claim", dependencies=[AUTH])
async def claim_task(req: TaskClaimRequest):
    if not req.worker_id.strip():
        raise HTTPException(422, "worker_id is required")
    return {"task": task_repo().claim(
        req.worker_id.strip(), max(10, min(req.lease_seconds, 600)),
    )}

@app.post("/tasks/{task_id}/heartbeat", dependencies=[AUTH])
async def heartbeat_task(task_id: str, req: TaskHeartbeatRequest):
    try:
        task = task_repo().heartbeat(
            task_id, req.worker_id, req.lease_token,
            max(10, min(req.lease_seconds, 600)), req.checkpoint,
        )
        return {"task": task}
    except Exception as exc:
        raise HTTPException(409, f"Lease lost or task unavailable: {exc}") from exc

@app.post("/tasks/{task_id}/transition", dependencies=[AUTH])
async def transition_task(task_id: str, req: TaskTransitionRequest, request: Request):
    try:
        task = task_repo().transition(
            task_id, req.status, worker_id=req.worker_id, lease_token=req.lease_token,
            checkpoint=req.checkpoint, result=req.result, error=req.error,
        )
    except KeyError as exc:
        raise HTTPException(404, "Task not found") from exc
    except (ValueError, PermissionError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc
    await audit("task_transition", task_id, {
        "status": req.status, "worker_id": req.worker_id,
    }, request.client.host if request.client else "")
    return {"task": task}

@app.get("/approvals", dependencies=[AUTH])
async def list_approvals(status: str = "pending", limit: int = 20):
    """What AXE is waiting on, across every task.

    The phone's notification watcher polls this. It cannot read core_approvals
    from Supabase directly -- that table grants nothing below service_role --
    and a lock-screen surface that silently sees zero pending approvals is
    worse than one that errors, because the task stays parked and nobody knows.
    """
    try:
        return {"approvals": task_repo().list_approvals(status, min(limit, 100))}
    except Exception as exc:
        raise HTTPException(503, f"Could not read approvals: {exc}") from exc

@app.post("/tasks/{task_id}/approvals", dependencies=[AUTH], status_code=202)
async def request_task_approval(task_id: str, req: TaskApprovalRequest, request: Request):
    try:
        if task_repo().get(task_id) is None:
            raise HTTPException(404, "Task not found")
        approval = task_repo().request_approval(task_id, req.model_dump())
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(409, f"Could not request approval: {exc}") from exc
    await audit("approval_request", task_id, {
        "approval_id": approval["id"], "kind": req.kind,
    }, request.client.host if request.client else "")
    return {"approval": approval}

@app.post("/tasks/{task_id}/approvals/{approval_id}/decision", dependencies=[AUTH])
async def decide_task_approval(
    task_id: str, approval_id: str, req: TaskApprovalDecision, request: Request,
):
    try:
        approval = task_repo().decide_approval(
            task_id, approval_id, req.approved, req.decided_by, req.reason,
        )
    except KeyError as exc:
        raise HTTPException(404, "Pending approval not found") from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
    await audit("approval_decision", task_id, {
        "approval_id": approval_id, "approved": req.approved,
        "decided_by": req.decided_by,
    }, request.client.host if request.client else "")
    return {"approval": approval}

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
        # Ollama cold-loads a model on first use after it's been evicted
        # (expected often now — OLLAMA_MAX_LOADED_MODELS=1 on the Hetzner
        # VPS unloads the previous model on every switch) and that alone can
        # take 20-90s on this box's CPU-only inference. The frontend already
        # budgets 90s for Ollama specifically (llmGateway.ts's isOllama
        # AbortSignal.timeout), but this backend call was cutting its own
        # upstream request off at a flat 25s regardless of provider — so a
        # perfectly healthy but cold Ollama model 502'd here long before the
        # frontend's own patience ran out. Match it for Ollama; every other
        # provider is a fast cloud API and keeps the original budget.
        proxy_timeout = 90 if provider == "ollama" else 25
        async with httpx.AsyncClient(timeout=proxy_timeout) as client:
            if fmt == "anthropic":
                sys_msg = next((m["content"] for m in messages if m.get("role") == "system"), None)
                # Anthropic's endpoint is BASE + /v1/messages, so the base must
                # not already end in /v1 — and for OpenAI-shaped providers it
                # usually does, which is exactly why someone types it here.
                #
                # Seen live 2026-08-20: POST https://api.anthropic.com/v1/v1/messages
                # -> 404, over and over, while Luka was adding credits to an
                # account that was never the problem.
                #
                # THE BRANCH ITSELF WAS ALSO WRONG, and that one cost more. The
                # chain read `if anthro_base.endswith("/v1") / elif fmt ==
                # "google" / else`, so it dispatched on the URL instead of the
                # format: every provider whose base ends in /v1 was sent down
                # the Anthropic path. https://api.openai.com/v1 ends in /v1, so
                # an OpenAI key went out as x-api-key to /v1/messages and came
                # back as a bare "Proxy HTTP 502" — which reads as a dead key,
                # not as a router sending the request to the wrong vendor.
                anthro_base = (base_url or "https://api.anthropic.com").rstrip("/")
                if anthro_base.endswith("/v1"):
                    anthro_base = anthro_base[:-3].rstrip("/")
                r = await client.post(
                    f"{anthro_base}/v1/messages",
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


@app.post("/proxy/fish-tts")
async def proxy_fish_tts(body: dict = Body(...)):
    # Fish Audio's API doesn't answer CORS preflight (OPTIONS) requests
    # properly — it 401s them instead of returning Access-Control-Allow-*
    # headers — so a packaged Tauri app calling it directly from the webview
    # gets silently blocked before the real POST ever goes out ("Load
    # failed"). Same fix as Exa/the LLM providers: proxy server-to-server,
    # where CORS doesn't apply. Verified working via direct curl.
    key = os.environ.get("FISH_AUDIO_API_KEY") or body.get("key", "")
    text = (body.get("text") or "").strip()
    voice_id = body.get("voiceId") or body.get("reference_id") or ""
    if not key:
        raise HTTPException(503, "Fish Audio not configured (set FISH_AUDIO_API_KEY on the server, or save your key in the app).")
    if not text or not voice_id:
        raise HTTPException(400, "Missing text or voiceId")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.fish.audio/v1/tts",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "model": "s2.1-pro-free"},
                json={"text": text[:4000], "reference_id": voice_id, "format": "mp3", "speed": body.get("speed") or 1.0},
            )
        if r.is_error:
            raise HTTPException(502, f"Fish Audio HTTP {r.status_code}: {r.text[:200]}")
        return Response(content=r.content, status_code=200, media_type="audio/mpeg")
    except httpx.HTTPError as e:
        raise HTTPException(502, str(e)[:300])

# ══════════════════════════════════════════════════════════════════════════════
# MARKET DATA — real historical candles + news, server-side keys only
# ══════════════════════════════════════════════════════════════════════════════
# AXE ALGO's risk/backtest engine reads MetaAPI's own broker history first
# (tradingAgentEngine.ts, backtestEngine.ts) — these exist for when that isn't
# enough: no MT5 connected yet, a symbol the broker doesn't carry, or deeper
# history than the broker keeps. TWELVEDATA_API_KEY/FINNHUB_API_KEY were
# already provisioned in this VPS's .env from the AXE-VAULT sync but nothing
# used them until now. Keys stay server-side on purpose: a Vite app bakes
# every VITE_-prefixed env var straight into its shipped JS bundle, so a paid
# key would be trivially extractable from the packaged Tauri app if it lived
# client-side — trading-os.json in the vault has the same note carved in for
# exactly this reason. Gated behind AUTH (unlike /proxy/exa): this gets hit
# every autopilot cycle x every symbol, and an open unauthenticated proxy
# would let anyone who finds the URL burn through a paid quota.

_TD_SYMBOL_MAP = {
    "XAUUSD": "XAU/USD", "XAGUSD": "XAG/USD",
    "EURUSD": "EUR/USD", "GBPUSD": "GBP/USD", "USDJPY": "USD/JPY",
    "USDCHF": "USD/CHF", "AUDUSD": "AUD/USD", "NZDUSD": "NZD/USD", "USDCAD": "USD/CAD",
    "BTCUSD": "BTC/USD", "ETHUSD": "ETH/USD",
}


def _td_symbol(symbol: str) -> str:
    # Falls through unmapped (indices, commodities beyond XAU/XAG) as-is —
    # TwelveData's own error message is more honest than a guessed ticker.
    return _TD_SYMBOL_MAP.get(symbol.strip().upper(), symbol.strip().upper())


async def _fetch_twelvedata_history(symbol: str, interval: str, outputsize: int) -> dict:
    key = os.environ.get("TWELVEDATA_API_KEY", "")
    if not key:
        return {"ok": False, "error": "TWELVEDATA_API_KEY not configured on the server."}
    outputsize = max(50, min(outputsize, 5000))
    td_symbol = _td_symbol(symbol)
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            "https://api.twelvedata.com/time_series",
            params={"symbol": td_symbol, "interval": interval, "outputsize": outputsize, "apikey": key, "order": "ASC"},
        )
    data = r.json()
    if data.get("status") == "error":
        return {"ok": False, "error": f"TwelveData: {data.get('message', 'unknown error')}"}
    values = data.get("values") or []
    candles = [
        {
            "time": v.get("datetime"),
            "open": float(v["open"]), "high": float(v["high"]),
            "low": float(v["low"]), "close": float(v["close"]),
            "volume": float(v.get("volume") or 0),
        }
        for v in values
    ]
    return {"ok": True, "symbol": symbol.upper(), "source": "twelvedata", "candles": candles}


@app.get("/backtest/vectorbt", dependencies=[AUTH])
async def backtest_vectorbt(symbol: str, interval: str = "1h", outputsize: int = 1000):
    """AXE Algo's vectorbt self-test engine. Runs the clean vbt:* strategies
    over real candles in an ISOLATED venv (/opt/axe-trading) — its heavy pinned
    deps never touch this API's env — and returns per-strategy metrics that
    AXE Core folds into the per-pair×strategy ledger as backtest priors."""
    py = "/opt/axe-trading/venv/bin/python"
    script = "/opt/axe-trading/vbt_backtest.py"
    if not os.path.exists(py) or not os.path.exists(script):
        raise HTTPException(status_code=503, detail="vectorbt self-test engine not installed on this host")
    try:
        proc = await asyncio.create_subprocess_exec(
            py, script, symbol, interval, str(outputsize),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            env={**os.environ},  # carries TWELVEDATA_API_KEY loaded from .env
        )
        out, err = await asyncio.wait_for(proc.communicate(), timeout=150)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="vectorbt backtest timed out")
    try:
        return json.loads(out.decode() or "{}")
    except Exception:
        detail = (err.decode() or out.decode() or "no output")[:400]
        raise HTTPException(status_code=500, detail=f"vectorbt output not JSON: {detail}")


@app.get("/signal/vectorbt", dependencies=[AUTH])
async def signal_vectorbt(symbol: str, interval: str = "1h", outputsize: int = 400):
    """Current buy/sell/hold per vbt:* strategy on the latest bar — lets AXE
    Algo actually TRADE a vectorbt strategy the ledger selected, not just rank
    it. Same isolated engine as /backtest/vectorbt, run in 'signal' mode."""
    py = "/opt/axe-trading/venv/bin/python"
    script = "/opt/axe-trading/vbt_backtest.py"
    if not os.path.exists(py) or not os.path.exists(script):
        raise HTTPException(status_code=503, detail="vectorbt engine not installed on this host")
    try:
        proc = await asyncio.create_subprocess_exec(
            py, script, symbol, interval, str(outputsize), "signal",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            env={**os.environ},
        )
        out, err = await asyncio.wait_for(proc.communicate(), timeout=90)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="vectorbt signal timed out")
    try:
        return json.loads(out.decode() or "{}")
    except Exception:
        detail = (err.decode() or out.decode() or "no output")[:400]
        raise HTTPException(status_code=500, detail=f"vectorbt output not JSON: {detail}")


# ── NautilusTrader engine ───────────────────────────────────────────────────
#
# Second framework, own venv, same contract as vectorbt. It needs python>=3.11
# and vectorbt does not, which is the whole reason these are separate venvs
# rather than one shared "trading" env: upgrading one must never be able to
# break the other.
#
# The vectorbt routes above are deliberately left as they are. They are running
# in production and a refactor of working code buys nothing here; the shared
# helper below exists so this engine does not add a third and fourth copy of
# the same subprocess dance.

NAUTILUS_PY = "/opt/axe-nautilus/venv/bin/python"
NAUTILUS_SCRIPT = "/opt/axe-nautilus/nautilus_backtest.py"


async def _run_engine(py: str, script: str, label: str, args: list[str], timeout: int) -> dict:
    """Run a framework engine out-of-process and return its JSON.

    Engines are separate processes on purpose: a numba or Rust import that dies
    takes its own subprocess with it and not this API."""
    if not os.path.exists(py) or not os.path.exists(script):
        raise HTTPException(status_code=503, detail=f"{label} engine not installed on this host")
    try:
        proc = await asyncio.create_subprocess_exec(
            py, script, *args,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            env={**os.environ},  # carries TWELVEDATA_API_KEY loaded from .env
        )
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail=f"{label} timed out")
    try:
        return json.loads(out.decode() or "{}")
    except Exception:
        detail = (err.decode() or out.decode() or "no output")[:400]
        raise HTTPException(status_code=500, detail=f"{label} output not JSON: {detail}")


@app.get("/backtest/nautilus", dependencies=[AUTH])
async def backtest_nautilus(symbol: str, interval: str = "1h", outputsize: int = 1000):
    """NautilusTrader self-test. Runs the nt:* strategies through a real
    matching engine — each one a bracket with a stop and a target filled
    against every bar's high and low — and returns the same six metrics
    vectorbt does, which AXE Core folds into the same ledger as priors.

    Slower than vectorbt by nature: this simulates order by order rather than
    vectorising, so the timeout is longer."""
    return await _run_engine(
        NAUTILUS_PY, NAUTILUS_SCRIPT, "nautilus backtest",
        [symbol, interval, str(outputsize)], 300,
    )


@app.get("/signal/nautilus", dependencies=[AUTH])
async def signal_nautilus(symbol: str, interval: str = "1h", outputsize: int = 400):
    """Current buy/sell/hold per nt:* strategy on the latest bar, so AXE Algo
    can trade a Nautilus strategy the ledger selected. Signal mode does not
    start the matching engine at all — it reads the same signal definitions the
    backtest uses, so the two can never disagree."""
    return await _run_engine(
        NAUTILUS_PY, NAUTILUS_SCRIPT, "nautilus signal",
        [symbol, interval, str(outputsize), "signal"], 90,
    )


# ── TradingAgents engine ────────────────────────────────────────────────────
#
# Third framework, and the one with a different cost shape: every decision is a
# real multi-agent LLM conversation, so it is priced in minutes where the other
# two are priced in seconds. It runs against this box's OWN Ollama, so it costs
# no provider quota and cannot be broken by a revoked key -- which is what makes
# it safe for the autopilot to call at all.

TA_PY = "/opt/axe-tradingagents/venv/bin/python"
TA_SCRIPT = "/opt/axe-tradingagents/tradingagents_engine.py"


@app.get("/backtest/tradingagents", dependencies=[AUTH])
async def backtest_tradingagents(symbol: str, interval: str = "1h", outputsize: int = 0, dates: int = 4):
    """Small walk-forward: a handful of dates, each a full debate, scored on
    what the price actually did next. Deliberately few -- this is the honest
    alternative to pretending a thousand-bar sweep is possible with an LLM in
    the loop."""
    return await _run_engine(
        TA_PY, TA_SCRIPT, "tradingagents backtest",
        [symbol, interval, str(outputsize), "backtest", str(dates)], 1800,
    )


@app.get("/signal/tradingagents", dependencies=[AUTH])
async def signal_tradingagents(symbol: str, interval: str = "1h"):
    """The firm's LAST decision, read from cache. Never runs a model.

    Measured on this box: one debate runs past four minutes on the 8B model and
    on the 3B one alike -- the cost is the number of sequential tool-using
    calls, not the model. So a live signal path that waits for a debate would
    stall every trading cycle, and capping it shorter just means ta:debate gets
    promoted by the ledger and then times out into hold forever: wired, ranked,
    and silently never trading.

    Hence the split. This reads what /refresh wrote, in milliseconds. A missing
    or day-old cache comes back as hold with a reason attached."""
    return await _run_engine(
        TA_PY, TA_SCRIPT, "tradingagents signal",
        [symbol, interval, "0", "signal"], 30,
    )


@app.get("/refresh/tradingagents", dependencies=[AUTH])
async def refresh_tradingagents(symbol: str, interval: str = "1h"):
    """Run a real debate and cache the answer. Minutes, by design — call it on
    a schedule, not in a trading loop."""
    return await _run_engine(
        TA_PY, TA_SCRIPT, "tradingagents refresh",
        [symbol, interval, "0", "refresh"], 1800,
    )


@app.get("/frameworks/status", dependencies=[AUTH])
async def frameworks_status():
    """Which engines are actually on this box.

    The Frameworks tab used to decide "wired" from a constant in the frontend,
    which meant it would have claimed an engine was live the moment the code
    naming it shipped — regardless of whether anything was installed here. This
    project has been caught by written-but-never-connected three times; a tab
    whose whole purpose is to say which frameworks are real should not be
    reading its answer off a hard-coded list."""
    return {
        "ok": True,
        "frameworks": {
            "vbt": {"installed": os.path.exists("/opt/axe-trading/venv/bin/python")
                    and os.path.exists("/opt/axe-trading/vbt_backtest.py")},
            "nt": {"installed": os.path.exists(NAUTILUS_PY) and os.path.exists(NAUTILUS_SCRIPT)},
            "ta": {"installed": os.path.exists(TA_PY) and os.path.exists(TA_SCRIPT)},
        },
    }


async def _fetch_finnhub_news(category: str, limit: int) -> dict:
    key = os.environ.get("FINNHUB_API_KEY", "")
    if not key:
        return {"ok": False, "error": "FINNHUB_API_KEY not configured on the server."}
    limit = max(1, min(limit, 50))
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get("https://finnhub.io/api/v1/news", params={"category": category, "token": key})
    if r.is_error:
        return {"ok": False, "error": f"Finnhub HTTP {r.status_code}: {r.text[:200]}"}
    items = r.json() or []
    news = [
        {
            "id": str(a.get("id")), "headline": a.get("headline"), "summary": a.get("summary"),
            "url": a.get("url"), "source": a.get("source"), "datetime": a.get("datetime"),
            "image": a.get("image"),
        }
        for a in items[:limit]
    ]
    return {"ok": True, "category": category, "source": "finnhub", "news": news}


async def _fetch_finnhub_calendar() -> dict:
    key = os.environ.get("FINNHUB_API_KEY", "")
    if not key:
        return {"ok": False, "error": "FINNHUB_API_KEY not configured on the server."}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get("https://finnhub.io/api/v1/calendar/economic", params={"token": key})
    if r.is_error:
        # Finnhub's economic calendar is a paid-tier endpoint on some plans —
        # surface that honestly rather than pretend it's empty.
        return {"ok": False, "error": f"Finnhub calendar HTTP {r.status_code}: {r.text[:200]}"}
    raw_events = (r.json() or {}).get("economicCalendar") or []
    # Finnhub's own field is `time`; DataPlanePanel.tsx's CalendarEvent
    # expects `date`. Normalized here so it's already correct whenever this
    # unlocks on a higher Finnhub tier.
    events = [
        {"event": e.get("event"), "date": e.get("time"), "impact": e.get("impact"), "country": e.get("country")}
        for e in raw_events
    ]
    return {"ok": True, "source": "finnhub", "events": events}


_FRED_SERIES = {"real_yield_10y": "DFII10", "dxy": "DTWEXBGS", "fed_funds": "FEDFUNDS"}


async def _fetch_fred_series(name: str) -> dict:
    key = os.environ.get("FRED_API_KEY", "")
    if not key:
        return {"ok": False, "error": "FRED_API_KEY not configured on the server."}
    series_id = _FRED_SERIES.get(name)
    if not series_id:
        return {"ok": False, "error": f"Unknown macro series '{name}'."}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={"series_id": series_id, "api_key": key, "file_type": "json", "sort_order": "desc", "limit": 1},
        )
    if r.is_error:
        return {"ok": False, "error": f"FRED HTTP {r.status_code}: {r.text[:200]}"}
    obs = (r.json() or {}).get("observations") or []
    return {"ok": True, "source": "fred", "series_id": series_id, "observations": obs}


async def _fetch_polymarket_bias() -> dict:
    # Public API, no key. Not filtered per-symbol — the top-volume market
    # catalog skews sports/entertainment moment to moment, so a plain
    # "?order=volume" listing was mostly noise for a trading context. A
    # macro-keyword search keeps this to the Fed/inflation/rates markets
    # that actually bear on FX and index decisions.
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://gamma-api.polymarket.com/public-search",
                params={"q": "fed rate inflation recession", "limit_per_type": 8},
            )
        if r.is_error:
            return {"ok": False, "error": f"Polymarket HTTP {r.status_code}: {r.text[:200]}"}
        events = (r.json() or {}).get("events") or []
        items = [
            {"question": m.get("question"), "outcomePrices": m.get("outcomePrices"), "volume": m.get("volume")}
            for e in events
            for m in (e.get("markets") or [])[:2]
        ]
        items.sort(key=lambda m: float(m.get("volume") or 0), reverse=True)
        return {"ok": True, "source": "polymarket", "markets": items[:8]}
    except httpx.HTTPError as e:
        return {"ok": False, "error": str(e)[:300]}


@app.get("/market/history", dependencies=[AUTH])
async def market_history(symbol: str, interval: str = "1h", outputsize: int = 300):
    try:
        result = await _fetch_twelvedata_history(symbol, interval, outputsize)
    except httpx.HTTPError as e:
        raise HTTPException(502, str(e)[:300])
    if not result["ok"]:
        raise HTTPException(503 if "not configured" in result["error"] else 502, result["error"])
    return result


@app.get("/market/news", dependencies=[AUTH])
async def market_news(category: str = "forex", limit: int = 20):
    try:
        result = await _fetch_finnhub_news(category, limit)
    except httpx.HTTPError as e:
        raise HTTPException(502, str(e)[:300])
    if not result["ok"]:
        raise HTTPException(503 if "not configured" in result["error"] else 502, result["error"])
    return result


# ── Agent toolbox — catalog + generic dispatch + standing decision context ──
# Backs DataPlanePanel.tsx (agent toolbox + macro/calendar/news/crowd-bias
# context), which was already fully built client-side against this exact
# contract (MarketTool/MarketToolResult/MacroBrief) with nothing behind it —
# every call 404'd. All actual fetching reuses the helpers above.

_MARKET_TOOLS = [
    {"name": "twelvedata_history", "args": {"symbol": "EURUSD", "interval": "1h"}, "description": "Historical OHLC candles (TwelveData)", "env": "TWELVEDATA_API_KEY"},
    {"name": "finnhub_news", "args": {"category": "forex"}, "description": "Market news headlines (Finnhub)", "env": "FINNHUB_API_KEY"},
    {"name": "finnhub_calendar", "args": {}, "description": "Economic calendar (Finnhub)", "env": "FINNHUB_API_KEY"},
    {"name": "fred_macro", "args": {"name": "fed_funds"}, "description": "Macro series: real yield / dollar index / fed funds (FRED)", "env": "FRED_API_KEY"},
    {"name": "polymarket_bias", "args": {}, "description": "Crowd-sourced prediction-market odds (Polymarket, no key needed)", "env": None},
]


@app.get("/marketdata/tools", dependencies=[AUTH])
async def marketdata_tools():
    tools = [
        {**{k: v for k, v in t.items() if k != "env"}, "configured": bool(t["env"] is None or os.environ.get(t["env"]))}
        for t in _MARKET_TOOLS
    ]
    return {"tools": tools, "configured_count": sum(1 for t in tools if t["configured"]), "total": len(tools)}


class MarketToolCallRequest(BaseModel):
    tool: str
    args: dict = {}


@app.post("/marketdata/call", dependencies=[AUTH])
async def marketdata_call(req: MarketToolCallRequest):
    try:
        if req.tool == "twelvedata_history":
            data = await _fetch_twelvedata_history(
                req.args.get("symbol", "EURUSD"), req.args.get("interval", "1h"), int(req.args.get("outputsize", 300)),
            )
        elif req.tool == "finnhub_news":
            data = await _fetch_finnhub_news(req.args.get("category", "forex"), int(req.args.get("limit", 20)))
        elif req.tool == "finnhub_calendar":
            data = await _fetch_finnhub_calendar()
        elif req.tool == "fred_macro":
            data = await _fetch_fred_series(req.args.get("name", "fed_funds"))
        elif req.tool == "polymarket_bias":
            data = await _fetch_polymarket_bias()
        else:
            raise HTTPException(400, f"Unknown tool '{req.tool}'")
    except httpx.HTTPError as e:
        return {"tool": req.tool, "ok": False, "source": "", "data": None, "error": str(e)[:300]}
    source = data.get("source", "")
    ok = bool(data.get("ok"))
    return {"tool": req.tool, "ok": ok, "source": source, "data": data if ok else None, "error": None if ok else data.get("error")}


@app.get("/marketdata/brief/{symbol}", dependencies=[AUTH])
async def marketdata_brief(symbol: str):
    macro_names = list(_FRED_SERIES.keys())
    macro_results, calendar, news, bias = await asyncio.gather(
        asyncio.gather(*[_fetch_fred_series(n) for n in macro_names]),
        _fetch_finnhub_calendar(),
        _fetch_finnhub_news("forex", 10),
        _fetch_polymarket_bias(),
    )

    def _as_tool_result(name: str, result: dict, data: object = None) -> dict:
        ok = bool(result.get("ok"))
        return {"tool": name, "ok": ok, "source": result.get("source", ""), "data": data if ok else None, "error": None if ok else result.get("error")}

    # DataPlanePanel.tsx (already built, this endpoint's only consumer) casts
    # `.data` straight to CalendarEvent[]/NewsItem[]/BiasMarket[] and calls
    # .filter/.slice/.map on it directly — it expects the bare array, not the
    # {ok, source, events/news/markets} wrapper _fetch_finnhub_* etc. return.
    # Handing it the wrapper object crashed the whole page on mount (.filter
    # is not a function on a plain object). Macro is the one exception: the
    # panel reads r.data.observations, so that one keeps the full object.
    news_items = [
        {"title": n.get("headline"), "url": n.get("url"), "source": n.get("source")}
        for n in (news.get("news") or [])
    ]

    return {
        "symbol": symbol.upper(),
        "as_of": datetime.now(timezone.utc).isoformat(),
        "macro": {name: _as_tool_result(f"fred_{name}", res, res) for name, res in zip(macro_names, macro_results)},
        "calendar": _as_tool_result("finnhub_calendar", calendar, calendar.get("events")),
        "news": _as_tool_result("finnhub_news", news, news_items),
        "crowd_bias": _as_tool_result("polymarket_bias", bias, bias.get("markets")),
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
# MEMORY — canonical global_memory table (recordEvent / saveGlobalMemory land here)
# ══════════════════════════════════════════════════════════════════════════════
# Dedicated endpoints rather than /supabase/table/global_memory directly: an
# upsert on (user_id, key) needs on_conflict, which the generic insert route
# above doesn't support — every memoryRecorder/globalMemoryService write is a
# key-addressed fact (append-only events get a unique timestamped key,
# preferences/performance counters reuse one key on purpose to overwrite).

@app.post("/memory/upsert", dependencies=[AUTH])
async def memory_upsert(entries: list[MemoryEntry]):
    """Found live 2026-08-11: a batch containing two entries with the same
    (user_id, key) — e.g. the same dedupeKey-based preference saved twice
    within one client flush window — made Postgres reject the WHOLE batch
    with 'ON CONFLICT DO UPDATE command cannot affect row a second time'.
    ON CONFLICT genuinely cannot touch the same row twice in one multi-row
    statement; that is a Postgres constraint, not a bug in the schema. The
    fix is to de-duplicate client-side, before the request ever reaches
    Postgres, keeping the LAST occurrence of each key — the same
    last-write-wins semantics the batch would have if sent as separate
    calls instead of one."""
    if not entries:
        return []
    deduped: dict[tuple[str, str], MemoryEntry] = {}
    for e in entries:
        deduped[(e.user_id, e.key)] = e
    rows = [e.model_dump() for e in deduped.values()]
    result = sb().table("global_memory").upsert(rows, on_conflict="user_id,key").execute()
    return result.data

@app.get("/memory", dependencies=[AUTH])
async def memory_list(
    user_id: str,
    category: Optional[str] = None,
    key_prefix: Optional[str] = None,
    limit: int = 100,
):
    q = sb().table("global_memory").select("*").eq("user_id", user_id).order("updated_at", desc=True).limit(limit)
    if category:
        q = q.eq("category", category)
    if key_prefix:
        q = q.like("key", f"{key_prefix}%")
    result = q.execute()
    return result.data or []

@app.get("/memory/stats", dependencies=[AUTH])
async def memory_stats(user_id: str):
    result = sb().table("global_memory").select("category, updated_at").eq("user_id", user_id).execute()
    rows = result.data or []
    by_category: dict[str, int] = {}
    last_updated: Optional[str] = None
    for row in rows:
        cat = row.get("category") or "unknown"
        by_category[cat] = by_category.get(cat, 0) + 1
        updated = row.get("updated_at")
        if updated and (last_updated is None or updated > last_updated):
            last_updated = updated
    return {"total": len(rows), "by_category": by_category, "last_updated": last_updated}

# ══════════════════════════════════════════════════════════════════════════════
# WEBHOOKS — external data in, straight into memory
# ══════════════════════════════════════════════════════════════════════════════
# core_webhook_secrets is a flat name/value table (e.g. "ring_webhook_secret",
# "ring_webhook_user_id" already exist there for the planned Ring integration
# — verified live, there is no separate `source`/`secret`/`active` schema).
# {source}_webhook_secret authorizes the call; {source}_webhook_user_id (if
# present) picks whose memory the payload lands in. Generic ingestion, not
# per-source parsing: the payload becomes one structured global_memory +
# rag_memories entry. Real per-source handling is separate follow-up work.

@app.post("/webhooks/{source}")
async def webhook_ingest(source: str, body: WebhookIngest, request: Request):
    secret_header = request.headers.get("x-webhook-secret", "")
    rows = (
        sb().table("core_webhook_secrets")
        .select("name, value")
        .in_("name", [f"{source}_webhook_secret", f"{source}_webhook_user_id"])
        .execute()
    )
    kv = {r["name"]: r["value"] for r in (rows.data or [])}
    expected_secret = kv.get(f"{source}_webhook_secret")
    if not expected_secret or expected_secret != secret_header:
        raise HTTPException(401, "Unknown or unauthorized webhook source")
    user_id = kv.get(f"{source}_webhook_user_id") or body.user_id

    ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    payload_json = json.dumps(body.payload)[:4000]
    sb().table("global_memory").upsert(
        [{
            "user_id": user_id,
            "category": "system_event",
            "key": f"webhook:{source}:{ts}",
            "value": payload_json,
            "confidence": 1.0,
            "metadata": {"kind": "webhook", "source": source},
        }],
        on_conflict="user_id,key",
    ).execute()
    try:
        sb().table("rag_memories").insert({
            "app_source": "axe-core",
            "user_id": user_id,
            "category": "system",
            "content": f"[webhook:{source}] {payload_json[:1000]}",
            "importance": 5,
            "metadata": {"source": "webhook", "webhook_source": source},
        }).execute()
    except Exception as e:  # noqa: BLE001 — memory write must not fail the webhook ack
        log.warning(f"webhook rag_memories write failed: {e}")

    await audit("webhook_ingest", source, {"user_id": user_id}, request.client.host if request.client else "")
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════════════
# MEMORY RETENTION
# ══════════════════════════════════════════════════════════════════════════════
# Now that every app event is recorded, global_memory grows without bound, and
# an unbounded memory degrades the thing it exists for: recall gets slower and
# noisier as year-old tool calls compete with this morning's context.
#
# The policy turns on one distinction — whether an entry is something AXE
# LEARNS FROM or merely something that HAPPENED. Preferences, corrections and
# the trading journal shape future behaviour, so they never expire however old
# they get. Tool calls, sessions and agent runs are evidence of activity; they
# are useful while recent and are noise once stale.
#
# Two safety rails, because deletion is not reversible:
#   - dry_run defaults to True, so the destructive call has to be deliberate
#   - a floor per kind keeps the newest N rows regardless of age, so a quiet
#     month can never empty a category and leave recall blind

# kind -> days to keep. Kinds absent from this map are kept forever.
MEMORY_RETENTION_DAYS: dict = {
    "session": 14,      # one row per day at most; pure activity trace
    "tool_call": 30,    # which tools work is learned via reflections, not raw calls
    "agent_run": 45,
    "resource": 90,
    "error": 90,        # genuinely instructive, but a stale error misleads
    "conversation": 180,
}

# Never expires, regardless of age:
#   preference   standing instructions about how to work
#   reflection   what Luka corrected — the highest-signal rows in the table
#   insight      inferred conclusions
#   anything keyed `ta:`  the trading journal (lessons, mistakes, theses,
#                         wins/losses) whose whole value is the long record

MEMORY_KEEP_MIN_PER_KIND = 50


@app.post("/memory/prune", dependencies=[AUTH])
async def memory_prune(user_id: str, dry_run: bool = True, request: Request = None):
    """Age out activity-trace memories. Defaults to a dry run."""
    report: dict = {"dry_run": dry_run, "policy": MEMORY_RETENTION_DAYS, "deleted": {}, "kept_by_floor": {}}
    total = 0

    for kind, days in MEMORY_RETENTION_DAYS.items():
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        # The journal is exempt even when a row's kind would otherwise age out.
        rows = (
            sb().table("global_memory")
            .select("id,key,created_at")
            .eq("user_id", user_id)
            .eq("metadata->>kind", kind)
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )
        rows = [r for r in rows if not str(r.get("key", "")).startswith("ta:")]

        # Newest-first, so everything before the floor is retained on recency
        # alone and only what is both old AND beyond the floor is removed.
        floor = rows[:MEMORY_KEEP_MIN_PER_KIND]
        candidates = rows[MEMORY_KEEP_MIN_PER_KIND:]
        stale = [r for r in candidates if (r.get("created_at") or "") < cutoff]

        report["kept_by_floor"][kind] = len(floor)
        report["deleted"][kind] = len(stale)
        total += len(stale)

        if stale and not dry_run:
            ids = [r["id"] for r in stale]
            for i in range(0, len(ids), 100):
                sb().table("global_memory").delete().in_("id", ids[i:i + 100]).execute()

    report["total"] = total
    if not dry_run and request is not None:
        await audit("memory_prune", "global_memory", report,
                    request.client.host if request.client else "")
    return report


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

class FileMove(BaseModel):
    from_path: str
    to_path: str

@app.post("/files/move", dependencies=[AUTH])
async def files_move(req: FileMove, request: Request):
    src = _safe_path(req.from_path)
    dst = _safe_path(req.to_path)
    if src == WORKSPACE_DIR or dst == WORKSPACE_DIR:
        raise HTTPException(400, "Refusing to move the workspace root")
    if not os.path.exists(src):
        raise HTTPException(404, "Source not found")
    if os.path.exists(dst):
        raise HTTPException(409, "Destination already exists")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    try:
        _shutil.move(src, dst)
    except Exception as e:
        raise HTTPException(500, f"Move failed: {e}")
    await audit("file_move", req.from_path, {"to": req.to_path}, request.client.host if request.client else "")
    return {"moved": True, "from": req.from_path, "to": req.to_path}

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


async def _openhands_wait_for_sandbox(task_id: str, url: str, budget_s: float = 90) -> dict:
    """Poll the app-conversation start-task until its sandbox is READY (or it
    fails). Returns the task dict. OpenHands' own POST /api/v1/app-conversations
    returns immediately with status=WORKING — the sandbox container that
    actually runs the agent takes several seconds to boot."""
    deadline = asyncio.get_event_loop().time() + budget_s
    async with httpx.AsyncClient(timeout=15) as client:
        while asyncio.get_event_loop().time() < deadline:
            try:
                r = await client.get(f"{url}/api/v1/app-conversations/start-tasks/search", params={"limit": 20})
            except httpx.HTTPError:
                await asyncio.sleep(2)
                continue
            if r.is_error:
                await asyncio.sleep(2)
                continue
            for item in (r.json() or {}).get("items", []):
                if item.get("id") == task_id:
                    status = item.get("status")
                    if status in ("READY", "ERROR", "FAILED"):
                        return item
                    break
            await asyncio.sleep(2)
    raise HTTPException(504, f"OpenHands sandbox didn't become ready within {budget_s}s")

async def _openhands_wait_for_reply(
    sandbox_url: str, sandbox_id: str, conversation_id: str, budget_s: float = 90,
) -> str | None:
    """The agent keeps working after the sandbox is READY — poll its own
    agent_final_response endpoint (on the per-conversation sandbox, a
    different host:port than the main OpenHands app) until it has one.
    Needs the sandbox's session key, which isn't in any API response —
    only in the container's own env — so this reads it via `docker inspect`
    rather than `docker exec` (no code execution, just metadata)."""
    proc = await asyncio.create_subprocess_exec(
        "docker", "inspect", sandbox_id, "--format", "{{range .Config.Env}}{{println .}}{{end}}",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    out, _ = await proc.communicate()
    session_key = next(
        (line.split("=", 1)[1] for line in out.decode().splitlines() if line.startswith("OH_SESSION_API_KEYS_0=")),
        None,
    )
    if not session_key:
        raise HTTPException(502, "Could not read OpenHands sandbox session key")

    base = sandbox_url.replace("host.docker.internal", "127.0.0.1")
    headers = {"X-Session-API-Key": session_key}
    deadline = asyncio.get_event_loop().time() + budget_s
    async with httpx.AsyncClient(timeout=15) as client:
        while asyncio.get_event_loop().time() < deadline:
            try:
                r = await client.get(f"{base}/api/conversations/{conversation_id}/agent_final_response", headers=headers)
            except httpx.HTTPError:
                # The sandbox can be genuinely slow to answer this (or briefly
                # unreachable right as it boots) — that's a "not ready yet",
                # not a hard failure; keep polling within the overall budget.
                await asyncio.sleep(3)
                continue
            if r.is_error:
                await asyncio.sleep(3)
                continue
            data = r.json()
            raw = data.get("response")
            if raw:
                # The agent's last action is usually a `finish` tool call —
                # {"name": "finish", "parameters": {"message": "..."}} — the
                # actual reply text is nested in .parameters.message, not
                # the top-level string.
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict):
                        if parsed.get("name") == "finish":
                            return parsed.get("parameters", {}).get("message", raw)
                        return parsed.get("response", raw)
                    return raw
                except (json.JSONDecodeError, TypeError):
                    return raw
            await asyncio.sleep(3)
    return None

async def _openhands_find_task(task_id: str, url: str) -> dict | None:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{url}/api/v1/app-conversations/start-tasks/search",
            params={"limit": 100},
        )
    if r.is_error:
        raise HTTPException(r.status_code, f"OpenHands status error: {r.text[:300]}")
    return next((item for item in (r.json() or {}).get("items", []) if item.get("id") == task_id), None)

@app.post("/internal/openhands/execute", dependencies=[AUTH])
async def exec_openhands(request: Request, body: dict = Body(default={})):
    # Serialized — see _OPENHANDS_SEMAPHORE's comment. A second caller waits
    # here instead of spawning a competing sandbox the VPS can't handle.
    if _OPENHANDS_SEMAPHORE.locked():
        logging.info("[openhands] a request is already running — this one is queued, not concurrent")
    async with _OPENHANDS_SEMAPHORE:
        openhands_base = AGENT_SERVICES["openhands"][0].rsplit("/api/v1/app-conversations", 1)[0]
        existing_task_id = body.pop("openhands_task_id", None)
        if existing_task_id:
            ready = await _openhands_find_task(existing_task_id, openhands_base)
            if not ready:
                raise HTTPException(404, "Persisted OpenHands task was not found")
            if ready.get("status") not in ("READY", "ERROR", "FAILED"):
                ready = await _openhands_wait_for_sandbox(existing_task_id, openhands_base)
            if ready.get("status") != "READY":
                raise HTTPException(502, f"OpenHands sandbox failed: {ready.get('detail') or ready.get('status')}")
            text = await _openhands_wait_for_reply(
                ready["agent_server_url"], ready["sandbox_id"], ready["app_conversation_id"],
            )
            return {
                "status": "ok" if text else "running",
                "result": text,
                "openhands_task_id": existing_task_id,
                "conversation_id": ready["app_conversation_id"],
            }

        # OpenHands' own /api/v1/app-conversations schema takes initial_message as
        # a {role, content: [...]} block, not the {task, context} shape every
        # other AXE tool call sends. Translate here (only for this tool — the
        # others stay a true passthrough) so the task text actually reaches the
        # agent instead of silently starting an empty conversation.
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
        created = await _agent_passthrough("openhands", body, request)
        task_id = created.get("id")
        if not task_id:
            return created  # not our translated shape (e.g. caller already passed conversation_id directly) — passthrough as-is

        # POST only ever returns the task's initial WORKING state (see docstring
        # above) — this is the piece that was missing: without polling for the
        # real reply, every call "succeeded" with an empty body, which is what
        # showed up in Settings as "openhands agent returned no content".
        # OPENHANDS_URL is the full create-conversation endpoint
        # (.../api/v1/app-conversations) — strip that suffix for the base URL
        # the status-polling and openapi paths hang off of.
        ready = await _openhands_wait_for_sandbox(task_id, openhands_base)
        if ready.get("status") != "READY":
            raise HTTPException(502, f"OpenHands sandbox failed: {ready.get('detail') or ready.get('status')}")
        text = await _openhands_wait_for_reply(
            ready["agent_server_url"], ready["sandbox_id"], ready["app_conversation_id"],
        )
        return {
            "status": "ok" if text else "running",
            "result": text,
            "openhands_task_id": task_id,
            "conversation_id": ready["app_conversation_id"],
        }

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

# Matches AXE_USER_ID for app_source 'axe-core' in chatPersistence.ts, so
# crew runs land in the same memory stream as chat instead of a separate one.
AXE_CORE_DEFAULT_USER_ID = "acff7a12-1111-481d-a7a9-cc07583b8069-axe-core"

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

    # Beyond the audit trail above: land the run in the same memory/RAG/Neural
    # layer chat and agents already use, tagged tab:crew — previously crew
    # runs only reached core_audit_log, invisible to Memory Hub and recall.
    try:
        ts = int(datetime.now(timezone.utc).timestamp() * 1000)
        specialists = result.get("specialists") or []
        result_text = str(result.get("result") or result.get("error") or "")[:2000]
        sb().table("global_memory").upsert(
            [{
                "user_id": AXE_CORE_DEFAULT_USER_ID,
                "category": "system_event",
                "key": f"crew:{ts}",
                "value": json.dumps({
                    "task": (req.task or "")[:500],
                    "specialists": specialists,
                    "status": result.get("status"),
                    "result": result_text,
                }),
                "confidence": 0.8,
                "metadata": {"kind": "agent_run", "tab": "crew", "specialists": specialists},
            }],
            on_conflict="user_id,key",
        ).execute()
        if result.get("status") == "ok" and result_text:
            sb().table("rag_memories").insert({
                "app_source": "axe-core",
                "user_id": AXE_CORE_DEFAULT_USER_ID,
                "category": "agent",
                "content": f"[crew:{','.join(specialists) or 'crew'}] {(req.task or '')[:200]} → {result_text[:400]}",
                "importance": 6,
                "metadata": {"source": "crew_run", "specialists": specialists, "tab": "crew"},
            }).execute()
    except Exception as e:  # noqa: BLE001 — a memory-write failure must not fail the crew response
        log.warning(f"crew_run memory write failed: {e}")

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
        # core_notifications columns are id/recipient/type/message/read/created_at
        # only — no title or source. This previously inserted both, which
        # Postgres rejected on every single call (silently swallowed by the
        # except below), so notify:true schedules have never actually written
        # a row since this was built. Fold the schedule name into the message
        # instead of a separate title column.
        sb().table("core_notifications").insert({
            "type": "success" if result["status"] == "ok" else "error",
            "message": f"{schedule_name}: {result['output'][:1900]}",
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

    # Whole body guarded: this used to have no try/except at all. The
    # postgrest_client_timeout fix on sb() bounds any single call to 15s, but
    # a tick can make many calls (one select + up to 2 per due schedule), so a
    # sustained Supabase-side outage could still chain several bounded
    # timeouts into one very slow tick. The crontab fires every 60s
    # regardless of whether the previous tick finished; a run that reliably
    # takes longer than that has the same worker-exhaustion effect as the
    # unbounded version did, just slower to arrive. Failing the whole tick
    # fast and loud on the first error is safer than limping through the
    # remaining schedules on a backend that has already shown it is down.
    try:
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
            # cron_manager was registered as an agent with no write site of its
            # own: this tick already ran real, unattended actions every minute,
            # but nothing tagged that activity, so its hub stayed empty
            # regardless of how much real work it did. Recorded per fired
            # schedule, at the real outcome, not the UI edit that created it.
            # Wrapped separately so a memory-write hiccup can never cost the
            # schedule's own update/notify, which already completed above.
            try:
                sb().table("global_memory").upsert({
                    "user_id": AXE_CORE_DEFAULT_USER_ID,
                    "category": "system_event",
                    "key": f"agent_run:cron:{s['id']}:{int(now.timestamp())}",
                    "value": json.dumps({
                        "summary": f"Cron fired: {s['name']} ({s['action_type']}) -> {result['status']}",
                        "schedule_id": s["id"], "name": s["name"], "action_type": s["action_type"],
                        "status": result["status"], "at": now.isoformat(),
                    }),
                    "confidence": 1,
                    "metadata": {"kind": "agent_run", "agentId": "cron_manager",
                                 "summary": f"Cron fired: {s['name']} -> {result['status']}"},
                }, on_conflict="user_id,key").execute()
            except Exception as mem_err:
                print(f"[cron_tick] memory write failed for {s['id']}: {mem_err}", flush=True)
        await audit("cron_tick", "cron", {"ran": len(ran), "details": ran})
        await run_always_awake_jobs()
        return {"ran": len(ran), "at": now.isoformat(), "details": ran}
    except Exception as e:
        # Logged and returned as a normal (non-500) response on purpose: the
        # only caller is a crontab curl piped to /dev/null, so a 500 here
        # would be invisible anyway. What matters is that this request
        # completes — quickly, one way or the other — rather than joining a
        # pile of stuck workers.
        print(f"[cron_tick] failed: {e}", flush=True)
        return {"ran": 0, "at": now.isoformat(), "error": str(e)[:500]}
