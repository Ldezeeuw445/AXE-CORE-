"""bouw_publiceer met echte git: een lokale kale repo speelt GitHub, de API is nagebootst."""
import base64
import json
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
