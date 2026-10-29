"""DAX-bouw: de developer-DAX schrijft code zoals Grok Bot dat doet.

## Waarom (Luka, 28 okt 2026)

"DAX bots die exact hetzelfde werken als Grok bots, maar zonder usage-kosten,
want ze zijn van AXE Core zelf." Gemeten die dag: Grok Bot pakt in axon-memory
een taak van de bouwlijst, bouwt, test, pusht een branch, opent een PR en
merget hem in dezelfde minuut (#33, #34, #38). De developer-DAX draaide alleen
een CI-check: hij had geen eigen checkout, en na de agentlus gebeurde er niets.

## Wat dit doet

Een taak voor `developer` met `payload.dax_bouw` en `payload.repo`:

  1. voorbereid(): in de DAX een vaste kloon per repo (/dax/workspace/repos) en
     per taak een git-worktree op `dax/<taak>`, vers van de standaardbranch.
  2. de bestaande agentlus doet het werk in die worktree, alleen met gratis
     modellen (Groq, eigen Ollama): geen usage-kosten.
  3. afronden(): geheimen-controle (dezelfde regels als de bouwlus), tests van
     de repo, commit, push van de eigen branch, en een PR.
  4. Mergen doet hij zelf, zoals Grok Bot, alleen als alles klopt: tests groen,
     niets gevoeligs geraakt (migraties, billing/Stripe, auth/RLS, deploy, CI,
     lockfiles) en hooguit MAX_REGELS gewijzigde regels. Anders blijft het een
     draft-PR voor Luka. Een gratis model zet geen billing of RLS live.

De GitHub-sleutel gaat alleen via stdin de container in, per commando, en komt
nooit in een bestand, in git-config of in een log.

plan_bouwtaak() is de staande dienst die de developer elke paar uur één taak
geeft als hij er geen open heeft: "pak de volgende open taak van de bouwlijst".
"""
from __future__ import annotations

import logging
import re
import shlex
from datetime import datetime
from typing import Any

import httpx

from bouw_publiceer import TOEGESTAAN_PAD, VERBODEN_PAD, github_token, lijkt_geheim

log = logging.getLogger("axe_dax_bouw")

EIGENAAR = "Ldezeeuw445"
REPOS_MAP = "/dax/workspace/repos"
MAX_REGELS = 400
AUTEUR = ("AXE DAX developer", f"{EIGENAAR}@users.noreply.github.com")

# Per repo: waar de bouwlijst staat, en hoe de repo zichzelf test in een DAX
# (node, python3 en git zijn er; deno niet). Geen testcommando = nooit zelf mergen.
REPOS: dict[str, dict[str, str]] = {
    "axon-memory": {
        "bouwlijst": "docs/tasks.json",
        "regels": "CLAUDE.md",
        "test": "npm ci --no-audit --no-fund --loglevel=error && npm run test:naming && npm run build",
    },
    "AXE-CORE-": {
        "bouwlijst": "AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/docs/programma/programma.json",
        "regels": "AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/AGENTS.md",
        "test": "",
    },
}
# Welke repo de dienst om de beurt een taak geeft.
BEURT = ("axon-memory", "AXE-CORE-")

# Wat nooit zonder Luka live mag, ook niet met groene tests.
GEVOELIG = re.compile(
    r"(^|/)(supabase/migrations/|migrations?/|\.github/|infra/|src-tauri/|deploy[^/]*|"
    r"wrangler\.(toml|jsonc?)$|dockerfile|docker-compose[^/]*$|package-lock\.json$|"
    r"pnpm-lock\.yaml$|yarn\.lock$)|stripe|billing|webhook|checkout|subscription|"
    r"(^|[/_.-])(auth|rls|polic(y|ies)|secrets?|vault)([/_.-]|$)",
    re.IGNORECASE,
)

_AUTH_SH = (
    'IFS= read -r T || true\n'
    'g() { if [ -n "$T" ]; then git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic '
    '$(printf "x-access-token:%s" "$T" | base64 | tr -d "\\n")" "$@"; else git "$@"; fi; }\n'
)


def branch_voor(taak_id: str) -> str:
    veilig = "".join(ch for ch in str(taak_id) if ch.isalnum() or ch in "-_")[:12] or "taak"
    return f"dax/{veilig}"


def _url(repo: str) -> str:
    return f"https://github.com/{EIGENAAR}/{repo}.git"


def voorbereid(ux: Any, repo: str, taak_id: str, token: str = "", url: str | None = None) -> dict[str, Any]:
    """Kloon (eenmalig) en een worktree op dax/<taak>. {"pad", "branch", "basis"} of {"fout"}."""
    if repo not in REPOS:
        return {"fout": f"repo {repo!r} is not set up for DAX building"}
    branch = branch_voor(taak_id)
    basis_map = f"{REPOS_MAP}/{repo}"
    pad = f"{ux.werkmap}/{repo}"
    script = _AUTH_SH + "\n".join([
        "set -e",
        f"B={shlex.quote(basis_map)}",
        f'if [ ! -d "$B/.git" ]; then mkdir -p {shlex.quote(REPOS_MAP)}; g clone --quiet {shlex.quote(url or _url(repo))} "$B"; fi',
        'g -C "$B" fetch --quiet --prune origin',
        'git -C "$B" remote set-head origin --auto >/dev/null 2>&1 || true',
        'D=$(git -C "$B" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || echo origin/main)',
        'git -C "$B" worktree prune',
        f'rm -rf {shlex.quote(pad)}',
        f'git -C "$B" worktree add --quiet --force -B {shlex.quote(branch)} {shlex.quote(pad)} "$D"',
        'echo "BASIS=$D"',
    ])
    uit = _met_stdin(ux, script, token)
    if uit.get("exit_code") != 0:
        return {"fout": (uit.get("stderr") or uit.get("stdout") or "checkout failed")[-400:].replace(token or "\0", "***")}
    basis = next((r.split("=", 1)[1] for r in (uit.get("stdout") or "").splitlines() if r.startswith("BASIS=")), "origin/main")
    return {"pad": pad, "branch": branch, "basis": basis}


def _wil_stdin(ux: Any) -> bool:
    return hasattr(ux, "runtime") and hasattr(ux, "computer")


def _met_stdin(ux: Any, script: str, token: str, timeout: int = 900) -> dict[str, Any]:
    """Het script krijgt de sleutel op stdin; zonder runtime (tests) via ux.shell_stdin."""
    if _wil_stdin(ux):
        return ux.runtime.exec(ux.computer, script, cwd=ux.werkmap, timeout=timeout, stdin=(token or "") + "\n")
    return ux.shell_stdin(script, (token or "") + "\n")


def _git(ux: Any, pad: str, args: str) -> dict[str, Any]:
    return ux.shell(f"git -C {shlex.quote(pad)} {args}")


def wijzigingen(ux: Any, pad: str) -> dict[str, Any]:
    """Stage alles en geef paden, toegevoegde regels en het aantal gewijzigde regels."""
    _git(ux, pad, "add -A")
    namen = (_git(ux, pad, "diff --cached --name-only").get("stdout") or "").split("\n")
    paden = [p.strip() for p in namen if p.strip()]
    diff = _git(ux, pad, "diff --cached --unified=0 --no-color").get("stdout") or ""
    toegevoegd = "\n".join(r[1:] for r in diff.splitlines() if r.startswith("+") and not r.startswith("+++"))
    regels = 0
    for r in (_git(ux, pad, "diff --cached --numstat").get("stdout") or "").splitlines():
        delen = r.split("\t")
        if len(delen) >= 2:
            regels += sum(int(x) for x in delen[:2] if x.isdigit())
    return {"paden": paden, "toegevoegd": toegevoegd, "regels": regels}


def controleer(w: dict[str, Any]) -> str | None:
    verboden = [p for p in w["paden"] if VERBODEN_PAD.search(p) and not TOEGESTAAN_PAD.search(p)]
    if verboden:
        return "secret-looking files would be committed: " + ", ".join(verboden[:5])
    if lijkt_geheim(w["toegevoegd"]):
        return "an added line looks like an API key or private key"
    return None


def gevoelig(paden: list[str]) -> list[str]:
    return [p for p in paden if GEVOELIG.search(p)]


def mag_zelf_mergen(tests_ok: bool | None, w: dict[str, Any]) -> tuple[bool, str]:
    if tests_ok is not True:
        return False, "tests did not run green in the DAX" if tests_ok is False else "this repo has no DAX test command"
    raak = gevoelig(w["paden"])
    if raak:
        return False, "touches what only Luka puts live: " + ", ".join(raak[:4])
    if w["regels"] > MAX_REGELS:
        return False, f"{w['regels']} changed lines, more than {MAX_REGELS}"
    return True, "tests green, nothing sensitive, small change"


def _pr(http: httpx.Client, token: str, repo: str, branch: str, basis: str, titel: str, tekst: str,
        draft: bool) -> dict[str, Any]:
    kop = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    api = f"https://api.github.com/repos/{EIGENAAR}/{repo}"
    r = http.get(f"{api}/pulls", headers=kop, params={"head": f"{EIGENAAR}:{branch}", "state": "open"})
    r.raise_for_status()
    if r.json():
        return r.json()[0]
    r = http.post(f"{api}/pulls", headers=kop, json={
        "title": titel, "head": branch, "base": basis.split("/", 1)[-1], "body": tekst, "draft": draft})
    r.raise_for_status()
    return r.json()


def _merge(http: httpx.Client, token: str, repo: str, nummer: int, titel: str) -> bool:
    kop = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    r = http.put(f"https://api.github.com/repos/{EIGENAAR}/{repo}/pulls/{nummer}/merge", headers=kop,
                 json={"merge_method": "squash", "commit_title": f"{titel} (#{nummer})"})
    return r.status_code == 200 and bool(r.json().get("merged"))


def afronden(ux: Any, prep: dict[str, Any], repo: str, titel: str, verslag: str, taak_id: str, *,
             token: str | None = None, http: httpx.Client | None = None) -> dict[str, Any]:
    """Controle, tests, commit, push, PR en eventueel zelf mergen. Gooit nooit."""
    pad, branch, basis = prep["pad"], prep["branch"], prep.get("basis") or "origin/main"
    try:
        w = wijzigingen(ux, pad)
        if not w["paden"]:
            return {"veranderd": False, "reden": "no changes"}
        weigering = controleer(w)
        if weigering:
            _git(ux, pad, "reset -q")
            return {"veranderd": True, "gepusht": False, "geblokkeerd": True, "reden": weigering}
        testcmd = REPOS.get(repo, {}).get("test") or ""
        tests_ok: bool | None = None
        test_staart = ""
        if testcmd:
            t = ux.shell(f"cd {shlex.quote(pad)} && ( {testcmd} ) 2>&1 | tail -40; exit ${{PIPESTATUS[0]}}")
            tests_ok = t.get("exit_code") == 0
            test_staart = (t.get("stdout") or t.get("stderr") or "")[-1500:]
            # Een test kan bestanden maken (build-output, lockfile): opnieuw stagen en controleren.
            w = wijzigingen(ux, pad)
            weigering = controleer(w)
            if weigering:
                _git(ux, pad, "reset -q")
                return {"veranderd": True, "gepusht": False, "geblokkeerd": True, "reden": weigering}
        naam, mail = AUTEUR
        bericht = f"{titel}\n\n{(verslag or '').strip()[:3000]}\n\nAXE DAX developer, task {taak_id}"
        c = ux.shell(f"git -C {shlex.quote(pad)} -c user.name={shlex.quote(naam)} -c user.email={shlex.quote(mail)} "
                     f"commit -q -F - <<'AXE_DAX_EOF'\n{bericht}\nAXE_DAX_EOF")
        if c.get("exit_code") != 0:
            return {"veranderd": True, "gepusht": False, "reden": "commit failed: " + (c.get("stderr") or "")[-300:]}
        sha = (_git(ux, pad, "rev-parse --short HEAD").get("stdout") or "").strip()
        token = github_token() if token is None else token
        p = _met_stdin(ux, _AUTH_SH + f"g -C {shlex.quote(pad)} push --quiet origin {shlex.quote(branch)}:refs/heads/{shlex.quote(branch)}", token)
        if p.get("exit_code") != 0:
            fout = (p.get("stderr") or "push failed")[-300:].replace(token or "\0", "***")
            return {"veranderd": True, "gepusht": False, "sha": sha, "reden": fout}
        uit: dict[str, Any] = {"veranderd": True, "gepusht": True, "branch": branch, "sha": sha,
                               "regels": w["regels"], "tests_ok": tests_ok}
        zelf, waarom = mag_zelf_mergen(tests_ok, w)
        uit["zelf_mergen"], uit["waarom"] = zelf, waarom
        if not token:
            uit["pr"], uit["reden_geen_pr"] = None, "no GitHub key on the control plane"
            return uit
        eigen = http is None
        http = http or httpx.Client(timeout=30)
        try:
            tekst = (f"Built by the AXE DAX developer on its own computer, free models only (no usage cost).\n\n"
                     f"{(verslag or '').strip()[:4000]}\n\n"
                     f"Tests in the DAX: {'green' if tests_ok else 'not green' if tests_ok is False else 'none for this repo'}"
                     f"{chr(10) + '```' + chr(10) + test_staart + chr(10) + '```' if test_staart else ''}\n\n"
                     f"Self-merge: {'yes' if zelf else 'no'} — {waarom}.")
            pr = _pr(http, token, repo, branch, basis, titel, tekst, draft=not zelf)
            uit["pr"] = pr.get("html_url")
            if zelf and pr.get("number"):
                uit["gemerged"] = _merge(http, token, repo, int(pr["number"]), titel)
        except (httpx.HTTPError, KeyError, ValueError) as e:
            uit.setdefault("pr", None)
            uit["reden_geen_pr"] = f"GitHub: {type(e).__name__}"
        finally:
            if eigen:
                http.close()
        return uit
    except Exception as e:  # noqa: BLE001 — afronden mag de taak nooit laten crashen
        return {"veranderd": None, "gepusht": False, "reden": f"{type(e).__name__}: {e}"[:300]}


def contract(prep: dict[str, Any], repo: str) -> str:
    """Wat de agent te horen krijgt bovenop de taak."""
    info = REPOS.get(repo, {})
    return (
        f"\n\n[AXE DAX build contract] You work in {prep['pad']} on branch {prep['branch']} "
        f"(fresh from {prep.get('basis')}). Read {info.get('regels', 'the repo rules')} first and follow it. "
        f"Pick ONE open task from {info.get('bouwlijst', 'the build list')} that you can finish now, "
        "implement it completely with tests, and update the build list entry in the same change. "
        "Do NOT commit, push or merge: when you stop, AXE checks for secrets, runs the repo's tests, "
        "commits, pushes this branch and opens the PR. Never touch billing, auth/RLS, migrations or deploy "
        "config unless the task is exactly that; those always wait for Luka. End with a short report: "
        "task id, what changed, what you ran."
    )


# ── De staande dienst: elke paar uur één bouwtaak ────────────────────────────

def _open_bouwtaken(db: Any) -> list[dict[str, Any]]:
    try:
        rijen = (db.table("core_tasks").select("id,status,payload,created_at")
                 .eq("assignee", "developer").in_("status", ["queued", "running", "waiting_approval"])
                 .limit(50).execute().data) or []
    except Exception as exc:  # noqa: BLE001
        log.warning("dax-bouw: open taken onleesbaar (%s)", exc)
        return []
    return [r for r in rijen if (r.get("payload") or {}).get("dax_bouw")]


def _github_geweigerd() -> bool:
    try:
        import gezondheid
    except ImportError:
        return False
    laatste = (gezondheid._cache.get("uit") or {}).get("checks") or {}
    return (laatste.get("github") or {}).get("state") == "fail"


def plan_bouwtaak(db: Any, nu: datetime) -> dict[str, Any]:
    """Eén taak voor de developer-DAX als hij er geen open heeft, om de beurt per repo."""
    if _open_bouwtaken(db):
        return {"gepland": False, "reden": "a DAX build task is still open"}
    # 28-29 okt: vier rondes faalden op "could not read Username" omdat GitHub de
    # sleutel van de VPS weigerde (401). Zolang /health dat meet: geen taak die
    # alleen maar kan mislukken; de eigenaar-actie vps-github-key zegt wat er moet.
    if _github_geweigerd():
        return {"gepland": False, "reden": "GitHub rejects the VPS key; waiting for a new one (owner action vps-github-key)"}
    try:
        laatste = (db.table("core_tasks").select("payload").eq("assignee", "developer")
                   .order("created_at", desc=True).limit(20).execute().data) or []
    except Exception:  # noqa: BLE001
        laatste = []
    vorige = next(((r.get("payload") or {}).get("repo") for r in laatste if (r.get("payload") or {}).get("dax_bouw")), None)
    i = (BEURT.index(vorige) + 1) % len(BEURT) if vorige in BEURT else 0
    repo = BEURT[i]
    rij = {
        "title": f"DAX build: next task in {repo}",
        "goal": (f"Take the next open task from the build list of {repo} that fits one run, "
                 "build it with tests, and report what changed."),
        "status": "queued", "priority": "medium", "source_app": "axe_core",
        "requested_by": "dax-bouw", "capability": "agentic", "assignee": "developer",
        "execution_mode": "patch",
        "payload": {"repo": repo, "dax_bouw": True, "free_models": True, "crew": False},
        "metadata": {"dax_bouw": True, "app": "axe_core", "gepland_op": nu.isoformat()},
    }
    try:
        data = db.table("core_tasks").insert(rij).execute().data or []
    except Exception as exc:  # noqa: BLE001
        return {"gepland": False, "reden": f"insert failed: {type(exc).__name__}"}
    return {"gepland": True, "repo": repo, "taak": (data[0] if data else {}).get("id")}


def diensten() -> tuple[dict[str, Any], ...]:
    return ({
        "agent": "dax-bouw", "name": "DAX developer builds like Grok Bot",
        "job_key": "axe_core:staande-dax-bouw", "cron_expr": "20 */4 * * *",
        "wat": "Give the developer DAX one build task when it has none open. Free models only.",
        "run": plan_bouwtaak,
    },)


