"""Slotscherm-samenstelling: de parsers en de regels, met uitvoer zoals de echte machines die geven."""
import asyncio
from datetime import datetime, timezone

import lockscreen as ls

TOP = "CPU usage: 8.33% user, 12.5% sys, 79.16% idle \n"
VM = """Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               12000.
Pages active:                            200000.
Pages inactive:                          190000.
Pages speculative:                         5000.
Pages wired down:                        100000.
Pages occupied by compressor:             50000.
"""
DF = "/dev/disk3s5   488245288 300000000 150000000    67%  1000 2000 100% /System/Volumes/Data"
PROBE = f"{TOP}---\n{VM}---\n8589934592\n---\n{DF}\n"
NOW = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)


def test_cpu_is_100_minus_idle():
    assert ls.parse_top_cpu(TOP) == 20.8
    assert ls.parse_top_cpu("geen cpu hier") is None
    assert ls.parse_top_cpu("100.0% idle") == 0.0
    assert ls.parse_top_cpu("0.0% idle") == 100.0


def test_memory_counts_active_wired_and_compressed_only():
    # (200000 + 100000 + 50000) pages * 16384 = 5_734_400_000 bytes of 8 GiB
    pct = ls.parse_vm_stat(VM, 8 * 1024**3)
    assert pct == round(350000 * 16384 / (8 * 1024**3) * 100, 1)
    assert 60 < pct < 70


def test_inactive_memory_is_not_counted():
    # De fout die dit scherm permanent alarm zou laten slaan: inactief meetellen.
    with_inactive = (200000 + 100000 + 50000 + 190000) * 16384 / (8 * 1024**3) * 100
    assert ls.parse_vm_stat(VM, 8 * 1024**3) < round(with_inactive, 1)


def test_memory_parser_survives_garbage_and_zero_memsize():
    assert ls.parse_vm_stat("", 8 * 1024**3) is None
    assert ls.parse_vm_stat("nonsense", 8 * 1024**3) is None
    assert ls.parse_vm_stat(VM, 0) is None


def test_df_uses_used_over_used_plus_available_not_the_printed_capacity():
    # APFS' "Capacity" kolom telt snapshots en zusterschijven mee; used/(used+avail) is wat je kwijt bent.
    assert ls.parse_df_line(DF) == round(300000000 / 450000000 * 100, 1)
    assert ls.parse_df_line("") is None
    assert ls.parse_df_line("a b c d") is None


def test_the_whole_probe_parses_and_a_broken_section_only_blanks_itself():
    r = ls.parse_mac_probe(PROBE)
    assert r["cpu"] == 20.8 and r["mem"] is not None and r["disk"] is not None
    broken = ls.parse_mac_probe(f"{TOP}---\n---\n8589934592\n---\n{DF}\n")
    assert broken["cpu"] == 20.8 and broken["mem"] is None and broken["disk"] is not None
    assert ls.parse_mac_probe("")["cpu"] is None


def candles(*closes, t0="2026-10-06 00:00:00"):
    return [{"time": f"2026-10-06 {h:02d}:00:00", "close": c} for h, c in enumerate(closes)]


def test_summary_price_spark_and_windows():
    cs = candles(*[100 + i for i in range(26)])  # 100..125
    s = ls.candle_summary(cs)
    assert s["price"] == 125
    assert len(s["spark"]) == 24 and s["spark"][-1] == 125
    assert s["chg"]["1H"]["abs"] == 1.0
    assert s["chg"]["4H"]["abs"] == 4.0
    assert s["chg"]["1D"]["abs"] == 24.0
    assert s["chg"]["1H"]["pct"] == round(1 / 124 * 100, 2)


def test_summary_does_not_care_which_way_the_source_sorts():
    asc = candles(10, 11, 12, 13)
    s_asc = ls.candle_summary(asc)
    s_desc = ls.candle_summary(list(reversed(asc)))
    assert s_asc["price"] == s_desc["price"] == 13
    assert s_asc["spark"] == s_desc["spark"]


def test_summary_with_too_little_data_is_none_not_a_made_up_zero():
    assert ls.candle_summary([]) is None
    assert ls.candle_summary(candles(5)) is None
    assert ls.candle_summary([{"time": "x"}, {"close": 1}]) is None


def test_a_short_history_still_gives_a_window_from_the_oldest_candle():
    s = ls.candle_summary(candles(100, 110))
    assert s["chg"]["1D"]["abs"] == 10.0


def test_symbols_parse_and_fall_back():
    assert ls.parse_symbols("XAU/USD:XAUUSD,SPY") == (("XAU/USD", "XAUUSD"), ("SPY", "SPY"))
    assert ls.parse_symbols("BTC/USD") == (("BTC/USD", "BTCUSD"),)
    assert ls.parse_symbols("") == ls.DEFAULT_SYMBOLS
    assert ls.parse_symbols(None) == ls.DEFAULT_SYMBOLS
    assert ls.parse_symbols(" , ") == ls.DEFAULT_SYMBOLS


def test_attention_orders_by_severity_then_recency():
    approvals = [{"title": "Yes needed: DEAL-002", "created_at": "2026-10-06T10:00:00+00:00"}]
    failed = [{"name": "daily report", "last_run_at": "2026-10-06T11:30:00+00:00"}]
    notes = [{"message": "Backup klaar", "created_at": "2026-10-06T11:55:00+00:00"}]
    out = ls.attention_items(approvals, failed, notes, NOW)
    assert [i["severity"] for i in out] == ["critical", "warning", "info"]
    assert out[0]["ago_s"] == 2 * 3600
    assert out[1]["title"] == "Cron: daily report failed"


def test_the_same_question_three_times_is_one_row_with_a_count():
    a = [{"title": "Yes needed: DEAL-002", "created_at": f"2026-10-06T0{h}:00:00+00:00"} for h in (7, 8, 9)]
    out = ls.attention_items(a, [], [], NOW)
    assert len(out) == 1 and out[0]["count"] == 3
    assert out[0]["ago_s"] == 3 * 3600   # de nieuwste telt


def test_same_severity_newest_first():
    n = [{"message": "oud", "created_at": "2026-10-06T08:00:00+00:00"},
         {"message": "nieuw", "created_at": "2026-10-06T11:00:00+00:00"}]
    assert [i["title"] for i in ls.attention_items([], [], n, NOW)] == ["nieuw", "oud"]


def test_a_row_without_a_timestamp_goes_last_but_is_not_dropped():
    n = [{"message": "zonder tijd"}, {"message": "met tijd", "created_at": "2026-10-06T11:00:00+00:00"}]
    out = ls.attention_items([], [], n, NOW)
    assert [i["title"] for i in out] == ["met tijd", "zonder tijd"]


def test_empty_messages_are_ignored_and_only_the_first_line_is_shown():
    out = ls.attention_items([], [], [{"message": "   "}, {"message": "Titel\nrest van de tekst"}], NOW)
    assert [i["title"] for i in out] == ["Titel"]


def test_machine_row_none_is_offline_with_blank_numbers():
    r = ls.machine_row("imac", "iMac", None)
    assert r["online"] is False and r["cpu"] is None
    r2 = ls.machine_row("vps", "VPS", {"cpu": 14.0, "mem": 41.0, "disk": 37.0})
    assert r2["online"] is True and r2["mem"] == 41.0


def test_assemble_counts_the_attention_total_over_duplicates():
    att = [{"severity": "critical", "title": "x", "ago_s": 1, "route": "/", "count": 3},
           {"severity": "info", "title": "y", "ago_s": 2, "route": "/", "count": 1}]
    r = ls.assemble([], [], [], att, NOW)
    assert r["attention_total"] == 4


def test_cache_returns_the_stored_value_within_ttl_and_refetches_after():
    t = [0.0]
    cache = ls.TTLCache(klok=lambda: t[0])
    calls = []

    async def fetch():
        calls.append(1)
        return len(calls)

    async def go():
        a = await cache.get("k", 60, fetch)
        t[0] = 30
        b = await cache.get("k", 60, fetch)
        t[0] = 61
        c = await cache.get("k", 60, fetch)
        return a, b, c

    assert asyncio.run(go()) == (1, 1, 2)


def test_an_approval_is_not_repeated_as_its_own_notification():
    a = [{"title": "Yes needed: DEAL-002 — Copper Cathode", "created_at": "2026-10-06T10:00:00+00:00"}]
    n = [{"type": "warning", "message": "Yes needed: DEAL-002 — Copper Cathode: Deal: DEAL-002", "created_at": "2026-10-06T10:00:01+00:00"},
         {"type": "warning", "message": "Groq is niet meer bereikbaar", "created_at": "2026-10-06T11:00:00+00:00"}]
    out = ls.attention_items(a, [], n, NOW)
    assert [i["title"] for i in out] == ["Yes needed: DEAL-002 — Copper Cathode", "Groq is niet meer bereikbaar"]
    assert out[0]["count"] == 1


def test_notification_type_sets_severity():
    n = [{"type": "error", "message": "kapot", "created_at": "2026-10-06T11:00:00+00:00"},
         {"type": "warning", "message": "pas op", "created_at": "2026-10-06T11:00:00+00:00"},
         {"type": "info", "message": "fyi", "created_at": "2026-10-06T11:00:00+00:00"},
         {"message": "geen type", "created_at": "2026-10-06T11:00:00+00:00"}]
    sev = {i["title"]: i["severity"] for i in ls.attention_items([], [], n, NOW)}
    assert sev == {"kapot": "critical", "pas op": "warning", "fyi": "info", "geen type": "info"}


def test_parse_linux_probe_reads_cpu_mem_and_disk():
    # 1000 -> 2000 ticks in totaal, 900 -> 1500 idle: 40% in gebruik. 16 GB totaal, 6 GB beschikbaar: 62,5%.
    out = "CPU 1000 900 2000 1500\nMEM 16000000 6000000\nDISK 13%\n"
    assert ls.parse_linux_probe(out) == {"cpu": 40.0, "mem": 62.5, "disk": 13.0}


def test_parse_linux_probe_survives_garbage_per_field():
    got = ls.parse_linux_probe("CPU x y\nMEM 0 0\nDISK 57%\nrommel")
    assert got == {"cpu": None, "mem": None, "disk": 57.0}
    assert ls.parse_linux_probe("") == {"cpu": None, "mem": None, "disk": None}


def test_parse_linux_probe_idle_box_never_goes_below_zero():
    assert ls.parse_linux_probe("CPU 1000 1000 2000 2000\n")["cpu"] == 0.0
