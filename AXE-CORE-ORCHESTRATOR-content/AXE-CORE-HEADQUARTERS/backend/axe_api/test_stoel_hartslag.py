"""24 nov: stoelrijen zijn minuten oud (de CLI-meting is traag), de worker-hartslag niet."""
import time
from datetime import datetime, timedelta, timezone

import provider_router as pr
from stoelen_actueel import met_worker_hartslag

NU = datetime.now(timezone.utc)


def rij(machine, seat, minuten_oud):
    t = (NU - timedelta(minutes=minuten_oud)).isoformat()
    return {"id": f"{machine}:{seat}", "machine": machine, "seat_id": seat, "provider": "claude",
            "logged_in": True, "rate_limited": False, "rate_limit_until": None, "current_task": None,
            "last_seen_at": t, "updated_at": t, "email": None, "runs_7d": 1}


def test_oude_stoelrij_van_een_levende_mac_is_vrij():
    rijen = [rij("mac-mini-van-luka-6", "claude2", 5)]
    assert pr.kies_stoel(rijen) is None  # zo ging het: 5 min oud = verouderd
    workers = [{"device_id": "mac-mini-van-luka-6", "heartbeat_at": NU.isoformat()}]
    assert pr.kies_stoel(met_worker_hartslag(rijen, workers))["seat_id"] == "claude2"


def test_mac_zonder_hartslag_blijft_verouderd():
    rijen = [rij("mac-mini-van-luka-6", "claude2", 5)]
    workers = [{"device_id": "mac-mini-van-luka-6", "heartbeat_at": (NU - timedelta(minutes=10)).isoformat()}]
    assert pr.kies_stoel(met_worker_hartslag(rijen, workers)) is None


class Db:
    def __init__(self, tabellen): self.t, self.n = tabellen, None
    def table(self, n): self.n = n; return self
    def select(self, *_a): return self
    def order(self, *_a, **_k): return self
    def limit(self, *_a): return self
    def execute(self): return type("R", (), {"data": self.t.get(self.n, [])})()


def test_lees_stoelen_gebruikt_de_hartslag():
    db = Db({"core_coding_seats": [rij("mac-mini-van-luka-6", "claude", 6)],
             "core_computer_workers": [{"device_id": "mac-mini-van-luka-6", "heartbeat_at": NU.isoformat()}]})
    assert pr.kies_stoel(pr.lees_stoelen(db), familie="claude")["seat_id"] == "claude"
