"""18 nov: claude_code.run zonder prompt faalde elk uur op de Mac; nu meteen terug naar het model."""
import device_actions


def test_zonder_prompt_niets_naar_de_mac():
    fout = device_actions.ontbrekend("claude_code.run", {"repo": "orchestrator", "branch": "x"})
    assert fout and "args.prompt" in fout and "nothing was sent" in fout
    assert device_actions.ontbrekend("codex.run", {"prompt": "  "})
    assert device_actions.ontbrekend("claude_code.run", {"prompt": "bouw de peeks"}) is None
    assert device_actions.ontbrekend("terminal.free", {}) and device_actions.ontbrekend("files.read", {}) is None


def test_run_on_device_stopt_voor_de_database():
    class Kapot:
        def table(self, *_):
            raise AssertionError("mag de database niet raken")
    uit = device_actions.run_on_device("imac", "claude_code.run", {"repo": "x"}, db=Kapot())
    assert "args.prompt" in uit["error"]
