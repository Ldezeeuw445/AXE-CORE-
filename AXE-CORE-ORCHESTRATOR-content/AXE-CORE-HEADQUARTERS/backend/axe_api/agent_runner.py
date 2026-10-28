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
import base64
import functools
import json
import logging
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import re

try:
    import fcntl  # macOS/Linux; both supported agent hosts
except ImportError:  # pragma: no cover
    fcntl = None

log = logging.getLogger("axe_core_api.agent_runner")

DEFAULT_TIMEOUT = int(os.environ.get("AGENT_TIMEOUT", os.environ.get("CLAUDE_TIMEOUT", "900")))

PROTECTED_BRANCHES = {"main", "master"}

ALLOWED_PERMISSION_MODES = ("default", "acceptEdits", "plan")

# Wat een bouwrun van de planner zonder vraag mag draaien: de eigen controles van
# een repo en git lezen. Op 16 okt meldden twee "geslaagde" runs dat elk commando
# (npm test, tsc, node --test) op een toestemmingsvraag bleef hangen die headless
# niemand beantwoordt -- code geschreven, niets bewezen. Alleen in acceptEdits en
# alleen als de aanroeper erom vraagt (checks=True); chat en editor houden hun stand.
CHECK_TOOLS = (
    "Bash(npm test:*)", "Bash(npm run test:*)", "Bash(npm run lint:*)", "Bash(npm run typecheck:*)",
    "Bash(npm run build:*)", "Bash(npm run verify:*)", "Bash(npx vitest:*)", "Bash(npx tsc:*)",
    "Bash(npx eslint:*)", "Bash(npx oxlint:*)", "Bash(node --test:*)", "Bash(python3 -m pytest:*)",
    "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)",
)
DEFAULT_PERMISSION_MODE = "acceptEdits"


@functools.lru_cache(maxsize=8)
def _codex_help(binary: str) -> str | None:
    """`codex exec --help` van DEZE installatie, één keer per proces gelezen.
    None als hij niet te lezen is (niet geïnstalleerd, timeout)."""
    try:
        uit = subprocess.run([binary, "exec", "--help"], capture_output=True, text=True, timeout=15)
        return (uit.stdout or "") + (uit.stderr or "")
    except (OSError, subprocess.SubprocessError):
        return None


def _codex_kent(binary: str, vlag: str) -> bool:
    """Kent de geïnstalleerde codex deze vlag? Op 15-16 okt faalde elke Codex-run van
    de planner met "unexpected argument '--approve-for-me'": de documentatie (en de
    meting van 11 sep) noemt hem, de codex op de Mac mini is ouder. Onleesbare help
    = het gedocumenteerde gedrag aanhouden; dan faalt de run zichtbaar zoals voorheen."""
    hulp = _codex_help(binary)
    return True if hulp is None else vlag in hulp


def _codex_cmd(binary: str, prompt: str, mode: str, uitvoerbestand: str, model: str = "") -> list:
    """Codex-aanroep voor één modus.

    `default` en `acceptEdits` komen op hetzelfde uit, en dat staat hier met
    opzet uitgeschreven in plaats van stilletjes: Claude's `default` betekent
    "vraag het mij bij twijfel", en in een headless run is er niemand om te
    vragen. Zonder `--approve-for-me` blijft zo'n run hangen op een prompt die
    nooit beantwoord wordt. Dat is erger dan een modus die iets ruimer is dan
    zijn naam belooft, zolang het maar ergens staat — hier dus.
    """
    from provider_router import codex_cli_model
    cmd = [binary, "exec", str(prompt), "-C", ".", "-o", uitvoerbestand]
    # Leeg = geen -m: ChatGPT-accounts weigeren gpt-5-codex (model_not_found).
    gekozen = codex_cli_model(model)
    if gekozen:
        cmd += ["-m", gekozen]
    if mode == "plan":
        cmd += ["-s", "read-only"]
    else:
        # Een oudere codex kent --approve-for-me niet; daar vraagt exec niets en
        # blijft hij binnen de workspace-write-sandbox. Zonder deze check weigerde
        # hij elke schrijfrun meteen met exit 2.
        # Een nieuwe codex weigert -s samen met --approve-for-me ("cannot be used
        # with"); die vlag impliceert zelf de workspace-write-sandbox.
        cmd += ["--approve-for-me"] if _codex_kent(binary, "--approve-for-me") else ["-s", "workspace-write"]
    return cmd


def _zonder_model_vlag(cmd: list) -> list:
    """Zelfde Codex-aanroep, zonder -m / waarde. Voor de éénmalige retry."""
    uit: list = []
    sla_over = False
    for stuk in cmd:
        if sla_over:
            sla_over = False
            continue
        if stuk == "-m":
            sla_over = True
            continue
        uit.append(stuk)
    return uit


def _claude_fallback_binary() -> str | None:
    """Claude CLI voor als Codex het model weigert. Eerst PATH, dan Homebrew."""
    gevonden = _binary(ENGINES["claude"])
    if gevonden:
        return gevonden
    for kandidaat in (
        (os.environ.get("AXE_CLAUDE_BIN") or "").strip(),
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
    ):
        if kandidaat and os.path.exists(kandidaat):
            return kandidaat
    return None


# Let op: hieronder stonden tot 16 september TWEE definities van _claude_cmd en
# _cursor_cmd. Python houdt de laatste, dus de eerste twee waren dode code -- en
# ze verschilden: de dode _cursor_cmd zette altijd --force en negeerde de modus,
# de levende respecteert plan-modus (--mode ask --trust). Wie de bovenste las,
# las het gedrag dat NIET draait. Weg, zodat er één waarheid staat.
def _claude_cmd(binary: str, prompt: str, mode: str, _uitvoerbestand: str, model: str = "") -> list:
    cmd = [binary, "-p", str(prompt), "--output-format", "json", "--permission-mode", mode]
    # Leeg = de CLI houdt zijn eigen standaard, die met een update meebeweegt.
    return cmd + (["--model", model] if model else [])


def _cursor_cmd(binary: str, prompt: str, mode: str, _uitvoerbestand: str, model: str = "") -> list:
    """Cursor-agent voor één modus.

    NIET GEMETEN OP DEZE HOST. Claude en Codex hierboven zijn allebei tegen een
    echte CLI aangelegd en de versie staat in de kop; deze vlaggen komen uit
    Cursor's documentatie en niet uit een run die ik heb zien slagen. Dat staat
    er met opzet bij: een motor die "aanwezig" heet maar nooit gedraaid heeft is
    precies het soort halve waarheid dat je een uur kost.

    Wat dat in de praktijk betekent: `engine_status()` meldt alleen of het
    commando bestaat. Kloppen de vlaggen niet, dan faalt de eerste run zichtbaar
    met de stderr van cursor-agent erbij -- en dan repareren we hem hier, op één
    plek, in plaats van dat hij stilletjes iets anders doet.

    `--force` alleen buiten plan-modus, om dezelfde reden als bij Codex: in een
    headless run is er niemand om een goedkeuring aan te vragen, dus zonder die
    vlag hangt hij op een prompt die nooit beantwoord wordt.
    """
    cmd = [binary, "-p", str(prompt), "--output-format", "json"]
    if model:
        cmd += ["--model", model]
    if mode == "plan":
        # Gemeten 14 september, cursor-agent 2026.09.10: `--mode ask` in een
        # wegwerp-repo met de opdracht "verwijder bewijs.txt". Hij las het
        # bestand, antwoordde "Ask mode is alleen lezen", en git bleef schoon.
        # `--mode plan` hield ook alles heel maar gaf alleen een plan terug; ask
        # geeft een antwoord, en dat is wat chat en AXE Algo vragen. `--trust`
        # omdat een headless run anders op de werkmap-vraag blijft staan.
        cmd += ["--mode", "ask", "--trust"]
    else:
        cmd += ["--force"]
    return cmd


ENGINES = {
    "claude": {
        "label": "Claude Code",
        "bin_env": "CLAUDE_BIN",
        "bin_default": "claude",
        # Gemeten en gedocumenteerd in CLAUDE_CODE_SETUP.md: de CLI verkiest een
        # sleutel in zijn omgeving boven de `claude auth login`-sessie.
        # ANTHROPIC_BASE_URL en CLAUDECODE ook: gemeten 13 september erfde de API
        # die vanuit een Claude-sessie gestart was, en dan liep een run via de
        # proxy van die sessie in plaats van via het eigen abonnement.
        "blocked_env": ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDECODE"),
        "cmd": _claude_cmd,
        "leest_bestand": False,
        "install": "npm i -g @anthropic-ai/claude-code",
        "login": "claude auth login",
        # --permission-mode plan laat hem lezen en niets schrijven.
        "alleen_lezen": True,
    },
    "claude2": {
        # Een tweede Claude-abonnement op dezelfde Mac. Claude Code bewaart zijn
        # login per CLAUDE_CONFIG_DIR -- gemeten 13 september: met een eigen map
        # zegt `claude auth status` loggedIn false terwijl de gewone login Pro is.
        # Eenmalig inloggen, in vak 3 (Mac · agents):
        #   CLAUDE_CONFIG_DIR=~/.claude-tweede claude auth login
        "label": "Claude Code 2",
        "bin_env": "CLAUDE_BIN",
        "bin_default": "claude",
        "blocked_env": ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDECODE"),
        "extra_env": {"CLAUDE_CONFIG_DIR": os.path.expanduser(os.environ.get("CLAUDE2_CONFIG_DIR", "~/.claude-tweede"))},
        "cmd": _claude_cmd,
        "leest_bestand": False,
        "install": "npm i -g @anthropic-ai/claude-code",
        "login": "CLAUDE_CONFIG_DIR=~/.claude-tweede claude auth login",
        "alleen_lezen": True,
    },
    "claude3": {
        # Een derde Claude-abonnement, zelfde opzet als claude2 (14 september):
        # eigen loginmap, dus een los limiet. Eenmalig inloggen in vak 3:
        #   CLAUDE_CONFIG_DIR=~/.claude-derde claude auth login
        "label": "Claude Code 3",
        "bin_env": "CLAUDE_BIN",
        "bin_default": "claude",
        "blocked_env": ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDECODE"),
        "extra_env": {"CLAUDE_CONFIG_DIR": os.path.expanduser(os.environ.get("CLAUDE3_CONFIG_DIR", "~/.claude-derde"))},
        "cmd": _claude_cmd,
        "leest_bestand": False,
        "install": "npm i -g @anthropic-ai/claude-code",
        "login": "CLAUDE_CONFIG_DIR=~/.claude-derde claude auth login",
        "alleen_lezen": True,
    },
    "claude4": {
        # Een vierde Claude-abonnement, zelfde opzet als claude2/claude3.
        # Eenmalig inloggen in vak 3:
        #   CLAUDE_CONFIG_DIR=~/.claude-vierde claude auth login
        "label": "Claude Code 4",
        "bin_env": "CLAUDE_BIN",
        "bin_default": "claude",
        "blocked_env": ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDECODE"),
        "extra_env": {"CLAUDE_CONFIG_DIR": os.path.expanduser(os.environ.get("CLAUDE4_CONFIG_DIR", "~/.claude-vierde"))},
        "cmd": _claude_cmd,
        "leest_bestand": False,
        "install": "npm i -g @anthropic-ai/claude-code",
        "login": "CLAUDE_CONFIG_DIR=~/.claude-vierde claude auth login",
        "alleen_lezen": True,
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
        # -s read-only, hun eigen sandbox-stand.
        "alleen_lezen": True,
    },
    "codex2": {
        # Een tweede ChatGPT-abonnement op dezelfde Mac. Codex bewaart zijn
        # login (auth.json) onder CODEX_HOME -- gemeten 16 september: met een
        # eigen map zegt `codex doctor` dat CODEX_HOME daarheen wijst, dus een
        # tweede map is een tweede sessie en dus een tweede limiet.
        # Eenmalig inloggen, in vak 3 (Mac - agents):
        #   CODEX_HOME=~/.codex-tweede codex login
        "label": "Codex 2",
        "bin_env": "CODEX_BIN",
        "bin_default": "codex",
        "blocked_env": ("OPENAI_API_KEY", "OPENAI_BASE_URL"),
        "extra_env": {"CODEX_HOME": os.path.expanduser(os.environ.get("CODEX2_HOME", "~/.codex-tweede"))},
        "cmd": _codex_cmd,
        "leest_bestand": True,
        "install": "npm i -g @openai/codex",
        "login": "CODEX_HOME=~/.codex-tweede codex login",
        "alleen_lezen": True,
    },
    "codex3": {
        # Een derde ChatGPT-abonnement, zelfde opzet als codex2. Eenmalig
        # inloggen in vak 3 (Mac - agents):
        #   CODEX_HOME=~/.codex-derde codex login
        "label": "Codex 3",
        "bin_env": "CODEX_BIN",
        "bin_default": "codex",
        "blocked_env": ("OPENAI_API_KEY", "OPENAI_BASE_URL"),
        "extra_env": {"CODEX_HOME": os.path.expanduser(os.environ.get("CODEX3_HOME", "~/.codex-derde"))},
        "cmd": _codex_cmd,
        "leest_bestand": True,
        "install": "npm i -g @openai/codex",
        "login": "CODEX_HOME=~/.codex-derde codex login",
        "alleen_lezen": True,
    },
    "cursor": {
        "label": "Cursor",
        "bin_env": "CURSOR_BIN",
        "bin_default": "cursor-agent",
        # Zelfde voorzorg als bij de andere twee, en om dezelfde reden: als de
        # CLI een sleutel in zijn omgeving verkiest boven de ingelogde sessie,
        # betaal je de gemeterde API terwijl je denkt dat je abonnement het doet
        # -- en in de logs verandert er niets. Strippen kost niets als het
        # overbodig blijkt.
        "blocked_env": ("OPENAI_API_KEY", "OPENAI_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"),
        "cmd": _cursor_cmd,
        "leest_bestand": False,
        "install": "curl https://cursor.com/install -fsS | bash",
        "login": "cursor-agent login",
        # NEE -- en dat is geen omissie maar wat Cursor zelf schrijft over
        # `-p/--print`: "has access to all tools, including write and shell".
        # De sandbox-vlag die bestaat (`--sandbox enabled`) begrenst tot de
        # werkmap; alleen-lezen maakt hij het niet. Er is dus geen stand waarin
        # deze motor kan lezen zonder ook te mogen schrijven.
        #
        # Daarom weigert run_agent hem in plan-modus in plaats van te doen alsof.
        # De chat van AXE Core draait op plan, en die belofte -- een vraag
        # stellen herschrijft nooit bestanden -- is het enige wat hem veilig
        # maakt. Een motor die dat niet kan waarmaken hoort daar te weigeren,
        # niet stilletjes schrijfrechten mee te brengen.
        # Achterhaald sinds cursor-agent `--mode ask` heeft (zie _cursor_cmd):
        # die stand leest en weigert te schrijven, gemeten op 14 september.
        "alleen_lezen": True,
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
    # Een naam die al op de whitelist staat mag naar een eigen checkout van de
    # lus wijzen (bouw_publiceer.zorg_voor_canon), nooit een nieuwe naam erbij
    # en nooit buiten WERK_MAP. Zo bleef de whitelist van Luka de baas.
    for name, path in _werk_overrides().items():
        if name in out:
            out[name] = path
    return out


WERK_MAP = os.path.expanduser(os.environ.get("AXE_WERK_MAP", "~/.axe/werk"))
WERK_OVERRIDES = os.path.join(WERK_MAP, "agent-repos.json")


def _werk_overrides() -> dict:
    try:
        with open(WERK_OVERRIDES) as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return {}
    basis = os.path.realpath(WERK_MAP) + os.sep
    return {str(k): os.path.realpath(v) for k, v in (data or {}).items()
            if isinstance(v, str) and os.path.realpath(v).startswith(basis)}


# Hoe lang een run op een bezette motor mag wachten voor hij opgeeft.
MOTOR_WACHT = int(os.environ.get("AGENT_MOTOR_WACHT", "600"))


def _stderr_staart(stderr: str, n: int = 500) -> str:
    """Het stuk van stderr dat de fout noemt: het EINDE, zonder MCP-ruis.

    Gemeten 13 september, codex via /claude/run: `stderr[:500]` gaf de banner
    (workdir, model, sandbox, session id) en `rmcp::transport`-regels, en hield
    op vóór de enige regel die telde -- `ERROR: You've hit your usage limit ...
    try again at 10:36 PM`. De app herkent een limiet aan die tekst
    (src/domain/gebruikslimiet.ts); zonder die regel leek een tijdelijke limiet
    een kapotte motor.
    """
    regels = [r for r in (stderr or "").splitlines() if r.strip() and "rmcp::" not in r]
    return "\n".join(regels)[-n:]


_MOTOR_SLOTEN: dict[str, threading.Lock] = {}
_SLOTEN_SLOT = threading.Lock()


def _motor_slot(naam: str) -> threading.Lock:
    with _SLOTEN_SLOT:
        return _MOTOR_SLOTEN.setdefault(naam, threading.Lock())


def _subprocess_env(blocked: tuple, extra: dict | None = None) -> dict:
    env = os.environ.copy()
    for key in blocked:
        env.pop(key, None)
    env.update(extra or {})
    return env


def _current_branch(repo_path: str) -> str:
    """De branch van de checkout op dit moment, uit git zelf.

    Leeg bij een pad dat geen git-worktree is of waar git niet kan antwoorden;
    aanroepers lezen dat als een weigering, niet als toestemming.
    """
    # Eerst .git/HEAD zelf lezen. Gemeten 14 september: `git rev-parse` op de
    # repo's op de USB-SSD liep telkens tegen de 15s time-out terwijl er een
    # agent in een andere repo werkte, en /claude/repos (een async route) hield
    # daarmee de hele API 45 seconden stil. HEAD lezen is één klein bestand.
    branch = _branch_uit_head(repo_path)
    if branch is not None:
        return branch
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=repo_path, capture_output=True, text=True, timeout=5,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("branch check failed in %s: %s", repo_path, e)
        return ""
    return proc.stdout.strip() if proc.returncode == 0 else ""


def _branch_uit_head(repo_path: str) -> str | None:
    """De branch uit .git/HEAD, ook in een worktree (.git is dan een bestand met gitdir).

    None als het geen gewone branch-HEAD is (losgekoppeld, of onleesbaar): dan
    beslist git zelf. "HEAD" wordt nooit teruggegeven als branchnaam.
    """
    try:
        git = os.path.join(repo_path, ".git")
        if os.path.isfile(git):
            with open(git, "r", encoding="utf-8") as f:
                regel = f.read().strip()
            if not regel.startswith("gitdir:"):
                return None
            git = regel.split(":", 1)[1].strip()
            if not os.path.isabs(git):
                git = os.path.normpath(os.path.join(repo_path, git))
        with open(os.path.join(git, "HEAD"), "r", encoding="utf-8") as f:
            head = f.read().strip()
    except OSError:
        return None
    if head.startswith("ref: refs/heads/"):
        return head[len("ref: refs/heads/"):]
    return None


def _binary(engine: dict) -> str | None:
    naam = os.environ.get(engine["bin_env"], engine["bin_default"])
    gevonden = shutil.which(naam)
    if gevonden:
        return gevonden
    return naam if os.path.isabs(naam) and os.path.exists(naam) else None



# ── Subscription usage ledger ────────────────────────────────────────────────
# The CLIs do not expose a trustworthy "47% of weekly subscription left"
# endpoint. AXE therefore records what IT actually used and any real limit
# message the CLI emitted. No prompt/result content is persisted here.
_AGENT_USAGE_FILE = os.path.expanduser(
    os.environ.get("AXE_AGENT_USAGE_FILE", "~/.axe/agent-usage.json")
)
_AGENT_USAGE_LOCK = threading.Lock()
_AGENT_USAGE_MAX_EVENTS = 2000


def _usage_state() -> dict:
    try:
        with open(_AGENT_USAGE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {"events": []}
    except (OSError, ValueError, TypeError):
        return {"events": []}


def _usage_transaction(mutator):
    directory = os.path.dirname(_AGENT_USAGE_FILE) or "."
    os.makedirs(directory, exist_ok=True)
    lock_path = _AGENT_USAGE_FILE + ".lock"
    with _AGENT_USAGE_LOCK:
        with open(lock_path, "a+", encoding="utf-8") as lock:
            if fcntl is not None:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            try:
                state = _usage_state()
                result = mutator(state)
                tmp = _AGENT_USAGE_FILE + ".tmp"
                with open(tmp, "w", encoding="utf-8") as out:
                    json.dump(state, out, separators=(",", ":"))
                os.replace(tmp, _AGENT_USAGE_FILE)
                return result
            finally:
                if fcntl is not None:
                    fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def _limit_message(text: str) -> str | None:
    if not re.search(r"usage limit|rate limit|quota exceeded|too many requests|\b429\b", text or "", re.I):
        return None
    # Keep the useful clause (often contains "try again at …"), never the whole
    # stderr transcript.
    clean = " ".join((text or "").split())
    m = re.search(r"(.{0,90}(?:usage limit|rate limit|quota exceeded|too many requests|\b429\b).{0,180})", clean, re.I)
    return (m.group(1) if m else clean)[:280]


_AUTH_FOUT = re.compile(
    r"not logged in|please (log|sign) in|login required|"
    r"failed to authenticate|authentication (failed|required)|"
    r"oauth session expired|could not be refreshed|invalid_grant",
    re.I,
)
_LIMIET_KLOK = re.compile(r"try again at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?", re.I)
SEAT_VOLGORDE = ("claude", "claude2", "claude3", "claude4", "codex", "codex2", "codex3", "cursor")
_SEAT_BUSY: dict[str, dict] = {}
_SEAT_LIMIT: dict[str, dict] = {}
_SEAT_SNAP = os.path.expanduser(os.environ.get("AXE_CODING_SEATS_FILE", "~/.axe/coding-seats.json"))


def _auth_fout(tekst: str) -> bool:
    return bool(_AUTH_FOUT.search(tekst or ""))


# Een stoel die het model weigert ("The 'gpt-5-codex' model is not supported when
# using Codex with a ChatGPT account", 25-28 okt). Niet het account en niet de
# taak: de volgende stoel. Geen koeling, want het account werkt gewoon.
_MODEL_FOUT = re.compile(
    r"not supported when using codex with a chatgpt account|\bmodel_not_found\b|"
    r"unsupported model|model is not supported|requires a newer version",
    re.IGNORECASE,
)


def _model_fout(tekst: str) -> bool:
    return bool(_MODEL_FOUT.search(tekst or ""))


def _familie(naam: str) -> str:
    return re.sub(r"\d+$", "", naam or "")


def _machine_naam() -> str:
    return (os.environ.get("AXE_DEVICE_ID") or socket.gethostname().split(".")[0]).lower()


def parse_limiet_tot(tekst: str, nu: float | None = None) -> float | None:
    """Epoch-seconden tot wanneer de stoel koelt. None als dit geen limiet is."""
    if not _limit_message(tekst):
        return None
    nu = time.time() if nu is None else nu
    m = _LIMIET_KLOK.search(tekst or "")
    if not m:
        return nu + 3600
    uur, minuut = int(m.group(1)), int(m.group(2))
    ampm = (m.group(3) or "").upper()
    if ampm == "PM" and uur < 12:
        uur += 12
    if ampm == "AM" and uur == 12:
        uur = 0
    if uur > 23 or minuut > 59:
        return nu + 3600
    lokale = time.localtime(nu)
    kandidaat = time.mktime((
        lokale.tm_year, lokale.tm_mon, lokale.tm_mday,
        uur, minuut, 0, lokale.tm_wday, lokale.tm_yday, lokale.tm_isdst,
    ))
    if kandidaat <= nu:
        kandidaat += 86400
    return kandidaat


def _stoel_koelt(naam: str, nu: float | None = None) -> bool:
    nu = time.time() if nu is None else nu
    info = _SEAT_LIMIT.get(naam)
    if info and float(info.get("until") or 0) > nu:
        return True
    state = _usage_state()
    eigen = [
        e for e in (state.get("events") or [])
        if isinstance(e, dict) and e.get("engine") == naam and e.get("limit_until")
    ]
    laatste = max(eigen, key=lambda e: float(e.get("ts") or 0), default=None)
    return bool(laatste and float(laatste["limit_until"]) > nu)


def _onthoud_stoel_fout(naam: str, fout: str) -> None:
    if _auth_fout(fout):
        _ACCOUNT_CACHE[naam] = (time.monotonic(), {"ingelogd": False, "account": None})
    tot = parse_limiet_tot(fout)
    if tot:
        _SEAT_LIMIT[naam] = {"until": tot, "message": _limit_message(fout)}
    _schrijf_stoel_snapshot()


def _schrijf_stoel_snapshot() -> None:
    """Laatste stand voor de computer-worker. Geen tokens, geen prompts."""
    try:
        os.makedirs(os.path.dirname(_SEAT_SNAP) or ".", exist_ok=True)
        stoelen = {}
        for naam in SEAT_VOLGORDE:
            busy = _SEAT_BUSY.get(naam) or {}
            lim = _SEAT_LIMIT.get(naam) or {}
            stoelen[naam] = {
                "busy": bool(busy),
                "task": busy.get("task"),
                "limit_until": lim.get("until"),
                "limit_message": lim.get("message"),
            }
        fd, tmp = tempfile.mkstemp(prefix="axe-seats-", suffix=".json", dir=os.path.dirname(_SEAT_SNAP) or ".")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump({"updated_at": time.time(), "machine": _machine_naam(), "seats": stoelen}, f)
            os.replace(tmp, _SEAT_SNAP)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
    except OSError as e:
        log.warning("coding-seats snapshot write failed: %s", str(e)[:160])


def kies_vrije_stoel(gewenst: str, overslaan: set[str] | None = None, nu: float | None = None) -> str | None:
    """Volgende stoel die ingelogd is en niet op een limiet zit.

    Zelfde familie eerst (claude → claude2 → …), daarna de rest van het team.
    Onbekend (ingelogd is None) telt als probeerbaar: liever één echte fout
    dan een stoel overslaan die wél werkt. None = niemand over.
    """
    if gewenst not in ENGINES:
        return None
    nu = time.time() if nu is None else nu
    skip = set(overslaan or ())
    familie = _familie(gewenst)
    zelfde = [n for n in SEAT_VOLGORDE if _familie(n) == familie]
    rest = [n for n in SEAT_VOLGORDE if n not in zelfde]
    kandidaten = [gewenst] + [n for n in zelfde + rest if n != gewenst]
    gebruik = {}
    try:
        gebruik = agent_usage_status()
    except Exception:
        gebruik = {}

    def geschikt(naam: str) -> bool:
        if naam in skip or naam not in ENGINES:
            return False
        if not _binary(ENGINES[naam]):
            return False
        hit = _ACCOUNT_CACHE.get(naam)
        acc = hit[1] if hit else {"ingelogd": None, "account": None}
        if acc.get("ingelogd") is False:
            return False
        return not _stoel_koelt(naam, nu)

    # Gevraagde stoel eerst als hij kan: een vastgehouden lock hoort bij díe
    # stoel, niet bij een stillere met minder weekruns.
    if geschikt(gewenst):
        return gewenst
    vrij: list[tuple[tuple, str]] = []
    for naam in kandidaten:
        if not geschikt(naam):
            continue
        g = gebruik.get(naam) or {}
        score = (0 if _familie(naam) == familie else 1, int(g.get("runs_7d") or 0))
        vrij.append((score, naam))
    vrij.sort()
    return vrij[0][1] if vrij else None


def _openhands_stoel() -> dict:
    url = (os.environ.get("OPENHANDS_URL") or "").strip()
    return {
        "id": "openhands",
        "provider": "openhands",
        "label": "OpenHands",
        "email": None,
        "machine": os.environ.get("AXE_OPENHANDS_MACHINE") or "vps",
        "logged_in": True if url else None,
        "login_command": "Set OPENHANDS_URL on the VPS (no CLI login).",
        "current_task": None,
        "rate_limited": False,
        "rate_limit_until": None,
        "last_limit_message": None,
        "remaining_note": "OpenHands draait op de VPS, niet op een abonnements-CLI.",
        "shared_quota_with": [],
    }


def _record_agent_usage(engine: str, repo: str, result: dict, started_at: float, model: str = "") -> None:
    meta = result.get("meta") if isinstance(result, dict) else None
    usage = meta.get("usage") if isinstance(meta, dict) and isinstance(meta.get("usage"), dict) else {}
    errorish = str(result.get("error") or (result.get("result") if result.get("status") == "error" else "") or "")
    limit_msg = _limit_message(errorish)
    event = {
        "ts": time.time(),
        "engine": engine,
        "repo": repo,
        "status": result.get("status") or "error",
        "duration_s": round(max(0.0, time.time() - started_at), 2),
        "model": model or None,
        "input_tokens": usage.get("input_tokens"),
        "output_tokens": usage.get("output_tokens"),
        "cache_read_tokens": usage.get("cache_read_input_tokens"),
        "limit_message": limit_msg,
        "limit_until": parse_limiet_tot(errorish) if limit_msg else None,
    }

    def mutate(state):
        events = state.setdefault("events", [])
        events.append(event)
        state["events"] = events[-_AGENT_USAGE_MAX_EVENTS:]

    try:
        _usage_transaction(mutate)
    except Exception as e:  # noqa: BLE001
        log.warning("agent usage ledger write failed: %s", str(e)[:160])


def agent_usage_status() -> dict:
    """Privacy-safe observed usage per subscription seat.

    Counts are AXE runs, not vendor billing percentages. Exact remaining plan
    quota is deliberately reported as unavailable unless a CLI starts exposing
    it machine-readably.
    """
    state = _usage_state()
    events = state.get("events") if isinstance(state.get("events"), list) else []
    now = time.time()
    out = {}
    for name, motor in ENGINES.items():
        own = [e for e in events if isinstance(e, dict) and e.get("engine") == name]
        day = [e for e in own if float(e.get("ts") or 0) >= now - 86400]
        week = [e for e in own if float(e.get("ts") or 0) >= now - 7 * 86400]
        last = max(own, key=lambda e: float(e.get("ts") or 0), default=None)
        limits = [e for e in own if e.get("limit_message")]
        last_limit = max(limits, key=lambda e: float(e.get("ts") or 0), default=None)
        limit_until = None
        if last_limit and last_limit.get("limit_until"):
            try:
                limit_until = float(last_limit["limit_until"])
            except (TypeError, ValueError):
                limit_until = None
        if name in _SEAT_LIMIT:
            limit_until = float(_SEAT_LIMIT[name].get("until") or 0) or limit_until

        def isum(rows, key):
            return sum(int(e.get(key) or 0) for e in rows)

        busy = _SEAT_BUSY.get(name) or {}
        out[name] = {
            "label": motor["label"],
            "runs_24h": len(day),
            "runs_7d": len(week),
            "ok_7d": sum(1 for e in week if e.get("status") == "ok"),
            "failed_7d": sum(1 for e in week if e.get("status") != "ok"),
            "input_tokens_7d": isum(week, "input_tokens"),
            "output_tokens_7d": isum(week, "output_tokens"),
            "last_run_at": last.get("ts") if last else None,
            "last_status": last.get("status") if last else None,
            "last_limit_at": last_limit.get("ts") if last_limit else None,
            "last_limit_message": last_limit.get("limit_message") if last_limit else None,
            "rate_limited": bool(limit_until and limit_until > now),
            "rate_limit_until": limit_until if limit_until and limit_until > now else None,
            "current_task": busy.get("task"),
            "exact_remaining_available": False,
            "remaining_note": "De CLI geeft geen exact resterend abonnementssaldo machine-readable terug.",
        }
    return out

def run_agent(
    repo: str,
    prompt: str,
    permission_mode: str = None,
    timeout: int = None,
    engine: str = DEFAULT_ENGINE,
    model: str = "",
    checks: bool = False,
) -> dict:
    """Draai één sessie van `engine` in `repo`.

    Elke weigering hieronder gebeurt vóórdat de CLI start, dus een afgewezen
    aanroep kost niets en verandert niets op schijf.

    Een stoel die niet is ingelogd of op een limiet zit, wordt overgeslagen.
    Faalt de gekozen stoel alsnog op login of limiet, dan de volgende — een
    taak faalt niet met 'Not logged in' terwijl een andere stoel werkt.
    """
    gevraagd = (engine or DEFAULT_ENGINE).strip()
    if gevraagd not in ENGINES:
        return {"status": "error", "error": f"Onbekende motor '{gevraagd}'. Bekend: {', '.join(sorted(ENGINES))}"}

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
    if not _is_checkout(repo_path):
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
                     f"Check een werkbranch uit voordat {ENGINES[gevraagd]['label']} hier draait.",
            "branch": branch,
        }

    geprobeerd: list[str] = []
    overslaan: set[str] = set()
    huidige = kies_vrije_stoel(gevraagd) or gevraagd
    laatste: dict | None = None
    while huidige and huidige not in geprobeerd:
        geprobeerd.append(huidige)
        laatste = _run_agent_stoel(
            huidige, repo, repo_path, branch, prompt, mode, timeout, model, checks,
        )
        if laatste.get("status") == "ok":
            if len(geprobeerd) > 1:
                laatste["seats_tried"] = geprobeerd
            return laatste
        fout = str(laatste.get("error") or laatste.get("result") or "")
        if _auth_fout(fout) or _limit_message(fout) or _model_fout(fout):
            if not _model_fout(fout):
                _onthoud_stoel_fout(huidige, fout)
            overslaan.add(huidige)
            volgende = kies_vrije_stoel(gevraagd, overslaan=overslaan)
            if volgende:
                log.info("%s faalde op account/limiet/model; probeer %s", huidige, volgende)
                huidige = volgende
                continue
        break
    if laatste is not None:
        if geprobeerd:
            laatste["seats_tried"] = geprobeerd
        return laatste
    return {"status": "error", "error": f"Geen vrije stoel voor '{gevraagd}'.", "engine": gevraagd}


def _run_agent_stoel(
    motornaam: str,
    repo: str,
    repo_path: str,
    branch: str,
    prompt: str,
    mode: str,
    timeout: int | None,
    model: str,
    checks: bool,
) -> dict:
    """Eén stoel, één run. Aanroeper valt door bij login- of limietfout."""
    motor = ENGINES.get(motornaam)
    if not motor:
        return {"status": "error", "error": f"Onbekende motor '{motornaam}'.", "engine": motornaam}

    if mode == "plan" and not motor.get("alleen_lezen", False):
        return {
            "status": "error",
            "error": f"{motor['label']} kent geen alleen-lezen stand: zijn niet-interactieve "
                     f"modus heeft altijd schrijf- en shelltoegang. Gebruik hem in de "
                     f"code-editor, waar bewerken de bedoeling is, of kies Claude of Codex "
                     f"voor de chat.",
            "engine": motornaam,
        }

    binary = _binary(motor)
    if not binary:
        return {
            "status": "error",
            "error": f"{motor['label']} CLI niet gevonden. Installeer met `{motor['install']}` "
                     f"en log in met `{motor['login']}` op deze host. Zet géén API-sleutel — "
                     f"deze runner stript die met opzet.",
            "engine": motornaam,
        }

    limit = int(timeout or DEFAULT_TIMEOUT)

    # Eén sessie per abonnement tegelijk. Gemeten 13 september: zes gelijktijdige
    # `codex exec`-runs van de trading-desk maakten het limiet in een uur op. De
    # app verdeelt de abonnementen nu over de agents (domain/agentMotoren.ts);
    # dit is het vangnet als er tóch twee tegelijk komen: de tweede wacht.
    slot = _motor_slot(motornaam)
    begin = time.monotonic()
    if not slot.acquire(timeout=MOTOR_WACHT):
        return {"status": "error", "engine": motornaam, "repo": repo, "branch": branch,
                "error": f"{motor['label']} was {MOTOR_WACHT}s bezig met een andere run; deze is niet gestart."}
    gewacht = round(time.monotonic() - begin, 1)
    if gewacht >= 1:
        log.info("%s: %.1fs gewacht op een andere run", motornaam, gewacht)

    run_started = time.time()
    taak = f"{repo}: {str(prompt).strip()[:80]}"
    _SEAT_BUSY[motornaam] = {"task": taak, "since": run_started}
    _schrijf_stoel_snapshot()

    def finish(result: dict) -> dict:
        _SEAT_BUSY.pop(motornaam, None)
        _schrijf_stoel_snapshot()
        _record_agent_usage(motornaam, repo, result, run_started, (model or "").strip())
        return result

    uitvoer = ""
    tmp = None
    leest_bestand = motor["leest_bestand"]
    fallback = None
    fallback_note = ""
    try:
        if leest_bestand:
            fd, tmp = tempfile.mkstemp(prefix="axe-agent-", suffix=".txt")
            os.close(fd)

        cmd = motor["cmd"](binary, prompt, mode, tmp or "", (model or "").strip())
        if checks and mode == "acceptEdits" and motor["cmd"] is _claude_cmd:
            cmd += ["--allowedTools", *CHECK_TOOLS]

        def draai(cmd_nu: list, blocked=None, extra=None):
            return subprocess.run(
                cmd_nu, cwd=repo_path,
                env=_subprocess_env(
                    blocked if blocked is not None else motor["blocked_env"],
                    extra if extra is not None else motor.get("extra_env"),
                ),
                capture_output=True, text=True, timeout=limit,
            )

        def lees_tmp() -> str:
            if not (tmp and os.path.exists(tmp)):
                return ""
            try:
                with open(tmp, "r", encoding="utf-8") as f:
                    return f.read().strip()
            except Exception as e:  # noqa: BLE001
                log.warning("kon %s niet lezen: %s", tmp, e)
                return ""

        proc = draai(cmd)
        uitvoer = lees_tmp() if leest_bestand else ""

        if motor["cmd"] is _codex_cmd:
            fouttekst = "\n".join(x for x in (proc.stderr, proc.stdout, uitvoer) if x)
            if proc.returncode != 0 and _model_fout(fouttekst):
                if "-m" in cmd:
                    log.info("codex model_not_found with -m; retry without model flag")
                    proc = draai(_zonder_model_vlag(cmd))
                    uitvoer = lees_tmp() if leest_bestand else ""
                    fouttekst = "\n".join(x for x in (proc.stderr, proc.stdout, uitvoer) if x)
                    fallback = "no-m"
                    fallback_note = "Codex rejected the model flag; retried without -m. "
                if proc.returncode != 0 and _model_fout(fouttekst):
                    claude_bin = _claude_fallback_binary()
                    if claude_bin:
                        log.info("codex still model_not_found; fallback to Claude CLI %s", claude_bin)
                        claude_motor = ENGINES["claude"]
                        claude_cmd = _claude_cmd(claude_bin, prompt, mode, "", "")
                        if checks and mode == "acceptEdits":
                            claude_cmd += ["--allowedTools", *CHECK_TOOLS]
                        proc = draai(claude_cmd, claude_motor["blocked_env"], claude_motor.get("extra_env"))
                        leest_bestand = False
                        uitvoer = ""
                        fallback = "claude"
                        fallback_note = (
                            "Codex model_not_found on this ChatGPT account; retried without -m, "
                            "then fell back to Claude CLI. "
                        )
                    else:
                        fallback_note = (
                            "Codex model_not_found on this ChatGPT account; retried without -m; "
                            "Claude CLI fallback unavailable (/opt/homebrew/bin/claude not found). "
                        )
    except subprocess.TimeoutExpired:
        return finish({"status": "error", "error": f"{motor['label']} liep langer dan {limit}s", "repo": repo, "branch": branch, "engine": motornaam})
    except Exception as e:  # noqa: BLE001
        return finish({"status": "error", "error": f"{type(e).__name__}: {e}", "repo": repo, "branch": branch, "engine": motornaam})
    finally:
        slot.release()
        if tmp and os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass

    stdout = (proc.stdout or "").strip()
    basis = {"repo": repo, "branch": branch, "permission_mode": mode, "engine": motornaam, "exit_code": proc.returncode}
    if fallback:
        basis["codex_fallback"] = fallback

    def foutzin() -> str:
        return (
            fallback_note
            + f"{motor['label']} eindigde met {proc.returncode}. stderr: {_stderr_staart(proc.stderr)}"
        ).strip()

    if leest_bestand:
        if proc.returncode != 0 and not uitvoer:
            return finish({**basis, "status": "error", "error": foutzin()})
        resultaat = (uitvoer or stdout)[:8000]
        if fallback_note and resultaat:
            resultaat = fallback_note + resultaat
        return finish({**basis, "status": "error" if proc.returncode != 0 else "ok",
                "result": resultaat, **({"error": foutzin()} if proc.returncode != 0 else {})})

    # Claude: JSON op stdout. (Ook de Codex→Claude-terugval komt hier.)
    if proc.returncode != 0 and not stdout:
        return finish({**basis, "status": "error", "error": foutzin()})

    try:
        parsed = json.loads(stdout) if stdout else None
    except json.JSONDecodeError:
        parsed = None

    if parsed is None:
        # --output-format json houdt normaal stand, maar een versiewissel of een
        # wrapper op PATH mag geen verzonnen succes worden.
        tekst = (fallback_note + stdout)[:8000] if fallback_note else stdout[:8000]
        return finish({**basis, "status": "error" if proc.returncode != 0 else "ok",
                "result": tekst, "raw": True,
                **({"error": foutzin()} if proc.returncode != 0 else {})})

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

    tekst = result_text or stdout[:8000]
    if fallback_note:
        tekst = (fallback_note + tekst)[:8000]
    return finish({**basis, "status": "error" if mislukt else "ok",
            "result": tekst,
            "meta": parsed if isinstance(parsed, dict) else None,
            **({"error": foutzin()} if mislukt else {})})


# Een Claude-stoel die dagen niets doet, stond op Subscriptions als "Limit seen ·
# Token expired" (20 okt: drie van de vier). Het toegangstoken leeft een paar
# uur; de CLI ververst het pas bij zijn volgende run, en een login die écht
# stuk is zag je pas als een taak die stoel nodig had. Deze check-in IS die
# volgende run: de CLI zelf ververst, wij schrijven nooit aan een token
# (abonnement_verbruik.py zegt waarom). Klein model, leeg mapje, alleen lezen,
# en niet in de runstatistiek.
WARM_PROMPT = "Reply with the single word: ok"
WARM_MODEL = os.environ.get("AXE_WARM_MODEL", "haiku")


def houd_warm(naam: str, timeout: int = 90) -> dict:
    """Eén minimale run op precies deze stoel, zonder terugval naar een andere.

    {"status": "ok"} | {"status": "skip", "reden": ...} | {"status": "error", "error": ...}
    """
    motor = ENGINES.get(naam)
    if not motor or motor.get("cmd") is not _claude_cmd:
        return {"status": "skip", "reden": "geen Claude-stoel"}
    binary = _binary(motor)
    if not binary:
        return {"status": "skip", "reden": "niet geïnstalleerd"}
    slot = _motor_slot(naam)
    if not slot.acquire(blocking=False):
        # Bezig met echt werk: dat ververst het token al.
        return {"status": "skip", "reden": "bezig"}
    try:
        with tempfile.TemporaryDirectory(prefix="axe-warm-") as map_:
            proc = subprocess.run(
                _claude_cmd(binary, WARM_PROMPT, "plan", "", WARM_MODEL),
                cwd=map_, env=_subprocess_env(motor["blocked_env"], motor.get("extra_env")),
                capture_output=True, text=True, timeout=timeout,
            )
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": f"check-in liep langer dan {timeout}s"}
    except OSError as e:
        return {"status": "error", "error": f"{type(e).__name__}: {e}"}
    finally:
        slot.release()
    try:
        parsed = json.loads((proc.stdout or "").strip() or "null")
    except json.JSONDecodeError:
        parsed = None
    fout_in_json = isinstance(parsed, dict) and parsed.get("is_error") is True
    if proc.returncode == 0 and isinstance(parsed, dict) and not fout_in_json:
        return {"status": "ok"}
    fout = str(parsed.get("result") or "") if isinstance(parsed, dict) else ""
    fout = fout or _stderr_staart(proc.stderr or proc.stdout or "") or f"exit {proc.returncode}"
    if _auth_fout(fout) or _limit_message(fout):
        _onthoud_stoel_fout(naam, fout)
    return {"status": "error", "error": fout[-400:]}


def _git(repo_path: str, *args: str, timeout: int = 120) -> subprocess.CompletedProcess:
    """Eén git-aanroep in een checkout, zonder shell en zonder interactie.

    `GIT_TERMINAL_PROMPT=0`: zonder dat blijft een push met verlopen
    inloggegevens hangen op een gebruikersnaam-vraag die niemand ziet, tot de
    timeout. Falen met "authenticatie" is bruikbaar; vastlopen is dat niet.
    """
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    return subprocess.run(
        ["git", *args], cwd=repo_path, env=env,
        capture_output=True, text=True, timeout=timeout,
    )


def _repo_pad(repo: str) -> tuple:
    """(pad, branch, fout). Dezelfde bewakingen als run_agent, in dezelfde volgorde.

    Met opzet gedeeld en niet overgeschreven: een tweede kopie van "welke repo
    mag" en "welke branch mag" loopt binnen een week uit de pas met de eerste,
    en dan is niet te zien welke van de twee de weigering deed. Dat staat
    bovenaan dit bestand als reden dat het bestaat.
    """
    repos = _repos()
    if not repos:
        return None, None, ("Geen repositories op de whitelist. Zet AGENT_REPOS "
                            "(naam=/abs/pad) op deze host.")
    if not repo or repo not in repos:
        return None, None, f"Onbekende repo '{repo}'. Toegestaan: {', '.join(sorted(repos)) or '(geen)'}"
    pad = repos[repo]
    if not _is_checkout(pad):
        return None, None, f"Repo '{repo}' ({pad}) is geen git-checkout."
    branch = _current_branch(pad)
    if not branch:
        return None, None, f"Kon de branch van '{repo}' ({pad}) niet lezen; weiger te werken."
    if branch in PROTECTED_BRANCHES:
        return None, None, (f"Repo '{repo}' staat op beschermde branch '{branch}'. "
                            f"Check een werkbranch uit.")
    return pad, branch, None


def werkboom_status(repo: str) -> dict:
    """Wat er op dit moment gewijzigd is, zodat je het kúnt zien voor je het pusht.

    Dit endpoint bestaat omdat de volgende stap onomkeerbaar is. Een knop die
    commit en pusht zonder dat er iets te lezen viel, is een knop die je op een
    dag indrukt terwijl er iets in staat dat je niet bedoelde -- en op dat
    moment staat het al op GitHub.

    `--porcelain` en niet `git status` in mensentaal: het formaat ligt vast en
    verandert niet mee met een git-versie of een locale.
    """
    pad, branch, fout = _repo_pad(repo)
    if fout:
        return {"status": "error", "error": fout}

    try:
        st = _git(pad, "status", "--porcelain")
        stat = _git(pad, "diff", "--stat", "HEAD")
        voor = _git(pad, "rev-list", "--count", "--left-right", f"origin/{branch}...HEAD")
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": "git antwoordde niet binnen de tijd", "repo": repo}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "error": f"{type(e).__name__}: {e}", "repo": repo}

    if st.returncode != 0:
        return {"status": "error", "error": f"git status gaf {st.returncode}: {(st.stderr or '')[:300]}"}

    regels = [r for r in (st.stdout or "").splitlines() if r.strip()]
    bestanden = [{"staat": r[:2].strip(), "pad": r[3:]} for r in regels]

    # Links = commits die origin heeft en wij niet, rechts = andersom. Faalt als
    # de branch nog niet op origin staat; dat is geen fout, alleen onbekend.
    achter = vooruit = None
    if voor.returncode == 0 and voor.stdout.strip():
        stukken = voor.stdout.split()
        if len(stukken) == 2:
            achter, vooruit = int(stukken[0]), int(stukken[1])

    return {
        "status": "ok", "repo": repo, "branch": branch,
        "bestanden": bestanden, "aantal": len(bestanden),
        "diffstat": (stat.stdout or "").strip()[:4000],
        "achter": achter, "vooruit": vooruit,
        "schoon": not bestanden,
    }


def commit_en_push(repo: str, bericht: str, push: bool = True) -> dict:
    """Leg vast wat de agent veranderde, en zet het op de branch.

    Drie dingen die dit met opzet NIET doet:

    - Niet op main of master. Dezelfde regel als voor een agent-run, via
      `_repo_pad`, en om dezelfde reden.
    - Geen `--force`, geen rebase, geen amend. Dit duwt vooruit of het faalt;
      het herschrijft nooit iets dat er al staat.
    - Geen commit als er niets gewijzigd is. Een lege commit als "er is toch
      iets gebeurd" is precies de rommel die een geschiedenis onleesbaar maakt.

    `git add -A` legt alles vast wat er in de worktree staat, inclusief wat jij
    er zelf naast de agent in hebt gezet. Dat is de reden dat `werkboom_status`
    bestaat en dat de app die eerst toont: dit endpoint is niet de plek om te
    beslissen wat er mee mag, dat ben jij.
    """
    pad, branch, fout = _repo_pad(repo)
    if fout:
        return {"status": "error", "error": fout}

    tekst = (bericht or "").strip()
    if not tekst:
        return {"status": "error", "error": "Een commitbericht is verplicht."}

    try:
        st = _git(pad, "status", "--porcelain")
        if st.returncode != 0:
            return {"status": "error", "error": f"git status gaf {st.returncode}: {(st.stderr or '')[:300]}"}
        if not (st.stdout or "").strip():
            return {"status": "error", "error": "Niets gewijzigd — geen commit gemaakt.",
                    "repo": repo, "branch": branch, "schoon": True}

        add = _git(pad, "add", "-A")
        if add.returncode != 0:
            return {"status": "error", "error": f"git add gaf {add.returncode}: {(add.stderr or '')[:300]}"}

        commit = _git(pad, "commit", "-m", tekst)
        if commit.returncode != 0:
            return {"status": "error", "repo": repo, "branch": branch,
                    "error": f"git commit gaf {commit.returncode}: "
                             f"{((commit.stderr or '') + (commit.stdout or ''))[:500]}"}

        sha = _git(pad, "rev-parse", "--short", "HEAD").stdout.strip()

        if not push:
            return {"status": "ok", "repo": repo, "branch": branch, "sha": sha,
                    "gepusht": False, "bericht": tekst}

        pr = _git(pad, "push", "-u", "origin", branch, timeout=300)
        if pr.returncode != 0:
            # De commit staat er wél. Dat hoort in het antwoord, anders denk je
            # dat er niets gebeurd is en doe je het werk opnieuw.
            return {"status": "error", "repo": repo, "branch": branch, "sha": sha,
                    "gepusht": False, "gecommit": True,
                    "error": f"Commit {sha} staat lokaal, maar push faalde: "
                             f"{((pr.stderr or '') + (pr.stdout or ''))[:500]}"}
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": "git antwoordde niet binnen de tijd", "repo": repo}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "error": f"{type(e).__name__}: {e}", "repo": repo}

    return {"status": "ok", "repo": repo, "branch": branch, "sha": sha,
            "gepusht": True, "bericht": tekst}


def whitelisted_repos() -> dict:
    return _repos()


def _is_checkout(pad: str) -> bool:
    """Een git-checkout: `.git` als map, of als bestand in een worktree.

    Gemeten 14 september: de agent-werkkopieën in /Volumes/EagetSSD/agent-werk
    zijn worktrees, en daar is `.git` een bestand met "gitdir: ...". isdir gaf
    False en alle drie heetten "bestaat niet".
    """
    return os.path.exists(os.path.join(pad, ".git"))


def repo_status() -> dict:
    """Wat /health eerlijk moet kunnen zeggen: welke repo's er staan, of ze
    bestaan, en op welke branch ze nu zitten."""
    out = {}
    for name, path in sorted(whitelisted_repos().items()):
        exists = _is_checkout(path)
        branch = _current_branch(path) if exists else ""
        out[name] = {
            "path": path,
            "exists": exists,
            "branch": branch or None,
            "runnable": bool(exists and branch and branch not in PROTECTED_BRANCHES),
        }
    return out


# Op welk account is een motor ingelogd? Het scherm noemde ze "Claude 2", "Claude 3": drie abonnementen die je
# alleen uit elkaar houdt door je te herinneren in welke map welke login zat. Nu staat het e-mailadres erbij.
# Lokaal uitgelezen (een `auth status`, geen modelaanroep, dus geen sessie van je abonnement), vijf minuten onthouden.
_ACCOUNT_TTL_S = 300.0
_ACCOUNT_CACHE: dict[str, tuple[float, dict]] = {}
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def _draai_status(cmd: list[str], motor: dict, timeout: float = 15.0) -> str:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                           env=_subprocess_env(motor["blocked_env"], motor.get("extra_env")))
        return (r.stdout or "") + (r.stderr or "")
    except (OSError, subprocess.SubprocessError):
        return ""


def _codex_account(motor: dict) -> dict:
    """De e-mail uit het id_token in auth.json (alleen de claim, nooit het token zelf)."""
    thuis = (motor.get("extra_env") or {}).get("CODEX_HOME") or os.path.expanduser("~/.codex")
    try:
        with open(os.path.join(thuis, "auth.json")) as f:
            tokens = (json.load(f).get("tokens") or {})
        jwt = tokens.get("id_token") or ""
        if not tokens.get("access_token") and not jwt:
            return {"ingelogd": False, "account": None}
        deel = jwt.split(".")[1] if jwt.count(".") >= 2 else ""
        claims = json.loads(base64.urlsafe_b64decode(deel + "=" * (-len(deel) % 4))) if deel else {}
        return {"ingelogd": True, "account": claims.get("email") or None}
    except (OSError, ValueError, IndexError):
        return {"ingelogd": False, "account": None}


def _account_van(naam: str, motor: dict, binary: str | None) -> dict:
    """{"ingelogd": bool | None, "account": e-mail | None}; None = niet vast te stellen."""
    if not binary:
        return {"ingelogd": None, "account": None}
    nu = time.monotonic()
    hit = _ACCOUNT_CACHE.get(naam)
    if hit and nu - hit[0] < _ACCOUNT_TTL_S:
        return hit[1]
    if naam.startswith("claude"):
        tekst = _draai_status([binary, "auth", "status"], motor)
        try:
            d = json.loads(tekst[tekst.index("{"):tekst.rindex("}") + 1])
            ingelogd = bool(d.get("loggedIn"))
            mail = d.get("email") or None
            uit = {"ingelogd": ingelogd, "account": mail if ingelogd else None}
        except ValueError:
            uit = {"ingelogd": None, "account": None}
    elif naam.startswith("codex"):
        uit = _codex_account(motor)
    else:  # cursor
        tekst = _draai_status([binary, "status"], motor)
        mail = _EMAIL_RE.search(tekst)
        uit = {"ingelogd": bool(mail) or ("logged in" in tekst.lower() and "not logged in" not in tekst.lower()),
               "account": mail.group(0) if mail else None}
        if not tekst.strip():
            uit = {"ingelogd": None, "account": None}
    _ACCOUNT_CACHE[naam] = (nu, uit)
    return uit


def vergeet_accounts() -> None:
    """Na een nieuwe login, en voor tests."""
    _ACCOUNT_CACHE.clear()


def _motor_label(m: dict, account: dict, aanwezig: bool) -> str:
    """"Claude · naam@mail.nl" zodra bekend; zonder login zegt het dat, met de vaste naam erbij."""
    familie = m["label"].split(" ")[0]
    if account.get("account"):
        return f"{familie} · {account['account']}"
    if aanwezig and account.get("ingelogd") is False:
        return f"{m['label']} (not logged in)"
    return m["label"]


def engine_status() -> dict:
    """Welke motoren er zijn, en op welk account ze ingelogd zijn.

    Aanwezigheid is of het commando bestaat. De login komt uit `auth status` (Claude), `auth.json` (Codex) of
    `status` (Cursor): lokaal, zonder modelaanroep, dus zonder sessie van je abonnement te verbruiken.
    """
    uit = {}
    for naam, m in ENGINES.items():
        binary = _binary(m)
        account = _account_van(naam, m, binary)
        uit[naam] = {
            "label": _motor_label(m, account, binary is not None),
            "aanwezig": binary is not None, "login": m["login"],
            "ingelogd": account["ingelogd"], "account": account["account"],
            # Zodat het scherm kan zeggen waarom een motor niet in de chat kan.
            "alleen_lezen": m.get("alleen_lezen", False),
        }
    return uit


def coding_seats_status() -> list[dict]:
    """Eén kaart per stoel: e-mail, machine, taak, limiet, login-commando.

    Geen tokens. Zelfde e-mail op twee stoelen krijgt shared_quota_with, omdat
    die stoelen één quotum delen — vandaag allemaal support@axeheadquarters.com.
    """
    gebruik = agent_usage_status()
    machine = _machine_naam()
    stoelen = []
    for naam in SEAT_VOLGORDE:
        motor = ENGINES[naam]
        binary = _binary(motor)
        account = _account_van(naam, motor, binary)
        g = gebruik.get(naam) or {}
        stoelen.append({
            "id": naam,
            "provider": _familie(naam),
            "label": motor["label"],
            "email": account.get("account"),
            "machine": machine,
            "logged_in": account.get("ingelogd"),
            "login_command": motor["login"],
            "current_task": (_SEAT_BUSY.get(naam) or {}).get("task") or g.get("current_task"),
            "rate_limited": bool(g.get("rate_limited")),
            "rate_limit_until": g.get("rate_limit_until"),
            "last_limit_message": g.get("last_limit_message"),
            "remaining_note": g.get("remaining_note") or "De CLI geeft geen exact resterend saldo.",
            "shared_quota_with": [],
        })
    stoelen.append(_openhands_stoel())
    per_mail: dict[str, list[str]] = {}
    for s in stoelen:
        mail = (s.get("email") or "").strip().lower()
        if mail:
            per_mail.setdefault(mail, []).append(s["id"])
    for s in stoelen:
        mail = (s.get("email") or "").strip().lower()
        anderen = [i for i in per_mail.get(mail, []) if i != s["id"]] if mail else []
        s["shared_quota_with"] = anderen
    return stoelen


def cli_available(engine: str = DEFAULT_ENGINE) -> bool:
    m = ENGINES.get(engine)
    return bool(m and _binary(m))
