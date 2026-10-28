"""bouw_publiceer met echte git: een lokale kale repo speelt GitHub, de API is nagebootst."""
import base64
import json
import os
import subprocess

import httpx
import pytest

import agent_runner
import bouw_publiceer as bp


def sh(pad, *args):
    return subprocess.run(["git", *args], cwd=pad, capture_output=True, text=True, check=True).stdout


@pytest.fixture
def repo(tmp_path, monkeypatch):
    remote = tmp_path / "remote.git"
    werk = tmp_path / "werk"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(remote)], check=True, capture_output=True)
    subprocess.run(["git", "init", "-b", "main", str(werk)], check=True, capture_output=True)
    sh(werk, "config", "user.email", "test@example.com")
    sh(werk, "config", "user.name", "Test")
    (werk / "app.py").write_text("print('hoi')\n")
    sh(werk, "add", "-A")
    sh(werk, "commit", "-m", "begin")
    # get-url zegt GitHub (voor de PR), pushen gaat naar de lokale kale repo.
    sh(werk, "remote", "add", "origin", "https://github.com/Ldezeeuw445/voorbeeld.git")
    sh(werk, "config", "remote.origin.pushurl", str(remote))
    sh(werk, "push", "-q", str(remote), "main")
    sh(werk, "checkout", "-q", "-b", "axe-agent")
    monkeypatch.setenv("AGENT_REPOS", f"voorbeeld={werk}")
    return werk, remote


def github(bestaande_pr=None):
    gezien = []

    def handler(request: httpx.Request):
        gezien.append((request.method, request.url.path, request.url.params.get("head"),
                       json.loads(request.content) if request.content else None))
        if request.method == "GET" and request.url.path.endswith("/pulls"):
            return httpx.Response(200, json=[{"html_url": bestaande_pr}] if bestaande_pr else [])
        if request.method == "GET":
            return httpx.Response(200, json={"default_branch": "main"})
        return httpx.Response(201, json={"html_url": "https://github.com/Ldezeeuw445/voorbeeld/pull/7"})
    return httpx.Client(transport=httpx.MockTransport(handler)), gezien


def publiceer(token="t", http=None):
    return bp.publiceer("voorbeeld", "Build next step: voorbeeld", "TOS-SEC-4: done, tests green", "taak-1",
                        git=agent_runner._git, commit_en_push=agent_runner.commit_en_push,
                        repo_pad=agent_runner._repo_pad, token=token, http=http)


def test_legt_vast_pusht_en_opent_een_draft_pr(repo):
    werk, remote = repo
    (werk / "app.py").write_text("print('hallo')\n")
    (werk / "nieuw.ts").write_text("export const x = 1;\n")
    client, gezien = github()
    uit = publiceer(http=client)
    assert uit["gepusht"] is True and uit["branch"] == "axe-agent"
    assert uit["pr"] == "https://github.com/Ldezeeuw445/voorbeeld/pull/7" and uit["nieuw"] is True
    # De commit staat echt op de remote, met de taak in het bericht.
    bericht = sh(remote, "log", "-1", "--format=%B", "axe-agent")
    assert "Build next step: voorbeeld" in bericht and "TOS-SEC-4" in bericht and "task taak-1" in bericht
    post = [g for g in gezien if g[0] == "POST"][0]
    assert post[3]["draft"] is True and post[3]["head"] == "axe-agent" and post[3]["base"] == "main"
    assert ("GET", "/repos/Ldezeeuw445/voorbeeld/pulls", "Ldezeeuw445:axe-agent", None) in gezien


def test_een_bestaande_pr_wordt_alleen_bijgewerkt(repo):
    werk, _ = repo
    (werk / "app.py").write_text("print('weer')\n")
    client, gezien = github(bestaande_pr="https://github.com/Ldezeeuw445/voorbeeld/pull/3")
    uit = publiceer(http=client)
    assert uit["pr"].endswith("/pull/3") and uit["nieuw"] is False
    assert not [g for g in gezien if g[0] == "POST"]


@pytest.mark.parametrize("pad,inhoud", [
    (".env", "OPENAI_API_KEY=iets\n"),
    ("config/.env.local", "X=1\n"),
    ("deploy/server.pem", "certificaat\n"),
    ("src/sleutel.ts", "export const k = 'sk-ant-" + "a" * 40 + "';\n"),
    ("src/stripe.ts", "const s = 'sk_live_" + "b" * 30 + "';\n"),
])
def test_geheimen_gaan_nooit_mee(repo, pad, inhoud):
    werk, remote = repo
    doel = werk / pad
    doel.parent.mkdir(parents=True, exist_ok=True)
    doel.write_text(inhoud)
    voor = sh(werk, "rev-parse", "HEAD")
    uit = publiceer(http=github()[0])
    assert uit["gepusht"] is False and uit["geblokkeerd"] is True
    assert sh(werk, "rev-parse", "HEAD") == voor, "er mag niets gecommit zijn"


def _jwt(rol: str) -> str:
    deel = base64.urlsafe_b64encode(json.dumps({"iss": "supabase", "role": rol}).encode()).decode().rstrip("=")
    return f"eyJhbGciOiJIUzI1NiJ9.{deel}.handtekeninghandtekening"


def test_service_role_jwt_is_geheim_anon_niet(repo):
    assert bp.lijkt_geheim(f"const k = '{_jwt('service_role')}'") is True
    assert bp.lijkt_geheim(f"const k = '{_jwt('anon')}'") is False


def test_een_voorbeeld_env_mag_wel(repo):
    werk, _ = repo
    (werk / ".env.example").write_text("POLYGON_API_KEY=\n")
    uit = publiceer(http=github()[0])
    assert uit["gepusht"] is True


def test_zonder_token_wel_gepusht_maar_geen_pr(repo):
    werk, remote = repo
    (werk / "app.py").write_text("print('x')\n")
    uit = publiceer(token="")
    assert uit["gepusht"] is True and uit["pr"] is None and "GITHUB_TOKEN" in uit["reden_geen_pr"]
    assert sh(remote, "rev-parse", "axe-agent").strip()


def test_nooit_op_main(repo):
    werk, _ = repo
    sh(werk, "checkout", "-q", "main")
    (werk / "app.py").write_text("print('main')\n")
    uit = publiceer(http=github()[0])
    assert uit["gepusht"] is False and "beschermde branch" in uit["reden"]


def test_noodknop(monkeypatch):
    monkeypatch.setenv("AXE_BOUW_PUSH", "0")
    assert bp.aan() is False
    monkeypatch.delenv("AXE_BOUW_PUSH")
    assert bp.aan() is True


# ── 28 okt: de werkbranch haalt main binnen, en de PR krijgt een sleutel ─────

@pytest.fixture
def twee_kanten(tmp_path):
    """Een kale remote met main, een werk-checkout op axe-agent, en een tweede kloon die main bijwerkt."""
    remote = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(remote)], check=True, capture_output=True)
    werk = tmp_path / "werk"
    subprocess.run(["git", "clone", "-q", str(remote), str(werk)], check=True, capture_output=True)
    for pad in (werk,):
        sh(pad, "config", "user.email", "test@example.com")
        sh(pad, "config", "user.name", "Test")
    (werk / "app.py").write_text("regel = 1\n")
    sh(werk, "add", "-A")
    sh(werk, "commit", "-q", "-m", "begin")
    sh(werk, "push", "-q", "origin", "main")
    sh(werk, "remote", "set-head", "origin", "main")
    sh(werk, "checkout", "-q", "-b", "axe-agent")
    sh(werk, "push", "-q", "-u", "origin", "axe-agent")
    ander = tmp_path / "ander"
    subprocess.run(["git", "clone", "-q", str(remote), str(ander)], check=True, capture_output=True)
    sh(ander, "config", "user.email", "ander@example.com")
    sh(ander, "config", "user.name", "Ander")
    return werk, remote, ander


def main_krijgt(ander, bestand, inhoud):
    (ander / bestand).write_text(inhoud)
    sh(ander, "add", "-A")
    sh(ander, "commit", "-q", "-m", f"main: {bestand}")
    sh(ander, "push", "-q", "origin", "main")


def test_een_werkbranch_die_achterloopt_haalt_main_binnen(twee_kanten):
    werk, _, ander = twee_kanten
    (werk / "agent.py").write_text("x = 1\n")
    sh(werk, "add", "-A")
    sh(werk, "commit", "-q", "-m", "werk van de lus")
    main_krijgt(ander, "nieuw_op_main.py", "y = 2\n")
    uit = bp.ververs_werkbranch(agent_runner._git, str(werk), "axe-agent")
    assert uit["actie"] == "gemerged" and uit["achter"] == 1
    assert (werk / "nieuw_op_main.py").exists() and (werk / "agent.py").exists()


def test_botst_main_dan_gaat_het_oude_werk_naar_een_archief_en_begint_de_branch_op_main(twee_kanten):
    from datetime import datetime, timezone
    werk, remote, ander = twee_kanten
    (werk / "app.py").write_text("regel = 'van de lus'\n")
    sh(werk, "commit", "-q", "-am", "oud werk op oude code")
    sh(werk, "push", "-q", "origin", "axe-agent")
    oud = sh(werk, "rev-parse", "HEAD").strip()
    main_krijgt(ander, "app.py", "regel = 'van main'\n")
    uit = bp.ververs_werkbranch(agent_runner._git, str(werk), "axe-agent",
                                nu=datetime(2026, 10, 28, 9, 0, tzinfo=timezone.utc))
    assert uit["actie"] == "opnieuw" and uit["archief"] == "axe-agent-archief-20261028-0900"
    assert "reden" not in uit
    # Niets weg: het oude werk staat op GitHub onder het archief.
    assert sh(remote, "rev-parse", "axe-agent-archief-20261028-0900").strip() == oud
    # De werkbranch staat nu op main, lokaal en op de remote.
    assert (werk / "app.py").read_text() == "regel = 'van main'\n"
    assert sh(remote, "rev-parse", "axe-agent").strip() == sh(remote, "rev-parse", "main").strip()


def test_een_vuile_checkout_wordt_niet_aangeraakt(twee_kanten):
    werk, _, ander = twee_kanten
    main_krijgt(ander, "nieuw.py", "z = 3\n")
    (werk / "app.py").write_text("half werk\n")
    uit = bp.ververs_werkbranch(agent_runner._git, str(werk), "axe-agent")
    assert uit["actie"] == "geen" and "uncommitted" in uit["reden"]
    assert (werk / "app.py").read_text() == "half werk\n"


def test_main_zelf_wordt_nooit_ververst(twee_kanten):
    werk, _, _ = twee_kanten
    assert bp.ververs_werkbranch(agent_runner._git, str(werk), "main")["actie"] == "geen"


def test_github_token_gebruikt_de_login_van_git_als_er_geen_sleutel_staat():
    gezien = []

    def run(cmd, **kw):
        gezien.append(cmd[:2])
        if cmd[:2] == ["gh", "auth"]:
            raise FileNotFoundError("gh")
        assert kw["env"]["GIT_TERMINAL_PROMPT"] == "0"
        return subprocess.CompletedProcess(cmd, 0, stdout="protocol=https\nhost=github.com\nusername=x\npassword=gho_test\n")
    assert bp.github_token(env={}, run=run) == "gho_test"
    assert gezien == [["gh", "auth"], ["git", "credential"]]
    assert bp.github_token(env={"GITHUB_TOKEN": "uit-env"}, run=run) == "uit-env"


def test_github_token_zonder_enige_login_is_leeg():
    def run(cmd, **kw):
        return subprocess.CompletedProcess(cmd, 1, stdout="", stderr="no")
    assert bp.github_token(env={}, run=run) == ""


def test_een_checkout_van_de_oude_repo_wordt_een_kloon_van_de_nieuwe(tmp_path):
    oud = tmp_path / "oud"
    subprocess.run(["git", "init", "-q", "-b", "axe-agent", str(oud)], check=True)
    sh(oud, "remote", "add", "origin", "https://github.com/Ldezeeuw445/axon-memory-app.git")
    nieuw_remote = tmp_path / "axon-memory.git"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(nieuw_remote)], check=True)
    zaad = tmp_path / "zaad"
    subprocess.run(["git", "clone", "-q", str(nieuw_remote), str(zaad)], check=True, capture_output=True)
    sh(zaad, "config", "user.email", "t@example.com")
    sh(zaad, "config", "user.name", "T")
    (zaad / "README.md").write_text("AXON\n")
    sh(zaad, "add", "-A")
    sh(zaad, "commit", "-q", "-m", "begin")
    sh(zaad, "push", "-q", "origin", "main")
    werk_map = tmp_path / "werk"
    overrides = werk_map / "agent-repos.json"
    uit = bp.zorg_voor_canon(agent_runner._git, "axon-memory", str(oud), werk_map=str(werk_map),
                             overrides_pad=str(overrides), url_voor=lambda r: str(nieuw_remote))
    assert uit["actie"] == "overgezet" and uit["van"] == "Ldezeeuw445/axon-memory-app"
    assert uit["naar"] == "Ldezeeuw445/axon-memory"
    kloon = werk_map / "axon-memory"
    assert (kloon / "README.md").read_text() == "AXON\n"
    assert sh(kloon, "rev-parse", "--abbrev-ref", "HEAD").strip() == "axe-agent"
    assert json.loads(overrides.read_text()) == {"axon-memory": str(kloon)}


def test_de_juiste_repo_of_een_onbekende_naam_blijft_zoals_hij_is(tmp_path):
    goed = tmp_path / "goed"
    subprocess.run(["git", "init", "-q", str(goed)], check=True)
    sh(goed, "remote", "add", "origin", "git@github.com:Ldezeeuw445/axon-memory.git")
    kw = {"werk_map": str(tmp_path / "w"), "overrides_pad": str(tmp_path / "w" / "o.json")}
    assert bp.zorg_voor_canon(agent_runner._git, "axon-memory", str(goed), **kw) == {"actie": "geen"}
    assert bp.zorg_voor_canon(agent_runner._git, "iets-anders", str(goed), **kw) == {"actie": "geen"}
    lokaal = tmp_path / "lokaal"
    subprocess.run(["git", "init", "-q", str(lokaal)], check=True)
    assert bp.zorg_voor_canon(agent_runner._git, "axon-memory", str(lokaal), **kw) == {"actie": "geen"}
    assert not (tmp_path / "w").exists()


def test_de_whitelist_volgt_alleen_een_override_binnen_de_werkmap(tmp_path, monkeypatch):
    werk_map = tmp_path / "werk"
    (werk_map / "axon-memory").mkdir(parents=True)
    (werk_map / "agent-repos.json").write_text(json.dumps({
        "axon-memory": str(werk_map / "axon-memory"), "nieuw": str(werk_map / "x"), "axe-core": "/etc"}))
    monkeypatch.setattr(agent_runner, "WERK_MAP", str(werk_map))
    monkeypatch.setattr(agent_runner, "WERK_OVERRIDES", str(werk_map / "agent-repos.json"))
    monkeypatch.setenv("AGENT_REPOS", f"axon-memory={tmp_path}/oud,axe-core={tmp_path}/core")
    repos = agent_runner._repos()
    assert repos["axon-memory"] == os.path.realpath(werk_map / "axon-memory")
    assert repos["axe-core"] == str(tmp_path / "core") and "nieuw" not in repos
