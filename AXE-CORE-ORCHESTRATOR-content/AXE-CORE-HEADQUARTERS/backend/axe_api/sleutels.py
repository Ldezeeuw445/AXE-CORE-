"""Keys per app: welke sleutel elke app gebruikt, waar hij woont, en of hij werkt.

Luka, 9 nov 2026: "duidelijk te zien per app welke keys ze gebruiken, en dan
alle keys, per app ... als er iets is met een key kan de manager die bij die
app hoort het mij laten weten."

## Wat dit NOOIT doet

Een waarde teruggeven, loggen of vergelijken. De enige vraag aan een sleutel
is: staat hij in de omgeving van dit proces (`bool(os.environ.get(naam))`).
De rest van het bewijs komt uit wat de sleutel deed: een feed die vandaag met
die sleutel slaagde, of een 401/"ontbreekt" in intel_sync_log.

## Waar de namen vandaan komen

Uit de CODE van elke app (9 nov gelezen: process.env / Deno.env.get /
os.environ), niet uit een .env-bestand. Plekken (SLEUTELS.md):

- vps        /opt/axe-core-api/.env; dit proces ziet ze zelf
- companion  de Companion-server en zijn Supabase edge-functies
- edge       Supabase edge-secrets (intel-proxy, trading-os engine)
- build      .env bij het bouwen; VITE_-namen komen in de browserbundel
- settings   AXE Core Instellingen -> Keys (user_settings, achter RLS)

Wat dit proces niet kan zien heet "niet te zien vanaf hier", nooit "ok".
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

APPS = ("AXE Core", "AXE Companion", "Trading OS", "NorthSea")

# Manager die over de sleutels van een app rapporteert (grok_managers).
MANAGER = {"AXE Core": "projectsmgr", "AXE Companion": "companionmgr",
           "Trading OS": "tradingos", "NorthSea": "northseamgr"}

PLEK_LABEL = {
    "vps": "VPS (axe-core-api)",
    "companion": "Companion server",
    "edge": "Supabase edge secrets",
    "build": "Build env (.env)",
    "settings": "AXE Core Settings → Keys",
}


def _k(naam: str, apps: tuple[str, ...], plek: str, doel: str, feeds: tuple[str, ...] = (),
       publiek: bool = False) -> dict[str, Any]:
    return {"naam": naam, "apps": apps, "plek": plek, "doel": doel, "feeds": feeds, "publiek": publiek}


C, T, A, N = "AXE Companion", "Trading OS", "AXE Core", "NorthSea"

CATALOGUS: tuple[dict[str, Any], ...] = (
    # ── marktdata en intel (VPS: de staande intel-diensten + /market) ────────
    _k("ALPHAVANTAGE_API_KEY", (C, T), "vps", "Congress trades (daily)", ("congressTrades",)),
    _k("EIA_API_KEY", (C, T), "vps", "Energy flows: oil, gas, WTI, Brent (daily)", ("energyFlows",)),
    _k("FINNHUB_API_KEY", (A, T), "vps", "Quotes and news on the AXE Core API"),
    _k("TWELVEDATA_API_KEY", (A, T), "vps", "Price history (candles)"),
    _k("FRED_API_KEY", (A, T), "vps", "Macro series"),
    _k("AISSTREAM_API_KEY", (C, T), "vps", "Vessel tracking", ("vesselTracking",)),
    _k("UNUSUAL_WHALES_API_KEY", (C, T), "vps", "Options flow, market tide, dark pool",
       ("marketTide", "unusualOptions", "darkPool")),
    # ── AI-providers voor de agents (VPS) ───────────────────────────────────
    _k("ANTHROPIC_API_KEY", (A,), "vps", "Claude API (fallback when no subscription seat is free)"),
    _k("OPENAI_API_KEY", (A, C), "vps", "OpenAI API"),
    _k("GEMINI_API_KEY", (A,), "vps", "Gemini"),
    _k("GROQ_API_KEY", (A,), "vps", "Groq (free tier)"),
    _k("XAI_API_KEY", (A,), "vps", "Grok API"),
    _k("DEEPSEEK_API_KEY", (A,), "vps", "DeepSeek"),
    _k("CEREBRAS_API_KEY", (A,), "vps", "Cerebras"),
    _k("OPENROUTER_API_KEY", (A,), "vps", "OpenRouter"),
    _k("PERPLEXITY_API_KEY", (A,), "vps", "Perplexity search"),
    _k("EXA_API_KEY", (A,), "vps", "Exa search"),
    _k("OPENHANDS_API_KEY", (A,), "vps", "OpenHands"),
    _k("CURSOR_API_KEY", (A,), "vps", "Cursor seat 1"),
    _k("CURSOR2_API_KEY", (A,), "vps", "Cursor seat 2"),
    _k("BROWSER_USE_API_KEY", (A,), "vps", "Browser Use cloud"),
    _k("OLLAMA_PROXY_KEY", (A,), "vps", "Ollama on the Macs via the proxy"),
    # ── AXE Core zelf ───────────────────────────────────────────────────────
    _k("AXE_API_KEY", (A,), "vps", "Apps calling the AXE Core API"),
    _k("CRON_SECRET", (A,), "vps", "The minute tick that runs every schedule"),
    _k("GITHUB_TOKEN", (A,), "vps", "Pushing build branches and PRs"),
    _k("N8N_API_KEY", (A,), "vps", "n8n workflows"),
    _k("SMARTTHINGS_TOKEN", (A,), "vps", "Smart home"),
    _k("VAPID_PRIVATE_KEY", (A, C), "vps", "Push notifications"),
    _k("FISH_AUDIO_API_KEY", (A,), "vps", "Voice (Fish Audio)"),
    _k("ELEVENLABS_API_KEY", (A, C), "settings", "Voice (ElevenLabs)"),
    # ── NorthSea ────────────────────────────────────────────────────────────
    _k("NORTHSEA_ENGINE_TOKEN", (N,), "vps", "AXE Core → NorthSea engine"),
    _k("NORTHSEA_DISCOVERY_TOKEN", (N,), "vps", "Discovery sweep"),
    _k("RESEND_API_KEY", (N, T), "edge", "Sending mail from trade@ (only after Luka approves)"),
    # ── AXE Companion (server + intel-proxy) ────────────────────────────────
    _k("UNUSUAL_WHALES_TOKEN", (C,), "edge", "intel-proxy: options flow, tide, dark pool (401 since Aug)",
       ("marketTide", "unusualOptions", "darkPool")),
    _k("GREYNOISE_API_KEY", (C,), "edge", "intel-proxy: cyber threats", ("cyberThreats",)),
    _k("RAPIDAPI_KEY", (C,), "edge", "intel-proxy: ADS-B Exchange (replaced by adsb.lol)"),
    _k("ACLED_PASSWORD", (C,), "edge", "intel-proxy: armed conflict events (ACLED)"),
    _k("QUIVER_API_KEY", (C,), "edge", "Congress trades (old route)"),
    _k("FMP_API_KEY", (C, T), "edge", "Fundamentals and congress (old route)"),
    _k("EODHD_API_KEY", (C,), "companion", "End-of-day prices"),
    _k("COINGECKO_API_KEY", (C,), "companion", "Crypto prices"),
    _k("PERIGON_API_KEY", (C,), "companion", "News"),
    _k("ALPACA_API_KEY_ID", (C,), "companion", "Alpaca broker (live)"),
    _k("ALPACA_PAPER_API_KEY_ID", (C,), "companion", "Alpaca broker (paper)"),
    _k("METAAPI_TOKEN", (C, T), "companion", "MetaApi / MT5 broker connection"),
    _k("STRIPE_SECRET_KEY", (C,), "companion", "Payments"),
    _k("STRIPE_WEBHOOK_SECRET", (C,), "companion", "Payment webhooks"),
    _k("SUPABASE_SERVICE_ROLE_KEY", (C, T), "companion", "Database writes from the server"),
    # ── Trading OS (browser + engine-proxy) ─────────────────────────────────
    _k("VITE_POLYGON_API_KEY", (T,), "build", "Polygon prices in the browser", publiek=True),
    _k("VITE_TWELVEDATA_API_KEY", (T,), "build", "Twelve Data in the browser", publiek=True),
    _k("VITE_FMP_API_KEY", (T,), "build", "FMP in the browser", publiek=True),
    _k("VITE_FRED_API_KEY", (T,), "build", "FRED in the browser", publiek=True),
    _k("VITE_ALPHAVANTAGE_KEY", (T,), "build", "Alpha Vantage in the browser", publiek=True),
    _k("INTEL_CRON_SECRET", (T,), "edge", "engine-proxy cron"),
)

VERS_BINNEN = timedelta(hours=26)
_KAPOT = ("401", "403", "unauthor", "forbidden", "invalid api key", "invalid_token",
          "authentication", "ontbreekt", "not configured", "missing")


def _tijd(s: Any) -> datetime | None:
    if not isinstance(s, str) or not s:
        return None
    try:
        t = datetime.fromisoformat(s.replace("Z", "+00:00").replace(" ", "T", 1))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _feed_bewijs(feeds: tuple[str, ...], sync: Mapping[str, dict[str, Any]], nu: datetime) -> dict[str, Any] | None:
    """Wat de feeds die deze sleutel gebruiken het laatst lieten zien."""
    beste: dict[str, Any] | None = None
    for f in feeds:
        rij = sync.get(f)
        if not rij:
            continue
        fout = str(rij.get("last_error") or "").strip()
        laatst = _tijd(rij.get("last_sync_at"))
        if fout and any(w in fout.lower() for w in _KAPOT):
            return {"status": "broken", "feed": f, "detail": fout[:160]}
        if laatst and nu - laatst <= VERS_BINNEN and not fout:
            beste = {"status": "works", "feed": f, "at": laatst.isoformat()}
    return beste


def status(sync_rijen: list[dict[str, Any]], nu: datetime, env: Mapping[str, str] | None = None) -> dict[str, Any]:
    """Per app de sleutels met een eerlijke status. Nooit een waarde."""
    env = os.environ if env is None else env
    sync = {str(r.get("feed_id")): r for r in sync_rijen or []}
    per_app: dict[str, list[dict[str, Any]]] = {a: [] for a in APPS}
    for k in CATALOGUS:
        bewijs = _feed_bewijs(k["feeds"], sync, nu)
        if k["plek"] == "vps":
            aanwezig = bool((env.get(k["naam"]) or "").strip())
            if bewijs and bewijs["status"] == "broken":
                st, detail = "broken", f"{bewijs['feed']}: {bewijs['detail']}"
            elif not aanwezig:
                st, detail = "missing", "Not set on the VPS"
            elif bewijs:
                st, detail = "works", f"{bewijs['feed']} synced {bewijs['at'][:16].replace('T', ' ')} UTC"
            else:
                st, detail = "present", "Set on the VPS; nothing has proven it works yet"
        else:
            if bewijs and bewijs["status"] == "broken":
                st, detail = "broken", f"{bewijs['feed']}: {bewijs['detail']}"
            elif bewijs:
                st, detail = "works", f"{bewijs['feed']} synced {bewijs['at'][:16].replace('T', ' ')} UTC"
            else:
                st, detail = "unseen", f"Lives in {PLEK_LABEL[k['plek']]}; not visible from the VPS"
        rij = {"name": k["naam"], "purpose": k["doel"], "where": PLEK_LABEL[k["plek"]],
               "status": st, "detail": detail, "feeds": list(k["feeds"])}
        if k["publiek"]:
            rij["warning"] = "VITE_ key: ends up in the browser bundle, readable by anyone with the app"
        for app in k["apps"]:
            per_app[app].append(rij)
    tellers = {a: {s: sum(1 for r in rows if r["status"] == s)
                   for s in ("works", "present", "missing", "broken", "unseen")}
               for a, rows in per_app.items()}
    return {"generated_at": nu.isoformat(), "apps": [
        {"app": a, "manager": MANAGER[a], "counts": tellers[a], "keys": per_app[a]} for a in APPS]}


def problemen(overzicht: dict[str, Any], app: str) -> list[str]:
    """Korte regels voor de manager van deze app: bewezen kapot, of ontbrekend
    terwijl een feed ervan afhangt. Een provider die Luka bewust niet gebruikt
    (DeepSeek zonder sleutel) is geen melding waard."""
    for blok in overzicht.get("apps") or []:
        if blok.get("app") == app:
            return [f"{r['name']} {'broken' if r['status'] == 'broken' else 'missing'} ({r['detail']})"
                    for r in blok.get("keys") or []
                    if r["status"] == "broken" or (r["status"] == "missing" and r.get("feeds"))]
    return []


def lees(db: Any, nu: datetime | None = None) -> dict[str, Any]:
    nu = nu or datetime.now(timezone.utc)
    try:
        rijen = db.table("intel_sync_log").select("feed_id,last_sync_at,last_error").limit(200).execute().data or []
    except Exception:  # noqa: BLE001 -- zonder bewijs: alleen aanwezigheid
        rijen = []
    return status(rijen, nu)


def manager_regel(db: Any, app: str, nu: datetime | None = None) -> str:
    """Eén zin voor het managerrapport; leeg als alles in orde is (geen ruis)."""
    try:
        p = problemen(lees(db, nu), app)
    except Exception:  # noqa: BLE001
        return ""
    if not p:
        return ""
    return "Keys: " + "; ".join(p[:4]) + (f" (+{len(p) - 4} more)" if len(p) > 4 else "")


__all__ = ["CATALOGUS", "APPS", "status", "problemen", "lees", "manager_regel"]
