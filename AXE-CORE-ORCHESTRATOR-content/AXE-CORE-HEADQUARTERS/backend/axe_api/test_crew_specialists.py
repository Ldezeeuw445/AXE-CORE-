"""De Research Crew-specialisten komen aan bij run_crew_kickoff.

De app stuurt {"specialists": ["axe_core", "dollar_bill", "intel"]}, maar
CrewRunRequest had dat veld niet: Pydantic gooide het stil weg en de crew draaide
altijd alleen de master-orchestrator. Een serialisatietest had dat niet gevangen;
deze volgt de hele weg: HTTP-body -> CrewRunRequest -> run_crew -> payloadbestand
-> run_crew.py -> run_crew_kickoff(specialists). Alleen de subprocess-grens en de
CrewAI-import zijn vervangen, niet de code ertussen.
"""
import ast
import json
import pathlib
import sys
import types

import pytest

import crew_runner as cr

HIER = pathlib.Path(__file__).parent
MAIN = HIER / "main.py"
RESEARCH_BODY = {
    "task": "Research XAUUSD for the next session",
    "context": "real data here",
    "specialists": ["axe_core", "dollar_bill", "intel"],
}


@pytest.fixture
def kickoff(monkeypatch, tmp_path):
    """Voert run_crew.py echt uit, in-process, met een nep-CrewAI-pakket dat
    vastlegt met welke specialisten run_crew_kickoff werd aangeroepen."""
    gezien: dict = {}

    def nep_kickoff(specialists, user_request):
        gezien["specialists"] = list(specialists)
        gezien["request"] = user_request
        return "SIGNAL: long"

    pakket = types.ModuleType("axe_core___god_mode_ai_system")
    crew_mod = types.ModuleType("axe_core___god_mode_ai_system.crew")
    crew_mod.run_crew_kickoff = nep_kickoff
    monkeypatch.setitem(sys.modules, "axe_core___god_mode_ai_system", pakket)
    monkeypatch.setitem(sys.modules, "axe_core___god_mode_ai_system.crew", crew_mod)

    sys.path.insert(0, str(HIER))
    import run_crew as runner_mod

    def nep_subprocess_run(argv, **_kw):
        assert argv[1] == cr.RUNNER
        monkeypatch.setattr(sys, "argv", ["run_crew.py", argv[2], argv[3]])
        runner_mod.main()
        return types.SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(cr.subprocess, "run", nep_subprocess_run)
    monkeypatch.setattr(cr.os.path, "exists", lambda p: True if p == cr.CREW_VENV_PY else pathlib.Path(p).exists())
    monkeypatch.setenv("AXE_SLOT_DIR", str(tmp_path))
    monkeypatch.setattr("zuinig.SLOT_DIR", str(tmp_path))
    return gezien


def test_research_crew_drie_specialisten_bereiken_de_kickoff(kickoff):
    req = cr.CrewRunRequest.model_validate(RESEARCH_BODY)
    # Precies wat main.crew_run doet (de aanroep wordt hieronder in de bron bewaakt).
    res = cr.run_crew(req.task, req.context, req.conversation, req.specialists)

    assert res["status"] == "ok", res
    assert kickoff["specialists"] == ["axe_core", "dollar_bill", "intel"]
    assert res["specialists"] == ["axe_core", "dollar_bill", "intel"]
    assert "real data here" in kickoff["request"]


def test_zonder_specialisten_blijft_het_gedrag_gelijk(kickoff):
    req = cr.CrewRunRequest.model_validate({"task": "hoi"})
    assert req.specialists is None
    res = cr.run_crew(req.task, req.context, req.conversation, req.specialists)
    assert res["status"] == "ok"
    # Lege lijst: run_crew_kickoff valt zelf terug op axe_core, zoals voorheen.
    assert kickoff["specialists"] == []


def test_rommel_in_de_lijst_wordt_opgeschoond(kickoff):
    res = cr.run_crew("t", None, None, [" Intel ", "intel", 7, None, "DOLLAR_BILL"])
    assert res["status"] == "ok"
    assert kickoff["specialists"] == ["intel", "dollar_bill"]


def test_normalize_begrenst_en_weigert_geen_lijst():
    assert cr.normalize_specialists(None) == []
    assert cr.normalize_specialists("intel") == []
    assert len(cr.normalize_specialists([f"s{i}" for i in range(50)])) == cr.MAX_SPECIALISTS


def _run_crew_aanroepen() -> list[ast.Call]:
    boom = ast.parse(MAIN.read_text())
    return [n for n in ast.walk(boom)
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "run_crew"]


def test_main_geeft_de_specialisten_door_bij_elke_aanroep():
    aanroepen = _run_crew_aanroepen()
    assert len(aanroepen) >= 2, "crew_run en de geplande crew-job roepen run_crew allebei aan"
    for call in aanroepen:
        assert len(call.args) == 4, f"run_crew zonder specialisten: {ast.unparse(call)}"
        assert "specialists" in ast.unparse(call.args[3])


def test_main_heeft_geen_eigen_crewrunrequest_meer():
    boom = ast.parse(MAIN.read_text())
    eigen = [n.name for n in ast.walk(boom) if isinstance(n, ast.ClassDef) and n.name == "CrewRunRequest"]
    assert eigen == [], "een tweede CrewRunRequest in main.py zou het veld weer kunnen verliezen"
    imports = [n for n in ast.walk(boom) if isinstance(n, ast.ImportFrom) and n.module == "crew_runner"]
    assert any(a.name == "CrewRunRequest" for n in imports for a in n.names)


def test_payload_die_de_runner_krijgt_bevat_de_lijst(monkeypatch, tmp_path):
    """Zonder de runner: wat er in het payloadbestand staat."""
    geschreven = {}

    def vang(argv, **_kw):
        geschreven.update(json.loads(pathlib.Path(argv[2]).read_text()))
        pathlib.Path(argv[3]).write_text(json.dumps({"status": "ok", "result": "x"}))
        return types.SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(cr.subprocess, "run", vang)
    monkeypatch.setattr(cr.os.path, "exists", lambda p: True)
    monkeypatch.setattr("zuinig.SLOT_DIR", str(tmp_path))
    cr.run_crew("t", None, None, ["axe_core", "dollar_bill", "intel"])
    assert geschreven["specialists"] == ["axe_core", "dollar_bill", "intel"]
