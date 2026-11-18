#!/usr/bin/env python3
"""Claude Code -> AXE-notch: wat Claude nu doet, live (Luka, 18 nov 2026).

Claude Code roept dit script aan bij elke hook-gebeurtenis (UserPromptSubmit,
PreToolUse, PostToolUse, PostToolUseFailure, Stop, SessionEnd) met de
gebeurtenis als JSON op stdin. Het script werkt één bestand bij,
~/.axe/claude-live.json, dat de notch elke seconde leest.

Gouden regel (uit de Pulsar-opzet): dit script mag Claude NOOIT tegenhouden.
Elke fout wordt ingeslikt en het script eindigt altijd met exit 0, zonder iets
op stdout te zetten. Alleen standaardbibliotheek, niets verlaat de Mac.
"""
from __future__ import annotations

import fcntl
import json
import os
import sys
import time
from pathlib import Path

PAD = Path(os.environ.get("AXE_CLAUDE_LIVE", str(Path.home() / ".axe" / "claude-live.json")))
MAX_STAPPEN = 40
MAX_SESSIES = 6

SOORT = {
    "Read": "lezen", "Glob": "zoeken", "Grep": "zoeken", "Edit": "bewerken", "Write": "bewerken",
    "MultiEdit": "bewerken", "NotebookEdit": "bewerken", "Bash": "uitvoeren", "WebFetch": "web",
    "WebSearch": "web", "Task": "agent", "Agent": "agent", "TodoWrite": "plan", "ExitPlanMode": "plan",
}


def _kort(s: object, n: int = 90) -> str:
    t = " ".join(str(s or "").split())
    return t if len(t) <= n else t[: n - 1] + "…"


def beschrijf(tool: str, invoer: dict) -> str:
    """Eén korte regel voor wat een tool doet, zonder geheimen."""
    pad = invoer.get("file_path") or invoer.get("path") or invoer.get("notebook_path")
    if pad:
        return f"{tool} {Path(str(pad)).name}"
    if tool == "Bash":
        return _kort(invoer.get("description") or invoer.get("command"), 80)
    if tool in ("Grep", "Glob"):
        return f"{tool} {_kort(invoer.get('pattern'), 60)}"
    if tool in ("WebFetch", "WebSearch"):
        return f"{tool} {_kort(invoer.get('url') or invoer.get('query'), 60)}"
    if tool.startswith("mcp__"):
        return _kort(tool.split("__")[-1].replace("_", " "), 60)
    return tool


def werk_bij(staat: dict, ev: dict, nu: float) -> dict:
    """Pure functie: één gebeurtenis in de stand verwerken."""
    sessies = staat.setdefault("sessies", {})
    sid = str(ev.get("session_id") or "onbekend")
    s = sessies.setdefault(sid, {"id": sid, "begon": nu, "stappen": [], "klaar": False})
    s["project"] = Path(str(ev.get("cwd") or s.get("project") or "")).name or s.get("project", "")
    s["bijgewerkt"] = nu
    soort = ev.get("hook_event_name") or ""
    if soort == "UserPromptSubmit":
        prompt = str(ev.get("prompt") or "")
        if prompt.lstrip().startswith("<scheduled-task"):
            prompt = "Geplande taak"
        s.update(vraag=_kort(prompt, 200), begon=nu, stappen=[], klaar=False, wacht=False)
    elif soort == "PreToolUse":
        tool = str(ev.get("tool_name") or "")
        s["stappen"].append({"tool": tool, "soort": SOORT.get(tool, "mcp" if tool.startswith("mcp__") else "overig"),
                             "wat": beschrijf(tool, ev.get("tool_input") or {}), "staat": "bezig", "t": nu})
        s["wacht"] = False
    elif soort in ("PostToolUse", "PostToolUseFailure"):
        for st in reversed(s["stappen"]):
            if st.get("staat") == "bezig" and st.get("tool") == ev.get("tool_name"):
                st["staat"] = "mislukt" if soort == "PostToolUseFailure" else "klaar"
                break
    elif soort == "Notification":
        s["wacht"] = True
        s["melding"] = _kort(ev.get("message"), 160)
    elif soort == "Stop":
        s.update(klaar=True, wacht=False, eind=nu)
        for st in s["stappen"]:
            if st.get("staat") == "bezig":
                st["staat"] = "klaar"
    elif soort == "SessionEnd":
        sessies.pop(sid, None)
        return staat
    s["stappen"] = s["stappen"][-MAX_STAPPEN:]
    # Oudste sessies eruit; de notch volgt er hooguit een paar.
    if len(sessies) > MAX_SESSIES:
        for oud in sorted(sessies.values(), key=lambda x: x.get("bijgewerkt", 0))[: len(sessies) - MAX_SESSIES]:
            sessies.pop(oud["id"], None)
    staat["bijgewerkt"] = nu
    return staat


def main() -> None:
    try:
        ev = json.loads(sys.stdin.read() or "{}")
        if not isinstance(ev, dict):
            return
        PAD.parent.mkdir(parents=True, exist_ok=True)
        with open(PAD.with_suffix(".lock"), "w") as slot:
            fcntl.flock(slot, fcntl.LOCK_EX)  # parallelle hooks overschrijven elkaar anders
            try:
                staat = json.loads(PAD.read_text()) if PAD.exists() else {}
            except (OSError, ValueError):
                staat = {}
            staat = werk_bij(staat if isinstance(staat, dict) else {}, ev, time.time())
            tmp = PAD.with_suffix(".tmp")
            tmp.write_text(json.dumps(staat, ensure_ascii=False))
            os.replace(tmp, PAD)
    except Exception:  # noqa: BLE001 -- nooit Claude tegenhouden
        pass


if __name__ == "__main__":
    main()
    sys.exit(0)
