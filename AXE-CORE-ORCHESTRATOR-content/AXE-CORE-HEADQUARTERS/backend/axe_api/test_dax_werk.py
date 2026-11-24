from datetime import datetime, timedelta, timezone

import dax_werk as dw

NU = datetime(2026, 11, 24, 12, tzinfo=timezone.utc)


def t(agent, status, uur=1, titel="x"):
    m = (NU - timedelta(hours=uur)).isoformat()
    return {"assignee": agent, "status": status, "title": titel, "updated_at": m, "completed_at": m}


def test_status_uit_echt_werk_niet_ready():
    taken = [t("northsea", "completed", 2, "Follow-up DEAL-002"), t("northsea", "completed", 30),
             t("northsea", "running"), t("trading", "failed", 3)]
    ns = dw.werk("northsea", taken, NU, pending_ok=1)
    assert ns["stand"] == "needs_you" and ns["wacht"] == 1 and ns["open"] == 1 and ns["klaar_24u"] == 1
    assert ns["laatste_klaar"] == "Follow-up DEAL-002"
    assert ns["regel"] == "1 open · 1 waiting on you · 1 deal actions done (24h)"
    tr = dw.werk("trading", taken, NU, meting="12/13 feeds fresh, 1 failing")
    assert tr["stand"] == "failing" and "1 failed" in tr["regel"] and tr["regel"].endswith("1 failing")
    assert dw.werk("browser", taken, NU)["stand"] == "idle"


def test_feed_meting():
    rijen = [{"last_sync_at": (NU - timedelta(hours=1)).isoformat(), "last_error": ""},
             {"last_sync_at": (NU - timedelta(days=3)).isoformat(), "last_error": "429"}]
    assert dw.feed_meting(rijen, NU) == "1/2 feeds fresh, 1 failing"
