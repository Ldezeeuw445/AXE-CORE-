from datetime import datetime, timezone

import sleutel_teller as st


def test_naam_van_vindt_de_env_naam_en_nooit_de_waarde():
    env = {"GROQ_LIGHT_API_KEY": "gsk_geheim", "PATH": "gsk_geheim", "ANDERS": "x"}
    assert st.naam_van("gsk_geheim", env) == "GROQ_LIGHT_API_KEY"
    assert st.naam_van("onbekend", env) is None
    assert st.naam_van("", env) is None


def test_tel_en_buffer(monkeypatch):
    monkeypatch.setenv("AXE_SLEUTEL_TELLER_UIT", "1")
    monkeypatch.setenv("TEST_TELLER_API_KEY", "waarde-123")
    st.leeg_buffer()
    nu = datetime(2026, 11, 23, 12, tzinfo=timezone.utc)
    assert st.tel("waarde-123", 200, tokens=50, nu=nu) == "TEST_TELLER_API_KEY"
    st.tel("waarde-123", 429, nu=nu)
    st.tel("waarde-123", 500, nu=nu)
    assert st.tel("niet-bekend", 200, nu=nu) is None
    rijen = st.leeg_buffer()
    assert rijen == [{"p_dag": "2026-11-23", "p_sleutel": "TEST_TELLER_API_KEY", "p_calls": 3, "p_ok": 1,
                      "p_mislukt": 1, "p_limiet": 1, "p_tokens": 50, "p_status": 500}]
    assert st.leeg_buffer() == []


def test_flush_breekt_nooit(monkeypatch):
    monkeypatch.setenv("AXE_SLEUTEL_TELLER_UIT", "1")
    monkeypatch.setenv("TEST_TELLER_API_KEY", "waarde-456")
    st.tel("waarde-456", 200)

    def stuk(_rijen):
        raise RuntimeError("db weg")

    monkeypatch.setattr(st, "_schrijver", stuk)
    assert st.flush() == 0


def test_samenvatting_vandaag_gisteren_week():
    nu = datetime(2026, 11, 23, 12, tzinfo=timezone.utc)
    rijen = [
        {"dag": "2026-11-23", "sleutel": "A_KEY", "calls": 10, "ok": 8, "mislukt": 1, "limiet": 1, "tokens": 900,
         "laatste_status": 429, "laatste_at": "2026-11-23T11:00:00+00:00"},
        {"dag": "2026-11-22", "sleutel": "A_KEY", "calls": 4, "ok": 4, "laatste_status": 200,
         "laatste_at": "2026-11-22T11:00:00+00:00"},
        {"dag": "2026-11-10", "sleutel": "A_KEY", "calls": 99},
    ]
    s = st.samenvatting(rijen, nu)["A_KEY"]
    assert s["calls_today"] == 10 and s["ok_today"] == 8 and s["limited_today"] == 1
    assert s["calls_yesterday"] == 4 and s["calls_7d"] == 14
    assert s["last_status"] == 429


def test_429_zonder_tegoed_telt_als_402(monkeypatch):
    monkeypatch.setenv("AXE_SLEUTEL_TELLER_UIT", "1")
    monkeypatch.setenv("TEST_TELLER_API_KEY", "waarde-789")
    st.leeg_buffer()
    st.tel("waarde-789", 429, tekst='{"error":{"type":"insufficient_quota","code":"credit_balance_exhausted"}}')
    st.tel("waarde-789", 429, tekst="Rate limit exceeded: free-models-per-day")
    rij = st.leeg_buffer()[0]
    assert rij["p_limiet"] == 2 and rij["p_status"] == 429
    assert st.echte_status(429, "insufficient_quota") == 402
    assert st.echte_status(429, "slow down") == 429
