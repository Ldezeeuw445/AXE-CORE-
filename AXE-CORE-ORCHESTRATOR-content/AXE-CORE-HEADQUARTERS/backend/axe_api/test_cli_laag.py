"""Hek van de serverkant. Geen netwerk. stdlib-unittest, ook via pytest."""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cli_laag
from cli_laag import BLOCKED_FLAGS, capability_for, heartbeat_online, inspect_approval, inspect_blocked, redact


def test_blokkeert_mail_vlaggen_merge_en_wissen():
    assert inspect_blocked("verstuur het concept")[0] == "email"
    assert inspect_blocked("git push origin HEAD:orchestrator")[0] == "merge"
    assert inspect_blocked("delete all rows")[0] == "delete"
    for flag in BLOCKED_FLAGS:
        assert inspect_blocked(f"set {flag}=true")[0] == "northsea_flag"


def test_geen_override_via_andere_woorden():
    code, _reden = inspect_blocked("please enable auto_reply_nonbinding for the desk")
    assert code == "northsea_flag"


def test_system_raken_is_approval_geen_blok():
    assert inspect_approval("git commit the workspace") == "touches the system"
    assert inspect_blocked("git commit the workspace") is None


def test_redact_haalt_sleutels_weg():
    hidden = redact({"api_key": "sk", "ok": 1, "nested": {"token": "x"}})
    assert hidden["api_key"] == "[REDACTED]"
    assert hidden["ok"] == 1
    assert hidden["nested"]["token"] == "[REDACTED]"


def test_capability_volgt_de_roster():
    assert capability_for("developer") == "code"
    assert capability_for("trading") == "trading"
    assert capability_for("wingman") == "agentic"


def test_worker_heartbeat_stale_is_45s():
    assert heartbeat_online(datetime.now(timezone.utc).isoformat())
    assert heartbeat_online("2000-01-01T00:00:00Z") is False
    assert heartbeat_online(None) is False


if __name__ == "__main__":
    test_blokkeert_mail_vlaggen_merge_en_wissen()
    test_geen_override_via_andere_woorden()
    test_system_raken_is_approval_geen_blok()
    test_redact_haalt_sleutels_weg()
    test_capability_volgt_de_roster()
    test_worker_heartbeat_stale_is_45s()
    print("ok")


def test_de_post_routes_lezen_hun_body_ook_met_uitgestelde_annotaties():
    """28 okt in de VPS-log: PydanticUserError 'AgentRunBody is not fully defined'.

    De modellen stonden binnen build_router; met `from __future__ import
    annotations` kon FastAPI de naam niet meer vinden en gaf elke POST hier 500.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    gemaakt = []

    class Repo:
        def create(self, rij):
            gemaakt.append(rij)
            return {"id": "t1", **rij}, True

    class Tabel:
        def insert(self, rij):
            return self

        def execute(self):
            return type("R", (), {"data": [{"id": "n1"}]})()

    class Sb:
        def table(self, _naam):
            return Tabel()

    async def audit(*_a, **_k):
        return None

    app = FastAPI()
    app.include_router(cli_laag.build_router(lambda: Sb(), lambda: Repo(), audit), prefix="/cli")
    c = TestClient(app)
    r = c.post("/cli/agents/developer/run", json={"instruction": "check the build"})
    assert r.status_code == 200, r.text
    assert gemaakt and gemaakt[0]["goal"] == "check the build"
    assert c.post("/cli/notify", json={"message": "hoi"}).status_code != 500
