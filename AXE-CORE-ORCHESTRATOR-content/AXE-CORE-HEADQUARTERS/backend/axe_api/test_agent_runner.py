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

    def test_cursor_schrijft_met_force_en_leest_met_ask(self):
        cmd = a.ENGINES["cursor"]["cmd"]("cursor-agent", "p", "acceptEdits", "")
        assert "--force" in cmd and "-p" in cmd
        assert cmd[cmd.index("--output-format") + 1] == "json"
        lees = a.ENGINES["cursor"]["cmd"]("cursor-agent", "p", "plan", "")
        assert "--force" not in lees
        assert lees[lees.index("--mode") + 1] == "ask"

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

    def test_cursor_kan_het_nu_ook(self):
        # cursor-agent kreeg `--mode ask`: lezen zonder schrijven. Zie _cursor_cmd.
        assert a.ENGINES["cursor"]["alleen_lezen"] is True


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


class TestFoutmelding:
    def test_stderr_geeft_de_fout_en_niet_de_banner(self):
        # Letterlijk de vorm van codex op 13 september: banner, MCP-ruis, en de
        # enige regel die telt helemaal onderaan.
        stderr = (
            "Reading additional input from stdin...\nOpenAI Codex v0.140.0\n--------\n"
            "workdir: /Users/luka/AXE-CORE-\nmodel: gpt-5.5\nsession id: 01a09b80\n--------\n"
            + "2026-09-13T16:01:46Z ERROR rmcp::transport::worker: worker quit with fatal\n" * 20
            + "ERROR: You've hit your usage limit. Upgrade to Pro or try again at 10:36 PM.\n"
        )
        kern = a._stderr_staart(stderr)
        assert "usage limit" in kern and "10:36 PM" in kern
        assert "rmcp::" not in kern
        assert len(kern) <= 500

    def test_lege_stderr_blijft_leeg(self):
        assert a._stderr_staart("") == "" and a._stderr_staart(None) == ""


class TestEenSessiePerMotor:
    """Twee runs op hetzelfde abonnement lopen na elkaar, nooit naast elkaar."""

    def _nep_run(self, log, duur=0.3):
        import threading as _t
        import time as _time
        bezig = {"n": 0, "max": 0}
        slot = _t.Lock()

        echt = subprocess.run

        def run(cmd, **kw):
            # git (branch lezen) mag tegelijk; alleen de CLI-start telt.
            if cmd and cmd[0] == "git":
                return echt(cmd, **kw)
            with slot:
                bezig["n"] += 1
                bezig["max"] = max(bezig["max"], bezig["n"])
            _time.sleep(duur)
            with slot:
                bezig["n"] -= 1
            log.append(cmd[0])
            return subprocess.CompletedProcess(cmd, 0, stdout='{"result": "ok"}', stderr="")
        return run, bezig

    def test_twee_gelijktijdige_runs_wachten_op_elkaar(self, monkeypatch):
        import threading as _t
        pad = _repo()
        monkeypatch.setenv("AGENT_REPOS", f"proef={pad}")
        monkeypatch.setattr(a, "_binary", lambda motor: "claude")
        log = []
        run, bezig = self._nep_run(log)
        monkeypatch.setattr(subprocess, "run", run)
        uitslagen = []
        draden = [_t.Thread(target=lambda: uitslagen.append(a.run_agent("proef", "x", permission_mode="plan", engine="claude"))) for _ in range(3)]
        for d in draden:
            d.start()
        for d in draden:
            d.join()
        assert [u["status"] for u in uitslagen] == ["ok", "ok", "ok"]
        assert bezig["max"] == 1

    def test_een_andere_motor_hoeft_niet_te_wachten(self, monkeypatch):
        import threading as _t
        pad = _repo()
        monkeypatch.setenv("AGENT_REPOS", f"proef={pad}")
        monkeypatch.setattr(a, "_binary", lambda motor: motor["bin_default"])
        log = []
        run, bezig = self._nep_run(log)
        monkeypatch.setattr(subprocess, "run", run)
        draden = [_t.Thread(target=lambda e=e: a.run_agent("proef", "x", permission_mode="plan", engine=e)) for e in ("claude", "codex")]
        for d in draden:
            d.start()
        for d in draden:
            d.join()
        assert bezig["max"] == 2

    def test_te_lang_bezet_start_niet_en_zegt_dat(self, monkeypatch):
        pad = _repo()
        monkeypatch.setenv("AGENT_REPOS", f"proef={pad}")
        monkeypatch.setattr(a, "_binary", lambda motor: "claude")
        monkeypatch.setattr(a, "MOTOR_WACHT", 0)
        slot = a._motor_slot("claude")
        slot.acquire()
        try:
            r = a.run_agent("proef", "x", permission_mode="plan", engine="claude")
        finally:
            slot.release()
        assert r["status"] == "error" and "bezig met een andere run" in r["error"]


class TestTweedeClaude:
    def test_claude2_is_claude_met_een_eigen_loginmap(self):
        c2 = a.ENGINES["claude2"]
        assert c2["cmd"] is a.ENGINES["claude"]["cmd"]
        assert c2["extra_env"]["CLAUDE_CONFIG_DIR"].endswith(".claude-tweede")
        env = a._subprocess_env(c2["blocked_env"], c2["extra_env"])
        assert env["CLAUDE_CONFIG_DIR"] == c2["extra_env"]["CLAUDE_CONFIG_DIR"]

    def test_geen_sessieproxy_naar_een_claude_motor(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_BASE_URL", "http://127.0.0.1:1")
        monkeypatch.setenv("CLAUDECODE", "1")
        for naam in ("claude", "claude2"):
            env = a._subprocess_env(a.ENGINES[naam]["blocked_env"], a.ENGINES[naam].get("extra_env"))
            assert "ANTHROPIC_BASE_URL" not in env and "CLAUDECODE" not in env


class TestBranchZonderGit:
    def test_leest_de_branch_uit_head_ook_in_een_worktree(self, tmp_path):
        repo = _repo("werkbranch")
        assert a._branch_uit_head(repo) == "werkbranch"
        # Een worktree: .git is een bestand dat naar de echte gitdir wijst.
        wt = tmp_path / "wt"
        subprocess.run(["git", "-C", repo, "worktree", "add", "-q", "-b", "andere", str(wt)], check=True)
        assert a._branch_uit_head(str(wt)) == "andere"

    def test_losgekoppeld_of_geen_repo_laat_git_beslissen(self, tmp_path):
        repo = _repo("werkbranch")
        sha = subprocess.run(["git", "-C", repo, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
        subprocess.run(["git", "-C", repo, "checkout", "-q", sha], check=True)
        assert a._branch_uit_head(repo) is None
        assert a._current_branch(repo) == "HEAD"
        assert a._branch_uit_head(str(tmp_path)) is None


class TestWorktree:
    def test_een_worktree_is_een_checkout(self, tmp_path):
        (tmp_path / ".git").write_text("gitdir: /ergens/.git/worktrees/x\n")
        assert a._is_checkout(str(tmp_path))
        assert not a._is_checkout(str(tmp_path / "leeg"))
