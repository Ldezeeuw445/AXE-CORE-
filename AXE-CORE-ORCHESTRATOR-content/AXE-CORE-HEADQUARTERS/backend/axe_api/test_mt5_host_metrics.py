from datetime import datetime, timezone, timedelta

import mt5_host_metrics as m

NOW = datetime(2026, 11, 27, 16, 0, tzinfo=timezone.utc)


def _row(cpu=10, mem=20, disk=30, source="endpoint", at="2026-11-27T15:59:00Z"):
    return {"cpu": cpu, "mem": mem, "disk": disk, "source": source, "measured_at": at}


def test_normalize_drops_account_fields_and_rejects_empty():
    n = m.normalize({"cpu": 12.34, "mem": 40, "disk": 16, "login": 123456, "accountId": "x", "token": "nope"}, "endpoint", "2026-11-27T15:00:00Z")
    assert n == {"cpu": 12.3, "mem": 40.0, "disk": 16.0, "source": "endpoint", "measured_at": "2026-11-27T15:00:00Z"}
    assert m.normalize({"ok": True, "trading": True}, "endpoint") is None
    assert m.has_numbers({"cpu": None, "mem": None, "disk": None}) is False


def test_choose_prefers_a_fresh_endpoint_and_skips_inventing():
    picked = m.choose(_row(at="2026-11-27T16:00:00Z"), _row(cpu=1, mem=1, disk=1, source="ssh", at="2026-11-27T15:50:00Z"), None, now=NOW)
    assert picked["cpu"] == 10 and picked["source"] == "endpoint" and picked["stale"] is False
    assert picked["age_seconds"] == 0
    empty = m.choose({"ok": False}, None, None, now=NOW)
    assert empty["cpu"] is None and empty["source"] is None and empty["stale"] is False


def test_choose_falls_back_to_ssh_then_to_last_good_and_marks_stale():
    ssh = m.choose(None, _row(cpu=7, mem=8, disk=9, source="ssh", at="2026-11-27T15:59:30Z"), _row(at="2026-11-27T15:00:00Z"), now=NOW)
    assert ssh["cpu"] == 7 and ssh["source"] == "ssh" and ssh["stale"] is False
    stale = m.choose(None, None, _row(at="2026-11-27T15:50:00Z"), now=NOW)
    assert stale["cpu"] == 10 and stale["source"] == "endpoint"
    assert stale["age_seconds"] == 600 and stale["stale"] is True


def test_choose_prefers_the_newer_reading_even_if_it_is_ssh():
    picked = m.choose(_row(at="2026-11-27T15:58:00Z"), _row(cpu=3, mem=3, disk=3, source="ssh", at="2026-11-27T16:00:00Z"), None, now=NOW)
    assert picked["source"] == "ssh" and picked["cpu"] == 3 and picked["stale"] is False


def test_is_fresh_uses_the_two_minute_window():
    assert m.is_fresh(_row(at="2026-11-27T15:58:01Z"), now=NOW) is True
    assert m.is_fresh(_row(at="2026-11-27T15:57:59Z"), now=NOW) is False
    assert m.is_fresh({"cpu": 1, "mem": 1, "disk": 1, "source": "ssh"}, now=NOW) is True


def test_last_good_remembers_a_fresh_row_and_ignores_a_stale_echo(tmp_path):
    pad = tmp_path / "cache.json"
    store = m.LastGood(str(pad))
    store.put({**_row(at="2026-11-27T15:59:00Z"), "stale": False})
    assert store.get()["cpu"] == 10
    store.put({**_row(cpu=99, mem=99, disk=99, at="2026-11-27T15:00:00Z"), "stale": True})
    assert store.get()["cpu"] == 10
    again = m.LastGood(str(pad))
    assert again.get()["mem"] == 20 and "login" not in (again.get() or {})


def test_snapshot_row_keeps_online_false_with_last_good_numbers():
    picked = m.choose(None, None, _row(at="2026-11-27T15:00:00Z"), now=NOW)
    row = m.snapshot_row(False, picked)
    assert row["id"] == "mt5bridge" and row["name"] == "VPS MT5 bridge"
    assert row["online"] is False and row["cpu"] == 10 and row["stale"] is True
    assert set(row) == {"id", "name", "online", "cpu", "mem", "disk", "source", "measured_at", "age_seconds", "stale"}
