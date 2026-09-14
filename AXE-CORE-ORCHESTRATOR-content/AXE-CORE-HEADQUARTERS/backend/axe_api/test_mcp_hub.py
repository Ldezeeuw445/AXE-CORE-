"""Tests voor mcp_hub: protocol lezen, verbindingen, sleutels, grenzen. Geen netwerk."""
import asyncio
import json
import sys

import httpx
import pytest

import mcp_hub as h


def antwoord(tekst, soort="application/json"):
    return httpx.Response(200, headers={"content-type": soort}, text=tekst)


@pytest.fixture
def schoon(tmp_path, monkeypatch):
    monkeypatch.setattr(h, "SLEUTEL_BESTAND", str(tmp_path / "sleutels.env"))
    monkeypatch.setattr(h, "VERBINDINGEN_BESTAND", str(tmp_path / "verbindingen.json"))
    monkeypatch.setattr(h, "VAULT", str(tmp_path / "vault.env"))
    for naam in ("SUPABASE_ACCESS_TOKEN", "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"):
        monkeypatch.delenv(naam, raising=False)
    return tmp_path


class TestBerichten:
    def test_leest_gewone_json(self):
        assert h.lees_bericht(antwoord('{"jsonrpc":"2.0","id":3,"result":{"ok":1}}'), 3)["result"] == {"ok": 1}

    def test_leest_het_juiste_bericht_uit_een_sse_stroom(self):
        sse = 'data: {"jsonrpc":"2.0","method":"log"}\n\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n\n'
        assert h.lees_bericht(antwoord(sse, "text/event-stream"), 2)["result"] == {"tools": []}

    def test_sse_zonder_antwoord_is_een_fout(self):
        with pytest.raises(h.McpFout):
            h.lees_bericht(antwoord("data: {}\n\n", "text/event-stream"), 9)


class TestVerbindingen:
    def test_drie_supabase_projecten_elk_hun_eigen_adres(self, schoon):
        h.voeg_toe("supabase", "Companion", {"project_ref": "abcdefghij"})
        h.voeg_toe("supabase", "Axon", {"project_ref": "klmnopqrst"})
        alle = h.verbindingen()
        assert {"supabase", "supabase-companion", "supabase-axon"} <= set(alle)
        assert "project_ref=abcdefghij" in h.url_voor("supabase-companion")
        assert "project_ref=pqnngpcgbdwxavbatbia" in h.url_voor("supabase")
        assert all("read_only=true" in h.url_voor(v) for v in ("supabase", "supabase-companion"))

    def test_vreemde_tekens_en_dubbele_namen_worden_geweigerd(self, schoon):
        with pytest.raises(ValueError):
            h.voeg_toe("supabase", "X", {"project_ref": "abc&read_only=false"})
        h.voeg_toe("cloudflare", "Tweede", {})
        with pytest.raises(ValueError):
            h.voeg_toe("cloudflare", "Tweede", {})
        with pytest.raises(ValueError):
            h.voeg_toe("github", "Nog een", {})

    def test_supabase_deelt_de_token_cloudflare_niet(self, schoon):
        (schoon / "vault.env").write_text("SUPABASE_ACCESS_TOKEN=account-token\nCLOUDFLARE_API_TOKEN=eerste-account\n")
        h.voeg_toe("supabase", "Companion", {"project_ref": "abcdefghij"})
        h.voeg_toe("cloudflare", "Tweede", {})
        assert h.sleutel_voor("supabase-companion")[0] == "account-token"
        assert h.sleutel_voor("cloudflare-tweede") == (None, "ontbreekt")
        naam = h.bewaar_sleutel("cloudflare-tweede", "tweede-account")
        assert naam == "CLOUDFLARE_API_TOKEN__CLOUDFLARE_TWEEDE"
        assert h.sleutel_voor("cloudflare-tweede")[0] == "tweede-account"
        assert h.sleutel_voor("cloudflare")[0] == "eerste-account"
        assert oct((schoon / "sleutels.env").stat().st_mode)[-3:] == "600"

    def test_verwijderen_neemt_de_eigen_sleutel_mee(self, schoon):
        h.voeg_toe("resend", "Northsea", {})
        h.bewaar_sleutel("resend-northsea", "re_12345678")
        h.verwijder("resend-northsea")
        assert "resend-northsea" not in h.verbindingen()
        assert "RESEND_API_KEY__RESEND_NORTHSEA" not in (schoon / "sleutels.env").read_text()
        with pytest.raises(KeyError):
            h.verwijder("resend")

    def test_het_overzicht_noemt_nooit_een_waarde(self, schoon, monkeypatch):
        monkeypatch.setenv("PERPLEXITY_API_KEY", "geheim-12345678")
        assert "geheim-12345678" not in json.dumps(h.overzicht())


class TestStdio:
    def test_praat_mcp_met_een_proces(self, schoon, monkeypatch):
        nep = (
            "import sys, json\n"
            "for regel in sys.stdin:\n"
            "    m = json.loads(regel)\n"
            "    if 'id' not in m: continue\n"
            "    print('log op stdout', flush=True)\n"
            "    r = {'tools': [{'name': 'echo'}]} if m['method'] == 'tools/list' else {'serverInfo': {'name': 'nep'}}\n"
            "    print(json.dumps({'jsonrpc': '2.0', 'id': m['id'], 'result': r}), flush=True)\n"
        )
        monkeypatch.setitem(h.SJABLONEN, "nep", {"naam": "Nep", "categorie": "dev", "transport": "stdio",
                                                 "commando": [sys.executable, "-c", nep], "sleutels": [],
                                                 "docs": "", "uitleg": ""})
        uit = asyncio.run(h.test("nep"))
        assert uit["status"] == "online" and uit["server"] == "nep" and uit["tools"][0]["name"] == "echo"

    def test_een_npm_pakket_ziet_geen_andere_sleutels(self, schoon, monkeypatch):
        monkeypatch.setenv("SUPABASE_SERVICE_ROLE", "niet-voor-npm")
        monkeypatch.setenv("BRAVE_API_KEY", "wel-voor-brave")
        env = h.StdioSessie("brave-search").env
        assert "SUPABASE_SERVICE_ROLE" not in env and env["BRAVE_API_KEY"] == "wel-voor-brave"


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
