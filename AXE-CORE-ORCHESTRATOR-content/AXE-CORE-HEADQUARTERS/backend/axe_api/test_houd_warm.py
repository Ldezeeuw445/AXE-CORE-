"""agent_runner.houd_warm: precies één stoel, alleen lezen, de CLI zelf ververst."""
import json
import stat

import agent_runner as ar


def nep_claude(tmp_path, uitvoer: dict, code: int = 0):
    log = tmp_path / "args.json"
    pad = tmp_path / "claude"
    pad.write_text("#!/usr/bin/env python3\nimport json, os, sys\n"
                   f"json.dump({{'argv': sys.argv[1:], 'cwd': os.getcwd(), 'dir': os.environ.get('CLAUDE_CONFIG_DIR'),"
                   f" 'key': os.environ.get('ANTHROPIC_API_KEY')}}, open({str(log)!r}, 'w'))\n"
                   f"print({json.dumps(json.dumps(uitvoer))})\nsys.exit({code})\n")
    pad.chmod(pad.stat().st_mode | stat.S_IEXEC)
    return str(pad), log


def test_check_in_draait_alleen_lezen_in_een_leeg_mapje(tmp_path, monkeypatch):
    binary, log = nep_claude(tmp_path, {"type": "result", "is_error": False, "result": "ok"})
    monkeypatch.setattr(ar, "_binary", lambda m: binary)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "mag-niet-mee")
    assert ar.houd_warm("claude2") == {"status": "ok"}
    gezien = json.loads(log.read_text())
    assert gezien["argv"][gezien["argv"].index("--permission-mode") + 1] == "plan"
    assert gezien["argv"][gezien["argv"].index("--model") + 1] == ar.WARM_MODEL
    assert "axe-warm-" in gezien["cwd"] and gezien["dir"].endswith(".claude-tweede")
    assert gezien["key"] is None


def test_een_authfout_in_de_json_is_geen_succes(tmp_path, monkeypatch):
    binary, _ = nep_claude(tmp_path, {"type": "result", "subtype": "success", "is_error": True,
                                      "result": "Invalid API key · Please run /login"})
    monkeypatch.setattr(ar, "_binary", lambda m: binary)
    uit = ar.houd_warm("claude3")
    assert uit["status"] == "error" and "login" in uit["error"]
    ar.vergeet_accounts()


def test_bezig_of_geen_claude_is_overslaan(monkeypatch):
    monkeypatch.setattr(ar, "_binary", lambda m: "/bin/true")
    assert ar.houd_warm("codex")["status"] == "skip"
    slot = ar._motor_slot("claude4")
    slot.acquire()
    try:
        assert ar.houd_warm("claude4") == {"status": "skip", "reden": "bezig"}
    finally:
        slot.release()
