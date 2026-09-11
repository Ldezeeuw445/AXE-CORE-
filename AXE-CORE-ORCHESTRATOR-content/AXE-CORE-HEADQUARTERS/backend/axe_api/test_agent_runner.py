"""Wat elke motor werkelijk aan zijn CLI meegeeft, en wie er mag weigeren.

Deze tests bestonden niet, en dat was te zien: Cursor kreeg een plan-modus die
geen plan-modus wás. `-p/--print` heeft volgens Cursor's eigen documentatie
"access to all tools, including write and shell", dus een run die om alleen-lezen
vroeg zou gewoon mogen schrijven. Precies het soort fout dat pas opvalt als er
iets herschreven is dat je niet bedoelde.
"""
import os
import subprocess
import tempfile

import agent_runner as a


def _repo(branch="werkbranch"):
    pad = tempfile.mkdtemp(prefix="axe-test-repo-")
    subprocess.run(["git", "init", "-q", "-b", branch, "."], cwd=pad, check=True)
    subprocess.run(["git", "config", "user.email", "t@t"], cwd=pad, check=True)
    subprocess.run(["git", "config", "user.name", "T"], cwd=pad, check=True)
    with open(os.path.join(pad, "a.txt"), "w") as f:
        f.write("een\n")
    subprocess.run(["git", "add", "-A"], cwd=pad, check=True)
    subprocess.run(["git", "commit", "-qm", "eerste"], cwd=pad, check=True)
    return pad


class TestCommandos:
    def test_claude_krijgt_de_modus_mee(self):
        cmd = a.ENGINES["claude"]["cmd"]("claude", "doe iets", "plan", "")
        assert "--permission-mode" in cmd and cmd[cmd.index("--permission-mode") + 1] == "plan"

    def test_codex_leest_alleen_in_plan(self):
        plan = a.ENGINES["codex"]["cmd"]("codex", "p", "plan", "/tmp/uit")
        assert "read-only" in plan
        # En buiten plan mag hij schrijven, met automatische goedkeuring -- zonder
        # die vlag hangt een headless run op een vraag die niemand beantwoordt.
        schrijf = a.ENGINES["codex"]["cmd"]("codex", "p", "acceptEdits", "/tmp/uit")
        assert "workspace-write" in schrijf and "--approve-for-me" in schrijf

    def test_cursor_forceert_altijd(self):
        # Altijd, want plan-modus bereikt deze motor niet (zie de weigering
        # hieronder) en zonder --force hangt hij op een goedkeuring.
        cmd = a.ENGINES["cursor"]["cmd"]("cursor-agent", "p", "acceptEdits", "")
        assert "--force" in cmd and "-p" in cmd
        assert cmd[cmd.index("--output-format") + 1] == "json"

    def test_de_prompt_gaat_nooit_door_een_shell(self):
        # Een lijst en geen string: anders zou een prompt met backticks of een
        # puntkomma op de host uitgevoerd worden.
        for naam in a.ENGINES:
            cmd = a.ENGINES[naam]["cmd"]("bin", "rm -rf / ; echo $(whoami)", "acceptEdits", "/tmp/u")
            assert isinstance(cmd, list)
            assert "rm -rf / ; echo $(whoami)" in cmd


class TestAlleenLezen:
    def test_claude_en_codex_kunnen_het(self):
        assert a.ENGINES["claude"]["alleen_lezen"] is True
        assert a.ENGINES["codex"]["alleen_lezen"] is True

    def test_cursor_kan_het_niet(self):
        # Cursor's eigen documentatie: `-p/--print` "has access to all tools,
        # including write and shell". Er is geen stand die dat wegneemt.
        assert a.ENGINES["cursor"]["alleen_lezen"] is False

    def test_plan_wordt_geweigerd_voor_een_motor_die_het_niet_kan(self, monkeypatch):
        pad = _repo()
        monkeypatch.setenv("AGENT_REPOS", f"proef={pad}")
        r = a.run_agent("proef", "lees dit", permission_mode="plan", engine="cursor")
        assert r["status"] == "error"
        assert "alleen-lezen" in r["error"]

    def test_de_weigering_komt_voor_de_cli(self, monkeypatch):
        # Er mag niets gestart zijn. Zou de weigering ná de start komen, dan had
        # de agent al kunnen schrijven voordat iemand nee zei.
        pad = _repo()
        monkeypatch.setenv("AGENT_REPOS", f"proef={pad}")
        monkeypatch.setattr(subprocess, "run", _weiger_elke_start)
        r = a.run_agent("proef", "x", permission_mode="plan", engine="cursor")
        assert r["status"] == "error"


def _weiger_elke_start(*args, **kwargs):
    # _current_branch gebruikt subprocess ook; alleen een CLI-start is fout.
    if args and args[0] and args[0][0] != "git":
        raise AssertionError(f"de CLI is gestart terwijl dit geweigerd hoorde te worden: {args[0]}")
    return subprocess.CompletedProcess(args[0], 0, "werkbranch\n", "")


class TestBewakingen:
    def test_beschermde_branch(self, monkeypatch):
        pad = _repo(branch="main")
        monkeypatch.setenv("AGENT_REPOS", f"proef={pad}")
        r = a.run_agent("proef", "x", engine="claude")
        assert r["status"] == "error" and "main" in r["error"]

    def test_repo_buiten_de_whitelist(self, monkeypatch):
        monkeypatch.setenv("AGENT_REPOS", "proef=/tmp/bestaat-niet-hier")
        r = a.run_agent("iets-anders", "x", engine="claude")
        assert r["status"] == "error" and "Onbekende repo" in r["error"]

    def test_sleutels_gaan_niet_mee_de_omgeving_in(self, monkeypatch):
        # De hele reden dat de runner bestaat: een CLI die een sleutel vindt,
        # authenticeert daarmee in plaats van met het abonnement -- en dan betaalt
        # de gemeterde API terwijl er in de logs niets verandert.
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-geheim")
        monkeypatch.setenv("OPENAI_API_KEY", "sk-ook-geheim")
        env = a._subprocess_env(a.ENGINES["claude"]["blocked_env"])
        assert "ANTHROPIC_API_KEY" not in env
        env2 = a._subprocess_env(a.ENGINES["codex"]["blocked_env"])
        assert "OPENAI_API_KEY" not in env2
        env3 = a._subprocess_env(a.ENGINES["cursor"]["blocked_env"])
        assert "ANTHROPIC_API_KEY" not in env3 and "OPENAI_API_KEY" not in env3

    def test_onbekende_motor(self):
        r = a.run_agent("proef", "x", engine="verzonnen")
        assert r["status"] == "error" and "Onbekende motor" in r["error"]
