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


ANTWOORDEN = PAD.parent / "claude-antwoorden"
WACHT_MAX_S = 25.0


def vraag_id(ev: dict) -> str:
    """Stabiel id voor één toestemmingsvraag (sessie + tool + invoer)."""
    import hashlib
    sleutel = json.dumps([ev.get("session_id"), ev.get("tool_name"), ev.get("tool_input")], sort_keys=True, default=str)
    return hashlib.sha1(sleutel.encode()).hexdigest()[:16]


def zet_vraag(staat: dict, ev: dict, nu: float, vid: str) -> dict:
    """Een toestemmingsvraag in de stand: de notch toont hem met de HELE opdracht."""
    sessies = staat.setdefault("sessies", {})
    sid = str(ev.get("session_id") or "onbekend")
    s = sessies.setdefault(sid, {"id": sid, "begon": nu, "stappen": [], "klaar": False})
    invoer = ev.get("tool_input") or {}
    opdracht = invoer.get("command") or invoer.get("file_path") or invoer.get("url") or json.dumps(invoer, ensure_ascii=False)[:2000]
    s.update(wacht=True, bijgewerkt=nu, melding=f"Mag ik: {beschrijf(str(ev.get('tool_name') or ''), invoer)}?",
             vraag_toestemming={"id": vid, "tool": ev.get("tool_name"), "opdracht": str(opdracht)[:4000],
                                "altijd_kan": bool(ev.get("permission_suggestions")), "t": nu})
    return staat


def antwoord_als_uitvoer(antwoord: dict, ev: dict) -> dict | None:
    """Het antwoord uit de notch in de vorm die Claude Code verwacht."""
    besluit = antwoord.get("besluit")
    if besluit == "toestaan":
        return {"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "allow"}}}
    if besluit == "altijd":
        d = {"behavior": "allow"}
        if ev.get("permission_suggestions"):
            d["updatedPermissions"] = ev["permission_suggestions"]
        return {"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": d}}
    if besluit == "weigeren":
        return {"hookSpecificOutput": {"hookEventName": "PermissionRequest",
                                       "decision": {"behavior": "deny", "message": "Luka weigerde dit in de AXE-notch."}}}
    return None


def _schrijf_stand(fn) -> None:
    PAD.parent.mkdir(parents=True, exist_ok=True)
    with open(PAD.with_suffix(".lock"), "w") as slot:
        fcntl.flock(slot, fcntl.LOCK_EX)
        try:
            staat = json.loads(PAD.read_text()) if PAD.exists() else {}
        except (OSError, ValueError):
            staat = {}
        staat = fn(staat if isinstance(staat, dict) else {})
        tmp = PAD.with_suffix(".tmp")
        tmp.write_text(json.dumps(staat, ensure_ascii=False))
        os.replace(tmp, PAD)


def axe_draait() -> bool:
    """Draait de AXE-app (en dus de notch)? Zo niet, dan niet wachten."""
    if os.environ.get("AXE_NOTCH_ALTIJD") == "1":
        return True
    import subprocess
    try:
        return subprocess.run(["/usr/bin/pgrep", "-f", "AXE CORE.app/Contents/MacOS/"], capture_output=True,
                              timeout=2).returncode == 0
    except Exception:  # noqa: BLE001
        return False


def wacht_op_notch(ev: dict) -> None:
    """PermissionRequest: vraag in de notch, wacht hooguit 25 s op Luka's knop.
    Geen antwoord (of de notch draait niet): niets uitprinten -- dan vraagt
    Claude Code het gewoon zelf, zoals altijd."""
    if not axe_draait():
        return  # geen notch om op te wachten: Claude vraagt het meteen zelf
    vid = vraag_id(ev)
    _schrijf_stand(lambda st: zet_vraag(st, ev, time.time(), vid))
    bestand = ANTWOORDEN / f"{vid}.json"
    eind = time.time() + WACHT_MAX_S
    uit = None
    while time.time() < eind:
        if bestand.exists():
            try:
                uit = antwoord_als_uitvoer(json.loads(bestand.read_text()), ev)
            except (OSError, ValueError):
                uit = None
            try:
                bestand.unlink()
            except OSError:
                pass
            break
        time.sleep(0.25)

    def ruim_op(st: dict) -> dict:
        s = (st.get("sessies") or {}).get(str(ev.get("session_id") or "onbekend"))
        if s:
            s.pop("vraag_toestemming", None)
            s["wacht"] = False
        return st
    _schrijf_stand(ruim_op)
    if uit:
        sys.stdout.write(json.dumps(uit))


def main() -> None:
    try:
        ev = json.loads(sys.stdin.read() or "{}")
        if not isinstance(ev, dict):
            return
        if ev.get("hook_event_name") == "PermissionRequest":
            wacht_op_notch(ev)
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
