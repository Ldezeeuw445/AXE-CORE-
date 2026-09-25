"""Device actions: the VPS agent's hands on Luka's Macs (BOUWLIJST 6.15).

Rabbit OS3's model: the cloud thinks, the devices act. The agent loop runs on
the VPS, so its shell is the VPS's shell. Anything that is about a Mac -- its
files, its apps, its screen -- has to go to the computer-worker on THAT Mac.

Transport is the one computerRelay.ts already uses: a `core_tasks` row with
capability `computer_use` and a `target_device`, claimed only by the worker on
that device. Nothing new listens on any port.

Tiers mirror src/domain/tools/riskTiers.ts (a test keeps the two in step).
The model never picks the tier; an unknown tool is refused.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Callable

CAPABILITY = "computer_use"
HEARTBEAT_STALE_S = 90
POLL_S = 1.5
TIMEOUT_S = 6 * 60

TOOL_TIERS: dict[str, str] = {
    "system.info": "observe",
    "files.list": "observe",
    "files.read": "observe",
    "files.search": "observe",
    "personal.files.list": "observe",
    "camera.snapshot": "observe",
    "computer.permissions": "observe",
    "screen.displays": "observe",
    "screen.observe": "observe",
    "pointer.position": "observe",
    "app.list": "observe",
    "app.frontmost": "observe",
    "window.list": "observe",
    "git.status": "observe",
    "git.branch": "observe",
    "git.diff": "observe",
    "git.log": "observe",
    "memory.recall": "observe",
    "vercel.status": "observe",
    "terminal.typecheck": "safe_execute",
    "terminal.lint": "safe_execute",
    "terminal.test": "safe_execute",
    "terminal.build": "safe_execute",
    "git.create_branch": "safe_execute",
    "computer.permissions.request_screen": "safe_execute",
    "computer.permissions.request_accessibility": "safe_execute",
    "pointer.move": "safe_execute",
    "app.open": "safe_execute",
    "app.focus": "safe_execute",
    "files.write": "write",
    "terminal.install": "write",
    "claude_code.run": "write",
    "cursor.run": "write",
    "codex.run": "write",
    "memory.write": "write",
    "pointer.click": "write",
    "pointer.double_click": "write",
    "pointer.right_click": "write",
    "pointer.drag": "write",
    "pointer.scroll": "write",
    "keyboard.type": "write",
    "keyboard.key": "write",
    "git.commit": "consequential",
    "git.push": "consequential",
    "git.pr_open": "consequential",
    "git.merge": "consequential",
    "terminal.free": "consequential",
    "vercel.promote": "consequential",
    "db.migrate": "consequential",
    "files.delete": "consequential",
}

WORKSPACES = ("AXE Core", "AXE Companion", "Trading OS")

LABELS = {
    "mac-mini-van-luka-5": "Mac mini (the brain: API, planner, Ollama)",
    "main-imac-luka": "iMac (the executor, Luka's big screen)",
}


ALIASES = {
    "mac mini": "mac-mini-van-luka-5", "macmini": "mac-mini-van-luka-5", "mini": "mac-mini-van-luka-5",
    "imac": "main-imac-luka",
}


def resolve_device(name: str) -> str:
    """'Mac mini' and 'iMac' are how Luka (and the model) say it."""
    n = " ".join(str(name).replace("-", " ").lower().split())
    return ALIASES.get(n, str(name))


def approval_key(device: str, tool: str, args: dict[str, Any]) -> str | None:
    """What Luka has to say yes to before this runs, or None if it may run.

    observe/safe_execute run unattended. A write-tier action is approved per
    device+tool for the whole task: one "yes, you may click on the iMac"
    instead of one card per click, which would make computer use unusable.
    Consequential actions are approved with their exact arguments, every time.
    """
    device = resolve_device(device)
    tier = TOOL_TIERS.get(tool)
    if tier in (None, "observe", "safe_execute"):
        return None
    if tier == "write":
        return f"device:{device} {tool}"
    return f"device:{device} {tool} {json.dumps(args, sort_keys=True)}"


def _client():
    from supabase import create_client

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE"])
    client.options.postgrest_client_timeout = 15
    return client


def list_devices(db=None, now: Callable[[], float] = time.time) -> list[dict[str, Any]]:
    db = db or _client()
    rows = db.table("core_computer_workers").select(
        "device_id,host,workspaces,heartbeat_at"
    ).execute().data or []
    out = []
    for r in rows:
        beat = r.get("heartbeat_at")
        try:
            age = now() - datetime.fromisoformat(str(beat).replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
        ws = r.get("workspaces") or []
        if isinstance(ws, str):
            ws = [w for w in ws.split(",") if w]
        out.append({
            "device": r["device_id"],
            "label": LABELS.get(r["device_id"], r.get("host") or r["device_id"]),
            "online": age < HEARTBEAT_STALE_S,
            "seconds_since_heartbeat": int(age),
            "workspaces": ws,
        })
    return sorted(out, key=lambda d: (not d["online"], d["device"]))


def run_on_device(
    device: str,
    tool: str,
    args: dict[str, Any] | None = None,
    workspace: str = "AXE Core",
    parent_task_id: str | None = None,
    read_only: bool = False,
    db=None,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """Queue one action for one Mac and wait for its answer."""
    args = args or {}
    device = resolve_device(device)
    tier = TOOL_TIERS.get(tool)
    if tier is None:
        return {"error": f"unknown device tool {tool!r}. Known: {', '.join(sorted(TOOL_TIERS))}"}
    if read_only and tier in ("write", "consequential"):
        return {"error": "This is a read-only task. Observe and report instead of changing the Mac."}
    if workspace not in WORKSPACES:
        return {"error": f"unknown workspace {workspace!r}. Use one of {', '.join(WORKSPACES)}."}

    db = db or _client()
    known = {d["device"]: d for d in list_devices(db)}
    if device not in known:
        return {"error": f"no such device {device!r}. Call list_devices."}
    if not known[device]["online"]:
        # Fail in a second rather than time out in six minutes: a long wait
        # tempts the model to answer from memory.
        return {"error": f"{known[device]['label']} is offline (last heartbeat "
                         f"{known[device]['seconds_since_heartbeat']}s ago)."}

    row = db.table("core_tasks").insert({
        "capability": CAPABILITY,
        "status": "pending",
        "source_app": "axe_core",
        "title": f"{tool} · {workspace} · {device}",
        "goal": tool,
        "execution_mode": "read" if tier == "observe" else "write",
        "target_device": device,
        "parent_task_id": parent_task_id,
        "payload": {
            "tool": tool, "tier": tier, "workspace": workspace, "args": args,
            # The VPS is a remote client: the native build-equality check is
            # only for the packaged app talking to its own local worker.
            "client_runtime": "remote",
        },
    }).execute().data[0]

    deadline = time.monotonic() + TIMEOUT_S
    while time.monotonic() < deadline:
        sleep(POLL_S)
        found = db.table("core_tasks").select("status,result,error").eq(
            "id", row["id"]).limit(1).execute().data
        if not found:
            continue
        r = found[0]
        if r["status"] in ("completed", "done"):
            return {"device": device, "tool": tool, "ok": True,
                    "output": (r.get("result") or {}).get("output")}
        if r["status"] in ("failed", "cancelled"):
            return {"device": device, "tool": tool, "ok": False,
                    "error": (r.get("error") or {}).get("message") or r["status"]}
    return {"device": device, "tool": tool, "ok": False,
            "error": f"no answer from {device} within {TIMEOUT_S}s"}
