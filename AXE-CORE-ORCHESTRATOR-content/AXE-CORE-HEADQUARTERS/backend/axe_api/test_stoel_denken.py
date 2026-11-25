"""22-24 nov live: het stoel-brein gaf tekst i.p.v. een actie (geen tools, doel weg, werkbon)."""
import provider_router as pr

TOOLS = [{"name": "run_shell", "description": "Run a shell command.", "parameters": {"properties": {"command": {}}}},
         {"name": "finish", "description": "End the task.", "parameters": {"properties": {"summary": {}}}}]


def _contents(n):
    c = [{"role": "user", "parts": [{"text": "DOEL: repareer feed corporateJets"}]}]
    for i in range(n):
        c.append({"role": "model", "parts": [{"functionCall": {"name": "run_shell", "args": {"command": f"echo {i}"}}}]})
        c.append({"role": "user", "parts": [{"functionResponse": {"name": "run_shell", "response": {"stdout": str(i)}}}]})
    return c


def test_doel_en_tools_altijd_mee_ook_na_veel_stappen():
    p = pr.seat_prompt(_contents(20), "companionmgr", TOOLS)
    assert "DOEL: repareer feed corporateJets" in p
    assert "- run_shell(command)" in p and "- finish(summary)" in p
    assert "ONE JSON" in p and "echo 19" in p


def test_claude_json_met_actie_in_result_wordt_een_actie():
    raw = '{"type":"result","result":"{\\"name\\": \\"run_shell\\", \\"args\\": {\\"command\\": \\"ls\\"}}"}'
    uit = pr.parse_seat_antwoord(raw)
    assert uit["parts"][0]["functionCall"] == {"name": "run_shell", "args": {"command": "ls"}}


def test_gewone_tekst_in_result_blijft_tekst():
    uit = pr.parse_seat_antwoord('{"result": "Ik denk na."}')
    assert uit["parts"][0]["text"] == "Ik denk na."


def test_roep_stoel_vraagt_een_denk_run_zonder_werkbon():
    gezien = {}

    def runner(device, tool, args, **kw):
        gezien.update(args)
        return {"ok": True, "output": "{}"}
    pr.roep_stoel({"seat_id": "claude", "machine": "mini"}, "p", runner=runner)
    assert gezien["denk"] is True
