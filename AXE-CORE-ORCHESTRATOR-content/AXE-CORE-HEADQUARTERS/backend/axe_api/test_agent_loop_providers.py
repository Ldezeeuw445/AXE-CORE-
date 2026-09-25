"""Groq/OpenAI-pad van de agent-lus: strikte tool-ids en volgorde."""
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
