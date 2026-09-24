"""HTTP-uitvoer van axe. Alleen stdlib. Sleutel alleen in de header."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from .laag import UsageError, decide_guard, dumps, envelope, help_text, parse_argv

DEFAULTS = {
    "api_url": "https://api.axecompanion.com",
    "user_id": "acff7a12-1111-481d-a7a9-cc07583b8069",
    "actor": "os3",
    "memory_backend": "rag",
    "node_mac": "mac-mini",
    "node_vps": "vps",
    "timeout": 30.0,
}

TERMINAL = {"completed", "done", "failed", "cancelled", "rejected"}


class HttpError(Exception):
    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


def _read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def load_config(explicit: str | None = None) -> dict[str, Any]:
    file: dict[str, Any] = {}
    used = None
    candidates = []
    if explicit:
        candidates.append(Path(explicit))
    if os.environ.get("AXE_CONFIG"):
        candidates.append(Path(os.environ["AXE_CONFIG"]))
    candidates += [
        Path.home() / ".config" / "axe" / "config.json",
        Path.home() / ".axe.json",
        Path.cwd() / ".axe.json",
    ]
    for p in candidates:
        if p.is_file():
            file = _read_json(p)
            used = str(p)
            break

    def pick(env: str, key: str, default: Any) -> Any:
        if os.environ.get(env):
            return os.environ[env]
        if file.get(key):
            return file[key]
        return default

    return {
        "api_url": str(pick("AXE_API_URL", "apiUrl", DEFAULTS["api_url"])).rstrip("/"),
        "api_key": str(pick("AXE_API_KEY", "apiKey", "")),
        "user_id": str(pick("AXE_USER_ID", "userId", DEFAULTS["user_id"])),
        "actor": str(pick("AXE_ACTOR", "actor", DEFAULTS["actor"])),
        "memory_backend": "axon" if pick("AXE_MEMORY_BACKEND", "memoryBackend", "rag") == "axon" else "rag",
        "node_mac": str(pick("AXE_NODE_MAC", "nodeMac", DEFAULTS["node_mac"])),
        "node_vps": str(pick("AXE_NODE_VPS", "nodeVps", DEFAULTS["node_vps"])),
        "timeout": float(pick("AXE_TIMEOUT", "timeoutSec", DEFAULTS["timeout"])),
        "config_path": used,
    }


def public_config(cfg: dict[str, Any]) -> dict[str, Any]:
    out = dict(cfg)
    out["api_key"] = "[REDACTED]" if cfg.get("api_key") else ""
    return out


class Client:
    def __init__(self, cfg: dict[str, Any]):
        self.cfg = cfg

    def call(self, method: str, path: str, body: Any = None, query: dict[str, str] | None = None) -> Any:
        url = self.cfg["api_url"] + "/" + path.lstrip("/")
        if query:
            url += "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
        data = None if body is None else json.dumps(body).encode()
        headers = {"Accept": "application/json"}
        if self.cfg.get("api_key"):
            headers["Authorization"] = f"Bearer {self.cfg['api_key']}"
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.cfg["timeout"]) as resp:
                raw = resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            detail = raw[:300]
            try:
                parsed = json.loads(raw)
                detail = str(parsed.get("detail", raw[:300]))
            except json.JSONDecodeError:
                pass
            raise HttpError(detail, exc.code) from exc
        except urllib.error.URLError as exc:
            raise HttpError(f"unreachable: {exc.reason}", 0) from exc
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"raw": raw[:400]}

    def get(self, path: str, query: dict[str, str] | None = None) -> Any:
        return self.call("GET", path, query=query)

    def post(self, path: str, body: Any | None = None) -> Any:
        return self.call("POST", path, body if body is not None else {})

    def patch(self, path: str, body: Any | None = None) -> Any:
        return self.call("PATCH", path, body if body is not None else {})


def _settled(fn):
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 — status mag een dode dienst tonen
        return {"error": str(exc)[:200]}


def _capability(agent: str) -> str:
    return {"developer": "code", "trading": "trading", "intel": "research", "browser": "research"}.get(agent, "agentic")


def _audit(client: Client, cfg: dict[str, Any], parsed: dict[str, Any], status: str) -> None:
    body = {
        "actor": parsed.get("actor") or cfg["actor"],
        "command": parsed["path"],
        "args": parsed["raw"],
        "status": status,
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        client.post("/cli/audit", body)
    except Exception:
        try:
            client.post("/memory/upsert", [{
                "user_id": cfg["user_id"], "key": f"cli/audit/{body['at']}",
                "value": json.dumps(body), "category": "cli_audit", "confidence": 1,
            }])
        except Exception:
            pass


def _approval(client: Client, cfg: dict[str, Any], parsed: dict[str, Any], title: str, detail: str) -> dict[str, Any]:
    try:
        created = client.post("/tasks", {
            "title": title, "goal": detail,
            "requested_by": parsed.get("actor") or cfg["actor"],
            "source_app": "os3", "capability": "approval", "execution_mode": "read",
            "payload": {"command": parsed["path"], "raw": parsed["raw"]},
        })
        task_id = (created.get("task") or {}).get("id")
        approval = client.post(f"/tasks/{task_id}/approvals", {
            "kind": "os3", "title": title, "detail": detail,
            "requested_by": parsed.get("actor") or cfg["actor"],
        }) if task_id else {}
        row = approval.get("approval") or {}
        return envelope(parsed["path"], "pending_approval", result={"task_id": task_id},
                        error="pending approval",
                        approval={"id": row.get("id") or task_id, "status": row.get("status", "pending"), "title": title})
    except Exception as exc:
        return envelope(parsed["path"], "pending_approval", error=f"pending approval ({exc})")


def execute(parsed: dict[str, Any], client: Client, cfg: dict[str, Any]) -> dict[str, Any]:
    path = parsed["path"]
    if parsed.get("help") and path != "help":
        path = "help"
    if path == "help":
        return envelope("help", "ok", {"help": help_text()})

    guard = decide_guard(path, parsed["raw"], parsed["write"])
    if guard["kind"] == "blocked":
        env = envelope(path, "blocked", error=guard["reason"])
        _audit(client, cfg, parsed, "blocked")
        return env
    if guard["kind"] == "need_write":
        return envelope(path, "usage", error=guard["reason"])
    if guard["kind"] == "need_approval":
        env = _approval(client, cfg, parsed, f"OS3: {path}", guard["reason"])
        _audit(client, cfg, parsed, "pending_approval")
        return env

    try:
        env = _run(path, parsed, client, cfg)
        _audit(client, cfg, parsed, env["status"])
        return env
    except UsageError as exc:
        return envelope(path, "usage", error=str(exc))
    except HttpError as exc:
        status = "not_found" if exc.status == 404 else "blocked" if exc.status == 403 else "error"
        env = envelope(path, status, error=str(exc))
        _audit(client, cfg, parsed, status)
        return env
    except Exception as exc:
        env = envelope(path, "error", error=str(exc))
        _audit(client, cfg, parsed, "error")
        return env


def _flag(parsed: dict[str, Any], name: str) -> str | None:
    v = parsed["flags"].get(name)
    return v if isinstance(v, str) else None


def _run(path: str, parsed: dict[str, Any], client: Client, cfg: dict[str, Any]) -> dict[str, Any]:
    p = parsed["positionals"]
    actor = parsed.get("actor") or cfg["actor"]

    if path == "status":
        return envelope("status", "ok", {
            "core": _settled(lambda: client.get("/health")),
            "agents": _settled(lambda: client.get("/status/vps-agents")),
            "llm": _settled(lambda: client.get("/proxy/ai/providers")),
            "cron": _settled(lambda: client.get("/cron/schedules")),
            "northsea": _settled(lambda: client.get("/northsea/system-health")),
            "frameworks": _settled(lambda: client.get("/frameworks/status")),
            "memory_backend": cfg["memory_backend"],
            "nodes": {"mac": cfg["node_mac"], "vps": cfg["node_vps"]},
            "config": public_config(cfg),
        })

    if path == "tasks list":
        q = {"limit": _flag(parsed, "limit") or "50"}
        if _flag(parsed, "status"):
            q["status"] = _flag(parsed, "status")
        return envelope(path, "ok", client.get("/tasks", q))

    if path == "tasks create":
        title = _flag(parsed, "title") or (p[0] if p else "")
        goal = _flag(parsed, "goal") or " ".join(p[1:] if title in p[:1] else p)
        if not title.strip() or not goal.strip():
            raise UsageError("tasks create needs --title and --goal")
        return envelope(path, "ok", client.post("/tasks", {
            "title": title.strip(), "goal": goal.strip(),
            "priority": _flag(parsed, "priority") or "medium",
            "requested_by": actor, "source_app": "os3",
            "capability": _flag(parsed, "agent") or "agentic",
        }))

    if path == "tasks show":
        if not p:
            raise UsageError("tasks show needs an id")
        return envelope(path, "ok", client.get(f"/tasks/{p[0]}"))

    if path == "tasks update":
        if not p:
            raise UsageError("tasks update needs an id")
        body = {k: _flag(parsed, k) for k in ("title", "goal", "priority", "description") if _flag(parsed, k)}
        if not body:
            raise UsageError("tasks update needs a field to change")
        return envelope(path, "ok", client.patch(f"/tasks/{p[0]}", body))

    if path == "task wait":
        if not p:
            raise UsageError("task wait needs an id")
        timeout = (parsed.get("timeout_sec") or float(_flag(parsed, "timeout") or 90)) 
        start = time.time()
        last = None
        while time.time() - start < timeout:
            last = client.get(f"/tasks/{p[0]}")
            status = ((last or {}).get("task") or last or {}).get("status")
            if status in TERMINAL:
                return envelope(path, "ok", last)
            time.sleep(2)
        return envelope(path, "error", last, error="timeout waiting for task")

    if path == "agents list":
        return envelope(path, "ok", {
            "cli": _settled(lambda: client.get("/cli/agents")),
            "bridges": _settled(lambda: client.get("/internal/agents/status")),
            "live": _settled(lambda: client.get("/status/vps-agents")),
        })

    if path == "agent run":
        if len(p) < 2:
            raise UsageError("agent run needs <agent> and an instruction")
        agent, instruction = p[0], " ".join(p[1:])
        try:
            data = client.post(f"/cli/agents/{urllib.parse.quote(agent)}/run", {
                "instruction": instruction, "requested_by": actor,
            })
        except HttpError as exc:
            if exc.status != 404:
                raise
            data = client.post("/tasks", {
                "title": f"{agent}: {instruction[:80]}", "goal": instruction,
                "requested_by": actor, "source_app": "os3",
                "capability": _capability(agent),
                "metadata": {"agent": agent, "source": "os3"},
                "payload": {"request": instruction, "agent": agent},
            })
        task_id = (data.get("task") or {}).get("id") or data.get("task_id")
        return envelope(path, "ok", {**data, "task_id": task_id})

    if path == "memory search":
        q = _flag(parsed, "q") or _flag(parsed, "query") or " ".join(p)
        if not q:
            raise UsageError("memory search needs a query")
        try:
            data = client.get("/cli/memory/search", {
                "q": q, "limit": _flag(parsed, "limit") or "10", "user_id": cfg["user_id"],
            })
        except HttpError:
            rows = client.get("/memory", {"user_id": cfg["user_id"], "limit": "80"})
            needle = q.lower()
            hits = [r for r in (rows or []) if needle in f"{r.get('key','')} {r.get('value','')}".lower()][:10]
            data = {"hits": hits, "backend": cfg["memory_backend"]}
        return envelope(path, "ok", data)

    if path == "memory add":
        text = _flag(parsed, "text")
        if not text and _flag(parsed, "file"):
            text = Path(_flag(parsed, "file")).read_text()
        if not text:
            text = " ".join(p)
        if not (text or "").strip():
            raise UsageError("memory add needs --text or --file")
        try:
            data = client.post("/cli/memory/add", {
                "text": text, "key": _flag(parsed, "key"),
                "category": _flag(parsed, "category") or "cli", "user_id": cfg["user_id"],
            })
        except HttpError:
            key = _flag(parsed, "key") or f"cli/{int(time.time())}"
            client.post("/memory/upsert", [{
                "user_id": cfg["user_id"], "key": key, "value": text,
                "category": _flag(parsed, "category") or "cli", "confidence": 1,
            }])
            data = {"id": key, "key": key}
        return envelope(path, "ok", data)

    if path == "northsea status":
        return envelope(path, "ok", {
            "health": _settled(lambda: client.get("/northsea/system-health")),
            "overzicht": _settled(lambda: client.get("/northsea/overzicht")),
        })
    if path == "northsea deals":
        return envelope(path, "ok", client.get("/northsea/tab/deals"))
    if path == "northsea journal":
        return envelope(path, "ok", client.get("/northsea/tab/communicatie"))
    if path == "trading status":
        return envelope(path, "ok", client.get("/trading/overview"))
    if path == "cron list":
        app = _flag(parsed, "app") or "axe_core"
        return envelope(path, "ok", {
            "schedules": _settled(lambda: client.get("/cron/schedules")),
            "jobs": _settled(lambda: client.get("/cron/jobs", {"app_name": app})),
        })
    if path == "mcp list":
        return envelope(path, "ok", {
            "servers": _settled(lambda: client.get("/mcp/servers")),
            "hub": _settled(lambda: client.get("/mcp/hub")),
        })
    if path == "notify":
        msg = _flag(parsed, "message") or " ".join(p)
        if not msg:
            raise UsageError("notify needs a message")
        try:
            data = client.post("/cli/notify", {"message": msg, "actor": actor})
        except HttpError as exc:
            if exc.status != 404:
                raise
            client.post("/supabase/table/core_notifications", {"data": {"type": "info", "message": msg[:1900]}})
            data = {"posted": True, "via": "core_notifications"}
        return envelope(path, "ok", data)
    if path == "report":
        title = _flag(parsed, "title") or (p[0] if p else "")
        file = _flag(parsed, "file")
        if not title or not file:
            raise UsageError("report needs a title and --file")
        text = Path(file).read_text()
        try:
            data = client.post("/cli/report", {"title": title, "text": text, "actor": actor})
        except HttpError as exc:
            if exc.status != 404:
                raise
            key = f"report/{int(time.time())}"
            client.post("/memory/upsert", [{
                "user_id": cfg["user_id"], "key": key,
                "value": f"# {title}\n\n{text}", "category": "report", "confidence": 1,
            }])
            data = {"id": key, "key": key, "title": title}
        return envelope(path, "ok", data)
    if path == "approvals list":
        return envelope(path, "ok", client.get("/approvals", {
            "status": _flag(parsed, "status") or "pending",
            "limit": _flag(parsed, "limit") or "20",
        }))
    raise UsageError(f"unknown command '{path}'")


def main(argv: list[str]) -> int:
    try:
        parsed = parse_argv(argv)
    except UsageError as exc:
        text = dumps(envelope("help", "usage", error=str(exc)))
        print(text, end="")
        return EXIT_USAGE
    cfg = load_config(parsed.get("config_path"))
    if parsed.get("timeout_sec"):
        cfg["timeout"] = parsed["timeout_sec"]
    if parsed.get("actor"):
        cfg["actor"] = parsed["actor"]
    if parsed["path"] not in ("help", "status") and not cfg["api_key"]:
        env = envelope(parsed["path"], "config", error="AXE_API_KEY missing (env or config file). See os3/SETUP.md")
        print(dumps(env), end="")
        return env["exit"]
    env = execute(parsed, Client(cfg), cfg)
    print(dumps(env), end="")
    return int(env["exit"])


EXIT_USAGE = 2
