"""Dagbudget en cache: handel eerst, overig stopt eerder, 429 sluit de dag."""
import os
import tempfile

import twelvedata_budget as tb


def _leeg_pad():
    d = tempfile.TemporaryDirectory()
    os.environ["TWELVEDATA_BUDGET"] = os.path.join(d.name, "budget.json")
    return d


def test_handel_mag_tot_de_limiet_overig_stopt_eerder():
    tmp = _leeg_pad()
    try:
        assert tb.mag("handel") and tb.mag("overig")
        tb.boek(tb.OVERIG_MAX)
        assert tb.mag("handel") is True
        assert tb.mag("overig") is False
        tb.boek(tb.DAG_LIMIET - tb.OVERIG_MAX)
        assert tb.mag("handel") is False
        assert tb.stand()["used"] == tb.DAG_LIMIET
    finally:
        tmp.cleanup()
        os.environ.pop("TWELVEDATA_BUDGET", None)


def test_cache_raakt_twee_workers_dezelfde_hit():
    tmp = _leeg_pad()
    try:
        tb.cache_put("XAU/USD", "1h", 50, {"ok": True, "candles": [1]}, nu=1000)
        assert tb.cache_get("XAU/USD", "1h", 50, nu=1000 + 60)["candles"] == [1]
        assert tb.cache_get("XAU/USD", "1h", 50, nu=1000 + tb.CACHE_TTL_S + 1) is None
        tb.cache_put("XAU/USD", "1h", 50, {"ok": False}, nu=1000)
        # Een misser overschrijft een goede hit niet.
        assert tb.cache_get("XAU/USD", "1h", 50, nu=1060)["candles"] == [1]
    finally:
        tmp.cleanup()
        os.environ.pop("TWELVEDATA_BUDGET", None)


def test_apikey_in_url_wordt_weggefilterd():
    import logging
    import re
    from logging import LogRecord

    pat = re.compile(r"(?i)((?:api[_-]?key|apikey|authorization|token)=)[^&\s]+")

    class F(logging.Filter):
        def filter(self, record: LogRecord) -> bool:
            record.msg = pat.sub(r"\1REDACTED", record.getMessage())
            record.args = ()
            return True

    rec = LogRecord("httpx", logging.INFO, "", 0,
                    "HTTP Request: GET https://api.twelvedata.com/time_series?apikey=SECRET123&order=ASC", (), None)
    F().filter(rec)
    assert "SECRET123" not in rec.getMessage()
    assert "apikey=REDACTED" in rec.getMessage()


def test_429_sluit_de_dag_ook_onder_de_limiet():
    tmp = _leeg_pad()
    try:
        tb.boek(3)
        assert tb.mag("handel")
        tb.uitgeput()
        assert tb.mag("handel") is False
        assert tb.credits_op("TwelveData: You have run out of API credits for the day. 1014 API credits were used, limit 800")
    finally:
        tmp.cleanup()
        os.environ.pop("TWELVEDATA_BUDGET", None)
