"""Tests voor trading_cockpit: vorm, geen geheimen, alleen lezen, auth."""
import json
from datetime import datetime, timezone

import pytest

import trading_cockpit as tc

TOKEN = "eyJhbGciOiJSUzUxMiJ9.super-secret-metaapi-token"
ACCOUNTS = {"accounts": [
    {"id": "acc-1", "label": "FTMO 100k", "token": TOKEN, "accountId": "f32e523e-d708-4d13-a56b-0dd27e2c2930",
     "region": "london", "enabled": True, "environment": "live", "addedAt": "2026-09-01T00:00:00Z",
     "someFutureSecret": {"apiKey": "k", "password": "p"}},
    {"id": "acc-2", "label": "Demo", "token": "", "accountId": "aaaa1111-0000", "region": "london",
     "enabled": False, "environment": "demo", "addedAt": "2026-09-02T00:00:00Z"},
]}
VERDICT = {"state": "BLOCK", "blockReason": "Funnel: dropped", "gates": [{"id": "breaker", "status": "PASS", "detail": "ok"}],
           "sizing": None, "account": {"id": "f32e523e", "environment": "live", "live": True},
           "execution": {"state": "not-sent", "detail": "x", "tradeId": None, "price": None},
           "contributions": {"research": None, "intel": {"stance": "long", "summary": "s"}, "companion": {"stance": None, "summary": None}},
           "confidenceFloor": 0.6}
SETTINGS = {
    tc.K_ACCOUNTS: ACCOUNTS,
    tc.K_AUTOPILOT_ENABLED: True,
    tc.K_AUTOPILOT_INTERVAL: 15,
    tc.K_AUTOPILOT_LAST_RUN: "2026-09-22T10:00:00Z",
    tc.K_TRACES: [
        {"decisionId": "d1", "symbol": "EURUSD", "finalAction": "buy", "confidence": 0.7, "createdAt": "2026-09-22T10:01:00Z", "verdict": VERDICT, "steps": []},
        {"decisionId": "d0", "symbol": "XAUUSD", "finalAction": "hold", "confidence": 0.3, "createdAt": "2026-09-21T10:01:00Z", "blockedByRisk": "breaker", "steps": []},
    ],
    tc.K_REPORTS: [
        {"ticker": "EURUSD", "signal": "buy", "confidence": 0.6, "createdAt": "2026-09-22T09:00:00Z", "thesis": "old"},
        {"ticker": "EURUSD", "signal": "sell", "confidence": 0.5, "createdAt": "2026-09-22T09:30:00Z", "thesis": "new"},
    ],
    tc.K_LAB_RUNS: [{"id": "lab-1", "savedAt": "2026-09-22T08:00:00Z", "meta": {"symbol": "EURUSD", "timeframe": "h1", "strategyLabel": "ifvg"},
                     "metrics": {"totalTrades": 46, "netReturnPct": 3.2, "maxDrawdownPct": 4.1, "profitFactor": 1.3}, "funded": {"status": "ACTIVE"}}],
    "axe_trading_risk_profile:acc-1": {"riskPerTradePct": 0.01, "maxDailyLossPct": 0.05},
    "axe_trading_circuit_breaker:acc-1": {"tripped": False, "peakEquity": 100000},
}
NOW = datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc)
TRADES = [
    {"id": "t1", "status": "closed", "venue": "metaapi", "account_id": "f32e523e-d708-4d13-a56b-0dd27e2c2930", "account_label": "FTMO 100k", "pnl": 120.5, "closed_at": "2026-09-22T11:00:00Z"},
    {"id": "t2", "status": "closed", "venue": "metaapi", "account_id": "f32e523e-d708-4d13-a56b-0dd27e2c2930", "account_label": "FTMO 100k", "pnl": -40, "closed_at": "2026-09-21T11:00:00Z"},
    {"id": "t3", "status": "closed", "venue": "paper", "account_id": None, "pnl": 5, "closed_at": "2026-09-22T09:00:00Z"},
    {"id": "t4", "status": "open", "venue": "metaapi", "account_id": "aaaa1111-0000", "symbol": "XAUUSD", "side": "buy", "qty": 0.2, "entry_price": 2650.1, "stop_loss": 2640.0},
]


def test_no_secret_leaves_the_server():
    out = tc.shape_overview(SETTINGS, TRADES, None)
    text = json.dumps(out)
    assert TOKEN not in text
    assert "super-secret" not in text
    assert "f32e523e-d708-4d13-a56b-0dd27e2c2930" not in text  # alleen gemaskeerd
    assert '"password"' not in text and '"apiKey"' not in text and '"token"' not in text


def test_accounts_whitelist_and_connection_flag():
    acc = tc.shape_accounts(ACCOUNTS)
    assert acc[0]["metaApiAccount"] == "f32e523e…"
    assert acc[0]["connected"] is True and acc[1]["connected"] is False
    assert "someFutureSecret" not in acc[0]


def test_scrub_is_recursive():
    assert tc.scrub({"a": [{"access_token": 1, "b": {"API_KEY": 2, "ok": 3}}]}) == {"a": [{"b": {"ok": 3}}]}


def test_decisions_keep_verdict_and_mark_legacy():
    d = tc.shape_decisions(SETTINGS[tc.K_TRACES])
    assert d[0]["state"] == "BLOCK" and d[0]["blockReason"] == "Funnel: dropped"
    assert d[0]["contributions"]["intel"]["stance"] == "long"
    assert d[1]["legacy"] is True and d[1]["state"] is None and d[1]["blockReason"] == "breaker"


def test_pnl_evidence_positions():
    pnl = tc.shape_pnl(TRADES, now=NOW)["byAccount"]
    assert pnl["FTMO 100k"] == {"closed": 2, "wins": 1, "losses": 1, "pnl": 80.5, "pnlToday": 120.5, "winRate": 0.5}
    ev = tc.shape_evidence(TRADES, ACCOUNTS)
    assert ev["live"]["closed"] == 2 and ev["paper"]["closed"] == 1 and "unknown" not in ev
    pos = tc.shape_positions(TRADES)
    assert [p["id"] for p in pos] == ["t4"]


def test_crew_latest_per_symbol_and_lab():
    crew = tc.shape_crew(SETTINGS[tc.K_REPORTS])
    assert len(crew) == 1 and crew[0]["signal"] == "sell"
    lab = tc.shape_lab(SETTINGS[tc.K_LAB_RUNS])
    assert lab[0]["trades"] == 46 and lab[0]["funded"] == "ACTIVE"


def test_autopilot_next_due_and_lease_note():
    ap = tc.shape_autopilot(SETTINGS, None)
    assert ap["nextDueAt"].startswith("2026-09-22T10:15:00")
    assert "not applied" in ap["leaseNote"]


class _Q:
    """Fake supabase-py query die elke schrijfmethode laat ontploffen."""
    def __init__(self, calls, table):
        self.calls, self.table = calls, table
    def __getattr__(self, name):
        if name in ("insert", "update", "upsert", "delete", "rpc"):
            raise AssertionError(f"write attempted: {name}")
        def f(*a, **k):
            self.calls.append((self.table, name, a))
            return self
        return f
    def execute(self):
        class R: pass
        r = R()
        if self.table == "user_settings":
            r.data = [{"key": k, "value": v} for k, v in SETTINGS.items()]
        elif self.table == "global_memory":
            import json as _json
            r.data = [{"value": _json.dumps(ACCOUNTS), "updated_at": "2026-09-20T03:00:00Z"}]
        elif self.table == "core_trading_trades":
            r.data = TRADES
        else:
            raise RuntimeError("PGRST205 table not found")
        return r


class _Client:
    def __init__(self):
        self.calls = []
    def table(self, name):
        return _Q(self.calls, name)


def test_load_only_reads_and_survives_missing_lease_table():
    c = _Client()
    settings, trades, lease = tc.load(c)
    assert lease is None and trades == TRADES and settings[tc.K_ACCOUNTS] == ACCOUNTS
    assert {name for _, name, _ in c.calls} <= {"select", "eq", "in_", "like", "or_", "order", "limit"}


def test_router_requires_auth():
    pytest.importorskip("fastapi")
    from fastapi import FastAPI, Depends, HTTPException
    from fastapi.testclient import TestClient

    def auth():
        raise HTTPException(status_code=401)
    tc._cache.clear()
    app = FastAPI()
    app.include_router(tc.build_router(_Client), prefix="/trading", dependencies=[Depends(auth)])
    assert TestClient(app).get("/trading/overview").status_code == 401

    open_app = FastAPI()
    open_app.include_router(tc.build_router(_Client), prefix="/trading")
    client = TestClient(open_app)
    r = client.get("/trading/accounts")
    assert r.status_code == 200 and TOKEN not in r.text
    assert client.get("/trading/nope").status_code == 404
    assert client.post("/trading/overview").status_code == 405


def test_accounts_komen_uit_de_geheugentabel_als_user_settings_ze_niet_heeft():
    """De app schrijft accounts via memList onder cfg:trading_accounts, niet in user_settings."""
    class Leeg(_Client):
        def table(self, name):
            q = _Q(self.calls, name)
            if name == "user_settings":
                orig = q.execute
                q.execute = lambda: type("R", (), {"data": [
                    {"key": k, "value": v} for k, v in SETTINGS.items() if k != tc.K_ACCOUNTS]})()
            return q

    c = Leeg()
    settings, _, _ = tc.load(c)
    accounts = tc.shape_accounts(settings[tc.K_ACCOUNTS])
    assert [a["label"] for a in accounts] == ["FTMO 100k", "Demo"]
    assert TOKEN not in json.dumps(tc.shape_overview(settings, TRADES, None))
