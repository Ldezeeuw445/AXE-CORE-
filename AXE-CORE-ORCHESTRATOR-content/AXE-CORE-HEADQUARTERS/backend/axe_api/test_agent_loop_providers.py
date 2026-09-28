"""Providerpad van de agent-lus: tool-ids, volgorde, afkoeling en stoppen."""
import asyncio
import logging

import pytest

import agent_loop


def test_tool_antwoord_verwijst_naar_eigen_call_id():
    contents = [
        {"role": "user", "parts": [{"text": "hoeveel schijf is vrij?"}]},
        {"role": "model", "parts": [
            {"functionCall": {"name": "run_shell", "args": {"command": "df -h /"}}},
            {"functionCall": {"name": "run_shell", "args": {"command": "uptime"}}},
        ]},
        {"role": "user", "parts": [
            {"functionResponse": {"name": "run_shell", "response": {"stdout": "20G"}}},
            {"functionResponse": {"name": "run_shell", "response": {"stdout": "up 1 day"}}},
        ]},
    ]
    msgs = agent_loop._to_openai_messages(contents)
    assert msgs[0]["role"] == "system"
    call_ids = [c["id"] for c in msgs[2]["tool_calls"]]
    assert call_ids == ["call_1", "call_2"]
    assert msgs[2]["tool_calls"][0]["function"]["arguments"] == '{"command": "df -h /"}'
    assert [m["tool_call_id"] for m in msgs[3:]] == call_ids


def test_groq_staat_vooraan_als_key_er_is(monkeypatch):
    volgorde = []

    async def nep(contents, url, key, model):
        volgorde.append(model)
        return {"parts": [{"text": "ok"}]}

    monkeypatch.setenv("GROQ_API_KEY", "x")
    monkeypatch.setattr(agent_loop, "_call_openai_compat", nep)
    import asyncio
    out = asyncio.run(agent_loop._call_model([{"role": "user", "parts": [{"text": "hi"}]}], "gemini-key"))
    assert out == {"parts": [{"text": "ok"}]}
    assert volgorde == [agent_loop.GROQ_MODEL]


def test_mail_vraagt_altijd_ok():
    assert agent_loop.approval_reason("python3 -c 'import smtplib'", None)
    assert agent_loop.approval_reason("curl -s https://api.resend.com/emails", None)


def test_leestaak_mag_lezen_maar_niet_schrijven_of_posten():
    ro = lambda c: agent_loop.approval_reason(c, None, read_only=True)
    assert ro("df -h / 2>/dev/null") is None
    assert ro("cat /opt/northsea/log.txt 2>&1 | tail") is None
    assert ro("echo x > /opt/axe-workspace/a.txt")
    assert ro("curl -X POST https://example.com")
    assert ro("rm -rf /opt/axe-workspace/tmp")
    # Zonder read_only blijft de werkruimte vrij om in te schrijven.
    assert agent_loop.approval_reason("echo x > a.txt", None) is None


# ── W8: afkoeling ────────────────────────────────────────────────────────────

def _uitgeput(model, status, body):
    return agent_loop.ProviderUitgeput(model, status, body)


def test_groq_en_gemini_overgeslagen_na_dagquotum_en_credits(monkeypatch, caplog):
    """Na 429-per-dag en 402 begint de volgende stap meteen bij OpenAI.

    Zonder afkoeling doet de lus elke stap opnieuw twee kansloze HTTP-rondjes
    en zet hij elke stap dezelfde regel in het log.
    """
    volgorde = []
    monkeypatch.setattr(agent_loop, "_AFKOELING", {})
    monkeypatch.setenv("GROQ_API_KEY", "g")
    monkeypatch.setenv("OPENAI_API_KEY", "o")

    async def nep_compat(contents, url, key, model):
        volgorde.append(model)
        if model == agent_loop.GROQ_MODEL:
            raise _uitgeput(model, 429, "Rate limit reached: tokens per day (TPD) exceeded")
        return {"parts": [{"text": "ok"}]}

    async def nep_gemini(contents, key):
        volgorde.append("gemini")
        raise _uitgeput("gemini", 402, "prepayment credits are depleted")

    monkeypatch.setattr(agent_loop, "_call_openai_compat", nep_compat)
    monkeypatch.setattr(agent_loop, "_call_gemini", nep_gemini)

    vraag = [{"role": "user", "parts": [{"text": "hi"}]}]
    with caplog.at_level(logging.WARNING, logger="axe_agent_loop"):
        eerste = asyncio.run(agent_loop._call_model(vraag, "gemini-key"))
        volgorde.clear()
        tweede = asyncio.run(agent_loop._call_model(vraag, "gemini-key"))

    assert eerste == tweede == {"parts": [{"text": "ok"}]}
    # Tweede stap: Groq en Gemini worden niet eens meer geprobeerd.
    assert volgorde == [agent_loop.OPENAI_MODEL]
    assert set(agent_loop._AFKOELING) == {
        f"groq/{agent_loop.GROQ_MODEL}", f"gemini/{agent_loop.MODEL}",
    }
    # En het is één keer gemeld, niet elke stap.
    uitgeput = [r for r in caplog.records if "uitgeput" in r.getMessage()]
    assert len(uitgeput) == 2, [r.getMessage() for r in uitgeput]


def test_minuutlimiet_koelt_niet_af(monkeypatch):
    """Een 429 van een minuut is over voor de volgende stap begint."""
    monkeypatch.setattr(agent_loop, "_AFKOELING", {})
    monkeypatch.setenv("GROQ_API_KEY", "g")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    pogingen = []

    async def nep_compat(contents, url, key, model):
        pogingen.append(model)
        raise RuntimeError(f"{model} 429: Rate limit reached: requests per minute")

    async def nep_ollama(contents):
        return {"parts": [{"text": "lokaal"}]}

    monkeypatch.setattr(agent_loop, "_call_openai_compat", nep_compat)
    monkeypatch.setattr(agent_loop, "_call_ollama", nep_ollama)

    vraag = [{"role": "user", "parts": [{"text": "hi"}]}]
    asyncio.run(agent_loop._call_model(vraag, None))
    asyncio.run(agent_loop._call_model(vraag, None))
    assert pogingen == [agent_loop.GROQ_MODEL, agent_loop.GROQ_MODEL]
    assert agent_loop._AFKOELING == {}


# ── W1: één Ollama tegelijk ──────────────────────────────────────────────────

def test_twee_ollama_terugvallen_overlappen_nooit(monkeypatch):
    """De VPS valt om als twee worker-slots tegelijk het model laden."""
    monkeypatch.setattr(agent_loop, "_AFKOELING", {})
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    staat = {"nu": 0, "max": 0}

    async def nep_ollama(contents):
        staat["nu"] += 1
        staat["max"] = max(staat["max"], staat["nu"])
        await asyncio.sleep(0.02)
        staat["nu"] -= 1
        return {"parts": [{"text": "lokaal"}]}

    monkeypatch.setattr(agent_loop, "_call_ollama", nep_ollama)

    async def samen():
        vraag = [{"role": "user", "parts": [{"text": "hi"}]}]
        return await asyncio.gather(
            agent_loop._call_model(vraag, None),
            agent_loop._call_model(vraag, None),
        )

    uit = asyncio.run(samen())
    assert uit == [{"parts": [{"text": "lokaal"}]}] * 2
    assert staat["max"] == 1


# ── W2: stoppen ──────────────────────────────────────────────────────────────

def test_stoppen_voor_de_modelaanroep(monkeypatch):
    geroepen = []

    async def nooit(contents, api_key):
        geroepen.append(1)
        return {"parts": [{"text": "hoi"}]}

    monkeypatch.setattr(agent_loop, "_call_model", nooit)

    async def stil(*_a):
        pass

    async def stop():
        return True

    with pytest.raises(agent_loop.TaskCancelled):
        asyncio.run(agent_loop.run_agent_loop("doe iets", "t9", stil, should_stop=stop))
    assert geroepen == []


def test_stoppen_voor_de_tooluitvoering(monkeypatch):
    """Het model heeft al geantwoord; het commando mag niet meer draaien."""
    uitgevoerd = []
    beurten = {"n": 0}

    async def model(contents, api_key):
        return {"parts": [{"functionCall": {
            "name": "run_shell", "args": {"command": "touch /tmp/axe-mag-niet"},
        }}]}

    monkeypatch.setattr(agent_loop, "_call_model", model)
    monkeypatch.setattr(agent_loop, "_shell", lambda *a, **k: uitgevoerd.append(a) or {})

    async def stil(*_a):
        pass

    async def stop():
        # Vóór de modelaanroep nog niet, vóór de tool wel.
        beurten["n"] += 1
        return beurten["n"] > 1

    with pytest.raises(agent_loop.TaskCancelled):
        asyncio.run(agent_loop.run_agent_loop("doe iets", "t9", stil, should_stop=stop))
    assert uitgevoerd == []
