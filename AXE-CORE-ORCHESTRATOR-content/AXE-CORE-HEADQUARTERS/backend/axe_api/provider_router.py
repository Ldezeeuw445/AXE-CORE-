"""Provider-router: tierkaart + stoelen + tegoed-melding.

De agent-lus leest dit. Als de API-keten leegloopt (limiet, geen credits),
gaat het werk naar een vrije abonnements-stoel op de Mac mini — niet naar
een rode 'Taak mislukt'. Geen stoel vrij = wachten op capaciteit en later
opnieuw, via de bestaande defer_core_task.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from datetime import datetime, timezone
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

_kaart_cache: dict[str, Any] | None = None


class WaitingForCapacity(Exception):
    """Geen API en geen vrije stoel. Geen mislukking — later opnieuw."""

    def __init__(self, message: str, retry_after_s: int = WACHT_STANDAARD_S, errors: list[str] | None = None):
        super().__init__(message)
        self.retry_after_s = max(15, int(retry_after_s))
        self.errors = list(errors or [])


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
    """Welke API-aanbieders deze agent mag proberen, in volgorde."""
    rij = kaart_voor(agent, kaart)
    tier = int(rij.get("tier") or 2)
    if alleen_gratis or tier >= 3:
        return ["groq", "cerebras", "ollama"]
    if tier == 1:
        # Seats eerst in de lus; API alleen als noodrem (gratis + xAI als die er is).
        return ["groq", "cerebras", "xai", "ollama"]
    return ["groq", "cerebras", "gemini", "openai", "xai", "ollama"]


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
