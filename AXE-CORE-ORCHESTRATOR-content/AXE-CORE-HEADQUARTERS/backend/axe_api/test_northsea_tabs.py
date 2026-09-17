"""northsea.tab: de data per tabblad van de NorthSea-desk. Geen netwerk: de MCP-hub is nagebootst."""
import asyncio
import json
import re

import pytest

import northsea as n

TABS = ("deals", "pipeline", "tegenpartijen", "communicatie", "documenten", "bewijs", "automatisering", "rapporten", "werk")


def _antwoord(data):
    """Zoals de Supabase-MCP antwoordt: tekst met de JSON-array tussen untrusted-labels."""
    tekst = f"Below is the result...\n<untrusted-data-t>\n{json.dumps([{'data': data}])}\n</untrusted-data-t>"
    return {"status": "ok", "result": {"content": [{"type": "text", "text": tekst}]}}


@pytest.fixture(autouse=True)
def _schone_cache():
    n._tab_cache.clear()
    yield
    n._tab_cache.clear()


def test_elk_tabblad_heeft_een_query():
    assert set(n.TAB_SQL) == set(TABS)


def test_communicatie_query_levert_concepttekst_voor_preview():
    sql = n.TAB_SQL["communicatie"]
    assert "rd.body" in sql
    assert "left(rd.body" in sql.lower() or "left(rd.body" in sql
    assert "deal_product" in sql
    assert "buyer_requirements" in sql
    assert "supplier_offers" in sql


@pytest.mark.parametrize("naam", TABS)
def test_elke_query_leest_alleen(naam):
    sql = n.TAB_SQL[naam].lower()
    assert sql.lstrip().startswith(("with", "select"))
    # Geen schrijvende of schema-wijzigende sleutelwoorden, ook niet verstopt na een puntkomma.
    assert not re.search(r"\b(insert|update|delete|drop|alter|truncate|grant|create)\b", sql)
    assert ";" not in sql.strip().rstrip(";")


def test_onbekend_tabblad_is_een_fout_zonder_query(monkeypatch):
    geroepen = []

    async def roep(*a, **k):
        geroepen.append(a)
        return _antwoord({})

    monkeypatch.setattr(n.mcp_hub, "roep", roep)
    with pytest.raises(n.OnbekendTabblad):
        asyncio.run(n.tab("drop table companies"))
    assert geroepen == []


def test_haalt_de_data_van_het_tabblad_via_de_alleen_lezen_verbinding(monkeypatch):
    gezien = {}

    async def roep(verbinding, tool, args):
        gezien.update(verbinding=verbinding, tool=tool, query=args["query"])
        return _antwoord({"bedrijven": [{"id": "x"}]})

    monkeypatch.setattr(n.mcp_hub, "roep", roep)
    data = asyncio.run(n.tab("tegenpartijen"))
    assert data == {"bedrijven": [{"id": "x"}]}
    assert gezien["verbinding"] == n.VERBINDING and gezien["tool"] == "execute_sql"
    assert gezien["query"] == n.TAB_SQL["tegenpartijen"]


def test_cache_per_tabblad_en_vers_slaat_hem_over(monkeypatch):
    aanroepen = []

    async def roep(verbinding, tool, args):
        aanroepen.append(args["query"])
        return _antwoord({"n": len(aanroepen)})

    monkeypatch.setattr(n.mcp_hub, "roep", roep)
    assert asyncio.run(n.tab("bewijs")) == {"n": 1}
    assert asyncio.run(n.tab("bewijs")) == {"n": 1}          # uit de cache
    assert asyncio.run(n.tab("documenten")) == {"n": 2}      # ander tabblad, eigen cache
    assert asyncio.run(n.tab("bewijs", vers=True)) == {"n": 3}


def test_een_fout_van_supabase_wordt_een_northseafout_en_komt_niet_in_de_cache(monkeypatch):
    async def roep(*a, **k):
        return {"status": "error", "error": "verbinding weg"}

    monkeypatch.setattr(n.mcp_hub, "roep", roep)
    with pytest.raises(n.NorthseaFout, match="verbinding weg"):
        asyncio.run(n.tab("pipeline"))
    assert "pipeline" not in n._tab_cache
