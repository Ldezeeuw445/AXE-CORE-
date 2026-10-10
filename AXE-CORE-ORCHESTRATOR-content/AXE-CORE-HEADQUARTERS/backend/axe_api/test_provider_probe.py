"""De probe vraagt één woord, niet alleen de modellijst: een geldige sleutel zonder tegoed is niet 'online'."""
import asyncio

import provider_probe as pp


class Res:
    def __init__(self, code, tekst=""):
        self.status_code, self.text = code, tekst

    @property
    def is_success(self):
        return 200 <= self.status_code < 300


def _client(antwoord, gezien):
    class Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False

        async def post(self, url, **k):
            gezien.append(("POST", url))
            return antwoord

        async def get(self, url, **k):
            gezien.append(("GET", url))
            return antwoord
    return Client


def setup_function():
    pp._PROBE_CACHE.clear()


def test_openai_zonder_tegoed_is_niet_online_en_zegt_waarom(monkeypatch):
    gezien = []
    monkeypatch.setattr(pp.httpx, "AsyncClient", _client(Res(429, '{"error":{"message":"You have no credits remaining"}}'), gezien))
    ok, detail = asyncio.run(pp.probe_provider("openai", "sleutel"))
    assert ok is False and "no_credits" in detail
    # Het is een echte aanvraag (POST chat), geen modellijst: dat was het gat.
    assert gezien == [("POST", "https://api.openai.com/v1/chat/completions")]


def test_google_met_lege_prepayment_is_niet_online(monkeypatch):
    monkeypatch.setattr(pp.httpx, "AsyncClient", _client(Res(402, "Your prepayment credits are depleted"), []))
    ok, detail = asyncio.run(pp.probe_provider("google", "k"))
    assert (ok, "no_credits" in detail) == (False, True)


def test_een_antwoord_is_online(monkeypatch):
    monkeypatch.setattr(pp.httpx, "AsyncClient", _client(Res(200, "{}"), []))
    assert asyncio.run(pp.probe_provider("groq", "k")) == (True, "http_200")


def test_een_slechte_sleutel_en_een_limiet_hebben_elk_hun_reden(monkeypatch):
    monkeypatch.setattr(pp.httpx, "AsyncClient", _client(Res(401, "invalid api key"), []))
    assert asyncio.run(pp.probe_provider("groq", "k"))[1].endswith("bad_key")
    pp._PROBE_CACHE.clear()
    monkeypatch.setattr(pp.httpx, "AsyncClient", _client(Res(429, "slow down"), []))
    assert asyncio.run(pp.probe_provider("groq", "k"))[1].endswith("rate_limited")


def test_twee_minuten_onthouden_zodat_de_lampjes_niet_elke_keer_geld_kosten(monkeypatch):
    gezien = []
    monkeypatch.setattr(pp.httpx, "AsyncClient", _client(Res(200, "{}"), gezien))
    asyncio.run(pp.probe_provider("openai", "k"))
    asyncio.run(pp.probe_provider("openai", "k"))
    assert len(gezien) == 1


def test_onbekende_aanbieder_heeft_geen_probe(monkeypatch):
    monkeypatch.setattr(pp.httpx, "AsyncClient", _client(Res(200), []))
    assert asyncio.run(pp.probe_provider("onbekend", "k")) == (False, "no_probe")
