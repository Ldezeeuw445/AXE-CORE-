"""
Eén LLM-keten voor de browser-agents (Browser Use, Camofox, de Playwright-terugval).

Tot 9 okt hadden die drie elk hun eigen "OPENAI_API_KEY of niets". Toen het OpenAI-tegoed op was (en dat
van Google ook) bleef `/browser/ai/health` "ready" melden terwijl elke taak meteen met "You have no
credits remaining" stopte -- een lampje dat groen was voor iets wat niet werkte.

Deze keten probeert de aanbieders in volgorde (OpenAI, Gemini, Groq, en als laatste de eigen modelbox:
Ollama op Strato). Die laatste heeft geen tegoed dat kan opraken, dus de keten is nooit leeg: een agent
heeft altijd een model (10 okt, toen OpenAI en Google leeg waren). Een aanbieder die op tegoed,
sleutel, onbekend model of een limiet struikelt krijgt tien minuten rust en de volgende komt aan de
beurt; de eerste die antwoordt wordt onthouden. `status()` meet echt (een antwoord van één woord),
en is wat de gezondheidscontrole laat zien.

Alleen OpenAI-compatibele eindpunten: dat is wat alle drie spreken, dus één request-vorm.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass, field, replace
from typing import Any, Optional, Sequence

import httpx

#: Hoe lang een aanbieder die net faalde met rust gelaten wordt.
RUST_S = 600.0

#: Foutcodes/-teksten die zeggen "deze aanbieder kan nu niet" (niet "jouw verzoek is fout").
_NIET_BESCHIKBAAR = (
    "insufficient_quota", "credit_balance_exhausted", "credits are depleted", "no credits",
    "billing", "model_not_found", "no longer available", "invalid_api_key", "incorrect api key",
    "rate limit", "quota", "permission", "not found",
)


@dataclass
class Aanbieder:
    naam: str
    url: str
    sleutel_env: str
    model_env: str
    model: str
    extra: dict[str, Any] = field(default_factory=dict)
    #: Een aanbieder zonder abonnement: de modelbox. Hij is er altijd; de sleutel (OLLAMA_PROXY_KEY) is
    #: optioneel en wordt meegestuurd zodra het slot op de box dicht gaat.
    keyloos: bool = False
    #: Een koude 8B op CPU heeft meer dan de gebruikelijke 60 s nodig.
    min_timeout: float = 0.0

    def sleutel(self) -> Optional[str]:
        return os.getenv(self.sleutel_env) or ("-" if self.keyloos else None)

    def endpoint(self) -> str:
        if self.keyloos:
            return os.getenv("OLLAMA_HOST", "https://ollama.axecompanion.com").rstrip("/") + "/v1/chat/completions"
        return self.url

    def gekozen_model(self) -> str:
        return os.getenv(self.model_env, self.model)


AANBIEDERS: tuple[Aanbieder, ...] = (
    Aanbieder("openai", "https://api.openai.com/v1/chat/completions", "OPENAI_API_KEY", "BROWSER_USE_MODEL", "gpt-4o-mini"),
    Aanbieder("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
              "GEMINI_API_KEY", "BROWSER_LLM_GEMINI_MODEL", "gemini-2.5-flash"),
    # gpt-oss denkt eerst; zonder "low" gaat de hele tokenbudget op aan redeneren en blijft het antwoord leeg.
    Aanbieder("groq", "https://api.groq.com/openai/v1/chat/completions", "GROQ_API_KEY", "BROWSER_LLM_GROQ_MODEL",
              "openai/gpt-oss-120b", {"reasoning_effort": "low"}),
    Aanbieder("xai", "https://api.x.ai/v1/chat/completions", "XAI_API_KEY", "BROWSER_LLM_XAI_MODEL", "grok-4.5"),
    Aanbieder("openrouter", "https://openrouter.ai/api/v1/chat/completions",
              "OPENROUTER_API_KEY", "BROWSER_LLM_OPENROUTER_MODEL", "openrouter/auto"),
    # De eigen modelbox: geen tegoed om op te raken. Hetzelfde model als de agent-loop en de crews, zodat
    # er maar één algemeen model in het geheugen staat.
    Aanbieder("ollama", "", "OLLAMA_PROXY_KEY", "BROWSER_LLM_OLLAMA_MODEL", "llama3.1:8b-16k", {},
              keyloos=True, min_timeout=180.0),
)

def met_sleutel(basis: str, sleutel_env: str, naam: str, model: Optional[str] = None,
                extra: Optional[dict[str, Any]] = None) -> Aanbieder:
    """Dezelfde aanbieder met een andere sleutel (bijvoorbeeld een tweede account).

    `naam` is wat rust en "welk model" laten zien, dus per sleutel uniek: een 429 op de sleutel van de ene
    manager legt de andere niet stil. Een vast `model` gaat voor de model-omgevingsvariabele."""
    a = next(x for x in AANBIEDERS if x.naam == basis)
    uit = replace(a, naam=naam, sleutel_env=sleutel_env, extra={**a.extra, **(extra or {})})
    if model:
        uit = replace(uit, model_env=f"_VAST_{naam}", model=model)
    return uit


_rust_tot: dict[str, float] = {}
_laatste_goed: Optional[str] = None


def _klok() -> float:
    return time.monotonic()


def is_beschikbaarheidsfout(status: int, tekst: str) -> bool:
    """Is dit "deze aanbieder kan niet" (volgende proberen) of "dit verzoek is fout" (niet)?"""
    if status in (401, 402, 403, 404, 429) or status >= 500:
        return True
    low = (tekst or "").lower()
    return any(k in low for k in _NIET_BESCHIKBAAR)


def volgorde(nu: Optional[float] = None) -> list[Aanbieder]:
    """De aanbieders met een sleutel die niet uitrusten, de laatst geslaagde eerst."""
    nu = _klok() if nu is None else nu
    ok = [a for a in AANBIEDERS if a.sleutel() and _rust_tot.get(a.naam, 0.0) <= nu]
    if _laatste_goed:
        ok.sort(key=lambda a: 0 if a.naam == _laatste_goed else 1)
    return ok


def laat_rusten(naam: str, nu: Optional[float] = None, seconden: Optional[float] = None) -> None:
    _rust_tot[naam] = (_klok() if nu is None else nu) + (RUST_S if seconden is None else seconden)


DAG_RUST_MAX_S = 24 * 3600.0


def _tot_reset(headers: Any, nu_epoch: float) -> float:
    """Seconden tot de daglimiet weer vrij is: OpenRouter's X-RateLimit-Reset
    (ms of s sinds epoch), anders tot middernacht UTC (dan reset de teller)."""
    try:
        ruw = float((headers or {}).get("x-ratelimit-reset") or (headers or {}).get("X-RateLimit-Reset") or "")
        reset = ruw / 1000.0 if ruw > 1e11 else ruw
        if reset > nu_epoch:
            return min(DAG_RUST_MAX_S, reset - nu_epoch + 30.0)
    except (TypeError, ValueError):
        pass
    middernacht = (int(nu_epoch // 86400) + 1) * 86400
    return min(DAG_RUST_MAX_S, middernacht - nu_epoch + 30.0)


def rust_voor(status: int, headers: Any, tekst: str = "", nu_epoch: Optional[float] = None) -> Optional[float]:
    """Hoe lang rusten na deze fout. Een minuutlimiet (429 met retry-after, Groq) is na
    ~een minuut weer vrij; tien minuten rust maakte de gratis capaciteit onnodig krap
    (23 nov). Geen tegoed of een kapotte sleutel: de gewone RUST_S.

    26 nov: een DAGlimiet ("free-models-per-day", OpenRouter: 50 gratis verzoeken per
    dag per account) rustte maar RUST_S en werd dan de hele dag opnieuw geprobeerd --
    30 tot 107 verspilde 429's per sleutel per dag, en elke keer vertraging. Nu rust
    hij tot de reset."""
    if status != 429:
        return None
    low = (tekst or "").lower()
    if any(w in low for w in ("per-day", "per day", "daily", "free-models-per-day")):
        return _tot_reset(headers, time.time() if nu_epoch is None else nu_epoch)
    if any(w in low for w in ("insufficient_quota", "credit")):
        return None
    try:
        na = float((headers or {}).get("retry-after") or "")
    except (TypeError, ValueError):
        return None
    return max(15.0, min(na + 2.0, RUST_S))


def vergeet_alles() -> None:
    """Voor tests."""
    global _laatste_goed
    _rust_tot.clear()
    _laatste_goed = None


async def chat(messages: list[dict], max_tokens: int = 1024, timeout: float = 60.0, alleen: Optional[tuple[str, ...]] = None,
               keten: Optional[Sequence[Aanbieder]] = None) -> tuple[str, str]:
    """Antwoord + welke aanbieder het gaf. Gooit RuntimeError als er geen enkele werkt.

    `alleen` beperkt de keten tot die aanbieders (bijvoorbeeld de gratis: Groq en de eigen modelbox), voor werk dat
    nooit een betaalde aanroep mag kosten. `keten` is een eigen volgorde (bijvoorbeeld de sleutels van één manager):
    die wordt in die volgorde geprobeerd, zonder de gedeelde "laatst geslaagde" te veranderen."""
    global _laatste_goed
    fouten: list[str] = []
    nu = _klok()
    rij = volgorde(nu) if keten is None else [a for a in keten if a.sleutel() and _rust_tot.get(a.naam, 0.0) <= nu]
    for a in rij:
        if alleen is not None and a.naam not in alleen:
            continue
        body: dict[str, Any] = {"model": a.gekozen_model(), "messages": messages, "max_tokens": max_tokens, **a.extra}
        try:
            async with httpx.AsyncClient(timeout=max(timeout, a.min_timeout)) as client:
                res = await client.post(a.endpoint(), headers={"Authorization": f"Bearer {a.sleutel()}"}, json=body)
        except httpx.HTTPError as e:
            laat_rusten(a.naam)
            fouten.append(f"{a.naam}: {e.__class__.__name__}")
            _tel(a, 0)
            continue
        _tel(a, res.status_code, res)
        if res.status_code != 200:
            if is_beschikbaarheidsfout(res.status_code, res.text):
                laat_rusten(a.naam, seconden=rust_voor(res.status_code, getattr(res, "headers", None), res.text))
                fouten.append(f"{a.naam}: {res.status_code} {res.text[:90].strip()}")
                continue
            raise RuntimeError(f"LLM error ({a.naam}): {res.text[:200]}")
        tekst = ((res.json().get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        if not tekst.strip():
            fouten.append(f"{a.naam}: leeg antwoord")
            continue
        if keten is None:
            _laatste_goed = a.naam
        return tekst, a.naam
    raise RuntimeError("Geen LLM bereikbaar voor de browser-agent -- " + ("; ".join(fouten) or "geen enkele sleutel ingesteld"))


def _tel(a: Aanbieder, status: int, res: Any = None) -> None:
    """Verbruik per sleutel (sleutel_teller.py); faalt nooit."""
    try:
        import sleutel_teller

        tokens = 0
        if res is not None and status == 200:
            gebruik = (res.json() or {}).get("usage") or {}
            tokens = int(gebruik.get("total_tokens") or 0)
        sleutel_teller.tel(a.sleutel_env if not a.keyloos else None, status, tokens,
                           tekst=res.text[:400] if res is not None and status != 200 else None)
    except Exception:  # noqa: BLE001
        pass


async def status() -> dict[str, Any]:
    """Meet echt: welke aanbieders antwoorden nu? `ok` is waar zodra er één werkt."""
    uit: dict[str, Any] = {"providers": {}, "ok": False, "using": None}
    for a in AANBIEDERS:
        if not a.sleutel():
            uit["providers"][a.naam] = "no key"
            continue
        try:
            async with httpx.AsyncClient(timeout=max(20.0, min(a.min_timeout, 90.0))) as client:
                res = await client.post(
                    a.endpoint(), headers={"Authorization": f"Bearer {a.sleutel()}"},
                    json={"model": a.gekozen_model(), "max_tokens": 64, "messages": [{"role": "user", "content": "Say ok"}], **a.extra},
                )
            if res.status_code == 200 and ((res.json().get("choices") or [{}])[0].get("message") or {}).get("content", "").strip():
                uit["providers"][a.naam] = "ok"
                if not uit["ok"]:
                    uit["ok"], uit["using"] = True, a.naam
            else:
                laat_rusten(a.naam)
                uit["providers"][a.naam] = f"{res.status_code}: " + _kort(res.text)
        except httpx.HTTPError as e:
            uit["providers"][a.naam] = e.__class__.__name__
    return uit


def _kort(tekst: str) -> str:
    t = " ".join((tekst or "").split())
    for sleutel, uitleg in (("credit", "out of credits"), ("quota", "out of credits"), ("no longer available", "model retired"),
                            ("not exist", "model unavailable"), ("invalid", "key rejected")):
        if sleutel in t.lower():
            return uitleg
    return t[:60]
