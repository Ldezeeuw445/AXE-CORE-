"""Perplexity: welk preset mag, wat een vraag kost, en wat de route teruggeeft.

Er gaat hier geen enkele echte aanroep uit. De API wordt per vraag afgerekend,
dus een test die hem echt aanroept kost bij elke run geld. De nagebootste
client hieronder antwoordt in exact de vorm uit de API-referentie.
"""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import perplexity_agent as pa


class TestPreset:
    def test_toegestane_presets_blijven(self):
        for p in ("fast", "low", "medium", "high"):
            assert pa.kies_preset(p) == p

    def test_duurdere_en_onbekende_vallen_terug_op_de_standaard(self):
        # xhigh en wide-research draaien een sandbox en finance_search.
        for p in ("xhigh", "wide-research", "extreem", "", None, 42):
            assert pa.kies_preset(p) == pa.STANDAARD_PRESET

    def test_hoofdletters_en_spaties_tellen_niet(self):
        assert pa.kies_preset("  MEDIUM ") == "medium"


class TestDagbudget:
    def test_telt_op_binnen_een_dag(self):
        staat = {}
        pa.tel_kosten(staat, "2026-09-14", 0.012)
        pa.tel_kosten(staat, "2026-09-14", 0.030)
        assert staat["2026-09-14"] == pytest.approx(0.042)

    def test_een_nieuwe_dag_begint_bij_nul_en_vergeet_de_oude(self):
        staat = {"2026-09-13": 0.99}
        pa.tel_kosten(staat, "2026-09-14", 0.01)
        assert staat == {"2026-09-14": 0.01, "2026-09-14#vragen": 1}

    def test_budget_over_raakt_nooit_onder_nul(self):
        assert pa.budget_over({"2026-09-14": 1.50}, "2026-09-14", 1.00) == 0.0
        assert pa.budget_over({}, "2026-09-14", 1.00) == 1.00

    def test_een_negatieve_kostenregel_verhoogt_het_budget_niet(self):
        staat = {}
        pa.tel_kosten(staat, "2026-09-14", -5.0)
        assert staat["2026-09-14"] == 0.0

    def test_plafond_uit_de_omgeving_en_onzin_valt_terug(self, monkeypatch):
        monkeypatch.setenv("PERPLEXITY_DAILY_USD", "2.5")
        assert pa.dagbudget_usd() == 2.5
        monkeypatch.setenv("PERPLEXITY_DAILY_USD", "veel")
        assert pa.dagbudget_usd() == 0.25

    def test_ook_een_plafond_op_het_aantal_vragen(self, monkeypatch):
        staat = {"2026-09-13": 0.4, "2026-09-13#vragen": 9}
        for _ in range(3):
            pa.tel_kosten(staat, "2026-09-14", 0.001)
        assert staat == {"2026-09-14": 0.003, "2026-09-14#vragen": 3}, "oude dagen weg, vandaag geteld"
        assert pa.vragen_over(staat, "2026-09-14", 3) == 0
        monkeypatch.delenv("PERPLEXITY_DAILY_QUESTIONS", raising=False)
        assert pa.dagvragen() == 25


class TestKostenEnWachttijd:
    def test_leest_de_kosten_die_perplexity_zelf_rekent(self):
        assert pa.kosten_uit({"usage": {"cost": {"total_cost": 0.0153}}}) == 0.0153

    def test_zonder_kostenregel_is_het_nul_en_geen_fout(self):
        assert pa.kosten_uit({}) == 0.0
        assert pa.kosten_uit({"usage": None}) == 0.0
        assert pa.kosten_uit("geen dict") == 0.0

    def test_retry_after_in_seconden(self):
        assert pa.retry_after_seconden("12") == 12
        assert pa.retry_after_seconden(None) is None
        # Een datum in plaats van seconden: niet raden.
        assert pa.retry_after_seconden("Wed, 21 Oct 2026 07:28:00 GMT") is None


# ── De route ──────────────────────────────────────────────────────────────────

ANTWOORD = {
    "id": "resp_1",
    "object": "response",
    "status": "completed",
    "model": "openai/gpt-5.6-luna",
    "output": [
        {"type": "search_results", "queries": ["goud deze week"], "results": [
            {"id": 1, "url": "https://example.com/goud", "title": "Goud stijgt", "snippet": "…", "source": "web"},
        ]},
        {"type": "message", "role": "assistant", "content": [
            {"type": "output_text", "text": "Goud steeg door een zwakkere dollar.",
             "annotations": [{"type": "url_citation", "url": "https://example.com/goud", "title": "Goud stijgt"}]},
        ]},
    ],
    "usage": {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150,
              "cost": {"currency": "USD", "total_cost": 0.02}},
}


class NepAntwoord:
    def __init__(self, status, body, headers=None):
        self.status_code = status
        self._body = body
        self.headers = headers or {}
        self.is_error = status >= 400

    def json(self):
        if isinstance(self._body, (dict, list)):
            return self._body
        raise ValueError("geen json")


def nep_client(antwoord, gezien):
    class Client:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            gezien.append({"url": url, "headers": headers, "json": json})
            return antwoord

    return Client


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setattr(pa, "STAAT_PAD", str(tmp_path / "budget.json"))
    monkeypatch.setenv("PERPLEXITY_API_KEY", "test-sleutel")
    monkeypatch.setenv("PERPLEXITY_DAILY_USD", "1.00")
    a = FastAPI()
    a.include_router(pa.router, prefix="/research")
    return TestClient(a)


class TestRoute:
    def test_stuurt_vraag_en_preset_zoals_de_docs_voorschrijven(self, app, monkeypatch):
        gezien = []
        monkeypatch.setattr(pa.httpx, "AsyncClient", nep_client(NepAntwoord(200, ANTWOORD), gezien))
        r = app.post("/research/perplexity", json={"question": "Wat drijft goud?", "preset": "medium"})
        assert r.status_code == 200
        assert gezien[0]["url"] == "https://api.perplexity.ai/v1/agent"
        assert gezien[0]["json"] == {"input": "Wat drijft goud?", "preset": "medium"}
        assert gezien[0]["headers"]["Authorization"] == "Bearer test-sleutel"

    def test_telt_de_kosten_op_in_het_budgetbestand(self, app, monkeypatch):
        monkeypatch.setattr(pa.httpx, "AsyncClient", nep_client(NepAntwoord(200, ANTWOORD), []))
        app.post("/research/perplexity", json={"question": "a"})
        app.post("/research/perplexity", json={"question": "b"})
        with open(pa.STAAT_PAD, encoding="utf-8") as f:
            assert json.load(f)[pa.vandaag()] == pytest.approx(0.04)

    def test_weigert_met_402_als_het_budget_op_is_en_vraagt_niets(self, app, monkeypatch):
        with open(pa.STAAT_PAD, "w", encoding="utf-8") as f:
            json.dump({pa.vandaag(): 1.00}, f)
        gezien = []
        monkeypatch.setattr(pa.httpx, "AsyncClient", nep_client(NepAntwoord(200, ANTWOORD), gezien))
        r = app.post("/research/perplexity", json={"question": "Wat drijft goud?"})
        assert r.status_code == 402
        assert gezien == []  # geen betaalde aanroep als het budget op is

    def test_zonder_sleutel_503_en_zonder_vraag_400(self, app, monkeypatch):
        monkeypatch.delenv("PERPLEXITY_API_KEY")
        assert app.post("/research/perplexity", json={"question": "x"}).status_code == 503
        monkeypatch.setenv("PERPLEXITY_API_KEY", "k")
        assert app.post("/research/perplexity", json={"question": "  "}).status_code == 400

    def test_get_zegt_of_de_sleutel_er_is_zonder_perplexity_aan_te_roepen(self, app, monkeypatch):
        gezien = []
        monkeypatch.setattr(pa.httpx, "AsyncClient", nep_client(NepAntwoord(200, ANTWOORD), gezien))
        r = app.get("/research/perplexity")
        assert r.status_code == 200
        assert r.json()["configured"] is True
        assert gezien == []
        monkeypatch.delenv("PERPLEXITY_API_KEY")
        assert app.get("/research/perplexity").json()["configured"] is False

    def test_overbelasting_geeft_429_met_retry_after_door(self, app, monkeypatch):
        fout = NepAntwoord(429, {"error": {"message": "model overloaded"}}, {"Retry-After": "7"})
        monkeypatch.setattr(pa.httpx, "AsyncClient", nep_client(fout, []))
        r = app.post("/research/perplexity", json={"question": "x"})
        assert r.status_code == 429
        assert r.headers["retry-after"] == "7"
        assert r.json()["retryAfter"] == 7

    def test_een_geweigerde_perplexity_sleutel_is_geen_401(self, app, monkeypatch):
        # 401 is van de eigen AUTH van de server; de app mag niet denken dat
        # zijn eigen sleutel fout is.
        monkeypatch.setattr(pa.httpx, "AsyncClient", nep_client(NepAntwoord(401, {"error": {"message": "bad"}}), []))
        r = app.post("/research/perplexity", json={"question": "x"})
        assert r.status_code == 502
        assert "PERPLEXITY_API_KEY" in r.json()["detail"]

    def test_een_mislukte_vraag_telt_niet_mee_in_het_budget(self, app, monkeypatch):
        monkeypatch.setattr(pa.httpx, "AsyncClient", nep_client(NepAntwoord(500, {}), []))
        app.post("/research/perplexity", json={"question": "x"})
        assert pa.lees_staat() == {}
