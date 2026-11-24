import asyncio

import mt5_bridge_status as mb


def test_stand_is_nooit_groen_op_aanname():
    assert mb.stand(False, "ok") == "offline"
    assert mb.stand(True, "unmeasured") == "connected"
    assert mb.stand(True, "down") == "bridge_down"
    assert mb.stand(True, "ok") == "works"


class _Antwoord:
    def __init__(self, code):
        self.status_code = code
        self.is_success = 200 <= code < 300


class _Client:
    def __init__(self, code):
        self.code = code

    async def get(self, url, timeout=5):
        return _Antwoord(self.code)


def _met_tcp(monkeypatch, open_):
    async def nep(host, poort, timeout=4.0):
        return (open_, 12 if open_ else None)
    monkeypatch.setattr(mb, "tcp_open", nep)


def test_zonder_health_url_verbonden_maar_niet_gemeten(monkeypatch):
    _met_tcp(monkeypatch, True)
    uit = asyncio.run(mb.meet(_Client(200), env={}))
    assert uit["stand"] == "connected" and uit["bridge"] == "unmeasured" and uit["latency_ms"] == 12
    assert "31.70" not in str(uit), "open endpoint: geen IP-adres in het antwoord"


def test_met_health_url_werkt_of_niet(monkeypatch):
    _met_tcp(monkeypatch, True)
    env = {"MT5_BRIDGE_HEALTH_URL": "http://x/health"}
    assert asyncio.run(mb.meet(_Client(200), env=env))["stand"] == "works"
    assert asyncio.run(mb.meet(_Client(503), env=env))["stand"] == "bridge_down"


def test_offline(monkeypatch):
    _met_tcp(monkeypatch, False)
    uit = asyncio.run(mb.meet(_Client(200), env={"MT5_BRIDGE_HEALTH_URL": "http://x/health"}))
    assert uit["stand"] == "offline" and uit["reachable"] is False


def test_echte_tcp_meting_tegen_een_dichte_poort():
    ok, ms = asyncio.run(mb.tcp_open("127.0.0.1", 9, timeout=1))
    assert ok is False and ms is None
