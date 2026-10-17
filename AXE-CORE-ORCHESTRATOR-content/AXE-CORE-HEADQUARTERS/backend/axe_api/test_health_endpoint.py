"""/health via de echte app: de oude velden blijven, de metingen komen erbij.

Er gaat geen echt verzoek uit: de metingen van gezondheid.py worden vervangen.
"""
import os
import tempfile

os.environ.setdefault("AXE_API_KEY", "test-sleutel")
os.environ.setdefault("SUPABASE_URL", "http://localhost.invalid")
os.environ.setdefault("SUPABASE_SERVICE_ROLE", "test-service-role")
if "WORKSPACE_DIR" not in os.environ:
    os.environ["WORKSPACE_DIR"] = tempfile.mkdtemp(prefix="axe-test-workspace-")

from fastapi.testclient import TestClient  # noqa: E402

import gezondheid  # noqa: E402
import main  # noqa: E402


def test_health_houdt_de_oude_velden_en_meldt_wat_stilligt(monkeypatch):
    async def nep(url, key, **_kw):
        return {"checks": {"northsea_mcp": {"state": "fail"}}, "degraded": ["northsea_mcp"], "checked_at": "x"}
    monkeypatch.setattr(gezondheid, "controles", nep)
    r = TestClient(main.app).get("/health")
    assert r.status_code == 200
    data = r.json()
    # De bewaker en de uptimecheck lezen status; die blijft "ok" zolang de API leeft.
    assert data["status"] == "ok" and data["service"] == "axe-core-api"
    assert data["degraded"] == ["northsea_mcp"]
    assert data["checks"]["northsea_mcp"]["state"] == "fail"


def test_cron_tick_zet_de_tick_klok(monkeypatch):
    monkeypatch.setattr(main, "CRON_SECRET", "geheim")
    gezien = []
    monkeypatch.setattr(gezondheid, "tick_ontvangen", lambda *a: gezien.append(True))
    # Een verkeerde sleutel telt niet als tick.
    r = TestClient(main.app).post("/cron/tick", headers={"X-Cron-Secret": "fout"})
    assert r.status_code == 401 and gezien == []
