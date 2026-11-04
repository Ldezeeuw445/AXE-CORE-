"""Provider-router: tierkaart + stoelen + automatische fallback-keten.

`route(taak)` geeft geordende kandidaten. `loop_keten` schuift bij limiet,
tegoed of timeout door naar de volgende; een taakfout gaat terug naar de
planner. Hele keten op = WaitingForCapacity / defer_core_task, nooit failed.

Keten (env-namen, geen waarden): stoelen → Grok → betaalde API's →
gratis/goedkoop → Ollama/OpenHands als laatste vangnet. Frontend VITE_* telt
niet mee.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger("axe_provider_router")

KAART_PAD = Path(__file__).with_name("agent_tiers.json")
SEAT_FAMILIES = ("claude", "codex", "cursor")
SEAT_VOLGORDE = (
    "claude2", "claude3", "claude4", "claude",
    "codex", "codex2", "codex3", "cursor", "cursor2",
)
HARTSLAG_STALE_S = 180
WACHT_STANDAARD_S = 300
TEGOED_PREFIX = "[tegoed]"

_TEGOED = re.compile(
    r"no credits|insufficient_quota|credit_balance|credits are depleted|"
    r"billing|prepayment credits|credit low|out of credits|"
    r"you have no credits",
    re.I,
)
_LIMIET = re.compile(r"rate limit|quota exceeded|too many requests|\b429\b|usage limit", re.I)
_TRANSIENT = re.compile(
    r"timeout|timed out|temporar|unavailable|\b5\d\d\b|\b502\b|\b503\b|\b504\b|"
    r"connection reset|econnreset|network|overloaded",
    re.I,
)
_TAAKFOUT = re.compile(
    r"tests? (failed|rood|red)|assertionerror|pytest.*fail|vitest.*fail|"
    r"invalid (input|argument|request)|bad request|"
    r"verification failed|checks? (are )?not verified|"
    r"project checks are not verified|slechte input",
    re.I,
)

_kaart_cache: dict[str, Any] | None = None


class WaitingForCapacity(Exception):
    """Geen API en geen vrije stoel. Geen mislukking — later opnieuw."""

    def __init__(self, message: str, retry_after_s: int = WACHT_STANDAARD_S, errors: list[str] | None = None):
        super().__init__(message)
        self.retry_after_s = max(15, int(retry_after_s))
        self.errors = list(errors or [])
        self.status = "deferred"
        self.deferred = True


class TaakFout(Exception):
    """De taak zelf is fout (tests rood, slechte input). Niet doorschuiven."""


def laad_kaart(pad: Path | None = None) -> dict[str, Any]:
    """De tierkaart. Eén bestand; de router leest niets anders."""
    global _kaart_cache
    bron = pad or KAART_PAD
    if pad is None and _kaart_cache is not None:
        return _kaart_cache
    data = json.loads(bron.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "agents" not in data:
        raise RuntimeError("agent_tiers.json mist agents")
    if pad is None:
        _kaart_cache = data
    return data


def vergeet_kaart() -> None:
    global _kaart_cache
    _kaart_cache = None


def alle_ids(kaart: dict[str, Any] | None = None) -> dict[str, str]:
    """id → soort (main/crew/northsea)."""
    k = kaart or laad_kaart()
    uit: dict[str, str] = {}
    for naam, rij in (k.get("agents") or {}).items():
        uit[naam] = str((rij or {}).get("kind") or "main")
    for naam, rij in (k.get("crews") or {}).items():
        uit[naam] = str((rij or {}).get("kind") or "crew")
    for naam, rij in (k.get("northsea") or {}).items():
        uit[f"northsea.{naam}"] = str((rij or {}).get("kind") or "northsea")
        uit[naam] = str((rij or {}).get("kind") or "northsea")
    return uit


def kaart_voor(agent: str | None, kaart: dict[str, Any] | None = None) -> dict[str, Any]:
    k = kaart or laad_kaart()
    naam = (agent or "axe").strip()
    for bak in ("agents", "crews", "northsea"):
        rij = (k.get(bak) or {}).get(naam)
        if isinstance(rij, dict):
            return {"id": naam, **rij}
    if naam.startswith("northsea."):
        rij = (k.get("northsea") or {}).get(naam.split(".", 1)[1])
        if isinstance(rij, dict):
            return {"id": naam, **rij}
    return {"id": naam, "kind": "unknown", "tier": 2, "model": "groq", "seat_family": None}


def mag_stoel(agent: str | None, *, alleen_gratis: bool = False, kaart: dict[str, Any] | None = None) -> bool:
    if alleen_gratis:
        return False
    rij = kaart_voor(agent, kaart)
    tier = int(rij.get("tier") or 2)
    if tier >= 3:
        return False
    return bool(rij.get("seat_family"))


def api_namen(agent: str | None, *, alleen_gratis: bool = False, kaart: dict[str, Any] | None = None) -> list[str]:
    """Welke API-aanbieders deze agent mag proberen, in volgorde.

    OpenRouter zit bij de betaalde keten (heeft een key nodig, maar is al
    geconfigureerd op de VPS). Ollama blijft altijd laatste — keyloos.
    Claude/Anthropic loopt via de Mac-seat (zie mag_stoel), niet via API-key.
    """
    rij = kaart_voor(agent, kaart)
    tier = int(rij.get("tier") or 2)
    if alleen_gratis or tier >= 3:
        return ["groq", "cerebras", "ollama"]
    if tier == 1:
        # Seats eerst in de lus; API alleen als noodrem (gratis + xAI / OpenRouter).
        return ["groq", "cerebras", "xai", "openrouter", "ollama"]
    return ["groq", "cerebras", "gemini", "openai", "xai", "openrouter", "ollama"]


def _iso_ts(waarde: Any) -> float | None:
    if not waarde:
        return None
    if isinstance(waarde, (int, float)):
        n = float(waarde)
        return n / 1000.0 if n > 1e12 else n
    try:
        return datetime.fromisoformat(str(waarde).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def stoel_vrij(rij: dict[str, Any], *, nu: float | None = None, stale_s: int = HARTSLAG_STALE_S) -> bool:
    """True als deze core_coding_seats-rij werk mag krijgen."""
    nu = time.time() if nu is None else nu
    fam = str(rij.get("provider") or re.sub(r"\d+$", "", str(rij.get("seat_id") or rij.get("id") or "")))
    if fam not in SEAT_FAMILIES:
        return False
    if rij.get("logged_in") is not True:
        return False
    if rij.get("rate_limited") is True:
        tot = _iso_ts(rij.get("rate_limit_until"))
        if tot is None or tot > nu:
            return False
    if str(rij.get("current_task") or "").strip():
        return False
    gezien = _iso_ts(rij.get("last_seen_at") or rij.get("updated_at"))
    if gezien is not None and (nu - gezien) > stale_s:
        return False
    return True


def _resterend(rij: dict[str, Any]) -> float:
    """Hoger = meer ruimte. used_week/session (0-100 gebruikt) of weekruns als proxy."""
    for sleutel, omgekeerd in (("remaining_week", False), ("remaining_session", False), ("remaining", False)):
        raw = rij.get(sleutel)
        if raw is None:
            continue
        try:
            return float(raw)
        except (TypeError, ValueError):
            continue
    for sleutel in ("used_week", "used_session"):
        raw = rij.get(sleutel)
        if raw is None:
            continue
        try:
            return 100.0 - float(raw)
        except (TypeError, ValueError):
            continue
    runs = rij.get("runs_7d")
    try:
        return 1000.0 - float(runs or 0)
    except (TypeError, ValueError):
        return 500.0


def _stoel_identiteit(rij: dict[str, Any]) -> tuple[str, str]:
    sid = str(rij.get("seat_id") or rij.get("id") or "")
    fam = str(rij.get("provider") or re.sub(r"\d+$", "", sid))
    mail = str(rij.get("email") or "").strip().lower()
    org = str(rij.get("org_id") or "").strip()
    return fam, mail or org or sid


def kies_stoel(
    rijen: list[dict[str, Any]],
    *,
    familie: str | None = None,
    voorkeur: str | None = None,
    nu: float | None = None,
) -> dict[str, Any] | None:
    """Vrije stoel, minste gebruik eerst, alle gezonde stoelen.

    Familie is alleen tiebreaker: Codex met 0% wint van Claude op 69%.
    Zelfde e-mail+provider = één quotum, één kandidaat. Voorkeur-pinnet niet
    als een stillere stoel vrijer is.
    """
    nu = time.time() if nu is None else nu
    vrij = [r for r in rijen if stoel_vrij(r, nu=nu)]
    if not vrij:
        return None

    uniek: dict[tuple[str, str], dict[str, Any]] = {}
    for r in vrij:
        key = _stoel_identiteit(r)
        vorig = uniek.get(key)
        if vorig is None or _resterend(r) > _resterend(vorig):
            uniek[key] = r
    vrij = list(uniek.values())

    def sleutel(r: dict[str, Any]) -> tuple:
        sid = str(r.get("seat_id") or r.get("id") or "")
        fam = str(r.get("provider") or re.sub(r"\d+$", "", sid))
        zelfde = 0 if (familie and fam == familie) or (voorkeur and sid == voorkeur) else 1
        volgorde = SEAT_VOLGORDE.index(sid) if sid in SEAT_VOLGORDE else 99
        # Restant eerst (Codex 0% gebruikt vóór Claude 69%), familie alleen daarna.
        return (-_resterend(r), zelfde, volgorde)

    vrij.sort(key=sleutel)
    return vrij[0]


def vroegste_stoel_vrij(rijen: list[dict[str, Any]], *, nu: float | None = None) -> int:
    """Seconden tot een stoel waarschijnlijk weer kan, of de standaardwacht."""
    nu = time.time() if nu is None else nu
    tijden: list[float] = []
    for r in rijen:
        tot = _iso_ts(r.get("rate_limit_until"))
        if tot and tot > nu:
            tijden.append(tot - nu)
    if not tijden:
        return WACHT_STANDAARD_S
    return max(30, int(min(tijden)))


def is_tegoed_fout(tekst: str) -> bool:
    return bool(_TEGOED.search(tekst or ""))


def is_limiet_fout(tekst: str) -> bool:
    return bool(_LIMIET.search(tekst or ""))


def provider_uit_fout(tekst: str) -> str | None:
    low = (tekst or "").lower()
    for naam in ("openai", "anthropic", "openrouter", "gemini", "google", "groq", "cerebras", "xai"):
        if naam in low:
            return "gemini" if naam == "google" else naam
    return None


def meld_tegoed_eenmaal(
    db: Any,
    provider: str,
    detail: str,
    *,
    nu: datetime | None = None,
) -> bool:
    """Eén core_notifications-rij per provider per dag. Geen aankoop."""
    if not provider or not db:
        return False
    # Groq/Cerebras zijn gratis: een limiet is geen top-up.
    if provider in {"groq", "cerebras", "ollama"}:
        return False
    if not is_tegoed_fout(detail) and not is_limiet_fout(detail):
        return False
    dag = (nu or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    prefix = f"{TEGOED_PREFIX} {provider} {dag}"
    tekst = (
        f"{prefix}: {provider} weigert (geen tegoed of harde limiet). "
        f"AXE koopt niets. Agents gaan door op abonnements-stoelen. "
        f"Alleen top-uppen als je deze API nog wilt. Detail: {detail[:240]}"
    )
    try:
        bestaande = (
            db.table("core_notifications").select("id,message")
            .order("created_at", desc=True).limit(40).execute().data
        ) or []
        if any(str(r.get("message") or "").startswith(prefix) for r in bestaande):
            return False
        db.table("core_notifications").insert({"type": "warning", "message": tekst[:1900]}).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("tegoed-melding faalde: %s", exc)
        return False


def lees_stoelen(db: Any) -> list[dict[str, Any]]:
    if db is None:
        return []
    try:
        return list(
            db.table("core_coding_seats").select("*")
            .order("last_seen_at", desc=True).limit(40).execute().data or []
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("core_coding_seats lezen faalde: %s", exc)
        return []


def seat_prompt(contents: list[dict[str, Any]], agent: str | None = None) -> str:
    """Korte opdracht voor claude -p / codex exec uit de lus-transcriptie."""
    stukken: list[str] = []
    if agent:
        stukken.append(f"You are the {agent} agent of AXE Core, working for Luka.")
    stukken.append(
        "Continue this agent cycle. Answer with the next action or the final result. "
        "Do not send email, flip NorthSea auto_send_*, place live orders, or move money or deals."
    )
    for blok in contents[-8:]:
        rol = str(blok.get("role") or "user")
        delen = []
        for p in blok.get("parts") or []:
            if p.get("text"):
                delen.append(str(p["text"])[:2000])
            elif p.get("functionCall"):
                fc = p["functionCall"]
                delen.append(f"tool {fc.get('name')} {json.dumps(fc.get('args') or {}, ensure_ascii=False)[:400]}")
            elif p.get("functionResponse"):
                fr = p["functionResponse"]
                delen.append(f"result {fr.get('name')}: {json.dumps(fr.get('response') or {}, ensure_ascii=False)[:400]}")
        if delen:
            stukken.append(f"{rol}: " + "\n".join(delen))
    return "\n\n".join(stukken)[:12000]


def parse_seat_antwoord(tekst: str) -> dict[str, Any]:
    raw = (tekst or "").strip()
    if not raw:
        raise RuntimeError("seat returned empty output")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(raw[start:end + 1])
            except json.JSONDecodeError:
                data = None
        else:
            data = None
    if isinstance(data, dict):
        if data.get("functionCall") or data.get("name"):
            fc = data.get("functionCall") or data
            return {"parts": [{"functionCall": {"name": fc.get("name"), "args": fc.get("args") or {}}}]}
        inhoud = data.get("result") or data.get("text") or data.get("content")
        if inhoud:
            return {"parts": [{"text": str(inhoud)}]}
    return {"parts": [{"text": raw[:8000]}]}


def stoel_tool(seat_id: str) -> str:
    fam = re.sub(r"\d+$", "", seat_id or "")
    if fam == "codex":
        return "codex.run"
    if fam == "cursor":
        return "cursor.run"
    return "claude_code.run"


_CODEX_WEIGER = re.compile(r"astra|gpt-6\b|gpt-5-codex", re.I)


def codex_cli_model(model: str = "") -> str:
    """Model voor `codex exec -m`. Leeg = géén -m, de CLI gebruikt het account.

    25-28 okt: -m gpt-5-codex gaf HTTP 400 model_not_found op een ChatGPT-
    abonnement ("not supported when using Codex with a ChatGPT account").
    gpt-6-astra evenmin: die 400't met 'requires a newer version'. AXE_CODEX_MODEL
    is de operator-override als iemand wél een model wil pinnen — astra / gpt-6 /
    gpt-5-codex blijven geweigerd, zodat de CLI zelf kiest en de retry-zonder-m
    plus Claude-terugval daarop aansluiten.
    """
    gekozen = (model or "").strip()
    if _CODEX_WEIGER.search(gekozen):
        gekozen = ""
    if not gekozen:
        gekozen = (os.environ.get("AXE_CODEX_MODEL") or "").strip()
        if _CODEX_WEIGER.search(gekozen):
            gekozen = ""
    return gekozen


def xai_stoel(*, nu: datetime | None = None) -> dict[str, Any]:
    """Grok via XAI_API_KEY op de VPS. Geen CLI-login; de sleutel ís de stoel."""
    key = bool((os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY") or "").strip())
    gezien = (nu or datetime.now(timezone.utc)).isoformat()
    actie = None if key else "Set XAI_API_KEY on the VPS (OpenAI-compatible API at https://api.x.ai)."
    return {
        "id": "vps:xai",
        "seat_id": "xai",
        "provider": "xai",
        "label": "Grok (xAI)",
        "email": None,
        "org_id": None,
        "machine": "vps",
        "logged_in": True if key else False,
        "login_command": "Set XAI_API_KEY on the VPS (OpenAI-compatible API at https://api.x.ai).",
        "current_task": None,
        "rate_limited": False,
        "rate_limit_until": None,
        "last_limit_message": None,
        "remaining_note": "Metered xAI API key, not a CLI subscription.",
        "shared_quota_with": [],
        "config_exists": True,
        "last_seen_at": gezien,
        "updated_at": gezien,
        "actie": actie,
    }


def stoel_model(seat_id: str, tier: int, model: str = "") -> str:
    fam = re.sub(r"\d+$", "", seat_id or "")
    if fam == "codex":
        return codex_cli_model(model)
    if fam == "cursor":
        return (model or "").strip()
    if (model or "").strip():
        return model.strip()
    if tier <= 1:
        return os.environ.get("AXE_CLAUDE_HEAVY_MODEL", "opus")
    return os.environ.get("AXE_CLAUDE_CYCLE_MODEL", "sonnet")


def roep_stoel(
    stoel: dict[str, Any],
    prompt: str,
    *,
    tier: int = 2,
    parent_task_id: str | None = None,
    runner: Callable[..., dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Eén headless CLI-run op de Mac mini via de computer-worker."""
    seat_id = str(stoel.get("seat_id") or stoel.get("id") or "")
    device = str(stoel.get("machine") or os.environ.get("AXE_SEAT_DEVICE", "mac-mini-van-luka-5"))
    tool = stoel_tool(seat_id)
    args: dict[str, Any] = {"prompt": prompt, "seat": seat_id}
    model = stoel_model(seat_id, tier)
    if model:
        args["model"] = model
    if runner is None:
        import device_actions
        runner = device_actions.run_on_device
    return runner(device, tool, args, workspace="AXE Core", parent_task_id=parent_task_id)


# ── Automatische fallback-keten ──────────────────────────────────────────────
#
# Env-NAMEN, nooit waarden. Frontend VITE_* telt niet mee.
# 1. abonnements-stoelen  2. Grok  3. betaalde API's  4. gratis/goedkoop  5. VPS

CIRCUIT_FOUTEN = 3
CIRCUIT_VENSTER_S = 10 * 60
CIRCUIT_DICHT_S = 15 * 60
LIMIET_STANDAARD_S = 5 * 3600
TRANSIENT_BACKOFF_S = 1

# (id, soort, provider, env-namen). Ollama blijft altijd laatste vangnet.
KETEN: tuple[tuple[str, str, str, tuple[str, ...]], ...] = (
    ("claude2", "seat", "claude", ("CLAUDE2_CONFIG_DIR", "CLAUDE_BIN")),
    ("claude3", "seat", "claude", ("CLAUDE3_CONFIG_DIR", "CLAUDE_BIN")),
    ("claude4", "seat", "claude", ("CLAUDE4_CONFIG_DIR", "CLAUDE_BIN")),
    ("claude", "seat", "claude", ("CLAUDE_CONFIG_DIR", "CLAUDE_BIN")),
    ("codex", "seat", "codex", ("CODEX_HOME", "CODEX_BIN")),
    ("codex2", "seat", "codex", ("CODEX2_HOME", "CODEX_BIN")),
    ("codex3", "seat", "codex", ("CODEX3_HOME", "CODEX_BIN")),
    ("cursor", "seat", "cursor", ("CURSOR_BIN", "CURSOR_API_KEY")),
    ("cursor2", "seat", "cursor", ("CURSOR2_API_KEY", "CURSOR_BIN")),
    ("xai", "grok", "xai", ("XAI_API_KEY", "GROK_API_KEY")),
    ("xai2", "grok", "xai", ("GROK2_API_KEY", "XAI2_API_KEY")),
    ("anthropic", "paid", "anthropic", ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")),
    ("openai", "paid", "openai", ("OPENAI_API_KEY",)),
    ("gemini", "paid", "gemini", ("GEMINI_API_KEY", "GOOGLE_API_KEY")),
    ("deepseek", "paid", "deepseek", ("DEEPSEEK_API_KEY",)),
    ("perplexity", "paid", "perplexity", ("PERPLEXITY_API_KEY",)),
    ("groq", "free", "groq", ("GROQ_API_KEY",)),
    ("cerebras", "free", "cerebras", ("CEREBRAS_API_KEY",)),
    ("openrouter", "free", "openrouter", ("OPENROUTER_API_KEY",)),
    ("openhands", "vps", "openhands", ("OLLAMA_BASE_URL", "OLLAMA_URL", "VPS_HOST")),
    ("ollama", "vps", "ollama", ("OLLAMA_BASE_URL", "OLLAMA_URL", "OLLAMA_HOST", "LOCAL_OLLAMA_URL", "VPS_HOST")),
)

KETEN_IDS = tuple(rij[0] for rij in KETEN)
_KETEN_META = {rij[0]: rij for rij in KETEN}
STERKE_APIS = frozenset({"anthropic", "openai", "gemini", "xai", "xai2", "deepseek"})
CODE_SOORTEN = frozenset({"seat", "grok", "paid"})
KLEIN_EERST = ("groq", "cerebras", "ollama")

_FOUTEN: dict[str, list[datetime]] = {}
_CIRCUIT_TOT: dict[str, datetime] = {}
_TEGOED_DICHT: set[str] = set()
_LIMIET_TOT: dict[str, datetime] = {}


def reset_router_staat() -> None:
    """Leeg circuit/tegoed/limiet. Alleen tests en een handmatige reset."""
    _FOUTEN.clear()
    _CIRCUIT_TOT.clear()
    _TEGOED_DICHT.clear()
    _LIMIET_TOT.clear()


def reset_tegoed(provider: str | None = None) -> None:
    """Tegoed blijft dicht tot Luka reset. Geen automatische opening."""
    if provider:
        _TEGOED_DICHT.discard(provider)
    else:
        _TEGOED_DICHT.clear()


def _nu_dt(nu: datetime | float | None) -> datetime:
    if nu is None:
        return datetime.now(timezone.utc)
    if isinstance(nu, datetime):
        return nu if nu.tzinfo else nu.replace(tzinfo=timezone.utc)
    return datetime.fromtimestamp(float(nu), tz=timezone.utc)


def classificeer_fout(tekst: str, status: int | None = None) -> str:
    """limiet | tegoed | transient | taakfout. Onbekend provider-fout = transient."""
    t = tekst or ""
    code = int(status) if status is not None else None
    if is_tegoed_fout(t) or code == 402:
        return "tegoed"
    if is_limiet_fout(t) or code == 429:
        return "limiet"
    if _TAAKFOUT.search(t):
        return "taakfout"
    if code is not None and 500 <= code < 600:
        return "transient"
    if _TRANSIENT.search(t):
        return "transient"
    return "transient"


def _status_uit_exc(exc: BaseException) -> int | None:
    for attr in ("status", "status_code", "http_status"):
        raw = getattr(exc, attr, None)
        if raw is None:
            continue
        try:
            return int(raw)
        except (TypeError, ValueError):
            continue
    return None


def registreer_fout(
    provider: str,
    klasse: str,
    *,
    nu: datetime | None = None,
    wacht_tot: datetime | None = None,
) -> None:
    """Cooldown / circuit per provider. taakfout telt niet als providerfout."""
    if not provider or klasse == "taakfout":
        return
    moment = _nu_dt(nu)
    if klasse == "tegoed":
        _TEGOED_DICHT.add(provider)
        return
    if klasse == "limiet":
        _LIMIET_TOT[provider] = wacht_tot or (moment + timedelta(seconds=LIMIET_STANDAARD_S))
    grens = moment - timedelta(seconds=CIRCUIT_VENSTER_S)
    recent = [t for t in _FOUTEN.get(provider, []) if t > grens]
    recent.append(moment)
    _FOUTEN[provider] = recent[-CIRCUIT_FOUTEN:]
    if len(recent) >= CIRCUIT_FOUTEN:
        _CIRCUIT_TOT[provider] = moment + timedelta(seconds=CIRCUIT_DICHT_S)


def circuit_dicht(provider: str, *, nu: datetime | None = None) -> bool:
    tot = _CIRCUIT_TOT.get(provider)
    if tot is None:
        return False
    if _nu_dt(nu) >= tot:
        _CIRCUIT_TOT.pop(provider, None)
        return False
    return True


def provider_skip_reden(
    provider: str,
    *,
    nu: datetime | None = None,
    credits_stoel: dict[str, Any] | None = None,
) -> str | None:
    """Waarom deze provider nu overgeslagen wordt, of None."""
    moment = _nu_dt(nu)
    if provider in _TEGOED_DICHT:
        return "tegoed"
    if circuit_dicht(provider, nu=moment):
        return "circuit open"
    tot = _LIMIET_TOT.get(provider)
    if tot is not None:
        if moment < tot:
            return "limiet"
        _LIMIET_TOT.pop(provider, None)
    if credits_stoel:
        if credits_stoel.get("window_open") is False:
            return "open 5-uursvenster"
        if credits_stoel.get("rate_limited") is True and not credits_stoel.get("window_open", True):
            return "open 5-uursvenster"
    return None


def env_gezet(namen: tuple[str, ...] | list[str], *, bron: dict[str, str] | None = None) -> bool:
    """True als minstens één env-NAAM een niet-lege waarde heeft. Logt de waarde nooit."""
    bron = os.environ if bron is None else bron
    return any(bool(str(bron.get(n) or "").strip()) for n in namen)


def taak_klasse(taak: dict[str, Any] | None) -> str:
    """code | research | klein — bepaalt welke schijf van de keten voorgaat."""
    t = taak or {}
    meta = t.get("metadata") if isinstance(t.get("metadata"), dict) else {}
    cap = str(t.get("capability") or "").lower()
    titel = str(t.get("title") or t.get("goal") or "").lower()
    agent = str(t.get("assignee") or meta.get("agent") or "").lower()
    risico = str(meta.get("risico") or "").lower()
    blob = " ".join((cap, titel, agent, risico))
    if "research" in blob or "perplexity" in blob:
        return "research"
    if (
        risico == "schrijven"
        or cap in {"code", "agentic", "planner"}
        or "build" in titel
        or "code" in agent
        or "developer" in agent
        or "schrijven" in blob
    ):
        return "code"
    return "klein"


def _credits_per_stoel(credits: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not credits:
        return {}
    rijen = credits.get("seats") if isinstance(credits.get("seats"), list) else []
    return {str(s.get("id")): s for s in rijen if isinstance(s, dict) and s.get("id")}


def _app_stand(credits: dict[str, Any] | None, taak: dict[str, Any] | None) -> str | None:
    if not credits or not taak:
        return None
    try:
        import usage_credits as uc
        app = uc.taak_app(taak)
    except Exception:
        app = None
    if not app:
        return None
    for rij in credits.get("apps") or []:
        if isinstance(rij, dict) and rij.get("id") == app:
            return str(rij.get("stand") or "") or None
    return None


def _stoelrij_voor(rijen: list[dict[str, Any]], sid: str) -> dict[str, Any] | None:
    for r in rijen:
        if str(r.get("seat_id") or r.get("id") or "") == sid:
            return r
        fam_id = str(r.get("id") or "")
        if fam_id.endswith(f":{sid}"):
            return r
    return None


def _provider_aanwezig(
    pid: str,
    soort: str,
    env_namen: tuple[str, ...],
    *,
    aanwezig: dict[str, bool] | None,
    env: dict[str, str] | None,
    stoelrij: dict[str, Any] | None,
) -> bool:
    if aanwezig is not None and pid in aanwezig:
        return bool(aanwezig[pid])
    if soort == "vps" and pid == "ollama":
        return True
    if soort == "seat":
        if stoelrij is not None:
            return True
        return env_gezet(env_namen, bron=env)
    return env_gezet(env_namen, bron=env)


def _kandidaat(pid: str, soort: str, provider: str, seat_id: str | None = None) -> dict[str, Any]:
    return {
        "id": pid,
        "soort": soort,
        "provider": provider,
        "seat_id": seat_id if seat_id is not None else (pid if soort == "seat" else None),
    }


def _sorteer_kandidaten(
    kandidaten: list[dict[str, Any]],
    *,
    klasse: str,
    credits: dict[str, Any] | None,
    taak: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    per = _credits_per_stoel(credits)
    stand = _app_stand(credits, taak)
    over = stand == "over"
    onder = stand == "under"

    def score(k: dict[str, Any]) -> tuple:
        sid = k["id"]
        sessies = int((per.get(sid) or {}).get("sessions_today") or 0)
        keten_i = KETEN_IDS.index(sid) if sid in KETEN_IDS else 99
        # App over budget: goedkope/vps voorgaan. Under: stoelen voorgaan om het minimum te halen.
        if over:
            goedkoop = 0 if k["soort"] in {"free", "vps"} else 1
        elif onder and klasse == "code":
            goedkoop = 0 if k["soort"] == "seat" else 1
        else:
            goedkoop = 0
        if klasse == "klein":
            klein_i = KLEIN_EERST.index(sid) if sid in KLEIN_EERST else 20
            vps_laatst = 1 if k["soort"] == "vps" and sid == "ollama" else 0
            return (vps_laatst, klein_i, sessies, goedkoop, keten_i)
        vps_laatst = 1 if sid == "ollama" else 0
        return (vps_laatst, goedkoop, sessies, keten_i)

    return sorted(kandidaten, key=score)


def route(
    taak: dict[str, Any] | None = None,
    *,
    stoelen: list[dict[str, Any]] | None = None,
    credits: dict[str, Any] | None = None,
    nu: datetime | None = None,
    aanwezig: dict[str, bool] | None = None,
    env: dict[str, str] | None = None,
    uitsluiten: set[str] | tuple[str, ...] = (),
) -> dict[str, Any]:
    """Geordende kandidaten voor deze taak. Geen netwerk, geen geheimen.

    Filter op capability, sorteer op app-budget en spreiding, sla over:
    open 5-uursvenster, tegoed, stale hartslag, circuit open.
    Ollama is altijd laatste kandidaat voor taken die hij aankan.
    """
    moment = _nu_dt(nu)
    klasse = taak_klasse(taak)
    rijen = list(stoelen or [])
    per_credits = _credits_per_stoel(credits)
    uitgesloten = set(uitsluiten)
    kandidaten: list[dict[str, Any]] = []
    overgeslagen: list[dict[str, Any]] = []
    vrij_vanaf: list[datetime] = []

    for pid, soort, provider, env_namen in KETEN:
        if pid in uitgesloten:
            overgeslagen.append({"id": pid, "soort": soort, "reden": "al geprobeerd"})
            continue
        if klasse == "code" and soort not in CODE_SOORTEN and pid not in {"groq", "cerebras", "openrouter", "openhands", "ollama"}:
            overgeslagen.append({"id": pid, "soort": soort, "reden": "geen code-capability"})
            continue
        if klasse != "research" and pid == "perplexity":
            overgeslagen.append({"id": pid, "soort": soort, "reden": "alleen research"})
            continue
        stoelrij = _stoelrij_voor(rijen, pid) if soort == "seat" else None
        if soort == "seat" and rijen:
            if stoelrij is None:
                overgeslagen.append({"id": pid, "soort": soort, "reden": "geen hartslag"})
                continue
            if not stoel_vrij(stoelrij, nu=moment.timestamp()):
                if str(stoelrij.get("current_task") or "").strip():
                    reden = "bezet"
                elif stoelrij.get("logged_in") is not True:
                    reden = "niet ingelogd"
                elif stoelrij.get("rate_limited") is True:
                    reden = "limiet"
                    tot = _iso_ts(stoelrij.get("rate_limit_until"))
                    if tot:
                        vrij_vanaf.append(datetime.fromtimestamp(tot, tz=timezone.utc))
                else:
                    reden = "stale hartslag"
                overgeslagen.append({"id": pid, "soort": soort, "reden": reden})
                continue
        elif not _provider_aanwezig(pid, soort, env_namen, aanwezig=aanwezig, env=env, stoelrij=stoelrij):
            overgeslagen.append({"id": pid, "soort": soort, "reden": "env ontbreekt"})
            continue
        skip = provider_skip_reden(pid, nu=moment, credits_stoel=per_credits.get(pid))
        if skip:
            overgeslagen.append({"id": pid, "soort": soort, "reden": skip})
            tot = _LIMIET_TOT.get(pid) or _CIRCUIT_TOT.get(pid)
            if tot:
                vrij_vanaf.append(tot)
            free_at = (per_credits.get(pid) or {}).get("window_free_at")
            dt = None
            try:
                import usage_credits as uc
                dt = uc.tot_dt(free_at)
            except Exception:
                dt = None
            if dt:
                vrij_vanaf.append(dt)
            continue
        kandidaten.append(_kandidaat(pid, soort, provider, pid if soort == "seat" else None))

    # Ollama altijd achteraan als hij in de lijst zit.
    kandidaten = _sorteer_kandidaten(kandidaten, klasse=klasse, credits=credits, taak=taak)
    ollama = [k for k in kandidaten if k["id"] == "ollama"]
    rest = [k for k in kandidaten if k["id"] != "ollama"]
    kandidaten = rest + ollama

    wacht_tot = min(vrij_vanaf) if vrij_vanaf else (moment + timedelta(seconds=WACHT_STANDAARD_S))
    retry = max(15, int((wacht_tot - moment).total_seconds())) if wacht_tot > moment else WACHT_STANDAARD_S
    return {
        "kandidaten": kandidaten,
        "overgeslagen": overgeslagen,
        "wacht_tot": wacht_tot.isoformat(),
        "retry_after_s": retry,
        "klasse": klasse,
    }


def wacht_na_keten(afgevallen: dict[str, Any] | None = None, *, nu: datetime | None = None) -> int:
    """Seconden tot de vroegste limiet/circuit, anders de standaardwacht."""
    moment = _nu_dt(nu)
    tijden: list[datetime] = []
    for tot in list(_LIMIET_TOT.values()) + list(_CIRCUIT_TOT.values()):
        if tot > moment:
            tijden.append(tot)
    if afgevallen:
        for reden in afgevallen.values():
            if isinstance(reden, datetime) and reden > moment:
                tijden.append(reden)
    if not tijden:
        return WACHT_STANDAARD_S
    return max(15, int((min(tijden) - moment).total_seconds()))


def draaide_op_tekst(provider: str | None) -> str | None:
    if not provider:
        return None
    return f"draaide op: {provider}"


def zet_provider_used(db: Any, task_id: str, provider: str) -> bool:
    """Laatste succesvolle provider op core_tasks.provider_used. Geen geheimen."""
    if not db or not task_id or not provider:
        return False
    try:
        db.table("core_tasks").update({"provider_used": provider}).eq("id", task_id).execute()
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("provider_used schrijven faalde: %s", exc)
        return False


def leg_poging_vast(
    db: Any,
    taak: dict[str, Any] | str | None,
    kandidaat: dict[str, Any],
    *,
    poging: int,
    start: datetime,
    eind: datetime,
    uitkomst: str,
    fout_klasse: str | None = None,
    tokens: int | None = None,
    sessie: str | None = None,
    fout: str | None = None,
) -> bool:
    """Schrijft core_task_attempts. Usage & Credits telt hieruit."""
    task_id = taak if isinstance(taak, str) else str((taak or {}).get("id") or "")
    if not db or not task_id:
        return False
    def _verberg(tekst: Any, limiet: int = 240) -> str | None:
        try:
            import usage_credits as uc
            return uc._schoon(tekst, limiet)  # noqa: SLF001 — zelfde redaction als de telling
        except Exception:
            if not tekst:
                return None
            return " ".join(str(tekst).split())[:limiet]

    rij = {
        "task_id": task_id,
        "poging": int(poging),
        "provider": kandidaat.get("provider") or kandidaat.get("id"),
        "seat_id": kandidaat.get("seat_id"),
        "model": kandidaat.get("model"),
        "started_at": start.isoformat(),
        "ended_at": eind.isoformat(),
        "uitkomst": uitkomst,
        "fout_klasse": fout_klasse,
        "tokens": tokens,
        "sessie": sessie,
    }
    if fout:
        rij["fout"] = _verberg(fout)
    try:
        import usage_credits as uc
        return bool(uc.schrijf_poging(db, rij))
    except Exception as exc:  # noqa: BLE001
        log.warning("core_task_attempts schrijven faalde: %s", exc)
        return False


def loop_keten(
    taak: dict[str, Any],
    probeer: Callable[[dict[str, Any]], Any],
    *,
    stoelen: list[dict[str, Any]] | None = None,
    credits: dict[str, Any] | None = None,
    nu: datetime | None = None,
    aanwezig: dict[str, bool] | None = None,
    env: dict[str, str] | None = None,
    db: Any = None,
    slaap: Callable[[float], None] | None = None,
    uitsluiten: set[str] | tuple[str, ...] = (),
) -> dict[str, Any]:
    """Probeer elke kandidaat. taakfout stopt; keten op → WaitingForCapacity (deferred).

    transient: 1 retry met backoff, daarna volgende.
    limiet: cooldown tot vensterreset, volgende.
    tegoed: dicht tot handmatige reset + één [tegoed]-melding, volgende.
    """
    moment = _nu_dt(nu)
    uit = route(
        taak, stoelen=stoelen, credits=credits, nu=moment,
        aanwezig=aanwezig, env=env, uitsluiten=uitsluiten,
    )
    errors: list[str] = []
    poging_nr = 0
    _slaap = time.sleep if slaap is None else slaap

    def _boek(k: dict[str, Any], start: datetime, eind: datetime, uitkomst: str,
              klasse: str | None, fout: str | None = None) -> None:
        tokens = None
        sessie = None
        leg_poging_vast(
            db, taak, k, poging=poging_nr, start=start, eind=eind,
            uitkomst=uitkomst, fout_klasse=klasse, tokens=tokens, sessie=sessie, fout=fout,
        )

    for k in uit["kandidaten"]:
        skip = provider_skip_reden(k["id"], nu=moment)
        if skip:
            errors.append(f"{k['id']}: {skip}")
            continue
        retries_over = 1
        while True:
            poging_nr += 1
            start = _nu_dt(nu)
            try:
                resultaat = probeer(k)
            except TaakFout as exc:
                eind = _nu_dt(nu)
                _boek(k, start, eind, "taakfout", "taakfout", str(exc))
                raise
            except Exception as exc:
                eind = _nu_dt(nu)
                klasse = classificeer_fout(str(exc), _status_uit_exc(exc))
                errors.append(f"{k['id']}: {str(exc)[:150]}")
                wacht_tot = None
                if klasse == "limiet":
                    wacht_tot = _LIMIET_TOT.get(k["id"]) or (start + timedelta(seconds=LIMIET_STANDAARD_S))
                    free_at = (_credits_per_stoel(credits).get(k["id"]) or {}).get("window_free_at")
                    try:
                        import usage_credits as uc
                        dt = uc.tot_dt(free_at)
                        if dt:
                            wacht_tot = dt
                    except Exception:
                        pass
                registreer_fout(k["id"], klasse, nu=start, wacht_tot=wacht_tot)
                _boek(k, start, eind, klasse, klasse, str(exc))
                if klasse == "taakfout":
                    raise TaakFout(str(exc)) from exc
                if klasse == "tegoed":
                    meld_tegoed_eenmaal(db, k.get("provider") or k["id"], str(exc), nu=start)
                    break
                if klasse == "limiet":
                    break
                if klasse == "transient" and retries_over > 0:
                    retries_over -= 1
                    _slaap(TRANSIENT_BACKOFF_S)
                    continue
                break
            else:
                eind = _nu_dt(nu)
                _boek(k, start, eind, "ok", None)
                pid = k.get("seat_id") or k["id"]
                zet_provider_used(db, str(taak.get("id") or ""), pid)
                return {
                    "ok": True,
                    "result": resultaat,
                    "provider_used": pid,
                    "kandidaat": k,
                    "draaide_op": draaide_op_tekst(pid),
                    "status": "ok",
                }
    retry = int(uit.get("retry_after_s") or wacht_na_keten(nu=moment))
    raise WaitingForCapacity(
        "every provider failed — " + " | ".join(errors[:12]),
        retry_after_s=retry,
        errors=errors,
    )
