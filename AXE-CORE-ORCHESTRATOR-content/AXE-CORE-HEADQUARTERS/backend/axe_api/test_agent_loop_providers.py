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


def test_minuutlimiet_korte_afkoeling(monkeypatch):
    """Een 429-per-minuut krijgt een korte backoff, geen dagblokkade.

    Zo slaat de volgende stap Groq over en landt meteen op Ollama, in plaats
    van opnieuw dezelfde nutteloze HTTP-rondjes te doen.
    """
    monkeypatch.setattr(agent_loop, "_AFKOELING", {})
    monkeypatch.setenv("GROQ_API_KEY", "g")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    pogingen = []

    async def nep_compat(contents, url, key, model):
        pogingen.append(model)
        raise agent_loop._provider_fout(
            model,
            type("R", (), {
                "status_code": 429,
                "text": "Rate limit reached: requests per minute",
                "headers": {},
            })(),
        )

    async def nep_ollama(contents):
        return {"parts": [{"text": "lokaal"}]}

    monkeypatch.setattr(agent_loop, "_call_openai_compat", nep_compat)
    monkeypatch.setattr(agent_loop, "_call_ollama", nep_ollama)

    vraag = [{"role": "user", "parts": [{"text": "hi"}]}]
    eerste = asyncio.run(agent_loop._call_model(vraag, None))
    tweede = asyncio.run(agent_loop._call_model(vraag, None))
    assert eerste == tweede == {"parts": [{"text": "lokaal"}]}
    # Tweede stap: Groq nog in de korte afkoeling → alleen ollama.
    assert pogingen == [agent_loop.GROQ_MODEL]
    assert f"groq/{agent_loop.GROQ_MODEL}" in agent_loop._AFKOELING


def test_openai_credits_als_429_koelt_lang(monkeypatch):
    """OpenAI meldt 'no credits' soms als 429 — dat is credits, geen minuutlimiet."""
    monkeypatch.setattr(agent_loop, "_AFKOELING", {})
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "o")

    async def nep_compat(contents, url, key, model):
        raise agent_loop._provider_fout(
            model,
            type("R", (), {
                "status_code": 429,
                "text": "You have no credits remaining",
                "headers": {},
            })(),
        )

    async def nep_ollama(contents):
        return {"parts": [{"text": "lokaal"}]}

    monkeypatch.setattr(agent_loop, "_call_openai_compat", nep_compat)
    monkeypatch.setattr(agent_loop, "_call_ollama", nep_ollama)
    vraag = [{"role": "user", "parts": [{"text": "hi"}]}]
    assert asyncio.run(agent_loop._call_model(vraag, "gemini-key")) == {"parts": [{"text": "lokaal"}]}
    naam = f"openai/{agent_loop.OPENAI_MODEL}"
    assert naam in agent_loop._AFKOELING
    # Credits → uren, niet 60s.
    assert agent_loop._AFKOELING[naam] - __import__("time").monotonic() > 1000


def test_openrouter_zit_in_keten_voor_ollama(monkeypatch):
    monkeypatch.setattr(agent_loop, "_AFKOELING", {})
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("CEREBRAS_API_KEY", raising=False)
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-key")
    volgorde = []

    async def nep_compat(contents, url, key, model):
        volgorde.append((url, model))
        return {"parts": [{"text": "via-or"}]}

    monkeypatch.setattr(agent_loop, "_call_openai_compat", nep_compat)
    vraag = [{"role": "user", "parts": [{"text": "hi"}]}]
    uit = asyncio.run(agent_loop._call_model(vraag, None))
    assert uit == {"parts": [{"text": "via-or"}]}
    assert volgorde[0][1] == agent_loop.OPENROUTER_MODEL
    assert "openrouter.ai" in volgorde[0][0]



# ── W9: HTTP 413 / request too large → trim + fallback ───────────────────────

def test_provider_fout_413_is_context_te_groot():
    exc = agent_loop._provider_fout(
        "openai/gpt-oss-120b",
        type("R", (), {
            "status_code": 413,
            "text": (
                "Request too large for model `openai/gpt-oss-120b` in organization "
                "org_x on tokens per minute (TPM)"
            ),
            "headers": {},
        })(),
    )
    assert isinstance(exc, agent_loop.ContextTeGroot)
    assert not isinstance(exc, agent_loop.ProviderUitgeput)
    # 413 must not trigger cool-down — the payload is fat, not the wallet.
    assert agent_loop._afkoelduur(exc) is None


def test_trim_contents_houdt_brief_en_knipt_tool_dumps():
    dik = "X" * 50_000
    contents = [
        {"role": "user", "parts": [{"text": "bouw feature A"}]},
        {"role": "model", "parts": [{"functionCall": {"name": "run_shell", "args": {"command": "ls -R"}}}]},
        {"role": "user", "parts": [{"functionResponse": {"name": "run_shell", "response": {"stdout": dik, "exit_code": 0}}}]},
        {"role": "model", "parts": [{"functionCall": {"name": "run_shell", "args": {"command": "pwd"}}}]},
        {"role": "user", "parts": [{"functionResponse": {"name": "run_shell", "response": {"stdout": "/tmp/ws", "exit_code": 0}}}]},
    ]
    uit = agent_loop._trim_contents(contents, budget=8_000)
    assert uit[0]["parts"][0]["text"] == "bouw feature A"
    assert agent_loop._estimate_contents_chars(uit) <= 8_000
    # Fat stdout must not survive whole.
    blob = str(uit)
    assert "X" * 40_000 not in blob
    assert "omitted" in blob.lower() or "truncated" in blob.lower() or len(blob) < 20_000


def test_413_trimt_en_valt_terug_op_volgende_provider(monkeypatch):
    """Groq 413 → trim + retry; still 413 → ollama with trimmed payload.

    Without this, every provider gets the same fat body and the task lands on
    Waiting for DAX capacity even though Ollama could finish the step.
    """
    monkeypatch.setattr(agent_loop, "_AFKOELING", {})
    monkeypatch.setenv("GROQ_API_KEY", "g")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("CEREBRAS_API_KEY", raising=False)

    dik = "Y" * 80_000
    contents = [
        {"role": "user", "parts": [{"text": "stap 1: verkent de repo"}]},
        {"role": "model", "parts": [{"functionCall": {"name": "run_shell", "args": {"command": "ls -R"}}}]},
        {"role": "user", "parts": [{"functionResponse": {"name": "run_shell", "response": {"stdout": dik}}}]},
    ]
    gezien = []

    async def nep_compat(c, url, key, model):
        size = agent_loop._estimate_contents_chars(c)
        gezien.append(("groq", model, size))
        raise agent_loop._provider_fout(
            model,
            type("R", (), {
                "status_code": 413,
                "text": "Request too large for model on tokens per minute (TPM)",
                "headers": {},
            })(),
        )

    async def nep_ollama(c):
        size = agent_loop._estimate_contents_chars(c)
        gezien.append(("ollama", agent_loop.OLLAMA_MODEL, size))
        return {"parts": [{"text": "ok-na-trim"}]}

    monkeypatch.setattr(agent_loop, "_call_openai_compat", nep_compat)
    monkeypatch.setattr(agent_loop, "_call_ollama", nep_ollama)

    # Fresh list so the loop can mutate it without touching the fixture above.
    import copy
    vraag = copy.deepcopy(contents)

    uit = asyncio.run(agent_loop._call_model(vraag, None))
    assert uit == {"parts": [{"text": "ok-na-trim"}]}
    # Soft-trim may fire first; then Groq 413 → harder trim + retry; then ollama.
    assert any(p == "ollama" for p, _, _ in gezien)
    ollama_sizes = [s for p, _, s in gezien if p == "ollama"]
    assert ollama_sizes and ollama_sizes[0] < 80_000
    # No cool-down parked for the 413 path.
    assert not any("413" in str(k) for k in agent_loop._AFKOELING)
    assert f"groq/{agent_loop.GROQ_MODEL}" not in agent_loop._AFKOELING


def test_gemini_default_is_niet_deprecated():

    assert "pro-latest" not in agent_loop.MODEL
    assert "flash" in agent_loop.MODEL or "2.5" in agent_loop.MODEL


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


def test_task_workspace_isolates_relative_shell_and_file_tools(monkeypatch, tmp_path):
    """Two durable runs may use the same relative names without sharing files."""
    a = tmp_path / "developer" / "task-a"
    b = tmp_path / "developer" / "task-b"

    token = agent_loop._HUIDIGE_WORKSPACE.set(str(a))
    try:
        assert agent_loop._write("artifact.txt", "A")["path"] == str(a / "artifact.txt")
        assert agent_loop._read("artifact.txt")["content"] == "A"
        assert agent_loop._shell("pwd")["stdout"].strip() == str(a)
    finally:
        agent_loop._HUIDIGE_WORKSPACE.reset(token)

    token = agent_loop._HUIDIGE_WORKSPACE.set(str(b))
    try:
        assert agent_loop._write("artifact.txt", "B")["path"] == str(b / "artifact.txt")
        assert agent_loop._read("artifact.txt")["content"] == "B"
        assert agent_loop._shell("pwd")["stdout"].strip() == str(b)
    finally:
        agent_loop._HUIDIGE_WORKSPACE.reset(token)

    assert (a / "artifact.txt").read_text() == "A"
    assert (b / "artifact.txt").read_text() == "B"


def test_ollama_blijft_niet_meer_voor_altijd_in_het_geheugen(monkeypatch):
    """8 nov: keep_alive -1 hield de modelbox onder AXE_DAX_MIN_FREE_MB en geen
    DAX-bot draaide nog. Standaard nu 30 minuten, instelbaar."""
    monkeypatch.delenv("AXE_OLLAMA_KEEP_ALIVE", raising=False)
    assert agent_loop._ollama_keep_alive() == "30m"
    monkeypatch.setenv("AXE_OLLAMA_KEEP_ALIVE", "-1")
    assert agent_loop._ollama_keep_alive() == -1
    monkeypatch.setenv("AXE_OLLAMA_KEEP_ALIVE", "10m")
    assert agent_loop._ollama_keep_alive() == "10m"
