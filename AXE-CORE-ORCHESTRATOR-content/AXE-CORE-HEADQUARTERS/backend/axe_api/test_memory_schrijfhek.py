import memory_schrijfhek as hek


def test_weiger_hold_skip_en_leeg():
    assert hek.is_noop("HOLD score=0.012")
    assert hek.is_noop("no change")
    assert hek.is_noop("skipped")
    assert hek.is_noop('{"action":"hold","score":0.1}')
    assert hek.is_noop("")
    assert not hek.is_noop("stopped out on the retest")


def test_cron_en_cycle_zijn_run_logs():
    assert hek.is_run_log("agent_run:cron:3f6b6442-c959-47dc-9ad5-7abc:1760000000")
    assert hek.is_run_log("agent_run:1760000000:abc123")
    assert hek.is_run_log("ta:axe_trading_agent:cycle:d38b0230-358e-45a7-98aa")
    assert not hek.is_run_log("ta:axe_trading_agent:lesson:XAUUSD:abc")


def test_stabiele_sleutel_plus_hash():
    assert hek.stabiele_sleutel("ta:axe_trading_agent:lesson:XAUUSD:1787700000000") == (
        "ta:axe_trading_agent:lesson:XAUUSD"
    )
    assert hek.stabiele_sleutel(
        "agent_run:cron:3f6b6442-c959-47dc-9ad5-7123456789ab:1760000000"
    ) == "agent_run:cron:3f6b6442-c959-47dc-9ad5-7123456789ab"
    h = hek.inhoud_hash("stopped out on the retest")
    assert hek.sleutel_met_hash("ta:axe_trading_agent:lesson:XAUUSD:1787700000000", h) == (
        f"ta:axe_trading_agent:lesson:XAUUSD:{h}"
    )
    assert len(h) == 16
    assert hek.inhoud_hash("  les  ") == hek.inhoud_hash("les")


def test_cap_en_duplicaat():
    les = "sized too wide into news"
    assert hek.mag_schrijven(content=les) == "ok"
    assert hek.mag_schrijven(content=les, bestaande_hash=hek.inhoud_hash(les)) == "duplicate"
    assert hek.mag_schrijven(content=les, vandaag_al=hek.GEHEUGEN_MAG_PER_DAG) == "cap"
    assert hek.mag_schrijven(content="HOLD score=0.1") == "noop"
    assert hek.mag_schrijven(key="agent_run:cron:x:1", content="Cron fired") == "run_log"


def test_herschrijf_zet_hash_in_sleutel_en_weiger_cron():
    reden, uit = hek.herschrijf("memory", {
        "agent": "axe_trader",
        "key": "ta:axe_trading_agent:lesson:XAUUSD:1787700000000",
        "content": "sized too wide into news",
    })
    assert reden == "ok" and uit is not None
    h = hek.inhoud_hash("sized too wide into news")
    assert uit["key"] == f"ta:axe_trading_agent:lesson:XAUUSD:{h}"
    assert uit["metadata"]["content_hash"] == h

    reden, uit = hek.herschrijf("global_memory", {
        "key": "agent_run:cron:abc:1760000000",
        "value": "Cron fired: desk -> ok",
    })
    assert reden == "run_log" and uit is None
