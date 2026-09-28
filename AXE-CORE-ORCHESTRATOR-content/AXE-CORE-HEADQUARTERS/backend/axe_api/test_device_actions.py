"""6.15: de VPS-agent laat een Mac het werk doen, met de tiers van de app."""
import asyncio
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest

import agent_loop
import device_actions


def test_tiers_gelijk_aan_de_app():
    ts = (Path(__file__).resolve().parents[2] / "src/domain/tools/riskTiers.ts").read_text()
    blok = ts.split("TOOL_TIERS", 1)[1].split("};", 1)[0]
    app = dict(re.findall(r"'([a-z_.]+)':\s*'([a-z_]+)'", blok))
    assert app == device_actions.TOOL_TIERS


def test_goedkeuring_per_tier():
    k = device_actions.approval_key
    assert k("main-imac-luka", "app.frontmost", {}) is None
    assert k("main-imac-luka", "app.open", {"name": "Safari"}) is None
    # klikken: één ja per apparaat en gereedschap, niet per klik
    assert k("main-imac-luka", "pointer.click", {"x": 1}) == k("main-imac-luka", "pointer.click", {"x": 2})
    # ingrijpend: elke keer met de exacte argumenten
    assert k("m", "git.push", {"a": 1}) != k("m", "git.push", {"a": 2})


class NepDb:
    def __init__(self, beat_age=5, eind="completed"):
        self.beat = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() - beat_age, timezone.utc).isoformat()
        self.eind, self.inserts, self._t = eind, [], None

    def table(self, name):
        self._t = name
        return self

    def select(self, *_):
        return self

    def eq(self, *_):
        return self

    def limit(self, *_):
        return self

    def insert(self, row):
        self.inserts.append(row)
        return self

    def execute(self):
        class R:
            pass
        r = R()
        if self._t == "core_computer_workers":
            r.data = [{"device_id": "main-imac-luka", "host": "iMac", "workspaces": "AXE Core", "heartbeat_at": self.beat}]
        elif self.inserts and not getattr(self, "_gelezen", False):
            self._gelezen = True
            r.data = [{"id": "t1"}]
        else:
            r.data = [{"status": self.eind, "result": {"output": "Safari"}, "error": {"message": "kapot"}}]
        return r


def test_actie_gaat_naar_het_juiste_apparaat():
    db = NepDb()
    out = device_actions.run_on_device("main-imac-luka", "app.frontmost", db=db, sleep=lambda s: None)
    assert out == {"device": "main-imac-luka", "tool": "app.frontmost", "ok": True, "output": "Safari"}
    row = db.inserts[0]
    assert row["target_device"] == "main-imac-luka"
    assert row["capability"] == "computer_use" and row["status"] == "pending"
    assert row["payload"]["client_runtime"] == "remote"


def test_offline_mac_faalt_meteen():
    out = device_actions.run_on_device("main-imac-luka", "app.list", db=NepDb(beat_age=600), sleep=lambda s: None)
    assert "offline" in out["error"]


def test_leestaak_mag_niet_klikken():
    out = device_actions.run_on_device("main-imac-luka", "pointer.click", read_only=True, db=NepDb())
    assert "read-only" in out["error"]


def test_onbekend_gereedschap_geweigerd():
    assert "unknown device tool" in device_actions.run_on_device("x", "rm.everything", db=NepDb())["error"]


def test_lus_vraagt_ok_voor_klik_op_mac(monkeypatch):
    async def model(contents, key):
        return {"parts": [{"functionCall": {"name": "run_on_device", "args": {
            "device": "main-imac-luka", "tool": "pointer.click", "args": {"x": 10, "y": 20}}}}]}

    monkeypatch.setattr(agent_loop, "_call_model", model)

    async def ev(*a):
        pass

    with pytest.raises(agent_loop.ApprovalRequired) as e:
        asyncio.run(agent_loop.run_agent_loop("klik op de iMac", "t", ev))
    assert e.value.command == "device:main-imac-luka pointer.click"


def test_gewone_namen():
    assert device_actions.resolve_device("Mac mini") == "mac-mini-van-luka-5"
    assert device_actions.resolve_device("iMac") == "main-imac-luka"
    assert device_actions.approval_key("iMac", "pointer.click", {}) == "device:main-imac-luka pointer.click"
