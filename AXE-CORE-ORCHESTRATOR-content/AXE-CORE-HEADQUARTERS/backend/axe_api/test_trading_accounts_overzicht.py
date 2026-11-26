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


def test_overzicht_leest_trading_os_uit_dezelfde_database():
    class Q:
        def __init__(self, data): self.data = data
        def select(self, *_): return self
        def order(self, *_, **__): return self
        def limit(self, *_): return self
        def execute(self): return self
    class DB:
        def table(self, naam):
            if naam == "mt5_account_snapshots":
                return Q([{"account_id": "x", "name": "Luka", "server": "Fundedelite-Server", "currency": "USD", "updated_at": "2026-04-21T08:18:25Z"}])
            return Q([])
    uit = t.overzicht(DB())
    assert uit["trading_os"]["bereikbaar"] is True and uit["trading_os"]["gedeeld_met_companion"] is True
    assert uit["trading_os"]["mt5"][0]["server"] == "Fundedelite-Server"


def test_gelijke_accounts_worden_een_regel_met_aantal_en_live_staat_bovenaan():
    rijen = [{"id": f"p{i}", "label": "AXE Alpaca Paper", "provider": "alpaca", "status": "active", "provider_status": "connected",
              "trading_mode": "paper", "last_sync_at": f"2026-11-2{i % 6}T10:00:00Z"} for i in range(39)]
    rijen += [{"id": "v", "label": "Vantage", "provider": "mt5", "status": "inactive", "provider_status": "disconnected",
               "trading_mode": "live", "last_sync_at": None}]
    uit = t.companion_accounts(rijen)["accounts"]
    assert [a["label"] for a in uit] == ["Vantage", "AXE Alpaca Paper"]
    assert uit[1]["aantal"] == 39 and uit[0]["aantal"] == 1
    assert uit[0]["verbonden"] is False
