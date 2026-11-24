"""24 nov live: claude_code.run ging naar de iMac (alfabetisch eerst, stoel op zijn
sessielimiet) terwijl de Mac mini twee vrije Claude-stoelen had."""
from datetime import datetime, timedelta, timezone

import device_actions as da

NU = datetime.now(timezone.utc)


class Db:
    def __init__(self, stoelen):
        self.stoelen, self.inserts, self._t = stoelen, [], None

    def table(self, n): self._t = n; return self
    def select(self, *_a): return self
    def eq(self, *_a): return self
    def limit(self, *_a): return self
    def insert(self, rij): self.inserts.append(rij); return self

    def execute(self):
        r = type("R", (), {})()
        if self._t == "core_computer_workers":
            r.data = [{"device_id": d, "host": d, "workspaces": ["AXE Core"], "heartbeat_at": NU.isoformat()}
                      for d in ("imac-3", "mac-mini-van-luka-6")]
        elif self._t == "core_coding_seats":
            r.data = self.stoelen
        elif self._t == "core_tasks" and self.inserts and not getattr(self, "_g", False):
            self._g = True
            r.data = [{"id": "t1"}]
        else:
            r.data = [{"status": "completed", "result": {"output": "ok"}}]
        return r


def stoel(seat, machine, ingelogd=True, tot=None):
    return {"seat_id": seat, "machine": machine, "logged_in": ingelogd, "rate_limited": bool(tot),
            "rate_limit_until": tot, "last_seen_at": NU.isoformat()}


VOL = (NU + timedelta(hours=2)).isoformat()


def test_kies_stoel():
    assert da.kies_stoel("claude_code.run", ["codex", "claude2"]) == "claude2"
    assert da.kies_stoel("claude_code.run", ["codex"]) is False
    assert da.kies_stoel("claude_code.run", None) is None


def test_mac_met_vrije_stoel_eerst_en_mac_mini_voor_imac():
    db = Db([stoel("claude3", "imac-3", tot=VOL), stoel("claude", "mac-mini-van-luka-6")])
    lijst = da.list_devices(db)
    assert [d["device"] for d in lijst] == ["mac-mini-van-luka-6", "imac-3"]
    assert lijst[0]["coding_seats_free"] == ["claude"] and lijst[1]["coding_seats_free"] == []


def test_ook_zonder_stoelinfo_mac_mini_eerst():
    assert [d["device"] for d in da.list_devices(Db([]))] == ["mac-mini-van-luka-6", "imac-3"]


def test_volle_mac_wijst_naar_de_andere():
    db = Db([stoel("claude3", "imac-3", tot=VOL), stoel("claude2", "mac-mini-van-luka-6")])
    uit = da.run_on_device("imac-3", "claude_code.run", {"prompt": "x"}, db=db, sleep=lambda s: None)
    assert "no free logged-in seat" in uit["error"] and "mac-mini-van-luka-6" in uit["error"]
    assert not db.inserts


def test_vrije_stoel_gaat_mee_naar_de_mac():
    db = Db([stoel("claude", "mac-mini-van-luka-6", ingelogd=False), stoel("claude2", "mac-mini-van-luka-6")])
    uit = da.run_on_device("mac-mini-van-luka-6", "claude_code.run", {"prompt": "x"}, db=db, sleep=lambda s: None)
    assert uit["ok"]
    assert db.inserts[0]["payload"]["args"]["seat"] == "claude2"


def test_gevraagde_volle_stoel_wordt_een_vrije():
    db = Db([stoel("claude3", "mac-mini-van-luka-6", tot=VOL), stoel("claude2", "mac-mini-van-luka-6")])
    da.run_on_device("mac-mini-van-luka-6", "claude_code.run", {"prompt": "x", "seat": "claude3"}, db=db,
                     sleep=lambda s: None)
    assert db.inserts[0]["payload"]["args"]["seat"] == "claude2"


def test_gevraagde_vrije_stoel_blijft_staan():
    db = Db([stoel("claude2", "mac-mini-van-luka-6"), stoel("claude", "mac-mini-van-luka-6")])
    da.run_on_device("mac-mini-van-luka-6", "claude_code.run", {"prompt": "x", "seat": "claude"}, db=db,
                     sleep=lambda s: None)
    assert db.inserts[0]["payload"]["args"]["seat"] == "claude"
