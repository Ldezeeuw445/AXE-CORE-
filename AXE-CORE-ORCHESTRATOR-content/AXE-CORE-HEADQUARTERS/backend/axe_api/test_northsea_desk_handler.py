import pytest

from northsea_desk_handler import dry_run_tick, mag_niet_verzenden, NorthSeaWeigering


def test_weiger_expliciete_send():
    assert mag_niet_verzenden({"payload": {"send": True}, "execution_mode": "execute"})


def test_leest_notice_met_sent_in_titel():
    """Een afgeronde 'PO sent'-notice is geschiedenis, geen verzendopdracht."""
    assert mag_niet_verzenden({
        "title": "Copper PO sent",
        "goal": "Desk run recorded a sent draft yesterday.",
        "execution_mode": "read",
        "payload": {},
    }) is None


def test_dry_run_zonder_token():
    with pytest.raises(RuntimeError, match="no token"):
        dry_run_tick(token="")


def test_dry_run_forceert_query_en_nult_sent():
    gezien = {}

    class R:
        status_code = 200
        def json(self):
            return {"sent": 0, "dry_run": True, "notices": []}

    def post(url, **kw):
        gezien["url"] = url
        gezien["kw"] = kw
        return R()

    uit = dry_run_tick(token="abc", url="http://127.0.0.1:8040/internal/engine/tick", post=post)
    assert gezien["kw"]["params"]["dry_run"] == "1"
    assert uit["sent"] == 0


def test_dry_run_met_sent_stopt():
    class R:
        status_code = 200
        def json(self):
            return {"sent": 2, "dry_run": True}

    with pytest.raises(NorthSeaWeigering):
        dry_run_tick(token="abc", post=lambda *a, **k: R())


def test_http_fout_is_reconnect():
    class R:
        status_code = 503
        text = "down"
        def json(self):
            raise ValueError("no json")

    with pytest.raises(RuntimeError, match="Reconnect"):
        dry_run_tick(token="abc", post=lambda *a, **k: R())


def test_handler_schrijft_draft_samenvatting():
    import asyncio
    from northsea_desk_handler import northsea_desk_handler

    events = []

    class Ctx:
        async def event(self, kind, msg, data=None):
            events.append((kind, msg))

    import northsea_desk_handler as h
    orig = h.dry_run_tick
    h.dry_run_tick = lambda: {"sent": 0, "notices": [{"titel": "draft"}], "summary": {"followups": 0}}
    try:
        uit = asyncio.run(northsea_desk_handler(
            {"title": "Desk run", "execution_mode": "read", "payload": {}},
            Ctx(),
        ))
    finally:
        h.dry_run_tick = orig
    assert uit["sent"] == 0 and uit["dry_run"] is True
    assert "sent 0" in uit["summary"]
    assert events
