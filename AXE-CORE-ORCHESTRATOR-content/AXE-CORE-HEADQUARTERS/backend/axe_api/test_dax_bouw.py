"""DAX-bouw met echte git: een lokale kale repo speelt GitHub, de API is nagebootst."""
import json
import subprocess

import httpx
import pytest

import dax_bouw as db_


class Lokaal:
    """Speelt DaxUitvoerder na: dezelfde shell(), maar hier op de testmachine."""

    def __init__(self, werkmap):
        self.werkmap = str(werkmap)

    def _run(self, command, stdin=None):
        p = subprocess.run(["bash", "-c", command], cwd=self.werkmap, capture_output=True, text=True,
                           input=stdin, timeout=120, check=False)
        return {"exit_code": p.returncode, "stdout": p.stdout, "stderr": p.stderr}

    def shell(self, command, cwd=None):
        return self._run(command)

    def shell_stdin(self, command, stdin):
        return self._run(command, stdin)


def sh(pad, *args):
    return subprocess.run(["git", *args], cwd=pad, capture_output=True, text=True, check=True).stdout


@pytest.fixture
def omgeving(tmp_path, monkeypatch):
    remote = tmp_path / "axon-memory.git"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(remote)], check=True)
    zaad = tmp_path / "zaad"
    subprocess.run(["git", "clone", "-q", str(remote), str(zaad)], check=True, capture_output=True)
    sh(zaad, "config", "user.email", "t@example.com")
    sh(zaad, "config", "user.name", "T")
    (zaad / "app.js").write_text("export const a = 1;\n")
    (zaad / "docs").mkdir()
    (zaad / "docs" / "tasks.json").write_text('{"A1": "todo"}\n')
    sh(zaad, "add", "-A")
    sh(zaad, "commit", "-q", "-m", "begin")
    sh(zaad, "push", "-q", "origin", "main")
    monkeypatch.setattr(db_, "REPOS_MAP", str(tmp_path / "repos"))
    monkeypatch.setitem(db_.REPOS, "axon-memory", {"bouwlijst": "docs/tasks.json", "regels": "CLAUDE.md", "test": "true"})
    werk = tmp_path / "taak"
    werk.mkdir()
    ux = Lokaal(werk)
    prep = db_.voorbereid(ux, "axon-memory", "abc123-taak", token="", url=str(remote))
    assert "fout" not in prep, prep
    return ux, prep, remote


def github(merged=True):
    gezien = []

    def handler(request: httpx.Request):
        body = json.loads(request.content) if request.content else None
        gezien.append((request.method, request.url.path, body))
        if request.method == "GET":
            return httpx.Response(200, json=[])
        if request.method == "POST":
            return httpx.Response(201, json={"html_url": "https://github.com/Ldezeeuw445/axon-memory/pull/40", "number": 40})
        return httpx.Response(200, json={"merged": merged})
    return httpx.Client(transport=httpx.MockTransport(handler)), gezien


def test_voorbereid_maakt_een_worktree_op_een_eigen_branch_vers_van_main(omgeving):
    _, prep, _ = omgeving
    assert prep["branch"] == "dax/abc123-taak" and prep["basis"] == "origin/main"
    assert sh(prep["pad"], "rev-parse", "--abbrev-ref", "HEAD").strip() == "dax/abc123-taak"
    assert (__import__("pathlib").Path(prep["pad"]) / "app.js").exists()


def test_klein_en_groen_gaat_live_zoals_grok_bot(omgeving):
    ux, prep, remote = omgeving
    (__import__("pathlib").Path(prep["pad"]) / "app.js").write_text("export const a = 2;\n")
    client, gezien = github()
    uit = db_.afronden(ux, prep, "axon-memory", "A1: a wordt 2", "Done, tests ran.", "abc123-taak",
                       token="t", http=client)
    assert uit["gepusht"] is True and uit["tests_ok"] is True and uit["zelf_mergen"] is True
    assert uit["gemerged"] is True and uit["pr"].endswith("/pull/40")
    # De commit staat echt op de remote, op de eigen branch, met de taak erin.
    assert "A1: a wordt 2" in sh(remote, "log", "-1", "--format=%B", "dax/abc123-taak")
    post = next(g for g in gezien if g[0] == "POST")
    assert post[2]["draft"] is False and post[2]["base"] == "main" and post[2]["head"] == "dax/abc123-taak"
    put = next(g for g in gezien if g[0] == "PUT")
    assert put[1].endswith("/pulls/40/merge") and put[2]["merge_method"] == "squash"


def test_billing_of_migraties_wachten_op_luka_als_draft(omgeving):
    ux, prep, _ = omgeving
    import pathlib
    m = pathlib.Path(prep["pad"]) / "supabase" / "migrations"
    m.mkdir(parents=True)
    (m / "20261028_x.sql").write_text("alter table t add column c int;\n")
    client, gezien = github()
    uit = db_.afronden(ux, prep, "axon-memory", "A2: kolom", "", "abc123-taak", token="t", http=client)
    assert uit["gepusht"] is True and uit["zelf_mergen"] is False and "only Luka" in uit["waarom"]
    assert next(g for g in gezien if g[0] == "POST")[2]["draft"] is True
    assert not [g for g in gezien if g[0] == "PUT"]


def test_rode_tests_betekenen_een_draft_en_geen_merge(omgeving, monkeypatch):
    ux, prep, _ = omgeving
    monkeypatch.setitem(db_.REPOS, "axon-memory", {"test": "echo kapot; false"})
    (__import__("pathlib").Path(prep["pad"]) / "app.js").write_text("export const a = 3;\n")
    client, gezien = github()
    uit = db_.afronden(ux, prep, "axon-memory", "A3", "", "abc123-taak", token="t", http=client)
    assert uit["tests_ok"] is False and uit["zelf_mergen"] is False
    assert not [g for g in gezien if g[0] == "PUT"]


def test_een_sleutel_in_de_wijziging_wordt_nooit_gepusht(omgeving):
    ux, prep, remote = omgeving
    (__import__("pathlib").Path(prep["pad"]) / "config.js").write_text(
        "const k = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';\n")
    uit = db_.afronden(ux, prep, "axon-memory", "A4", "", "abc123-taak", token="t", http=github()[0])
    assert uit["geblokkeerd"] is True and uit["gepusht"] is False
    branches = sh(remote, "branch", "--list", "dax/*")
    assert "dax/abc123-taak" not in branches


def test_niets_veranderd_is_geen_pr(omgeving):
    ux, prep, _ = omgeving
    assert db_.afronden(ux, prep, "axon-memory", "A5", "", "abc123-taak", token="t", http=github()[0]) == {
        "veranderd": False, "reden": "no changes"}


def test_een_halve_clone_van_een_eerdere_ronde_blokkeert_niet_meer(omgeving, tmp_path):
    """29 okt: '/dax/workspace/repos/axon-memory already exists and is not an empty directory'."""
    import pathlib
    _, _, remote = omgeving
    basis = pathlib.Path(db_.REPOS_MAP) / "axon-memory"
    import shutil
    shutil.rmtree(basis)
    basis.mkdir(parents=True)
    (basis / "rest-van-een-mislukte-clone").write_text("x")
    werk = tmp_path / "taak2"
    werk.mkdir()
    prep = db_.voorbereid(Lokaal(werk), "axon-memory", "def456-taak", token="", url=str(remote))
    assert "fout" not in prep, prep
    assert (basis / ".git").is_dir() and not (basis / "rest-van-een-mislukte-clone").exists()
    assert (pathlib.Path(prep["pad"]) / "app.js").exists()


def test_een_onbekende_repo_wordt_niet_uitgecheckt(tmp_path):
    assert "fout" in db_.voorbereid(Lokaal(tmp_path), "iets-anders", "x")


class _Db:
    def __init__(self, taken=None):
        self.taken = list(taken or [])
        self.ingevoegd = []

    def table(self, naam):
        db = self

        class Q:
            def __init__(self):
                self.filters, self.statussen, self.rij = [], None, None

            def select(self, *_a):
                return self

            def eq(self, k, v):
                self.filters.append((k, v))
                return self

            def in_(self, k, v):
                self.statussen = set(v)
                return self

            def order(self, *_a, **_k):
                return self

            def limit(self, *_a):
                return self

            def insert(self, rij):
                self.rij = rij
                return self

            def update(self, velden):
                self.wijziging = velden
                return self

            def execute(self):
                if getattr(self, "wijziging", None) is not None:
                    for t in db.taken:
                        if all(t.get(k) == v for k, v in self.filters):
                            t.update(self.wijziging)
                    return type("R", (), {"data": []})()
                if self.rij is not None:
                    db.ingevoegd.append(self.rij)
                    db.taken.append({**self.rij, "id": f"t{len(db.taken)}"})
                    return type("R", (), {"data": [db.taken[-1]]})()
                uit = [t for t in reversed(db.taken)
                       if all(t.get(k) == v for k, v in self.filters)
                       and (self.statussen is None or t.get("status") in self.statussen)]
                return type("R", (), {"data": uit})()
        return Q()


def test_de_dienst_geeft_om_de_beurt_een_taak_en_nooit_twee_tegelijk():
    from datetime import datetime, timezone
    nu = datetime(2026, 10, 28, 16, 20, tzinfo=timezone.utc)
    db = _Db()
    eerste = db_.plan_bouwtaak(db, nu)
    assert eerste["gepland"] is True and eerste["repo"] == "axon-memory"
    rij = db.ingevoegd[0]
    assert rij["assignee"] == "developer" and rij["payload"]["free_models"] is True and rij["payload"]["dax_bouw"] is True
    # Nog open: geen tweede.
    assert db_.plan_bouwtaak(db, nu)["gepland"] is False
    db.taken[-1]["status"] = "completed"
    tweede = db_.plan_bouwtaak(db, nu)
    assert tweede["gepland"] is True and tweede["repo"] == "AXE-CORE-"


def test_gevoelige_paden():
    assert db_.gevoelig(["supabase/functions/stripe-webhook/index.ts", "src/pages/Login.jsx",
                         "src/lib/auth.ts", "docs/tasks.json", "src/App.jsx", ".github/workflows/x.yml"]) == [
        "supabase/functions/stripe-webhook/index.ts", "src/lib/auth.ts", ".github/workflows/x.yml"]


def test_geen_bouwtaak_zolang_github_de_sleutel_weigert(monkeypatch):
    from datetime import datetime, timezone

    import gezondheid
    monkeypatch.setitem(gezondheid._cache, "uit", {"checks": {"github": {"state": "fail"}}})
    db = _Db()
    uit = db_.plan_bouwtaak(db, datetime(2026, 10, 29, 9, 20, tzinfo=timezone.utc))
    assert uit["gepland"] is False and "vps-github-key" in uit["reden"] and not db.ingevoegd


def test_sleutelfouten_verdwijnen_uit_home_maar_andere_fouten_blijven(monkeypatch):
    from datetime import datetime, timezone

    import gezondheid
    monkeypatch.setitem(gezondheid._cache, "uit", {"checks": {"github": {"state": "fail"}}})
    sleutel = {"message": "DAX build checkout failed: fatal: could not read Username for "
                          "'https://github.com': No such device or address"}
    db = _Db([
        {"id": "a", "assignee": "developer", "status": "failed", "payload": {"dax_bouw": True},
         "error": sleutel, "metadata": {"dax_bouw": True}},
        {"id": "b", "assignee": "developer", "status": "failed", "payload": {"dax_bouw": True},
         "error": {"message": "tests red"}, "metadata": {}},
        {"id": "c", "assignee": "developer", "status": "failed", "payload": {}, "error": sleutel, "metadata": {}},
    ])
    uit = db_.plan_bouwtaak(db, datetime(2026, 10, 29, 11, 20, tzinfo=timezone.utc))
    assert uit["gepland"] is False and uit["gearchiveerd"] == 1
    a, b, c = db.taken
    assert a["status"] == "cancelled" and a["metadata"]["archived"] is True and a["error"]["archived"] is True
    assert "vps-github-key" in a["metadata"]["archive_reason"] and "could not read Username" in a["error"]["message"]
    assert b["status"] == "failed" and c["status"] == "failed"
