from taak_fout import taak_fout


def test_northsea_no_handler():
    uit = taak_fout({"code": "no_handler", "message": "No handler for northsea_desk"})
    assert uit["actie"] == "retry"
    assert "8040" in uit["regel"]


def test_gpt6_astra():
    uit = taak_fout("The 'gpt-6-astra' model requires a newer version of the Codex CLI")
    assert uit["actie"] == "retry"
    assert "omits -m" in uit["regel"] or "Claude CLI" in uit["regel"]


def test_chatgpt_model_not_found():
    uit = taak_fout("The 'gpt-5-codex' model is not supported when using Codex with a ChatGPT account. code: model_not_found")
    assert uit["actie"] == "retry"
    assert "ChatGPT" in uit["regel"] and "Claude CLI" in uit["regel"]


def test_login():
    assert taak_fout("OAuth session expired")["actie"] == "reconnect"


def test_onbekend_blijft_leesbaar():
    assert taak_fout({"message": "disk full on dax-3"})["regel"] == "disk full on dax-3"


def test_lint_vondst_blijft_leesbaar():
    regel = "src/presentation/store/voiceStore.ts:12:5  error  @typescript-eslint/no-unused-vars  'foo' is defined but never used."
    uit = taak_fout({
        "message": f"Project check failed: lint (1 new)\n{regel}",
        "findings": [regel],
    }, "Build next step: AXE Core")
    assert "voiceStore.ts:12" in uit["regel"]
    assert "no-unused-vars" in uit["regel"]
    assert uit["actie"] == "fix"
