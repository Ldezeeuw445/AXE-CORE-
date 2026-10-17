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
"""
from __future__ import annotations

import base64
import binascii
import os
import re
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
