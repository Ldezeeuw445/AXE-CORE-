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

## Trading OS (28 okt, ná de drie gaten hierboven)

Niet TRADING-AXE-OS / TRADING-OS / main. Canon: Ldezeeuw445/trading-os-app,
basis snapshot-2026-10-17 (pull vóór elke run, PR daarheen, nooit main).
Taken uit docs/BOUWLIJST.md op die tak, in volgorde, wat [x] is overslaan.
Nooit uitrollen, nooit migraties, nooit live orders. Draait op Luka's
CLI-stoelen (Claude / ChatGPT / Cursor op mini en iMac), niet op Grok Bot.
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


BESCHERMD = {"main", "master"}
TRADING_OS = "trading-os"
TRADING_OS_BASIS = "snapshot-2026-10-17"
TRADING_OS_REPO = "Ldezeeuw445/trading-os-app"
TRADING_OS_TAKEN = "docs/BOUWLIJST.md"
# Hardcoded naast de regels bovenaan BOUWLIJST.md: de lus mag dit niet "vergeten"
# als het bestand ontbreekt of de kop verandert.
TRADING_OS_GRENZEN = (
    "HARD LIMITS (enforced by the build loop, not optional): never touch main or master; "
    "never deploy; never apply migrations; never place live orders; never call a broker "
    "or MetaAPI to execute. Work on the work branch. Open PRs into snapshot-2026-10-17."
)
CHECKBOX = re.compile(r"^\s*(?:[-*]|\d+[.)])\s+\[([ xX])\]\s+(.*)$")
TAAK_ID = re.compile(
    r"^(?:\*\*)?([A-Za-z][A-Za-z0-9._-]*|\d+(?:\.\d+)*[a-z]?)(?:\*\*)?\s*[:.—–-]?\s*(.*)$"
)


def _basis(git: Git, pad: str) -> str | None:
    """origin/<standaardbranch>, zoals de remote hem noemt."""
    kop = (git(pad, "symbolic-ref", "--short", "refs/remotes/origin/HEAD").stdout or "").strip()
    if kop:
        return kop
    for naam in ("origin/main", "origin/master"):
        if git(pad, "rev-parse", "--verify", "--quiet", naam).returncode == 0:
            return naam
    return None


def _korte_ref(ref: str) -> str:
    return (ref or "").rsplit("/", 1)[-1]


def archieven(git: Git, pad: str, branch: str, max_n: int = 2) -> list[str]:
    """Archieven van deze werkbranch op origin, nieuwste eerst (de naam draagt de tijd).

    29 okt: op axe-companion stond 11 dagen bouwwerk (gratis intel-bronnen,
    push-fixes, TOS-SEC-2) in axe-agent-archief-20261028-1113, en de lus begon
    daarna dezelfde drie taken opnieuw vanaf main. Wie het archief kent, port.
    """
    if not branch:
        return []
    p = git(pad, "ls-remote", "--heads", "origin", f"{branch}-archief-*", timeout=60)
    if p.returncode != 0:
        return []
    namen = {r.split("refs/heads/", 1)[1] for r in (p.stdout or "").splitlines() if "refs/heads/" in r}
    return sorted(namen, reverse=True)[:max_n]


def archief_prompt(namen: list[str], basis: str = "origin/main") -> str:
    if not namen:
        return ""
    lijst = ", ".join(namen)
    eerste = namen[0]
    return (
        f"Eerder werk van deze branch staat in {lijst} op origin: het liet zich niet meer mergen met "
        f"{basis}, dus het is bewaard en de branch begon opnieuw. Kijk daar eerst "
        f"(git fetch origin {eerste}; git log --oneline {basis}..origin/{eerste}; git show). Breng over "
        "wat nog ontbreekt en nog klopt met de huidige code, in plaats van het opnieuw te schrijven, "
        "en zeg in je verslag wat je uit het archief hebt overgenomen.\n"
    )


def ververs_werkbranch(git: Git, pad: str, branch: str, nu: datetime | None = None,
                       basis_naam: str | None = None, verboden: set[str] | None = None) -> dict:
    """Haal de basisbranch binnen voordat de lus verder bouwt. Gooit nooit.

    {"actie": "geen" | "gemerged" | "opnieuw", ...}; "opnieuw" noemt het archief.
    `basis_naam` (bijv. snapshot-2026-10-17) wint van origin/HEAD. Trading OS mag
    nooit main mergen, ook niet als GitHub die als default voert.
    """
    verboden = set() if verboden is None else set(verboden)
    nooit_werk = BESCHERMD | {TRADING_OS_BASIS} | verboden
    if basis_naam:
        nooit_werk.add(basis_naam)
    if not branch or branch in nooit_werk:
        return {"actie": "geen", "reden": "not a work branch"}
    if (git(pad, "status", "--porcelain").stdout or "").strip():
        return {"actie": "geen", "reden": "uncommitted changes in the checkout; left as is"}
    if basis_naam:
        if git(pad, "fetch", "--quiet", "origin", basis_naam, timeout=180).returncode != 0:
            return {"actie": "geen", "reden": f"fetch {basis_naam} failed"}
        basis = f"origin/{basis_naam}"
        if git(pad, "rev-parse", "--verify", "--quiet", basis).returncode != 0:
            return {"actie": "geen", "reden": f"missing {basis}"}
    else:
        if git(pad, "fetch", "--quiet", "origin", timeout=180).returncode != 0:
            return {"actie": "geen", "reden": "fetch failed"}
        basis = _basis(git, pad)
        if not basis:
            return {"actie": "geen", "reden": "no default branch on origin"}
    if _korte_ref(basis) in verboden:
        return {"actie": "geen", "reden": f"refusing to merge {_korte_ref(basis)}"}
    try:
        achter = int((git(pad, "rev-list", "--count", f"HEAD..{basis}").stdout or "0").strip() or 0)
    except ValueError:
        achter = 0
    if achter == 0:
        return {"actie": "geen", "achter": 0, "basis": basis}
    m = git(pad, "merge", "--no-edit", "-m", f"Merge {basis} into {branch} (AXE build loop)", basis, timeout=180)
    if m.returncode == 0:
        return {"actie": "gemerged", "achter": achter, "basis": basis}
    git(pad, "merge", "--abort")
    archief = f"{branch}-archief-{(nu or datetime.now(timezone.utc)).strftime('%Y%m%d-%H%M')}"
    git(pad, "branch", "-f", archief, "HEAD")
    if git(pad, "push", "--quiet", "origin", f"{archief}:refs/heads/{archief}", timeout=180).returncode != 0:
        return {"actie": "geen", "achter": achter,
                "reden": "base does not merge cleanly and the old branch could not be archived; nothing reset"}
    git(pad, "reset", "--hard", basis)
    weg = git(pad, "push", "--quiet", "--force-with-lease", "origin", f"{branch}:refs/heads/{branch}", timeout=180)
    return {"actie": "opnieuw", "achter": achter, "basis": basis, "archief": archief,
            **({} if weg.returncode == 0 else {"reden": "reset locally; the remote work branch was not updated"})}


# Waar elk product NU leeft. De naam op de whitelist van de Mac mini is een
# sleutel; de checkout erachter kan verouderd zijn. 28 okt: "axon-memory" wees
# naar een kloon van axon-memory-app, terwijl AXON sinds 17 okt in axon-memory
# wordt gebouwd. 21 bouwruns gingen zo naar een repo waar niemand meer kijkt.
# Trading OS: niet TRADING-AXE-OS / TRADING-OS / main — Ldezeeuw445/trading-os-app
# op snapshot-2026-10-17, taken uit docs/BOUWLIJST.md.
# Alleen wat hier staat wordt afgedwongen; een onbekende naam blijft zoals hij is.
# Waarde is "owner/repo" of {"repo", "basis", "taken"}.
CANON = {
    "axon-memory": {"repo": "Ldezeeuw445/axon-memory"},
    "axe-companion": {"repo": "Ldezeeuw445/AXE-COMPANION-OS-"},
    "axe-core": {"repo": "Ldezeeuw445/AXE-CORE-", "basis": "orchestrator"},
    "trading-os": {
        "repo": TRADING_OS_REPO,
        "basis": TRADING_OS_BASIS,
        "taken": TRADING_OS_TAKEN,
        "verboden": ("main", "master"),
    },
}
WERKBRANCH = "axe-agent"


def canon_info(naam: str, canon: dict | None = None) -> dict:
    waarde = (CANON if canon is None else canon).get(naam)
    if isinstance(waarde, str) and waarde.strip():
        return {"repo": waarde.strip()}
    if isinstance(waarde, dict) and (waarde.get("repo") or "").strip():
        return waarde
    return {}


def basis_voor(naam: str, canon: dict | None = None) -> str | None:
    return canon_info(naam, canon).get("basis") or None


def verboden_basis(naam: str, canon: dict | None = None) -> set[str]:
    """Branches this app must never receive a PR. Empty for Companion/AXON (their
    base is main). Trading OS: never main/master, only snapshot-2026-10-17."""
    info = canon_info(naam, canon)
    extra = set(info.get("verboden") or ())
    if naam == TRADING_OS or (info.get("repo") or "") == TRADING_OS_REPO:
        return set(BESCHERMD) | extra
    return extra


def zorg_voor_canon(git: Git, naam: str, pad: str | None, *, werk_map: str, overrides_pad: str,
                    canon: dict | None = None, url_voor: Callable[[str], str] | None = None) -> dict:
    """Wijst `naam` naar een checkout van de repo uit CANON? Zo niet: kloon hem in
    werk_map, zet de werkbranch, en laat de whitelist daarheen wijzen. Gooit nooit."""
    info = canon_info(naam, canon)
    doel = info.get("repo")
    if not doel:
        return {"actie": "geen"}
    huidig = _eigenaar_repo(git, pad) if pad else None
    # Alleen een GitHub-checkout van een ÁNDERE repo wordt omgezet. Geen origin of
    # geen GitHub (een test, een lokale map): niets doen, nooit gokken.
    if not huidig or huidig.lower() == doel.lower():
        return {"actie": "geen"}
    url_voor = url_voor or (lambda r: f"https://github.com/{r}.git")
    nieuw = os.path.join(werk_map, naam)
    basis_naam = info.get("basis")
    try:
        os.makedirs(werk_map, exist_ok=True)
        if not os.path.isdir(os.path.join(nieuw, ".git")):
            args = ["clone", "--quiet"]
            if basis_naam:
                args += ["--branch", basis_naam]
            args += [url_voor(doel), nieuw]
            if git(werk_map, *args, timeout=900).returncode != 0:
                return {"actie": "geen", "reden": f"could not clone {doel}"
                        + (f"@{basis_naam}" if basis_naam else "")}
        gezet = zorg_voor_werkbranch(git, nieuw, basis_naam=basis_naam)
        if gezet.get("reden") and gezet.get("actie") == "geen" and gezet.get("branch") != WERKBRANCH:
            if (git(nieuw, "rev-parse", "--abbrev-ref", "HEAD").stdout or "").strip() != WERKBRANCH:
                return {"actie": "geen", "reden": gezet.get("reden") or f"could not create {WERKBRANCH} in {doel}"}
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


def _toplevel(git: Git, pad: str | None) -> str | None:
    if not pad:
        return None
    uit = git(pad, "rev-parse", "--show-toplevel")
    t = (uit.stdout or "").strip() if uit.returncode == 0 else ""
    return os.path.realpath(t) if t else None


def zorg_voor_eigen_worktree(git: Git, naam: str, pad: str | None, *, eigen_pad: str, werk_map: str,
                             overrides_pad: str, basis_naam: str | None) -> dict:
    """Werk nooit in de checkout waar AXE zelf uit draait.

    29 okt: de lus zette ~/AXE-CORE- op de Mac mini op axe-agent (checkout -B in
    zorg_voor_werkbranch). Daar draaien de app, de lokale API en axe-autosync
    uit, en die laatste slaat een checkout buiten orchestrator over, dus de Mac
    mini bleef sinds 28 okt op oude code. Nu krijgt de lus een eigen worktree in
    werk_map/<naam> op de werkbranch, en de whitelist wijst daarheen.

    Staat de hoofdcheckout schoon op de werkbranch zonder eigen commits, dan
    gaat hij eerst terug naar de basis: dat haalt een vastgelopen Mac los. Met
    open wijzigingen of eigen commits blijft hij staan, en dat staat in "reden".
    Gooit nooit.
    """
    eigen, top = _toplevel(git, eigen_pad), _toplevel(git, pad)
    if not eigen or not top or eigen != top or not basis_naam:
        return {"actie": "geen"}
    nieuw = os.path.join(werk_map, naam)
    try:
        if git(top, "fetch", "--quiet", "origin", basis_naam, timeout=180).returncode != 0:
            return {"actie": "geen", "reden": f"fetch {basis_naam} failed"}
        huidig = (git(top, "rev-parse", "--abbrev-ref", "HEAD").stdout or "").strip()
        terug = None
        if huidig == WERKBRANCH:
            open_ = (git(top, "status", "--porcelain", "--untracked-files=no").stdout or "").strip()
            eigen_commits = (git(top, "rev-list", "--count", f"origin/{basis_naam}..HEAD").stdout or "0").strip()
            if open_ or eigen_commits not in ("", "0"):
                return {"actie": "geen", "reden": f"{top} is on {WERKBRANCH} with "
                        + ("uncommitted changes" if open_ else f"{eigen_commits} own commit(s)") + "; left as is"}
            if git(top, "checkout", "-q", basis_naam).returncode != 0:
                return {"actie": "geen", "reden": f"could not put {top} back on {basis_naam}"}
            git(top, "merge", "-q", "--ff-only", f"origin/{basis_naam}")
            terug = basis_naam
        if not os.path.isdir(nieuw):
            os.makedirs(werk_map, exist_ok=True)
            if git(top, "worktree", "add", "-q", "-B", WERKBRANCH, nieuw, f"origin/{basis_naam}",
                   timeout=300).returncode != 0:
                return {"actie": "geen", "reden": f"could not add a worktree at {nieuw}",
                        **({"terug_op": terug} if terug else {})}
        try:
            with open(overrides_pad) as fh:
                data = json.load(fh) or {}
        except (OSError, ValueError):
            data = {}
        if data.get(naam) != nieuw:
            data[naam] = nieuw
            tijdelijk = overrides_pad + ".tmp"
            with open(tijdelijk, "w") as fh:
                json.dump(data, fh, indent=2)
            os.replace(tijdelijk, overrides_pad)
    except OSError as e:
        return {"actie": "geen", "reden": f"{type(e).__name__}: {e}"[:200]}
    return {"actie": "worktree", "pad": nieuw, **({"terug_op": terug} if terug else {})}


def zorg_voor_werkbranch(git: Git, pad: str, branch: str = WERKBRANCH,
                         basis_naam: str | None = None) -> dict:
    """Zet de checkout op de werkbranch, vanaf de basis. Nooit main.

    Staat hij al op de werkbranch, dan niets. Staat hij op main/master of op de
    basis zelf (snapshot-2026-10-17), dan checkout -B vanaf origin/<basis>.
    Gooit nooit.
    """
    huidig = (git(pad, "rev-parse", "--abbrev-ref", "HEAD").stdout or "").strip()
    if huidig == branch:
        return {"actie": "geen", "branch": branch}
    beschermd = set(BESCHERMD)
    if basis_naam:
        beschermd.add(basis_naam)
    if huidig not in beschermd and huidig not in ("HEAD", "", "DETACHED"):
        return {"actie": "geen", "branch": huidig, "reden": "already on a work branch"}
    if basis_naam:
        if basis_naam in BESCHERMD:
            return {"actie": "geen", "reden": f"refusing to base work on {basis_naam}"}
        if git(pad, "fetch", "--quiet", "origin", basis_naam, timeout=180).returncode != 0:
            return {"actie": "geen", "reden": f"fetch {basis_naam} failed"}
        bron = f"origin/{basis_naam}"
        if git(pad, "rev-parse", "--verify", "--quiet", bron).returncode != 0:
            return {"actie": "geen", "reden": f"missing {bron}"}
    else:
        bron = f"origin/{branch}"
        if git(pad, "rev-parse", "--verify", "--quiet", bron).returncode != 0:
            bron = _basis(git, pad) or "origin/main"
    if git(pad, "checkout", "-q", "-B", branch, bron).returncode != 0:
        return {"actie": "geen", "reden": f"could not create {branch} from {bron}"}
    return {"actie": "gezet", "branch": branch, "van": huidig, "basis": bron}


def parse_bouwljist(tekst: str) -> dict:
    """Regels bovenaan + checklist in volgorde. `volgende` is de eerste open taak."""
    regels_lijnen: list[str] = []
    taken: list[dict] = []
    gezien_check = False
    for regel in (tekst or "").splitlines():
        m = CHECKBOX.match(regel)
        if not m:
            if not gezien_check:
                regels_lijnen.append(regel)
            continue
        gezien_check = True
        done = m.group(1).lower() == "x"
        rest = m.group(2).strip()
        id_m = TAAK_ID.match(rest)
        if id_m and id_m.group(1):
            tid, titel = id_m.group(1), (id_m.group(2) or rest).strip()
        else:
            tid, titel = rest[:40], rest
        taken.append({"id": tid, "titel": titel or rest, "done": done, "regel": rest})
    volgende = next((t for t in taken if not t["done"]), None)
    regels = "\n".join(regels_lijnen).strip()
    return {"regels": regels, "taken": taken, "volgende": volgende}


def volgende_bouwljist_in(pad: str, rel: str = TRADING_OS_TAKEN) -> dict:
    """Leest docs/BOUWLIJST.md in de checkout. Gooit nooit."""
    bestand = os.path.join(pad, rel)
    try:
        tekst = open(bestand, encoding="utf-8").read()
    except OSError as e:
        return {"ok": False, "reden": f"could not read {rel}: {type(e).__name__}"}
    parsed = parse_bouwljist(tekst)
    if not parsed["volgende"]:
        return {"ok": False, "reden": f"no open tasks in {rel}", **parsed}
    return {"ok": True, **parsed}


def trading_os_prompt(bouwljist: dict | None) -> str:
    """Opdracht voor één Trading OS-bouwrun: canon-repo, snapshot, BOUWLIJST, grenzen."""
    delen = [
        f"Repo: {TRADING_OS_REPO} (not TRADING-AXE-OS / TRADING-OS).",
        f"Base branch: {TRADING_OS_BASIS}. Pull it before you start. Open the PR into that "
        "branch, never into main.",
        TRADING_OS_GRENZEN,
    ]
    if bouwljist and bouwljist.get("regels"):
        delen.append("Rules from the top of docs/BOUWLIJST.md — follow them:\n"
                     + str(bouwljist["regels"])[:2500])
    volg = (bouwljist or {}).get("volgende") if bouwljist else None
    if volg:
        delen.append(
            f"This run's task is the first undone item in {TRADING_OS_TAKEN}, in order: {volg['id']}.\n"
            f"{volg.get('titel') or volg.get('regel') or ''}\n"
            "Skip everything already marked done ([x]). Implement only this item.\n"
            f"Start your report with the task id {volg['id']}."
        )
    else:
        reden = (bouwljist or {}).get("reden") or f"no open item in {TRADING_OS_TAKEN}"
        delen.append(f"Do not invent work. {reden}")
    return "\n\n".join(delen)


def _eigenaar_repo(git: Git, pad: str) -> Optional[str]:
    url = (git(pad, "remote", "get-url", "origin").stdout or "").strip()
    m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(\.git)?$", url)
    return m.group(1) if m else None


def zorg_voor_pr(http: httpx.Client, token: str, eigenaar_repo: str, branch: str,
                 titel: str, tekst: str, basis: str | None = None,
                 verboden: set[str] | None = None) -> dict:
    """Bestaande open PR van deze branch, of een nieuwe draft-PR naar de basisbranch."""
    kop = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    api = f"https://api.github.com/repos/{eigenaar_repo}"
    eigenaar = eigenaar_repo.split("/", 1)[0]
    r = http.get(f"{api}/pulls", headers=kop, params={"head": f"{eigenaar}:{branch}", "state": "open"})
    r.raise_for_status()
    if r.json():
        return {"pr": r.json()[0]["html_url"], "nieuw": False}
    verboden = set() if verboden is None else set(verboden)
    if not basis:
        info = http.get(api)
        info.raise_for_status()
        basis = info.json()["default_branch"]
    if not basis or basis in verboden:
        return {"pr": None, "reden_geen_pr": f"refusing PR into protected branch {basis or '(none)'}"}
    r = http.post(f"{api}/pulls", headers=kop, json={
        "title": titel, "head": branch, "base": basis, "body": tekst, "draft": True})
    r.raise_for_status()
    return {"pr": r.json()["html_url"], "nieuw": True, "basis": basis}


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
        resultaat.update(zorg_voor_pr(
            http, token, eigenaar_repo, branch, f"AXE build loop: {repo} ({branch})", PR_TEKST,
            basis=basis_voor(repo), verboden=verboden_basis(repo)))
    except (httpx.HTTPError, KeyError, ValueError) as e:
        resultaat["pr"] = None
        resultaat["reden_geen_pr"] = f"GitHub: {type(e).__name__}"
    finally:
        if eigen:
            http.close()
    return resultaat
