"""De LLM-keten voor de browser-agents: wie komt aan de beurt, en wanneer rust een aanbieder."""
import asyncio

import llm_cascade as lc


def setup_function():
    lc.vergeet_alles()


def test_zonder_sleutels_is_er_geen_aanbieder(monkeypatch):
    for a in lc.AANBIEDERS:
        monkeypatch.delenv(a.sleutel_env, raising=False)
    assert lc.volgorde() == []


def test_volgorde_is_openai_gemini_groq_en_slaat_aanbieders_zonder_sleutel_over(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("GROQ_API_KEY", "y")
    assert [a.naam for a in lc.volgorde()] == ["openai", "groq"]


def test_een_aanbieder_zonder_tegoed_rust_en_de_volgende_komt_aan_de_beurt(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    monkeypatch.setenv("GROQ_API_KEY", "y")
    lc.laat_rusten("openai", nu=100.0)
    assert [a.naam for a in lc.volgorde(nu=101.0)] == ["groq"]
    # Na de rusttijd mag hij weer.
    assert [a.naam for a in lc.volgorde(nu=100.0 + lc.RUST_S + 1)] == ["openai", "groq"]


def test_tegoed_op_sleutel_fout_en_limiet_zijn_aanbiedersfouten_een_slecht_verzoek_niet():
    assert lc.is_beschikbaarheidsfout(429, "")
    assert lc.is_beschikbaarheidsfout(402, "")
    assert lc.is_beschikbaarheidsfout(400, '{"code":"credit_balance_exhausted"}')
    assert lc.is_beschikbaarheidsfout(400, "model_not_found")
    assert lc.is_beschikbaarheidsfout(503, "")
    assert not lc.is_beschikbaarheidsfout(400, "messages must not be empty")


def test_chat_valt_door_naar_de_aanbieder_die_wel_antwoordt(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    monkeypatch.setenv("GROQ_API_KEY", "y")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    class Res:
        def __init__(self, code, tekst, js=None):
            self.status_code, self.text, self._js = code, tekst, js

        def json(self):
            return self._js

    antwoorden = {
        "https://api.openai.com/v1/chat/completions": Res(402, '{"error":{"code":"credit_balance_exhausted"}}'),
        "https://api.groq.com/openai/v1/chat/completions": Res(200, "", {"choices": [{"message": {"content": "klaar"}}]}),
    }

    class Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, **k): return antwoorden[url]

    monkeypatch.setattr(lc.httpx, "AsyncClient", Client)
    tekst, wie = asyncio.run(lc.chat([{"role": "user", "content": "hoi"}]))
    assert (tekst, wie) == ("klaar", "groq")
    # OpenAI rust nu; Groq is onthouden als de laatste die werkte.
    assert [a.naam for a in lc.volgorde()] == ["groq"]


def test_chat_meldt_eerlijk_dat_niets_werkt(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    for naam in ("GEMINI_API_KEY", "GROQ_API_KEY"):
        monkeypatch.delenv(naam, raising=False)

    class Res:
        status_code, text = 402, "no credits"

    class Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, **k): return Res()

    monkeypatch.setattr(lc.httpx, "AsyncClient", Client)
    try:
        asyncio.run(lc.chat([{"role": "user", "content": "hoi"}]))
        raise AssertionError("had moeten falen")
    except RuntimeError as e:
        assert "openai" in str(e) and "402" in str(e)
