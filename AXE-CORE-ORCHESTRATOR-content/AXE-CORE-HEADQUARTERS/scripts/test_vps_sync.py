"""vps_sync: manifest, optionele MISSING, worker-imports."""
from __future__ import annotations

import ast
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vps_sync as vs


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
         "northsea_desk_handler.py", "provider_router.py"},
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

