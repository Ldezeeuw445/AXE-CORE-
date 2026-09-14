"""Tests voor mcp_hub: het protocol lezen, sleutels vinden, grenzen bewaken. Geen netwerk."""
import asyncio

import httpx
import pytest

import mcp_hub as h


def antwoord(tekst, soort="application/json"):
    return httpx.Response(200, headers={"content-type": soort}, text=tekst)


class TestBerichten:
    def test_leest_gewone_json(self):
        assert h.lees_bericht(antwoord('{"jsonrpc":"2.0","id":3,"result":{"ok":1}}'), 3)["result"] == {"ok": 1}

    def test_leest_het_juiste_bericht_uit_een_sse_stroom(self):
        sse = 'event: message\ndata: {"jsonrpc":"2.0","method":"log"}\n\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n\n'
        assert h.lees_bericht(antwoord(sse, "text/event-stream"), 2)["result"] == {"tools": []}

    def test_sse_zonder_antwoord_is_een_fout(self):
        with pytest.raises(h.McpFout):
            h.lees_bericht(antwoord("data: {}\n\n", "text/event-stream"), 9)


class TestSleutels:
    def test_volgorde_omgeving_dan_eigen_bestand_dan_vault(self, tmp_path, monkeypatch):
        eigen = tmp_path / "eigen.env"
        vault = tmp_path / "vault.env"
        vault.write_text("SUPABASE_ACCESS_TOKEN=uit-vault\n")
        monkeypatch.setattr(h, "SLEUTEL_BESTAND", str(eigen))
        monkeypatch.setattr(h, "VAULT", str(vault))
        monkeypatch.delenv("SUPABASE_ACCESS_TOKEN", raising=False)
        assert h.sleutel_voor("supabase") == ("uit-vault", "vault (SUPABASE_ACCESS_TOKEN)")
        h.bewaar_sleutel("supabase", "zelf-ingevuld")
        assert h.sleutel_voor("supabase")[1].startswith("ingevuld in AXE")
        assert oct(eigen.stat().st_mode)[-3:] == "600"
        monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "uit-omgeving")
        assert h.sleutel_voor("supabase")[1].startswith("omgeving")

    def test_het_overzicht_noemt_nooit_een_waarde(self, monkeypatch):
        monkeypatch.setenv("PERPLEXITY_API_KEY", "geheim-12345678")
        assert "geheim-12345678" not in str(h.overzicht())


class TestGrenzen:
    def test_perplexity_alleen_zoeken(self):
        tools = [{"name": "perplexity_search"}, {"name": "perplexity_research"}]
        assert [t["name"] for t in h.zichtbare_tools("perplexity", tools)] == ["perplexity_search"]

    def test_een_dichte_tool_wordt_niet_aangeroepen(self):
        r = asyncio.run(h.roep("perplexity", "perplexity_research", {}))
        assert r["status"] == "error" and "niet open" in r["error"]

    def test_dagbudget(self):
        assert h.mag_nog("perplexity", "2026-09-14", {"2026-09-14": {"perplexity": 24}})
        assert not h.mag_nog("perplexity", "2026-09-14", {"2026-09-14": {"perplexity": 25}})
        assert h.mag_nog("github", "2026-09-14", {"2026-09-14": {"github": 999}})

    def test_supabase_staat_op_alleen_lezen(self):
        assert "read_only=true" in h.SERVERS["supabase"]["url"]
