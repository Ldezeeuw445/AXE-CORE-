from taak_fout import taak_fout


def test_northsea_no_handler():
    uit = taak_fout({"code": "no_handler", "message": "No handler for northsea_desk"})
    assert uit["actie"] == "retry"
    assert "8040" in uit["regel"]


def test_gpt6_astra():
    uit = taak_fout("The 'gpt-6-astra' model requires a newer version of the Codex CLI")
    assert uit["actie"] == "retry"
    assert "gpt-5-codex" in uit["regel"]


def test_login():
    assert taak_fout("OAuth session expired")["actie"] == "reconnect"


def test_onbekend_blijft_leesbaar():
    assert taak_fout({"message": "disk full on dax-3"})["regel"] == "disk full on dax-3"
