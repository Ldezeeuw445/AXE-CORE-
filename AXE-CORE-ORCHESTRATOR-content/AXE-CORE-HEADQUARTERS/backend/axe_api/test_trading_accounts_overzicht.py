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


def test_gelijke_accounts_worden_een_regel_met_aantal_en_live_staat_bovenaan():
    rijen = [{"id": f"p{i}", "label": "AXE Alpaca Paper", "provider": "alpaca", "status": "active", "provider_status": "connected",
              "trading_mode": "paper", "last_sync_at": f"2026-11-2{i % 6}T10:00:00Z"} for i in range(39)]
    rijen += [{"id": "v", "label": "Vantage", "provider": "mt5", "status": "inactive", "provider_status": "disconnected",
               "trading_mode": "live", "last_sync_at": None}]
    uit = t.companion_accounts(rijen)["accounts"]
    assert [a["label"] for a in uit] == ["Vantage", "AXE Alpaca Paper"]
    assert uit[1]["aantal"] == 39 and uit[0]["aantal"] == 1
    assert uit[0]["verbonden"] is False
