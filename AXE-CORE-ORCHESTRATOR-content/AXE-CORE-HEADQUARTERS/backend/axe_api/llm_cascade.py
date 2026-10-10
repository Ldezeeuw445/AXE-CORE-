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
from dataclasses import dataclass, field
from typing import Any, Optional

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
              "GEMINI_API_KEY", "BROWSER_LLM_GEMINI_MODEL", "gemini-flash-latest"),
    # gpt-oss denkt eerst; zonder "low" gaat de hele tokenbudget op aan redeneren en blijft het antwoord leeg.
    Aanbieder("groq", "https://api.groq.com/openai/v1/chat/completions", "GROQ_API_KEY", "BROWSER_LLM_GROQ_MODEL",
              "openai/gpt-oss-120b", {"reasoning_effort": "low"}),
    # De eigen modelbox: geen tegoed om op te raken. Hetzelfde model als de agent-loop en de crews, zodat
    # er maar één algemeen model in het geheugen staat.
    Aanbieder("ollama", "", "OLLAMA_PROXY_KEY", "BROWSER_LLM_OLLAMA_MODEL", "llama3.1:8b-16k", {},
              keyloos=True, min_timeout=180.0),
)

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


def laat_rusten(naam: str, nu: Optional[float] = None) -> None:
    _rust_tot[naam] = (_klok() if nu is None else nu) + RUST_S


def vergeet_alles() -> None:
    """Voor tests."""
    global _laatste_goed
    _rust_tot.clear()
    _laatste_goed = None


async def chat(messages: list[dict], max_tokens: int = 1024, timeout: float = 60.0) -> tuple[str, str]:
    """Antwoord + welke aanbieder het gaf. Gooit RuntimeError als er geen enkele werkt."""
    global _laatste_goed
    fouten: list[str] = []
    for a in volgorde():
        body: dict[str, Any] = {"model": a.gekozen_model(), "messages": messages, "max_tokens": max_tokens, **a.extra}
        try:
            async with httpx.AsyncClient(timeout=max(timeout, a.min_timeout)) as client:
                res = await client.post(a.endpoint(), headers={"Authorization": f"Bearer {a.sleutel()}"}, json=body)
        except httpx.HTTPError as e:
            laat_rusten(a.naam)
            fouten.append(f"{a.naam}: {e.__class__.__name__}")
            continue
        if res.status_code != 200:
            if is_beschikbaarheidsfout(res.status_code, res.text):
                laat_rusten(a.naam)
                fouten.append(f"{a.naam}: {res.status_code} {res.text[:90].strip()}")
                continue
            raise RuntimeError(f"LLM error ({a.naam}): {res.text[:200]}")
        tekst = ((res.json().get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        if not tekst.strip():
            fouten.append(f"{a.naam}: leeg antwoord")
            continue
        _laatste_goed = a.naam
        return tekst, a.naam
    raise RuntimeError("Geen LLM bereikbaar voor de browser-agent -- " + ("; ".join(fouten) or "geen enkele sleutel ingesteld"))


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
