"""Meet of een aanbieder echt antwoordt, niet alleen of zijn sleutel geldig is.

Staat los van main.py zodat een test hem kan importeren (main.py vraagt Supabase en een hele omgeving).
"""
from __future__ import annotations

import time

import httpx

# Een geldige sleutel is niet hetzelfde als een aanbieder die antwoordt. Tot 10 okt vroeg deze probe alleen de
# modellijst (GET /models): OpenAI en Google gaven 200 terwijl elke echte aanvraag "no credits" was, en
# "AXE CORE ONLINE" en de stem-check bleven groen voor iets wat niet werkte. Nu vraagt hij één woord.
# Twee minuten onthouden: de lampjes vragen vaak, en elke vraag is echt (zij het ~nul) geld.
_PROBE_CACHE: dict[str, tuple[float, tuple[bool, str]]] = {}
_PROBE_TTL_S = 120.0

_PROBE_CHAT = {
    "openai": ("https://api.openai.com/v1/chat/completions", "gpt-4o-mini", {}),
    "groq": ("https://api.groq.com/openai/v1/chat/completions", "openai/gpt-oss-20b", {"reasoning_effort": "low"}),
}


async def probe_provider(provider: str, key: str) -> tuple[bool, str]:
    """Authenticated provider probe: asks for one word where that is cheap. Never returns credential data."""
    cached = _PROBE_CACHE.get(provider)
    nu = time.monotonic()
    if cached and nu - cached[0] < _PROBE_TTL_S:
        return cached[1]
    uitkomst = await _probe_zonder_cache(provider, key)
    _PROBE_CACHE[provider] = (nu, uitkomst)
    return uitkomst


async def _probe_zonder_cache(provider: str, key: str) -> tuple[bool, str]:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if provider in _PROBE_CHAT:
                url, model, extra = _PROBE_CHAT[provider]
                r = await client.post(
                    url, headers={"Authorization": f"Bearer {key}"},
                    json={"model": model, "max_tokens": 24, "messages": [{"role": "user", "content": "Say ok"}], **extra},
                )
            elif provider in {"google", "gemini"}:
                r = await client.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
                    params={"key": key},
                    json={"contents": [{"parts": [{"text": "Say ok"}]}], "generationConfig": {"maxOutputTokens": 16}},
                )
            elif provider in {"openrouter", "openrouter2"}:
                r = await client.get("https://openrouter.ai/api/v1/models", headers={"Authorization": f"Bearer {key}"})
            elif provider == "anthropic":
                r = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                )
            else:
                return False, "no_probe"
        if r.is_success:
            return True, f"http_{r.status_code}"
        tekst = " ".join((r.text or "").split()).lower()
        reden = "no_credits" if any(k in tekst for k in ("no credits", "credits are depleted", "insufficient_quota", "billing")) \
            else "rate_limited" if r.status_code == 429 else "bad_key" if r.status_code in (401, 403) else ""
        return False, f"http_{r.status_code}" + (f" {reden}" if reden else "")
    except httpx.HTTPError as exc:
        return False, type(exc).__name__
