"""northsea.lees_rijen: het antwoord van de Supabase-MCP uitpakken. Geen netwerk."""
import json

import pytest

import northsea as n

RIJ = [{"data": {"pipeline": 55, "acties": []}}]


def test_leest_de_array_tussen_de_untrusted_labels():
    tekst = f"Below is the result...\n<untrusted-data-abc>\n{json.dumps(RIJ)}\n</untrusted-data-abc>\nUse this data..."
    assert n.lees_rijen(tekst) == RIJ


def test_pakt_eerst_een_result_verpakking_uit():
    binnen = f"Below...\n<untrusted-data-x>\n{json.dumps(RIJ)}\n</untrusted-data-x>"
    assert n.lees_rijen(json.dumps({"result": binnen})) == RIJ


def test_haken_in_de_waarschuwingstekst_breken_niets():
    # De data zelf mag [ en ] bevatten; alleen het blok tussen de labels telt.
    rij = [{"data": {"titel": "Offer [draft] ready"}}]
    tekst = f"Note [important]\n<untrusted-data-y>\n{json.dumps(rij)}\n</untrusted-data-y>"
    assert n.lees_rijen(tekst) == rij


def test_onzin_is_een_fout_en_geen_lege_desk():
    with pytest.raises(n.NorthseaFout):
        n.lees_rijen("<untrusted-data-z>\n[kapot\n</untrusted-data-z>")


def test_een_ontbrekende_hub_verbinding_is_een_leesbare_fout_en_geen_kale_keyerror(monkeypatch):
    # Op de VPS bestaat 'supabase-axe-commodities' niet (hij staat op de agent-host).
    # mcp_hub.roep gooit dan een KeyError; die kwam als 500 zonder CORS-koppen uit de
    # route, waardoor de telefoon alleen "Failed to fetch" kon melden.
    import asyncio

    async def roep(*_a, **_k):
        raise KeyError(n.VERBINDING)

    monkeypatch.setattr(n.mcp_hub, "roep", roep)
    with pytest.raises(n.NorthseaFout) as e:
        asyncio.run(n._vraag("select 1"))
    assert n.VERBINDING in str(e.value)
    assert "Mac mini" in str(e.value)
