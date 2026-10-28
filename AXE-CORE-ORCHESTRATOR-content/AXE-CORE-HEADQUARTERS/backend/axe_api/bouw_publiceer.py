"""Het werk van de bouwlus vastleggen en op GitHub zetten, als draft-PR.

Tot 17 okt bleef elke bouwrun ongecommit in de checkout op de Mac mini staan
("Commit en push NIET; Luka bekijkt de diff"). Run na run stapelde zich op in
één werkboom die niemand zag; Luka vroeg om autopilot zonder dat werk kwijtraakt
of achterloopt. Nu: na een geslaagde schrijfrun met echte wijzigingen

  1. weigeren als er iets geheims mee zou gaan (een .env, een sleutelbestand, of
     een regel die op een sleutel lijkt);
  2. commit_en_push uit agent_runner: alleen op de werkbranch, nooit main of
     master, geen --force, geen lege commit;
  3. één draft-PR per werkbranch (bestaat hij al, dan werkt de push hem bij).

Wat dit NIET doet: mergen, of een PR uit draft halen. Dat blijft bij Luka.
Uitzetten zonder uitrol: AXE_BOUW_PUSH=0 in de omgeving van de planner.

## 28 okt: 61 pushes, nul PR's, en gebouwd op code van 11 september

Twee gaten, gemeten op de Mac mini:
  * elke run zei "no GITHUB_TOKEN on this host". Er werd wel gepusht (git heeft
    zijn eigen login), maar een PR vraagt de GitHub-API en die kreeg geen
    sleutel. github_token() gebruikt nu dezelfde login als git zelf;
  * de werkbranch haalde main nooit binnen. axe-agent in AXE Companion stond 27
    commits voor en 142 achter: elke "volgende stap" werd gebouwd op een
    checkout van 11 september. ververs_werkbranch() haalt main binnen voor elke
    schrijfrun. Botst dat, dan gaat de oude branch als archief naar GitHub
    (er raakt niets weg) en begint de werkbranch opnieuw op main. Dat is de enige
    plek met --force-with-lease, en alleen op de eigen werkbranch van de lus.
"""
from __future__ import annotations

import base64
import binascii
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from typing import Callable, Optional

import httpx

# Paden die nooit mee mogen, ook niet als .gitignore ze vergeet.
VERBODEN_PAD = re.compile(
    r"(^|/)(\.env(\.[\w-]+)?|[^/]*\.pem|[^/]*\.p12|[^/]*\.key|id_rsa[^/]*|id_ed25519[^/]*|"
    r"credentials(\.json)?|service[-_]account[^/]*\.json)$", re.I)
TOEGESTAAN_PAD = re.compile(r"(^|/)\.env\.(example|sample|template)$", re.I)
# Toegevoegde regels die op een echte sleutel lijken.
GEHEIM_REGEL = re.compile(
    r"(sk-(ant-|proj-)?[A-Za-z0-9_-]{20,}|(sk|rk)_live_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|"
    r"AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abp]-[A-Za-z0-9-]{20,}|"
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----)")
# Een Supabase-JWT is alleen geheim met role service_role; een anon-sleutel staat in elke frontend.
JWT = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}")


def lijkt_geheim(tekst: str) -> bool:
    if GEHEIM_REGEL.search(tekst):
        return True
    for m in JWT.finditer(tekst):
        deel = m.group(1)
        try:
            inhoud = base64.urlsafe_b64decode(deel + "=" * (-len(deel) % 4)).decode("utf-8", "replace")
        except (ValueError, binascii.Error):
            continue
        if '"service_role"' in inhoud:
            return True
    return False

Git = Callable[..., object]  # (pad, *args, timeout=...) -> CompletedProcess


def aan() -> bool:
    return os.environ.get("AXE_BOUW_PUSH", "1").strip() != "0"


def _paden(git: Git, pad: str) -> list[str]:
    uit = git(pad, "status", "--porcelain", "--untracked-files=all")
    paden = []
    for regel in (uit.stdout or "").splitlines():
        p = regel[3:].strip()
        if " -> " in p:
            p = p.split(" -> ", 1)[1]
        if p:
            paden.append(p.strip('"'))
    return paden


def _toegevoegd(git: Git, pad: str, paden: list[str]) -> str:
    """Alle regels die erbij komen: de diff tegen HEAD plus de nieuwe bestanden."""
    diff = git(pad, "diff", "HEAD", "--unified=0", "--no-color").stdout or ""
    regels = [r[1:] for r in diff.splitlines() if r.startswith("+") and not r.startswith("+++")]
    bekend = set((git(pad, "ls-files").stdout or "").split())
    for p in paden:
        if p in bekend:
            continue
        try:
            with open(os.path.join(pad, p), encoding="utf-8", errors="replace") as fh:
                regels.append(fh.read(200_000))
        except OSError:
            continue
    return "\n".join(regels)


def controleer(git: Git, pad: str) -> Optional[str]:
    """None als het veilig is om te committen, anders waarom niet."""
    paden = _paden(git, pad)
    verboden = [p for p in paden if VERBODEN_PAD.search(p) and not TOEGESTAAN_PAD.search(p)]
    if verboden:
        return "secret-looking files would be committed: " + ", ".join(verboden[:5])
    if lijkt_geheim(_toegevoegd(git, pad, paden)):
        return "an added line looks like an API key or private key"
    return None


def github_token(env: dict | None = None, run: Callable[..., subprocess.CompletedProcess] = subprocess.run) -> str:
    """Een GitHub-sleutel voor de PR, zonder dat Luka er een hoeft te zetten.

    Volgorde: GITHUB_TOKEN of GH_TOKEN; anders `gh auth token`; anders de login
    die git zelf gebruikt om te pushen (`git credential fill` voor github.com).
    Dat laatste is precies de sleutel waarmee de push al slaagde: een PR openen
    vraagt niets wat de push niet al mocht. Wordt nooit gelogd of teruggegeven.
    """
    env = dict(os.environ if env is None else env)
    token = (env.get("GITHUB_TOKEN") or env.get("GH_TOKEN") or "").strip()
    if token:
        return token
    stil = {**env, "GIT_TERMINAL_PROMPT": "0", "GH_PROMPT_DISABLED": "1"}
    try:
        p = run(["gh", "auth", "token", "--hostname", "github.com"], capture_output=True, text=True,
                timeout=10, env=stil)
        if p.returncode == 0 and (p.stdout or "").strip():
            return p.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    try:
        p = run(["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n",
                capture_output=True, text=True, timeout=10, env=stil)
        if p.returncode == 0:
            for regel in (p.stdout or "").splitlines():
                if regel.startswith("password="):
                    return regel.split("=", 1)[1].strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return ""


def _basis(git: Git, pad: str) -> str | None:
    """origin/<standaardbranch>, zoals de remote hem noemt."""
    kop = (git(pad, "symbolic-ref", "--short", "refs/remotes/origin/HEAD").stdout or "").strip()
    if kop:
        return kop
    for naam in ("origin/main", "origin/master"):
        if git(pad, "rev-parse", "--verify", "--quiet", naam).returncode == 0:
            return naam
    return None


def ververs_werkbranch(git: Git, pad: str, branch: str, nu: datetime | None = None) -> dict:
    """Haal de standaardbranch binnen voordat de lus verder bouwt. Gooit nooit.

    {"actie": "geen" | "gemerged" | "opnieuw", ...}; "opnieuw" noemt het archief.
    """
    if not branch or branch in ("main", "master"):
        return {"actie": "geen", "reden": "not a work branch"}
    if (git(pad, "status", "--porcelain").stdout or "").strip():
        return {"actie": "geen", "reden": "uncommitted changes in the checkout; left as is"}
    if git(pad, "fetch", "--quiet", "origin", timeout=180).returncode != 0:
        return {"actie": "geen", "reden": "fetch failed"}
    basis = _basis(git, pad)
    if not basis:
        return {"actie": "geen", "reden": "no default branch on origin"}
    try:
        achter = int((git(pad, "rev-list", "--count", f"HEAD..{basis}").stdout or "0").strip() or 0)
    except ValueError:
        achter = 0
    if achter == 0:
        return {"actie": "geen", "achter": 0}
    m = git(pad, "merge", "--no-edit", "-m", f"Merge {basis} into {branch} (AXE build loop)", basis, timeout=180)
    if m.returncode == 0:
        return {"actie": "gemerged", "achter": achter, "basis": basis}
    git(pad, "merge", "--abort")
    archief = f"{branch}-archief-{(nu or datetime.now(timezone.utc)).strftime('%Y%m%d-%H%M')}"
    git(pad, "branch", "-f", archief, "HEAD")
    if git(pad, "push", "--quiet", "origin", f"{archief}:refs/heads/{archief}", timeout=180).returncode != 0:
        return {"actie": "geen", "achter": achter,
                "reden": "main does not merge cleanly and the old branch could not be archived; nothing reset"}
    git(pad, "reset", "--hard", basis)
    weg = git(pad, "push", "--quiet", "--force-with-lease", "origin", f"{branch}:refs/heads/{branch}", timeout=180)
    return {"actie": "opnieuw", "achter": achter, "basis": basis, "archief": archief,
            **({} if weg.returncode == 0 else {"reden": "reset locally; the remote work branch was not updated"})}


# Waar elk product NU leeft. De naam op de whitelist van de Mac mini is een
# sleutel; de checkout erachter kan verouderd zijn. 28 okt: "axon-memory" wees
# naar een kloon van axon-memory-app, terwijl AXON sinds 17 okt in axon-memory
# wordt gebouwd. 21 bouwruns gingen zo naar een repo waar niemand meer kijkt.
# Alleen wat hier staat wordt afgedwongen; een onbekende naam blijft zoals hij is.
CANON = {
    "axon-memory": "Ldezeeuw445/axon-memory",
    "axe-companion": "Ldezeeuw445/AXE-COMPANION-OS-",
    "axe-core": "Ldezeeuw445/AXE-CORE-",
}
WERKBRANCH = "axe-agent"


def zorg_voor_canon(git: Git, naam: str, pad: str | None, *, werk_map: str, overrides_pad: str,
                    canon: dict | None = None, url_voor: Callable[[str], str] | None = None) -> dict:
    """Wijst `naam` naar een checkout van de repo uit CANON? Zo niet: kloon hem in
    werk_map, zet de werkbranch, en laat de whitelist daarheen wijzen. Gooit nooit."""
    doel = (CANON if canon is None else canon).get(naam)
    if not doel:
        return {"actie": "geen"}
    huidig = _eigenaar_repo(git, pad) if pad else None
    # Alleen een GitHub-checkout van een ÁNDERE repo wordt omgezet. Geen origin of
    # geen GitHub (een test, een lokale map): niets doen, nooit gokken.
    if not huidig or huidig.lower() == doel.lower():
        return {"actie": "geen"}
    url_voor = url_voor or (lambda r: f"https://github.com/{r}.git")
    nieuw = os.path.join(werk_map, naam)
    try:
        os.makedirs(werk_map, exist_ok=True)
        if (not os.path.isdir(os.path.join(nieuw, ".git"))
                and git(werk_map, "clone", "--quiet", url_voor(doel), nieuw, timeout=900).returncode != 0):
            return {"actie": "geen", "reden": f"could not clone {doel}"}
        if git(nieuw, "rev-parse", "--verify", "--quiet", WERKBRANCH).returncode != 0:
            bron = f"origin/{WERKBRANCH}"
            if git(nieuw, "rev-parse", "--verify", "--quiet", bron).returncode != 0:
                bron = _basis(git, nieuw) or "origin/main"
            if git(nieuw, "checkout", "-q", "-B", WERKBRANCH, bron).returncode != 0:
                return {"actie": "geen", "reden": f"could not create {WERKBRANCH} in {doel}"}
        try:
            with open(overrides_pad) as fh:
                data = json.load(fh) or {}
        except (OSError, ValueError):
            data = {}
        data[naam] = nieuw
        tijdelijk = overrides_pad + ".tmp"
        with open(tijdelijk, "w") as fh:
            json.dump(data, fh, indent=2)
        os.replace(tijdelijk, overrides_pad)
    except OSError as e:
        return {"actie": "geen", "reden": f"{type(e).__name__}: {e}"[:200]}
    return {"actie": "overgezet", "van": huidig, "naar": doel, "pad": nieuw}


def _eigenaar_repo(git: Git, pad: str) -> Optional[str]:
    url = (git(pad, "remote", "get-url", "origin").stdout or "").strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(\.git)?$", url)
    return m.group(1) if m else None


def zorg_voor_pr(http: httpx.Client, token: str, eigenaar_repo: str, branch: str,
                 titel: str, tekst: str) -> dict:
    """Bestaande open PR van deze branch, of een nieuwe draft-PR naar de standaardbranch."""
    kop = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    api = f"https://api.github.com/repos/{eigenaar_repo}"
    eigenaar = eigenaar_repo.split("/", 1)[0]
    r = http.get(f"{api}/pulls", headers=kop, params={"head": f"{eigenaar}:{branch}", "state": "open"})
    r.raise_for_status()
    if r.json():
        return {"pr": r.json()[0]["html_url"], "nieuw": False}
    basis = http.get(api, headers=kop)
    basis.raise_for_status()
    r = http.post(f"{api}/pulls", headers=kop, json={
        "title": titel, "head": branch, "base": basis.json()["default_branch"], "body": tekst, "draft": True})
    r.raise_for_status()
    return {"pr": r.json()["html_url"], "nieuw": True}


PR_TEKST = (
    "Work from the AXE Core build loop (planner on the Mac mini). Each commit is one run: "
    "the task and the agent's report are in the commit message.\n\n"
    "Draft on purpose: nothing here is merged or deployed by the loop. Review, then merge "
    "or close. Stop the pushes with AXE_BOUW_PUSH=0 on the Mac mini."
)


def publiceer(repo: str, titel: str, verslag: str, taak_id: str, *, git: Git,
              commit_en_push: Callable[..., dict], repo_pad: Callable[[str], tuple],
              token: str = "", http: Optional[httpx.Client] = None) -> dict:
    """Leg vast, push, en zorg voor een draft-PR. Gooit nooit; het antwoord zegt wat er gebeurde."""
    pad, branch, fout = repo_pad(repo)
    if fout:
        return {"gepusht": False, "reden": fout}
    try:
        weigering = controleer(git, pad)
    except Exception as e:  # noqa: BLE001
        return {"gepusht": False, "reden": f"could not inspect the changes: {type(e).__name__}"}
    if weigering:
        return {"gepusht": False, "geblokkeerd": True, "reden": weigering}
    bericht = f"{titel}\n\n{(verslag or '').strip()[:3000]}\n\nAXE build loop, task {taak_id}"
    uit = commit_en_push(repo, bericht)
    if uit.get("status") != "ok":
        return {"gepusht": bool(uit.get("gepusht")), "gecommit": bool(uit.get("gecommit")),
                "sha": uit.get("sha"), "reden": uit.get("error")}
    resultaat = {"gepusht": True, "branch": branch, "sha": uit.get("sha")}
    eigenaar_repo = _eigenaar_repo(git, pad)
    if not token or not eigenaar_repo:
        resultaat["pr"] = None
        resultaat["reden_geen_pr"] = "no GITHUB_TOKEN on this host" if not token else "origin is not a GitHub repo"
        return resultaat
    eigen = http is None
    http = http or httpx.Client(timeout=20)
    try:
        resultaat.update(zorg_voor_pr(http, token, eigenaar_repo, branch, f"AXE build loop: {repo} ({branch})", PR_TEKST))
    except (httpx.HTTPError, KeyError, ValueError) as e:
        resultaat["pr"] = None
        resultaat["reden_geen_pr"] = f"GitHub: {type(e).__name__}"
    finally:
        if eigen:
            http.close()
    return resultaat
