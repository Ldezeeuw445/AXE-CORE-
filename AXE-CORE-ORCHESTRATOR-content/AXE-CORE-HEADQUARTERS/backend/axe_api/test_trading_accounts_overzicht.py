import trading_accounts_overzicht as t


def test_demo_testrijen_worden_een_getal_en_geheimen_gaan_niet_mee():
    rijen = [
        {"id": "a", "label": "100K 1STEP UPCOMERS", "provider": "mt5", "status": "active", "provider_status": "connected",
         "connection_method": "cloud_mt5", "trading_mode": "live", "masked_login": "••••7717", "last_sync_at": "2026-11-26T17:50:00Z",
         "mt5_login": "GEHEIM", "raw": {"token": "x"}},
        *[{"id": f"d{i}", "label": "AXE Demo Account", "provider": "demo", "connection_method": "demo_paper"} for i in range(28)],
    ]
    uit = t.companion_accounts(rijen)
    assert uit["demo_testrijen"] == 28
    assert len(uit["accounts"]) == 1
    a = uit["accounts"][0]
    assert a["label"] == "100K 1STEP UPCOMERS" and a["verbonden"] is True and a["login"] == "••••7717"
    assert "GEHEIM" not in str(uit) and "token" not in str(uit)


def test_overzicht_zegt_eerlijk_dat_trading_os_niet_bereikbaar_is():
    class DB:
        def table(self, _):
            raise RuntimeError("geen db")
    uit = t.overzicht(DB())
    assert "fout" in uit["companion"]
    assert uit["trading_os"]["bereikbaar"] is False
