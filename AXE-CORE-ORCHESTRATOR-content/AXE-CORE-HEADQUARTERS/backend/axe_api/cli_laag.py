"""
cli_laag.py — serverkant van de axe-commandolaag.

AXE's eigen node-agent (en optioneel OS3) praat met AXE via `axe`.
Deze routes zijn de gegovernede kant: hetzelfde hek als in de CLI,
plus schrijven naar de bestaande tabellen (taken, geheugen, chat,
approvals, audit). Pairing-tokens worden gehasht bewaard.

Geen tweede waarheid. Geen mail. Geen auto-send. Geen delete.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from uuid import uuid4

AXE_USER_UUID = "acff7a12-1111-481d-a7a9-cc07583b8069"
AXE_USER_MEMORY = f"{AXE_USER_UUID}-axe-core"
OS3_CONVERSATION = "axe-os3"

BLOCKED_FLAGS = (
    "auto_send_qualification", "auto_reply_nonbinding", "auto_send_followups",
)
EMAIL_RE = re.compile(
    r"\b(send[-_ ]?email|email[-_ ]?send|verstuur|resend|outbound[-_ ]?message|smtp|mailgun|sendgrid)\b",
    re.I,
)
DELETE_RE = re.compile(r"\b(delete|wissen|verwijder|drop table|truncate|rm -rf)\b", re.I)
MERGE_RE = re.compile(
    r"\b(merge\s+to\s+orchestrator|merge\s+orchestrator|push\s+.*orchestrator|git\s+push\s+.*orchestrator|HEAD:orchestrator)\b",
    re.I,
)
FLAG_RE = re.compile(r"\b(" + "|".join(BLOCKED_FLAGS) + r")\b", re.I)
SECRET_KEY = re.compile(
    r"(token|secret|password|passwd|api[_-]?key|apikey|credential|private[_-]?key|authorization|^key$|bearer|cookie|srk)",
    re.I,
)

ROSTER = [
    {"id": "axe", "name": "AXE Core", "tier": "axe"},
    {"id": "wingman", "name": "Wingman", "tier": "tier1"},
    {"id": "northsea", "name": "NorthSea Desk Manager", "tier": "tier1"},
    {"id": "trading", "name": "Trading Agent", "tier": "tier1"},
    {"id": "developer", "name": "AXE Developer", "tier": "tier1"},
    {"id": "thinktank", "name": "ThinkTank", "tier": "tier1"},
    {"id": "browser", "name": "Browser", "tier": "tier2"},
    {"id": "memory", "name": "Memory", "tier": "tier2"},
    {"id": "task", "name": "Task", "tier": "tier2"},
    {"id": "cron", "name": "Cron", "tier": "tier2"},
    {"id": "finance", "name": "Finance", "tier": "tier2"},
    {"id": "apps", "name": "Apps", "tier": "tier2"},
    {"id": "intel", "name": "AXE Intel", "tier": "tier3"},
    {"id": "companion", "name": "AXE Companion", "tier": "tier3"},
]

CAPABILITY = {
    "developer": "code", "trading": "trading",
    "intel": "research", "browser": "research",
}

NODE_PAIR_TTL_SEC = 15 * 60
NODE_STALE_SEC = 45
NODE_JOB_CAPABILITIES = ("node_agent", "computer_use", "claude_local")
NODE_PAIR_CATEGORY = "node_pair"


def slug_device(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-")
    return s or "node"


def hash_token(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def token_matches(token: str, hashed: str) -> bool:
    if not token or not hashed:
        return False
    return hmac.compare_digest(hash_token(token), hashed)


def new_node_token(device_id: str) -> str:
    return f"axe-node_{slug_device(device_id)}_{secrets.token_urlsafe(24)}"


def pair_expired(expires_at: str, now: datetime | None = None) -> bool:
    if not expires_at:
        return True
    stamp = now or datetime.now(timezone.utc)
    try:
        raw = expires_at.replace("Z", "+00:00")
        exp = datetime.fromisoformat(raw)
    except ValueError:
        return True
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return stamp >= exp


def heartbeat_online(heartbeat_at: str | None, now: datetime | None = None, stale: int = NODE_STALE_SEC) -> bool:
    if not heartbeat_at:
        return False
    stamp = now or datetime.now(timezone.utc)
    try:
        raw = heartbeat_at.replace("Z", "+00:00")
        beat = datetime.fromisoformat(raw)
    except ValueError:
        return False
    if beat.tzinfo is None:
        beat = beat.replace(tzinfo=timezone.utc)
    return (stamp - beat).total_seconds() < stale


def inspect_blocked(text: str) -> tuple[str, str] | None:
    t = " ".join((text or "").split())
    if not t:
        return None
    if FLAG_RE.search(t):
        return "northsea_flag", "NorthSea auto-send flags must stay false; no override"
    if MERGE_RE.search(t):
        return "merge", "merging to orchestrator is hard-blocked"
    if EMAIL_RE.search(t):
        return "email", "sending email or outbound messages is hard-blocked"
    if DELETE_RE.search(t):
        return "delete", "deleting data is hard-blocked"
    return None


def inspect_approval(text: str) -> str | None:
    t = (text or "").lower()
    if re.search(r"\b(git push|git commit|systemctl|docker|crontab|npm install|pip install)\b", t):
        return "touches the system"
    if re.search(r"\b(place order|open (a )?(long|short)|mt5|broker)\b", t):
        return "trading execution needs approval"
    if "northsea" in t and re.search(r"\b(write|update|action|toggle|enable)\b", t):
        return "NorthSea write needs approval"
    return None


def redact(value: Any) -> Any:
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if SECRET_KEY.search(str(k)) else redact(v)) for k, v in value.items()}
    return value


def weiger_of_door(text: str) -> None:
    blocked = inspect_blocked(text)
    if blocked:
        from fastapi import HTTPException
        raise HTTPException(403, blocked[1])


def capability_for(agent: str) -> str:
    return CAPABILITY.get(agent, "agentic")


def build_router(
    sb: Callable[[], Any],
    task_repo: Callable[[], Any],
    audit: Callable[..., Any],
) -> Any:
    from fastapi import APIRouter
    from pydantic import BaseModel, Field

    class AgentRunBody(BaseModel):
        instruction: str
        requested_by: str = "os3"

    class MemoryAddBody(BaseModel):
        text: str
        key: str | None = None
        category: str = "cli"
        user_id: str = AXE_USER_MEMORY

    class NotifyBody(BaseModel):
        message: str
        actor: str = "os3"

    class ReportBody(BaseModel):
        title: str
        text: str
        actor: str = "os3"

    class AuditBody(BaseModel):
        actor: str = "os3"
        command: str
        args: str = ""
        status: str = "ok"
        at: str | None = None
        extras: dict[str, Any] = Field(default_factory=dict)

    class NodeRegisterBody(BaseModel):
        name: str
        os: str = ""
        capabilities: list[str] = Field(default_factory=lambda: ["shell", "files", "claude_code"])
        actor: str = "axe"

    class NodeHeartbeatBody(BaseModel):
        device_id: str
        token: str = ""
        name: str = ""
        os: str = ""
        capabilities: list[str] = Field(default_factory=list)

    router = APIRouter()

    def _pair_key(device_id: str) -> str:
        return f"cli/node-pair/{device_id}"

    def _lees_paar(device_id: str) -> dict[str, Any] | None:
        try:
            rows = (sb().table("global_memory").select("key,value")
                    .eq("user_id", AXE_USER_MEMORY).eq("key", _pair_key(device_id))
                    .limit(1).execute().data) or []
        except Exception:
            return None
        if not rows:
            return None
        value = rows[0].get("value")
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None
        return None

    def _schrijf_paar(device_id: str, record: dict[str, Any]) -> None:
        sb().table("global_memory").upsert({
            "user_id": AXE_USER_MEMORY,
            "key": _pair_key(device_id),
            "value": json.dumps(record),
            "category": NODE_PAIR_CATEGORY,
            "confidence": 1,
        }, on_conflict="user_id,key").execute()

    @router.get("/agents")
    async def cli_agents():
        return {"agents": ROSTER}

    @router.post("/agents/{name}/run")
    async def cli_agent_run(name: str, body: AgentRunBody):
        weiger_of_door(f"{name} {body.instruction}")
        need = inspect_approval(body.instruction)
        created, _ = task_repo().create({
            "title": f"{name}: {body.instruction[:80]}",
            "goal": body.instruction,
            "requested_by": body.requested_by,
            "source_app": "os3",
            "capability": capability_for(name),
            "payload": {"request": body.instruction, "agent": name},
            "metadata": {"agent": name, "source": "os3"},
        })
        if need:
            approval = task_repo().request_approval(created["id"], {
                "kind": "os3",
                "title": f"OS3 agent run: {name}",
                "detail": need,
                "requested_by": body.requested_by,
            })
            await audit("cli_agent_run_pending", created["id"], {"agent": name, "approval": approval["id"]})
            return {"status": "pending_approval", "task": created, "task_id": created["id"],
                    "approval": approval}
        await audit("cli_agent_run", created["id"], {"agent": name})
        return {"task": created, "task_id": created["id"]}

    @router.get("/memory/search")
    async def cli_memory_search(q: str, limit: int = 10, user_id: str = AXE_USER_MEMORY):
        weiger_of_door(q)
        lim = max(1, min(limit, 50))
        hits: list[dict[str, Any]] = []
        try:
            rag = (sb().table("rag_memories").select("id,content,category,importance,created_at")
                   .ilike("content", f"%{q}%").limit(lim).execute().data) or []
            hits.extend({
                "id": r.get("id"), "source": "rag", "content": r.get("content"),
                "category": r.get("category"), "score": r.get("importance"),
            } for r in rag)
        except Exception:
            rag = []
        if len(hits) < lim:
            glob = (sb().table("global_memory").select("key,value,category,updated_at")
                    .eq("user_id", user_id).ilike("value", f"%{q}%")
                    .limit(lim - len(hits)).execute().data) or []
            hits.extend({
                "id": r.get("key"), "source": "global", "content": r.get("value"),
                "category": r.get("category"), "key": r.get("key"),
            } for r in glob)
        return {"backend": "rag", "hits": hits}

    @router.post("/memory/add")
    async def cli_memory_add(body: MemoryAddBody):
        weiger_of_door(body.text)
        key = body.key or f"cli/{datetime.now(timezone.utc).isoformat()}"
        sb().table("global_memory").upsert({
            "user_id": body.user_id, "key": key, "value": body.text,
            "category": body.category, "confidence": 1,
        }, on_conflict="user_id,key").execute()
        try:
            sb().table("rag_memories").insert({
                "user_id": body.user_id, "content": body.text,
                "category": body.category, "importance": 5,
                "metadata": {"source": "os3", "key": key},
            }).execute()
        except Exception:
            pass
        await audit("cli_memory_add", key, {"category": body.category})
        return {"id": key, "key": key, "backend": "rag"}

    @router.post("/notify")
    async def cli_notify(body: NotifyBody):
        weiger_of_door(body.message)
        sb().table("core_notifications").insert({
            "type": "info", "message": body.message[:1900],
        }).execute()
        try:
            sb().table("axe_messages").insert({
                "conversation_id": OS3_CONVERSATION,
                "user_id": AXE_USER_UUID,
                "role": "axe",
                "content": body.message,
                "metadata": {"app_source": "axe-core", "source": "os3-cli", "actor": body.actor},
            }).execute()
        except Exception:
            pass
        await audit("cli_notify", "chat", {"actor": body.actor})
        return {"posted": True, "conversation_id": OS3_CONVERSATION}

    @router.post("/report")
    async def cli_report(body: ReportBody):
        weiger_of_door(f"{body.title}\n{body.text}")
        key = f"report/{datetime.now(timezone.utc).isoformat()}"
        text = f"# {body.title}\n\n{body.text}"
        sb().table("global_memory").upsert({
            "user_id": AXE_USER_MEMORY, "key": key, "value": text,
            "category": "report", "confidence": 1,
        }, on_conflict="user_id,key").execute()
        try:
            sb().table("rag_memories").insert({
                "user_id": AXE_USER_MEMORY, "content": text,
                "category": "report", "importance": 6,
                "metadata": {"source": "os3", "title": body.title},
            }).execute()
        except Exception:
            pass
        sb().table("core_notifications").insert({
            "type": "success", "message": f"Report: {body.title}"[:1900],
        }).execute()
        try:
            sb().table("axe_messages").insert({
                "conversation_id": OS3_CONVERSATION,
                "user_id": AXE_USER_UUID,
                "role": "axe",
                "content": f"Report stored: {body.title}",
                "metadata": {"app_source": "axe-core", "source": "os3-report", "actor": body.actor},
            }).execute()
        except Exception:
            pass
        await audit("cli_report", key, {"title": body.title})
        return {"id": key, "key": key, "title": body.title}

    @router.post("/audit")
    async def cli_audit(body: AuditBody):
        weiger_of_door(body.args)
        details = redact({"command": body.command, "args": body.args, "status": body.status, **body.extras})
        await audit("cli_command", body.command, details)
        try:
            sb().table("global_memory").upsert({
                "user_id": AXE_USER_MEMORY,
                "key": f"cli/audit/{body.at or datetime.now(timezone.utc).isoformat()}-{uuid4().hex[:8]}",
                "value": str(details),
                "category": "cli_audit",
                "confidence": 1,
            }, on_conflict="user_id,key").execute()
        except Exception:
            pass
        return {"logged": True}

    @router.get("/status")
    async def cli_status():
        """Dunne verzamelroute; de CLI kan dit of de bestaande paden gebruiken."""
        return {"ok": True, "service": "axe-cli", "roster": len(ROSTER)}

    @router.get("/nodes")
    async def cli_nodes():
        workers: list[dict[str, Any]] = []
        try:
            workers = (sb().table("core_computer_workers")
                       .select("device_id,worker_id,host,workspaces,heartbeat_at")
                       .execute().data) or []
        except Exception:
            workers = []
        by_id: dict[str, dict[str, Any]] = {}
        for w in workers:
            did = str(w.get("device_id") or "")
            if not did:
                continue
            beat = w.get("heartbeat_at")
            by_id[did] = {
                "device_id": did,
                "name": w.get("host") or did,
                "os": None,
                "online": heartbeat_online(beat),
                "last_seen": beat,
                "capabilities": w.get("workspaces") or [],
                "source": "core_computer_workers",
            }
        try:
            pairs = (sb().table("global_memory").select("key,value")
                     .eq("user_id", AXE_USER_MEMORY).eq("category", NODE_PAIR_CATEGORY)
                     .execute().data) or []
        except Exception:
            pairs = []
        for row in pairs:
            value = row.get("value")
            rec = value if isinstance(value, dict) else None
            if rec is None and isinstance(value, str):
                try:
                    parsed = json.loads(value)
                    rec = parsed if isinstance(parsed, dict) else None
                except json.JSONDecodeError:
                    rec = None
            if not rec:
                continue
            did = str(rec.get("device_id") or "")
            if not did:
                continue
            cur = by_id.get(did, {
                "device_id": did, "name": rec.get("name") or did, "os": None,
                "online": False, "last_seen": None, "capabilities": [], "source": "pairing",
            })
            cur["os"] = rec.get("os") or cur.get("os")
            cur["name"] = rec.get("name") or cur.get("name")
            if rec.get("capabilities"):
                cur["capabilities"] = rec.get("capabilities")
            cur["paired"] = bool(rec.get("paired"))
            by_id[did] = cur
        nodes = sorted(by_id.values(), key=lambda n: str(n.get("name") or ""))
        return {"nodes": nodes, "stale_sec": NODE_STALE_SEC}

    @router.post("/nodes/register")
    async def cli_node_register(body: NodeRegisterBody):
        weiger_of_door(body.name)
        device_id = slug_device(body.name)
        token = new_node_token(device_id)
        now = datetime.now(timezone.utc)
        expires = now + timedelta(seconds=NODE_PAIR_TTL_SEC)
        record = {
            "device_id": device_id,
            "name": body.name.strip(),
            "os": (body.os or "").strip(),
            "capabilities": body.capabilities or ["shell", "files", "claude_code"],
            "token_hash": hash_token(token),
            "expires_at": expires.isoformat().replace("+00:00", "Z"),
            "paired": False,
            "created_at": now.isoformat().replace("+00:00", "Z"),
        }
        _schrijf_paar(device_id, record)
        await audit("cli_node_register", device_id, {"name": record["name"], "os": record["os"]})
        return {
            "device_id": device_id,
            "name": record["name"],
            "pairing": token,
            "expires_at": record["expires_at"],
            "shown_once": True,
        }

    @router.post("/nodes/heartbeat")
    async def cli_node_heartbeat(body: NodeHeartbeatBody):
        weiger_of_door(body.device_id)
        device_id = slug_device(body.device_id)
        pair = _lees_paar(device_id)
        if not pair:
            from fastapi import HTTPException
            raise HTTPException(403, "unknown node; run axe node register first")
        if not token_matches(body.token, str(pair.get("token_hash") or "")):
            from fastapi import HTTPException
            raise HTTPException(403, "invalid node token")
        if not pair.get("paired") and pair_expired(str(pair.get("expires_at") or "")):
            from fastapi import HTTPException
            raise HTTPException(403, "pairing token expired; run axe node register again")
        pair["paired"] = True
        if body.os:
            pair["os"] = body.os
        if body.capabilities:
            pair["capabilities"] = body.capabilities
        if body.name:
            pair["name"] = body.name
        _schrijf_paar(device_id, pair)
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        row = {
            "device_id": device_id,
            "worker_id": f"axe-node-{device_id}",
            "host": body.name or (pair or {}).get("name") or device_id,
            "workspaces": body.capabilities or (pair or {}).get("capabilities") or [],
            "heartbeat_at": now,
        }
        try:
            sb().table("core_computer_workers").upsert(row, on_conflict="device_id").execute()
        except Exception:
            pass
        return {"device_id": device_id, "online": True, "heartbeat_at": now, "paired": bool(pair)}

    @router.get("/nodes/jobs")
    async def cli_node_jobs(device_id: str):
        weiger_of_door(device_id)
        did = slug_device(device_id)
        jobs: list[dict[str, Any]] = []
        try:
            rows = (sb().table("core_tasks")
                    .select("id,status,capability,target_device,title,goal,payload,created_at")
                    .eq("target_device", did).eq("status", "pending")
                    .in_("capability", list(NODE_JOB_CAPABILITIES))
                    .order("created_at").limit(20).execute().data) or []
            jobs = rows
        except Exception:
            jobs = []
        return {
            "device_id": did,
            "jobs": jobs,
            "executor": "phase2",
            "capabilities": list(NODE_JOB_CAPABILITIES),
        }

    return router
