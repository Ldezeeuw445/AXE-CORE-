import markt_dag as md

YAHOO = {"chart": {"result": [{"timestamp": [1, 2, 3],
          "indicators": {"quote": [{"open": [5.4, None, 5.5], "high": [5.5, None, 5.7],
                                     "low": [5.3, None, 5.4], "close": [5.477, None, 5.603]}]}}]}}


def test_gaten_eruit_en_verandering_tegen_de_vorige_dag():
    balken = md.dag_balken(YAHOO)
    assert [b["c"] for b in balken] == [5.477, 5.603] and balken[0]["t"] == 1000
    s = md.samenvatting("XCUUSD", balken)
    assert s["ok"] and s["source"] == "yahoo" and s["last"] == 5.603
    assert round(s["changePct"], 2) == 2.3


def test_geen_data_is_geen_prijs():
    assert md.dag_balken({"chart": {"result": None}}) == []
    s = md.samenvatting("DXY", [])
    assert s["ok"] is False and "last" not in s


def test_alleen_de_drie_desk_symbolen():
    assert set(md.DESK_SYMBOLEN) == {"XCUUSD", "BCOUSD", "DXY"}
