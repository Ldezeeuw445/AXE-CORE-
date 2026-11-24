"""24 nov: stoelrijen zijn minuten oud (de CLI-meting is traag), de worker-hartslag niet."""
import time
from datetime import datetime, timedelta, timezone

import provider_router as pr
from stoelen_actueel import met_worker_hartslag

def nu():
    return datetime.now(timezone.utc)


def rij(machine, seat, minuten_oud):
    t = (nu() - timedelta(minutes=minuten_oud)).isoformat()
    return {"id": f"{machine}:{seat}", "machine": machine, "seat_id": seat, "provider": "claude",
            "logged_in": True, "rate_limited": False, "rate_limit_until": None, "current_task": None,
            "last_seen_at": t, "updated_at": t, "email": None, "runs_7d": 1}


def test_oude_stoelrij_van_een_levende_mac_is_vrij():
    rijen = [rij("mac-mini-van-luka-6", "claude2", 5)]
    assert pr.kies_stoel(rijen) is None  # zo ging het: 5 min oud = verouderd
    workers = [{"device_id": "mac-mini-van-luka-6", "heartbeat_at": nu().isoformat()}]
    assert pr.kies_stoel(met_worker_hartslag(rijen, workers))["seat_id"] == "claude2"


def test_mac_zonder_hartslag_blijft_verouderd():
    rijen = [rij("mac-mini-van-luka-6", "claude2", 5)]
    workers = [{"device_id": "mac-mini-van-luka-6", "heartbeat_at": (nu() - timedelta(minutes=10)).isoformat()}]
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
             "core_computer_workers": [{"device_id": "mac-mini-van-luka-6", "heartbeat_at": nu().isoformat()}]})
    assert pr.kies_stoel(pr.lees_stoelen(db), familie="claude")["seat_id"] == "claude"


def test_volle_stoel_volgt_de_mac_ook_na_een_nieuwe_naam():
    import device_actions as da
    da._VOLLE_STOELEN.clear()
    uit = '{"result":"You\'ve hit your session limit · resets 8:20am (Europe/Amsterdam)"}'
    assert da.onthoud_volle_stoel("imac-3", "claude3", uit)
    db = Db({"core_coding_seats": [rij("main-imac-luka", "claude3", 0), rij("mac-mini-van-luka-6", "claude2", 0)],
             "core_computer_workers": []})
    gekozen = pr.kies_stoel(pr.lees_stoelen(db), familie="claude")
    assert gekozen["seat_id"] == "claude2" and gekozen["machine"] == "mac-mini-van-luka-6"
    da._VOLLE_STOELEN.clear()
