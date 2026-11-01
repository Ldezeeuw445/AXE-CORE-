"""vps_sync: manifest, optionele MISSING, worker-imports."""
from __future__ import annotations

import ast
import json
import os
import sys
import subprocess

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vps_sync as vs


def test_ssh_fout_is_geen_lege_succesvolle_inventaris(monkeypatch):
    monkeypatch.setattr(vs.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a[0], 255, "", "permission denied"))
    with pytest.raises(RuntimeError, match="connection failed"):
        vs.remote_sums()


def test_lege_remote_hashes_zijn_onbekend_niet_in_sync(monkeypatch, capsys):
    monkeypatch.setattr(vs, "ssh", lambda _: "")
    assert vs.cmd_check(None) == 2
    assert "unknown" in capsys.readouterr().err


def test_manifest_heeft_de_servermodules_die_199_miste():
    rels = {rel for rel, _unit in vs.MANIFEST.values()}
    for pad in (
        "backend/axe_api/goedkeuring_melding.py",
        "backend/axe_api/beslis_beleid.py",
        "backend/axe_api/push_meldingen.py",
        "backend/axe_api/northsea_crew_zichtbaar.py",
        "backend/axe_api/agent_workspace.py",
        "backend/axe_api/device_actions.py",
        "backend/axe_api/review_desk_bron.py",
        "backend/axe_api/llm_cascade.py",
        "backend/axe_api/provider_probe.py",
        "backend/axe_api/abonnement_verbruik.py",
        "backend/axe_api/dax_wacht.py",
        "backend/axe_api/dax_routine.py",
        "backend/axe_api/staande_diensten.py",
        "backend/axe_api/grok_managers.py",
        "backend/axe_api/prompts/axemanager.md",
        "backend/axe_api/prompts/projectsmgr.md",
        "backend/axe_api/prompts/companionmgr.md",
        "backend/axe_api/prompts/axon.md",
        "backend/axe_api/prompts/tradingos.md",
        "backend/axe_api/prompts/northseamgr.md",
        "backend/axe_api/lockscreen.py",
        "backend/axe_api/twelvedata_budget.py",
        "backend/axe_api/provider_router.py",
        "backend/axe_api/agent_tiers.json",
        "backend/axe_api/northsea_desk_handler.py",
        "backend/axe_api/taak_fout.py",
    ):
        assert pad in rels, pad


def test_deploy_slaat_optionele_missing_over_tenzij_only():
    rows = [
        ("/opt/axe-tts/app.py", "backend/axe_tts/app.py", "axe-tts", vs.MISSING),
        ("/etc/systemd/system/axe-tts.service", "backend/axe_tts/axe-tts.service", "axe-tts", vs.MISSING),
        ("/opt/axe-core-api/cli_laag.py", "backend/axe_api/cli_laag.py", "axe-core-api", vs.MISSING),
        ("/opt/axe-core-api/push_meldingen.py", "backend/axe_api/push_meldingen.py", "axe-core-api", vs.REPO_AHEAD),
    ]
    todo, skip = vs.deploy_kandidaten(rows, geinstalleerd={"axe-core-api"})
    namen = {vs.naam_van(r[0]) for r in todo}
    assert namen == {"push_meldingen.py"}
    assert {vs.naam_van(r[0]) for r in skip} == {"app.py", "axe-tts.service", "cli_laag.py"}

    alleen, _ = vs.deploy_kandidaten(rows, only=["cli_laag.py"], geinstalleerd={"axe-core-api"})
    assert [vs.naam_van(r[0]) for r in alleen] == ["cli_laag.py"]


def test_deploy_slaat_missing_over_als_de_dienst_niet_op_de_box_staat():
    rows = [
        ("/opt/axe-core-api/browser_agent_app.py", "backend/axe_api/browser_agent_app.py", "axe-browser-agent", vs.MISSING),
        ("/opt/axe-core-api/main.py", "backend/axe_api/main.py", "axe-core-api", vs.REPO_AHEAD),
    ]
    todo, skip = vs.deploy_kandidaten(rows, geinstalleerd={"axe-core-api"})
    assert [vs.naam_van(r[0]) for r in todo] == ["main.py"]
    assert skip and skip[0][1] == "unit-not-installed"


def test_weiger_task_worker_zonder_agent_loop_imports():
    missing = vs.ontbrekende_worker_imports({"task_worker.py"}, {"task_runtime.py"})
    for pad in ("agent_loop.py", "agent_workspace.py", "device_actions.py", "beslis_beleid.py"):
        assert pad in missing, pad
    missing2 = vs.ontbrekende_worker_imports(
        {"task_worker.py", "agent_loop.py"},
        {"task_runtime.py"},
    )
    for pad in ("agent_workspace.py", "device_actions.py", "beslis_beleid.py"):
        assert pad in missing2, pad
    assert vs.ontbrekende_worker_imports(
        {"task_worker.py"},
        {"task_runtime.py", "agent_loop.py", "agent_workspace.py", "device_actions.py",
         "beslis_beleid.py", "missies.py", "mission_engine.py", "dax.py",
         "northsea_desk_handler.py", "provider_router.py", "dax_bouw.py", "bouw_publiceer.py"},
    ) == []
    assert vs.ontbrekende_worker_imports({"push_meldingen.py"}, set()) == []


# ── CORE-SYNC-1: alles wat de diensten importeren staat in het manifest ─────────
#
# Het manifest werd met de hand bijgehouden, en elke keer dat iemand een module
# toevoegde aan main.py zonder het manifest, kon een fix eraan niet worden
# uitgerold of op drift gecontroleerd (zie de commentaren in MANIFEST: #199,
# 23 sep, 10 okt). Op 17 okt ontbraken er dertien. Deze test rekent de importketen
# uit, ook imports binnen functies, en weigert een lokale module die nergens staat.

API = os.path.join(vs.HQ, "backend", "axe_api")
STARTPUNTEN = ("main", "task_worker", "browser_agent_app")
# Lokale modules die bewust NIET naar de VPS gaan, met waarom.
NIET_OP_DE_VPS: dict[str, str] = {}


def _lokale_imports(naam: str, lokaal: set[str]) -> set[str]:
    with open(os.path.join(API, naam + ".py"), encoding="utf-8") as fh:
        boom = ast.parse(fh.read())
    uit = set()
    for knoop in ast.walk(boom):
        if isinstance(knoop, ast.Import):
            uit.update(a.name.split(".")[0] for a in knoop.names)
        elif isinstance(knoop, ast.ImportFrom) and knoop.module and knoop.level == 0:
            uit.add(knoop.module.split(".")[0])
    return uit & lokaal


def _sluiting(start: str, lokaal: set[str]) -> set[str]:
    gezien, todo = set(), [start]
    while todo:
        naam = todo.pop()
        if naam not in gezien:
            gezien.add(naam)
            todo.extend(_lokale_imports(naam, lokaal))
    return gezien


def test_import_sluiting_staat_in_het_manifest():
    lokaal = {f[:-3] for f in os.listdir(API) if f.endswith(".py") and not f.startswith("test_")}
    in_manifest = {rel for rel, _unit in vs.MANIFEST.values()}
    ontbreekt = set()
    for start in STARTPUNTEN:
        for naam in _sluiting(start, lokaal):
            if f"backend/axe_api/{naam}.py" not in in_manifest and naam not in NIET_OP_DE_VPS:
                ontbreekt.add(naam)
    assert not ontbreekt, (
        f"main.py of de worker importeert {sorted(ontbreekt)}, maar vps_sync kent ze niet: "
        "zet ze in MANIFEST (of met reden in NIET_OP_DE_VPS)")


def test_optionele_imports_gaan_niet_ongevraagd_naar_de_box():
    for remote in ("/opt/axe-core-api/agent_runner.py", "/opt/axe-core-api/agent_tunnel.py",
                   "/opt/axe-core-api/trading_cockpit.py"):
        assert remote in vs.MANIFEST and remote in vs.OPTIONAL_WHEN_MISSING, remote



# ── auto (28 okt): de Macs zetten zelf live, alleen schoon en groen ───────────

AHEAD = ("/opt/axe-core-api/main.py", "backend/axe_api/main.py", "axe-core-api", vs.REPO_AHEAD)
DRIFT = ("/opt/axe-core-api/planner.py", "backend/axe_api/planner.py", "axe-core-api", vs.BOX_DRIFT)


def test_auto_besluit():
    assert vs.auto_besluit([], [], True)[0] == "niets"
    assert vs.auto_besluit([AHEAD, DRIFT], [AHEAD], True) == ("geweigerd", "edited on the box and not in git: planner.py")
    assert vs.auto_besluit([AHEAD], [AHEAD], False)[0] == "geweigerd"
    assert "no test environment" in vs.auto_besluit([AHEAD], [AHEAD], None)[1]
    assert vs.auto_besluit([AHEAD], [AHEAD], True)[0] == "deploy"


@pytest.fixture
def nep_box(tmp_path, monkeypatch):
    staat = {"ssh": [], "teruggezet": False, "health": "200", "tests": (True, "1 passed")}
    monkeypatch.setattr(vs, "STAAT", str(tmp_path / "auto.json"))
    monkeypatch.setattr(vs, "survey", lambda: [AHEAD])
    monkeypatch.setattr(vs, "geinstalleerde_eenheden", lambda: {"axe-core-api"})
    monkeypatch.setattr(vs, "draai_tests", lambda: staat["tests"])
    monkeypatch.setattr(vs, "verzend", lambda todo: ("20261028-1700", {"axe-core-api"}))
    monkeypatch.setattr(vs, "gezondheid", lambda: staat["health"])
    monkeypatch.setattr(vs, "terugzetten", lambda todo, stamp, units: staat.__setitem__("teruggezet", True))
    monkeypatch.setattr(vs, "ssh", lambda cmd: staat["ssh"].append(cmd) or ("ok" if "mkdir" in cmd else ""))
    monkeypatch.setattr(vs, "meld", lambda uit, vorige: None)
    monkeypatch.setattr(vs, "ontbrekende_worker_imports", lambda *a: [])
    monkeypatch.delenv("AXE_AUTO_DEPLOY", raising=False)
    return staat


def lees_staat():
    with open(vs.STAAT) as fh:
        return json.load(fh)


def test_auto_zet_live_met_slot_en_ruimt_het_slot_op(nep_box):
    assert vs.cmd_auto(None) == 0
    uit = lees_staat()
    assert uit["actie"] == "gedeployd" and uit["bestanden"] == ["main.py"]
    assert any("mkdir" in c for c in nep_box["ssh"]) and any(c.startswith("rm -rf") for c in nep_box["ssh"])


def test_auto_zet_terug_als_health_faalt(nep_box):
    nep_box["health"] = "502"
    assert vs.cmd_auto(None) == 1
    assert nep_box["teruggezet"] is True
    assert lees_staat()["actie"] == "teruggezet"


def test_auto_rolt_niet_uit_bij_rode_tests_en_probeert_dezelfde_commit_niet_elke_ronde(nep_box, monkeypatch):
    nep_box["tests"] = (False, "1 failed")
    assert vs.cmd_auto(None) == 1
    assert lees_staat()["actie"] == "geweigerd"
    assert not any("mkdir" in c for c in nep_box["ssh"])
    monkeypatch.setattr(vs, "survey", lambda: (_ for _ in ()).throw(AssertionError("niet opnieuw meten")))
    assert vs.cmd_auto(None) == 0


def test_auto_staat_uit_met_de_schakelaar(nep_box, monkeypatch):
    monkeypatch.setenv("AXE_AUTO_DEPLOY", "0")
    monkeypatch.setattr(vs, "survey", lambda: (_ for _ in ()).throw(AssertionError("uit is uit")))
    assert vs.cmd_auto(None) == 0


def test_een_ontbrekende_testomgeving_wordt_volgende_ronde_opnieuw_geprobeerd(nep_box, monkeypatch):
    nep_box["tests"] = (None, "no Python 3.11+ on this Mac")
    assert vs.cmd_auto(None) == 1
    uit = lees_staat()
    assert uit["actie"] == "geweigerd" and "no Python 3.11+" in uit["reden"]
    nep_box["tests"] = (True, "645 passed")
    assert vs.cmd_auto(None) == 0 and lees_staat()["actie"] == "gedeployd"


def test_de_testomgeving_laat_dingen_weg_die_geen_test_nodig_heeft(tmp_path, monkeypatch):
    monkeypatch.setattr(vs, "TEST_VENV", str(tmp_path / "venv"))
    monkeypatch.setattr(vs, "_basis_python", lambda: None)
    monkeypatch.setattr(vs, "_uv", lambda: None)
    py, waarom = vs.maak_test_venv()
    assert py is None and "Python 3.11+" in waarom


def test_met_uv_buiten_het_pad_bouwt_de_testomgeving_toch(tmp_path, monkeypatch):
    """Onder launchd staat uv niet op PATH; de vaste Mac-plek moet genoeg zijn."""
    bin_ = tmp_path / "bin"
    bin_.mkdir()
    uv = bin_ / "uv"
    # Nep-uv: logt zijn argumenten; "venv" zet een python neer die naar deze testpython wijst.
    uv.write_text(f"""#!/bin/sh
echo "$@" >> {tmp_path / "uv.log"}
if [ "$1" = venv ]; then
  mkdir -p "$4/bin"
  printf '#!/bin/sh\\nexec {sys.executable} "$@"\\n' > "$4/bin/python"
  chmod +x "$4/bin/python"
fi
""")
    uv.chmod(0o755)
    monkeypatch.setattr(vs, "_MAC_BIN", (str(bin_),))
    monkeypatch.setenv("PATH", "/usr/bin:/bin")
    monkeypatch.setattr(vs, "TEST_VENV", str(tmp_path / "venv"))
    monkeypatch.setattr(vs, "_basis_python", lambda: pytest.fail("met uv geen andere Python zoeken"))
    py, waarom = vs.maak_test_venv()
    log = (tmp_path / "uv.log").read_text()
    assert py == str(tmp_path / "venv" / "bin" / "python") and waarom == ""
    assert "venv --python 3.12" in log and "pip install -q --python" in log
    eisen = (tmp_path / "venv" / "requirements-tests.txt").read_text().splitlines()
    assert not [r for r in eisen if r.startswith(("browser-use", "pywebpush"))] and "pytest" in eisen
