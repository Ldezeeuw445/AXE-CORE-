"""vps_sync: manifest, optionele MISSING, worker-imports."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vps_sync as vs


def test_manifest_heeft_de_servermodules_die_199_miste():
    rels = {rel for rel, _unit in vs.MANIFEST.values()}
    for pad in (
        "backend/axe_api/goedkeuring_melding.py",
        "backend/axe_api/push_meldingen.py",
        "backend/axe_api/northsea_crew_zichtbaar.py",
        "backend/axe_api/agent_workspace.py",
        "backend/axe_api/device_actions.py",
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
    assert vs.ontbrekende_worker_imports({"task_worker.py"}, {"task_runtime.py"}) == [
        "agent_loop.py",
        "agent_workspace.py",
        "device_actions.py",
    ]
    assert vs.ontbrekende_worker_imports(
        {"task_worker.py", "agent_loop.py"},
        {"task_runtime.py"},
    ) == ["agent_workspace.py", "device_actions.py"]
    assert vs.ontbrekende_worker_imports(
        {"task_worker.py"},
        {"task_runtime.py", "agent_loop.py", "agent_workspace.py", "device_actions.py"},
    ) == []
    assert vs.ontbrekende_worker_imports({"push_meldingen.py"}, set()) == []
