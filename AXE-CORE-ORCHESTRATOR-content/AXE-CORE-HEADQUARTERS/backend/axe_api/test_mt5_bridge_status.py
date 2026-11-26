import asyncio

import mt5_bridge_status as mb


def test_stand_is_nooit_groen_op_aanname():
    assert mb.stand(False, "ok") == "offline"
    assert mb.stand(True, "unmeasured") == "connected"
    assert mb.stand(True, "down") == "bridge_down"
    assert mb.stand(True, "ok") == "works"


class _Antwoord:
    def __init__(self, code, body=None):
        self.status_code = code
        self.is_success = 200 <= code < 300
        self._body = {"ok": True, "trading": True} if body is None else body

    def json(self):
        return self._body


class _Client:
    def __init__(self, code, body=None):
        self.code = code
        self.body = body
        self.urls = []

    async def get(self, url, timeout=5):
        self.urls.append(url)
        return _Antwoord(self.code, self.body)


def _met_tcp(monkeypatch, open_):
    async def nep(host, poort, timeout=4.0):
        return (open_, 12 if open_ else None)
    monkeypatch.setattr(mb, "tcp_open", nep)


def test_health_url_uit_dan_verbonden_maar_niet_gemeten(monkeypatch):
    _met_tcp(monkeypatch, True)
    uit = asyncio.run(mb.meet(_Client(200), env={"MT5_BRIDGE_HEALTH_URL": "off"}))
    assert uit["stand"] == "connected" and uit["bridge"] == "unmeasured" and uit["latency_ms"] == 12
    assert "31.70" not in str(uit), "open endpoint: geen IP-adres in het antwoord"


def test_zonder_env_meet_hij_de_tunnel(monkeypatch):
    # 26 nov: zonder adres bleef het "not measured" terwijl de bridge uren plat lag.
    _met_tcp(monkeypatch, True)
    client = _Client(200)
    uit = asyncio.run(mb.meet(client, env={}))
    assert client.urls == ["https://mt5-bridge.axecompanion.com/health"]
    assert uit["stand"] == "works" and uit["detail"] == "bridge healthy · trading on"


def test_bridge_antwoordt_maar_mt5_niet_verbonden(monkeypatch):
    _met_tcp(monkeypatch, True)
    uit = asyncio.run(mb.meet(_Client(200, {"ok": False, "trading": True}), env={}))
    assert uit["stand"] == "bridge_down" and "not connected" in uit["detail"]


def test_tunnel_werkt_ook_als_poort_22_dicht_is(monkeypatch):
    _met_tcp(monkeypatch, False)
    uit = asyncio.run(mb.meet(_Client(200), env={}))
    assert uit["stand"] == "works" and uit["reachable"] is True


def test_met_health_url_werkt_of_niet(monkeypatch):
    _met_tcp(monkeypatch, True)
    env = {"MT5_BRIDGE_HEALTH_URL": "http://x/health"}
    assert asyncio.run(mb.meet(_Client(200), env=env))["stand"] == "works"
    assert asyncio.run(mb.meet(_Client(503), env=env))["stand"] == "bridge_down"


def test_offline(monkeypatch):
    _met_tcp(monkeypatch, False)
    uit = asyncio.run(mb.meet(_Client(502), env={"MT5_BRIDGE_HEALTH_URL": "http://x/health"}))
    assert uit["stand"] == "offline" and uit["reachable"] is False


def test_echte_tcp_meting_tegen_een_dichte_poort():
    ok, ms = asyncio.run(mb.tcp_open("127.0.0.1", 9, timeout=1))
    assert ok is False and ms is None
