"""
agent_runner.py — één kern voor elke codeer-CLI die op een abonnement draait.

Branch C was Claude Code. Codex (ChatGPT Plus) is dezelfde vorm: een CLI die
lokaal in een checkout draait, ingelogd op een abonnement in plaats van op een
gemeterde API-sleutel. Wat verschilt is de naam van het commando en de vlaggen;
wat NIET mag verschillen zijn de bewakingen.

Daarom staat hier de kern en niet in twee bestanden naast elkaar:

1. WELKE REPOSITORIES aangeraakt mogen worden — een expliciete whitelist. Een
   repo die er niet op staat wordt geweigerd; er is geen "elk pad"-modus, en het
   pad kan niet uit het verzoek komen.
2. WELKE BRANCH de checkout mag hebben — nooit main of master. Live gelezen met
   `git rev-parse` op het moment van aanroepen, niet geloofd uit het verzoek.
3. DAT HET SUBPROCES START ZONDER API-SLEUTEL. Een CLI die een sleutel in zijn
   omgeving vindt, kan daarmee authenticeren in plaats van met de sessie waar de
   operator op ingelogd is — en dan betaalt de gemeterde API terwijl er in de
   logs niets verandert.

Een tweede kopie van die drie zou binnen een week uit elkaar lopen met de eerste,
en dan is niet te zien welke van de twee de weigering heeft gedaan. Dat is
precies het patroon dat pairRegistry en metaApiSymbolResolver in deze codebase al
een keer hebben opgelost.

## Wat per motor wél verschilt

Claude Code kent `--permission-mode`; Codex kent een sandbox-vlag en een aparte
goedkeuringsvlag. De drie modusnamen blijven hetzelfde naar buiten toe, zodat de
app niet hoeft te weten welke motor eronder zit — de vertaling staat in ENGINES.

## Meting, 11 september 2026, codex-cli 0.154.0

    codex exec [PROMPT]          niet-interactief
      -C, --cd <DIR>             werkmap
      -s, --sandbox              read-only | workspace-write | danger-full-access
      --approve-for-me           goedkeuring automatisch binnen workspace-write
      -o, --output-last-message  eindantwoord naar een bestand
    codex login                  "Sign in with ChatGPT" — het abonnement
    codex login status           controleren

`--dangerously-bypass-approvals-and-sandbox` bestaat en staat hier bewust niet
in. Net als `bypassPermissions` bij Claude: een onbewaakte run die mag bewerken
én uitvoeren hoort een apart, met naam genoemd endpoint te zijn, niet een string
die iemand in een verzoek kan zetten.
"""
from __future__ import annotations
import json
import logging
import os
import shutil
import subprocess
import tempfile

log = logging.getLogger("axe_core_api.agent_runner")

DEFAULT_TIMEOUT = int(os.environ.get("AGENT_TIMEOUT", os.environ.get("CLAUDE_TIMEOUT", "900")))

PROTECTED_BRANCHES = {"main", "master"}

ALLOWED_PERMISSION_MODES = ("default", "acceptEdits", "plan")
DEFAULT_PERMISSION_MODE = "acceptEdits"


def _codex_cmd(binary: str, prompt: str, mode: str, uitvoerbestand: str) -> list:
    """Codex-aanroep voor één modus.

    `default` en `acceptEdits` komen op hetzelfde uit, en dat staat hier met
    opzet uitgeschreven in plaats van stilletjes: Claude's `default` betekent
    "vraag het mij bij twijfel", en in een headless run is er niemand om te
    vragen. Zonder `--approve-for-me` blijft zo'n run hangen op een prompt die
    nooit beantwoord wordt. Dat is erger dan een modus die iets ruimer is dan
    zijn naam belooft, zolang het maar ergens staat — hier dus.
    """
    cmd = [binary, "exec", str(prompt), "-C", ".", "-o", uitvoerbestand]
    if mode == "plan":
        cmd += ["-s", "read-only"]
    else:
        cmd += ["-s", "workspace-write", "--approve-for-me"]
    return cmd


def _claude_cmd(binary: str, prompt: str, mode: str, _uitvoerbestand: str) -> list:
    return [binary, "-p", str(prompt), "--output-format", "json", "--permission-mode", mode]


ENGINES = {
    "claude": {
        "label": "Claude Code",
        "bin_env": "CLAUDE_BIN",
        "bin_default": "claude",
        # Gemeten en gedocumenteerd in CLAUDE_CODE_SETUP.md: de CLI verkiest een
        # sleutel in zijn omgeving boven de `claude auth login`-sessie.
        "blocked_env": ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"),
        "cmd": _claude_cmd,
        "leest_bestand": False,
        "install": "npm i -g @anthropic-ai/claude-code",
        "login": "claude auth login",
    },
    "codex": {
        "label": "Codex",
        "bin_env": "CODEX_BIN",
        "bin_default": "codex",
        # Of Codex een omgevingssleutel bóven de ChatGPT-sessie verkiest, heb ik
        # niet gemeten — hun documentatie zegt het niet. Strippen kost niets als
        # het overbodig blijkt en voorkomt anders dat je stilletjes de gemeterde
        # API betaalt terwijl je denkt dat je abonnement het doet.
        "blocked_env": ("OPENAI_API_KEY", "OPENAI_BASE_URL"),
        "cmd": _codex_cmd,
        "leest_bestand": True,
        "install": "npm i -g @openai/codex",
        "login": "codex login",
    },
}

DEFAULT_ENGINE = "claude"


def _repos() -> dict:
    """De whitelist: "naam=/abs/pad,ander=/abs/pad".

    `AGENT_REPOS` als nieuwe naam, met `CLAUDE_CODE_REPOS` als terugval, zodat
    een host die al draait niet stilletjes zijn whitelist kwijtraakt bij het
    uitrollen van deze wijziging. Leeg betekent: geen enkele repo bereikbaar, en
    dat is de juiste standaard voor een dienst die code bewerkt.
    """
    raw = (os.environ.get("AGENT_REPOS") or os.environ.get("CLAUDE_CODE_REPOS") or "").strip()
    out = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry or "=" not in entry:
            continue
        name, _, path = entry.partition("=")
        name, path = name.strip(), os.path.abspath(os.path.expanduser(path.strip()))
        if name and path:
            out[name] = path
    return out


def _subprocess_env(blocked: tuple) -> dict:
    env = os.environ.copy()
    for key in blocked:
        env.pop(key, None)
    return env


def _current_branch(repo_path: str) -> str:
    """De branch van de checkout op dit moment, uit git zelf.

    Leeg bij een pad dat geen git-worktree is of waar git niet kan antwoorden;
    aanroepers lezen dat als een weigering, niet als toestemming.
    """
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=repo_path, capture_output=True, text=True, timeout=15,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("branch check failed in %s: %s", repo_path, e)
        return ""
    return proc.stdout.strip() if proc.returncode == 0 else ""


def _binary(engine: dict) -> str | None:
    naam = os.environ.get(engine["bin_env"], engine["bin_default"])
    gevonden = shutil.which(naam)
    if gevonden:
        return gevonden
    return naam if os.path.isabs(naam) and os.path.exists(naam) else None


def run_agent(
    repo: str,
    prompt: str,
    permission_mode: str = None,
    timeout: int = None,
    engine: str = DEFAULT_ENGINE,
) -> dict:
    """Draai één sessie van `engine` in `repo`.

    Elke weigering hieronder gebeurt vóórdat de CLI start, dus een afgewezen
    aanroep kost niets en verandert niets op schijf.
    """
    motornaam = (engine or DEFAULT_ENGINE).strip()
    motor = ENGINES.get(motornaam)
    if not motor:
        return {"status": "error", "error": f"Onbekende motor '{motornaam}'. Bekend: {', '.join(sorted(ENGINES))}"}

    if not prompt or not str(prompt).strip():
        return {"status": "error", "error": "prompt is required"}

    repos = _repos()
    if not repos:
        return {
            "status": "error",
            "error": "Geen repositories op de whitelist. Zet AGENT_REPOS "
                     "(naam=/abs/pad,ander=/abs/pad) op deze host.",
        }
    if not repo or repo not in repos:
        return {
            "status": "error",
            "error": f"Onbekende repo '{repo}'. Toegestaan: {', '.join(sorted(repos)) or '(geen)'}",
        }
    repo_path = repos[repo]

    if not os.path.isdir(repo_path):
        return {"status": "error", "error": f"Repo '{repo}' wijst naar {repo_path}, dat hier niet bestaat."}
    if not os.path.isdir(os.path.join(repo_path, ".git")):
        return {"status": "error", "error": f"Repo '{repo}' ({repo_path}) is geen git-checkout."}

    mode = (permission_mode or DEFAULT_PERMISSION_MODE).strip()
    if mode not in ALLOWED_PERMISSION_MODES:
        return {
            "status": "error",
            "error": f"permission_mode '{mode}' mag niet. Toegestaan: {', '.join(ALLOWED_PERMISSION_MODES)}",
        }

    branch = _current_branch(repo_path)
    if not branch:
        return {"status": "error", "error": f"Kon de branch van '{repo}' ({repo_path}) niet lezen; weiger te draaien."}
    if branch in PROTECTED_BRANCHES:
        return {
            "status": "error",
            "error": f"Repo '{repo}' staat op beschermde branch '{branch}'. "
                     f"Check een werkbranch uit voordat {motor['label']} hier draait.",
            "branch": branch,
        }

    binary = _binary(motor)
    if not binary:
        return {
            "status": "error",
            "error": f"{motor['label']} CLI niet gevonden. Installeer met `{motor['install']}` "
                     f"en log in met `{motor['login']}` op deze host. Zet géén API-sleutel — "
                     f"deze runner stript die met opzet.",
        }

    limit = int(timeout or DEFAULT_TIMEOUT)
    uitvoer = ""
    tmp = None
    try:
        if motor["leest_bestand"]:
            fd, tmp = tempfile.mkstemp(prefix="axe-agent-", suffix=".txt")
            os.close(fd)

        cmd = motor["cmd"](binary, prompt, mode, tmp or "")
        proc = subprocess.run(
            cmd, cwd=repo_path, env=_subprocess_env(motor["blocked_env"]),
            capture_output=True, text=True, timeout=limit,
        )

        if motor["leest_bestand"] and tmp and os.path.exists(tmp):
            try:
                with open(tmp, "r", encoding="utf-8") as f:
                    uitvoer = f.read().strip()
            except Exception as e:  # noqa: BLE001
                log.warning("kon %s niet lezen: %s", tmp, e)
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": f"{motor['label']} liep langer dan {limit}s", "repo": repo, "branch": branch, "engine": motornaam}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "error": f"{type(e).__name__}: {e}", "repo": repo, "branch": branch, "engine": motornaam}
    finally:
        if tmp and os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass

    stdout = (proc.stdout or "").strip()
    basis = {"repo": repo, "branch": branch, "permission_mode": mode, "engine": motornaam, "exit_code": proc.returncode}

    if motor["leest_bestand"]:
        if proc.returncode != 0 and not uitvoer:
            return {**basis, "status": "error",
                    "error": f"{motor['label']} eindigde met {proc.returncode}. stderr: {(proc.stderr or '')[:500]}"}
        return {**basis, "status": "error" if proc.returncode != 0 else "ok",
                "result": (uitvoer or stdout)[:8000]}

    # Claude: JSON op stdout.
    if proc.returncode != 0 and not stdout:
        return {**basis, "status": "error",
                "error": f"{motor['label']} eindigde met {proc.returncode}. stderr: {(proc.stderr or '')[:500]}"}

    try:
        parsed = json.loads(stdout) if stdout else None
    except json.JSONDecodeError:
        parsed = None

    if parsed is None:
        # --output-format json houdt normaal stand, maar een versiewissel of een
        # wrapper op PATH mag geen verzonnen succes worden.
        return {**basis, "status": "error" if proc.returncode != 0 else "ok",
                "result": stdout[:8000], "raw": True}

    mislukt = proc.returncode != 0
    result_text = ""
    if isinstance(parsed, dict):
        result_text = str(parsed.get("result") or parsed.get("text") or "")
        # Gemeten tegen CLI 2.1.250: een authenticatiefout komt terug als
        # subtype "success" met is_error true. Op subtype of exitcode alleen
        # vertrouwen zou een mislukte run als ok rapporteren, en dat is het ene
        # wat dit nooit mag doen.
        if parsed.get("is_error") is True:
            mislukt = True

    return {**basis, "status": "error" if mislukt else "ok",
            "result": result_text or stdout[:8000],
            "meta": parsed if isinstance(parsed, dict) else None}


def whitelisted_repos() -> dict:
    return _repos()


def repo_status() -> dict:
    """Wat /health eerlijk moet kunnen zeggen: welke repo's er staan, of ze
    bestaan, en op welke branch ze nu zitten."""
    out = {}
    for name, path in sorted(whitelisted_repos().items()):
        exists = os.path.isdir(os.path.join(path, ".git"))
        branch = _current_branch(path) if exists else ""
        out[name] = {
            "path": path,
            "exists": exists,
            "branch": branch or None,
            "runnable": bool(exists and branch and branch not in PROTECTED_BRANCHES),
        }
    return out


def engine_status() -> dict:
    """Welke motoren op deze host werkelijk aanwezig zijn.

    Alleen of het commando bestaat — niet of je ingelogd bent. Dat laatste kost
    een echte aanroep, en een statuspaneel hoort geen sessie te verbruiken.
    """
    return {
        naam: {"label": m["label"], "aanwezig": _binary(m) is not None, "login": m["login"]}
        for naam, m in ENGINES.items()
    }


def cli_available(engine: str = DEFAULT_ENGINE) -> bool:
    m = ENGINES.get(engine)
    return bool(m and _binary(m))
