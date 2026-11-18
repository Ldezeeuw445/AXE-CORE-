"""De Claude-hook voor de AXE-notch (18 nov): stand bijwerken, nooit blokkeren."""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

HIER = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("hook", HIER / "claude-notch-hook.py")
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)


def test_een_sessie_van_vraag_tot_klaar():
    s = hook.werk_bij({}, {"hook_event_name": "UserPromptSubmit", "session_id": "a", "cwd": "/x/AXE", "prompt": "fix de notch"}, 10)
    s = hook.werk_bij(s, {"hook_event_name": "PreToolUse", "session_id": "a", "tool_name": "Edit",
                          "tool_input": {"file_path": "/x/src/Notch.tsx"}}, 11)
    sess = s["sessies"]["a"]
    assert sess["vraag"] == "fix de notch" and sess["project"] == "AXE"
    assert sess["stappen"][-1] == {"tool": "Edit", "soort": "bewerken", "wat": "Edit Notch.tsx", "staat": "bezig", "t": 11}
    s = hook.werk_bij(s, {"hook_event_name": "PostToolUse", "session_id": "a", "tool_name": "Edit"}, 12)
    s = hook.werk_bij(s, {"hook_event_name": "Stop", "session_id": "a"}, 20)
    assert s["sessies"]["a"]["klaar"] and s["sessies"]["a"]["stappen"][-1]["staat"] == "klaar"
    s = hook.werk_bij(s, {"hook_event_name": "SessionEnd", "session_id": "a"}, 21)
    assert "a" not in s["sessies"]


def test_geplande_taak_en_bash_beschrijving():
    s = hook.werk_bij({}, {"hook_event_name": "UserPromptSubmit", "session_id": "b", "prompt": "<scheduled-task x>"}, 1)
    assert s["sessies"]["b"]["vraag"] == "Geplande taak"
    assert hook.beschrijf("Bash", {"command": "rm -rf /", "description": "Run the tests"}) == "Run the tests"


def test_kapotte_invoer_blokkeert_nooit(tmp_path):
    r = subprocess.run([sys.executable, str(HIER / "claude-notch-hook.py")], input="dit is geen json",
                       capture_output=True, text=True, env={"AXE_CLAUDE_LIVE": str(tmp_path / "live.json"), "HOME": str(tmp_path)})
    assert r.returncode == 0 and r.stdout == ""
    r = subprocess.run([sys.executable, str(HIER / "claude-notch-hook.py")],
                       input=json.dumps({"hook_event_name": "UserPromptSubmit", "session_id": "c", "prompt": "hoi"}),
                       capture_output=True, text=True, env={"AXE_CLAUDE_LIVE": str(tmp_path / "live.json"), "HOME": str(tmp_path)})
    assert r.returncode == 0 and json.loads((tmp_path / "live.json").read_text())["sessies"]["c"]["vraag"] == "hoi"


def test_koppelen_en_ontkoppelen_laat_de_rest_staan():
    spec2 = importlib.util.spec_from_file_location("koppel", HIER / "claude_notch_koppelen.py")
    k = importlib.util.module_from_spec(spec2)
    spec2.loader.exec_module(k)
    eigen = {"permissions": {"allow": ["Bash(ls)"]},
             "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "say klaar"}]}]}}
    gekoppeld = k.koppel(json.loads(json.dumps(eigen)))
    assert any(k.is_onze(h) for b in gekoppeld["hooks"]["PreToolUse"] for h in b["hooks"])
    assert gekoppeld["hooks"]["Stop"][0]["hooks"][0]["command"] == "say klaar"   # eigen hook blijft
    assert k.koppel(json.loads(json.dumps(gekoppeld))) == gekoppeld                # twee keer = één keer
    assert k.ontkoppel(gekoppeld) == eigen                                          # los = precies terug


def test_toestemming_uit_de_notch(tmp_path):
    ev = {"hook_event_name": "PermissionRequest", "session_id": "p", "tool_name": "Bash",
          "tool_input": {"command": "git push origin orchestrator", "description": "Push"},
          "permission_suggestions": [{"type": "addRules", "rules": [{"toolName": "Bash", "ruleContent": "git push:*"}]}]}
    st = hook.zet_vraag({}, ev, 5, "abc")
    v = st["sessies"]["p"]["vraag_toestemming"]
    assert v["opdracht"] == "git push origin orchestrator" and v["altijd_kan"] and st["sessies"]["p"]["wacht"]
    assert hook.antwoord_als_uitvoer({"besluit": "toestaan"}, ev)["hookSpecificOutput"]["decision"] == {"behavior": "allow"}
    altijd = hook.antwoord_als_uitvoer({"besluit": "altijd"}, ev)["hookSpecificOutput"]["decision"]
    assert altijd["updatedPermissions"] == ev["permission_suggestions"]
    assert hook.antwoord_als_uitvoer({"besluit": "weigeren"}, ev)["hookSpecificOutput"]["decision"]["behavior"] == "deny"
    assert hook.antwoord_als_uitvoer({"besluit": "??"}, ev) is None


def test_zonder_antwoord_vraagt_claude_zelf(tmp_path):
    ev = {"hook_event_name": "PermissionRequest", "session_id": "q", "tool_name": "Bash", "tool_input": {"command": "ls"}}
    code = ("import importlib.util,sys;sp=importlib.util.spec_from_file_location('h',sys.argv[1]);"
            "h=importlib.util.module_from_spec(sp);sp.loader.exec_module(h);h.WACHT_MAX_S=0.3;"
            "import io,json;sys.stdin=io.StringIO(sys.argv[2]);h.main()")
    r = subprocess.run([sys.executable, "-c", code, str(HIER / "claude-notch-hook.py"), json.dumps(ev)],
                       capture_output=True, text=True, env={"AXE_CLAUDE_LIVE": str(tmp_path / "live.json"), "HOME": str(tmp_path), "AXE_NOTCH_ALTIJD": "1"})
    assert r.returncode == 0 and r.stdout == ""
    assert "vraag_toestemming" not in json.loads((tmp_path / "live.json").read_text())["sessies"]["q"]
