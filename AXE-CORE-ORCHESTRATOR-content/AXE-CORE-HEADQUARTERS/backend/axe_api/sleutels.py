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
- companion  de Companion-server (Vercel-project axe-companion-os)
- edge       Supabase edge-secrets (intel-proxy, trading-os engine)
- build      Trading OS op Vercel (project trading-os); VITE_ komt in de bundel

edge: sinds 20 nov vraagt dit de NAMEN van de edge-geheimen op via de
edge-functie sleutel-namen (supabase/functions/sleutel-namen) in beide
projecten -- Companion rechtstreeks met de eigen servicesleutel, Commodities
via de NorthSea MCP (die heeft die sleutel al). Nooit waarden.

companion en build: sinds 20 nov vraagt dit de NAMEN van de env-variabelen op
bij Vercel (VERCEL_TOKEN op de VPS), nooit de waarden (geen ?decrypt).
- settings   AXE Core Instellingen -> Keys (user_settings, achter RLS)

Wat dit proces niet kan zien heet "niet te zien vanaf hier", nooit "ok".
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

APPS = ("AXE Core", "AXE Companion", "Trading OS", "NorthSea", "AXON Memory")

# Manager die over de sleutels van een app rapporteert (grok_managers).
MANAGER = {"AXE Core": "projectsmgr", "AXE Companion": "companionmgr",
           "Trading OS": "tradingos", "NorthSea": "northseamgr", "AXON Memory": "memory"}

PLEK_LABEL = {
    "vps": "VPS (axe-core-api)",
    "companion": "Companion server",
    "edge": "Supabase edge secrets",
    "build": "Build env (.env)",
    "settings": "AXE Core Settings → Keys",
    "mac": "Mac (agent runner)",
    "dax": "STRATO VPS (DAX)",
}


def _k(naam: str, apps: tuple[str, ...], plek: str, doel: str, feeds: tuple[str, ...] = (),
       publiek: bool = False, nodig: str = "required", provider: str | None = None,
       bewijs: tuple[str, str, int] | None = None, alias: tuple[str, ...] = (),
       project: str = "companion") -> dict[str, Any]:
    """nodig: required | optional | unused. provider: id in Models & Tests (de
    app vult daar de status mee in). bewijs: (tabel, tijdkolom, max dagen).
    alias: andere namen waaronder de code dezelfde sleutel ook leest.
    project: bij plek "edge": welk Supabase-project (companion | commodities)."""
    return {"naam": naam, "apps": apps, "plek": plek, "doel": doel, "feeds": feeds, "publiek": publiek,
            "nodig": nodig, "provider": provider, "bewijs": bewijs, "alias": alias,
            "project": project}


C, T, A, N = "AXE Companion", "Trading OS", "AXE Core", "NorthSea"

CATALOGUS: tuple[dict[str, Any], ...] = (
    # ── marktdata en intel (VPS: de staande intel-diensten + /market) ────────
    _k("ALPHAVANTAGE_API_KEY", (C, T), "vps", "Congress trades (daily)", ("congressTrades",)),
    _k("EIA_API_KEY", (C, T), "vps", "Energy flows: oil, gas, WTI, Brent (daily)", ("energyFlows",)),
    _k("FINNHUB_API_KEY", (A, T), "vps", "Quotes and news on the AXE Core API"),
    _k("TWELVEDATA_API_KEY", (A, T), "vps", "Price history (candles)"),
    _k("FRED_API_KEY", (A, T), "vps", "Macro series"),
    _k("AISSTREAM_API_KEY", (C, T), "vps", "Vessel tracking (free key at aisstream.io)", ("vesselTracking",),
       nodig="optional"),
    _k("UNUSUAL_WHALES_API_KEY", (C, T), "vps", "Options flow, tide, dark pool (paid; 401 since Aug)",
       nodig="unused"),
    # ── AI-providers voor de agents ─────────────────────────────────────────
    _k("GROQ_API_KEY", (A,), "vps", "Agent thinking, 1st choice (free tier)", provider="groq"),
    _k("GROQ_AGENTS_API_KEY", (A,), "vps", "Own free Groq for the agents (a second Groq account), so they stop using up the chat's limit", nodig="optional", provider="groq"),
    _k("GROQ_LIGHT_API_KEY", (A,), "vps", "Groq 3: light agent tasks (GPT-OSS 20B by default)", nodig="optional", provider="groq"),
    _k("GROQ_RESERVE_API_KEY", (A,), "vps", "Groq 4: reserve for agent tasks", nodig="optional", provider="groq"),
    _k("GEMINI_API_KEY", (A,), "vps", "Agent thinking, 2nd choice", provider="google"),
    _k("OPENAI_API_KEY", (A, C), "vps", "Agent thinking, 3rd choice; Companion AI", provider="openai"),
    _k("ANTHROPIC_API_KEY", (A,), "vps", "Pay-per-use Claude; you use subscriptions instead",
       nodig="unused", provider="anthropic"),
    _k("XAI_API_KEY", (A,), "vps", "Grok API; you have Grok Bot itself", nodig="unused", provider="xai"),
    _k("OPENROUTER_API_KEY", (A,), "vps", "OpenRouter 1 (OpenRouter 2 is the one that works)",
       nodig="unused", provider="openrouter"),
    *(_k(f"OPENROUTER{slot}_API_KEY", (A,), "vps", f"OpenRouter {slot}: free agent fallback",
         nodig="optional", provider="openrouter") for slot in (3, 4, 5)),
    _k("CEREBRAS_API_KEY", (A,), "vps", "Cerebras", nodig="unused", provider="cerebras"),
    _k("DEEPSEEK_API_KEY", (A,), "vps", "DeepSeek", nodig="unused"),
    _k("PERPLEXITY_API_KEY", (A,), "vps", "Web research", nodig="optional", provider="perplexity"),
    _k("EXA_API_KEY", (A,), "settings", "Web search", nodig="optional", provider="exa"),
    _k("OPENHANDS_API_KEY", (A,), "vps", "Not needed: OpenHands runs on the VPS itself",
       nodig="unused", provider="openhands"),
    _k("OLLAMA_PROXY_KEY", (A,), "vps", "Ollama on the Macs via the proxy", nodig="optional", provider="ollama"),
    _k("CURSOR_API_KEY", (A,), "mac", "Cursor seat 1 (agent runner on the Mac)", nodig="optional"),
    _k("CURSOR2_API_KEY", (A,), "mac", "Cursor seat 2 (agent runner on the Mac)", nodig="optional"),
    _k("BROWSER_USE_API_KEY", (A,), "vps", "Browser Use cloud (only for the cloud version)", nodig="optional"),
    # ── AXE Core zelf ───────────────────────────────────────────────────────
    _k("AXON_API_KEY", ("AXON Memory",), "vps", "AXON Memory API connection", nodig="optional"),
    _k("AXE_API_KEY", (A,), "vps", "Apps calling the AXE Core API"),
    _k("CRON_SECRET", (A,), "vps", "The minute tick that runs every schedule"),
    _k("GITHUB_TOKEN", (A,), "vps", "Pushing build branches and PRs"),
    _k("N8N_API_KEY", (A,), "vps", "n8n workflows", nodig="optional"),
    _k("SMARTTHINGS_TOKEN", (A,), "vps", "Smart home (only if AXE should control it)", nodig="optional"),
    _k("VAPID_PRIVATE_KEY", (A, C), "vps", "Push notifications"),
    _k("FISH_AUDIO_API_KEY", (A,), "vps", "Voice (Fish Audio)", nodig="optional"),
    _k("ELEVENLABS_API_KEY", (A, C), "settings", "Voice (ElevenLabs)", nodig="optional", provider="elevenlabs"),
    # ── NorthSea ────────────────────────────────────────────────────────────
    _k("NORTHSEA_ENGINE_TOKEN", (N,), "vps", "AXE Core → NorthSea engine"),
    _k("NORTHSEA_DISCOVERY_TOKEN", (N,), "vps", "Discovery sweep"),
    _k("RESEND_API_KEY", (N, T), "edge", "Sending mail from trade@ (only after Luka approves)",
       project="commodities"),
    # ── AXE Companion (server + intel-proxy) ────────────────────────────────
    _k("METAAPI_TOKEN", (C, T), "companion", "MetaApi / MT5 broker connection (live accounts)",
       bewijs=("broker_trades", "created_at", 7)),
    _k("SUPABASE_SERVICE_ROLE_KEY", (C, T), "companion", "Database writes from the server"),
    _k("STRIPE_SECRET_KEY", (C,), "companion", "Payments (only when customers pay)", nodig="optional"),
    _k("STRIPE_WEBHOOK_SECRET", (C,), "companion", "Payment webhooks", nodig="optional"),
    _k("ALPACA_API_KEY_ID", (C,), "companion", "Alpaca broker (live)", nodig="optional"),
    _k("ALPACA_PAPER_API_KEY_ID", (C,), "companion", "Alpaca broker (paper)", nodig="optional"),
    _k("EODHD_API_KEY", (C,), "companion", "End-of-day prices", nodig="optional"),
    _k("COINGECKO_API_KEY", (C,), "companion", "Crypto prices", nodig="optional",
       alias=("COINGECKO_DEMO_API_KEY",)),
    _k("PERIGON_API_KEY", (C,), "companion", "News", nodig="optional"),
    _k("UNUSUAL_WHALES_TOKEN", (C,), "edge", "Old intel-proxy route (401 since Aug; paid)", nodig="unused",
       alias=("UW_TOKEN", "UW_API_KEY", "UNUSUAL_WHALES_KEY")),
    _k("GREYNOISE_API_KEY", (C,), "edge", "Old cyber feed (only checked 3 fixed IPs)", nodig="unused"),
    _k("RAPIDAPI_KEY", (C,), "edge", "Old ADS-B route (replaced by free adsb.lol)", nodig="unused",
       alias=("X_RAPIDAPI_KEY",)),
    _k("ACLED_PASSWORD", (C,), "edge", "Armed conflict events (ACLED)", nodig="optional"),
    _k("QUIVER_API_KEY", (C,), "edge", "Old congress route (replaced by Alpha Vantage)", nodig="unused"),
    _k("FMP_API_KEY", (C, T), "edge", "Old congress/fundamentals route", nodig="unused"),
    # ── Trading OS (browser + engine-proxy) ─────────────────────────────────
    _k("INTEL_CRON_SECRET", (T,), "edge", "engine-proxy cron"),
    # 20 nov in de TRADING-OS-code nagekeken: Polygon en Twelve Data worden nog
    # gelezen (server ook onder de naam zonder VITE_), FRED/FMP/Alpha Vantage niet meer.
    _k("VITE_POLYGON_API_KEY", (T,), "build", "Polygon prices (candle engine)", publiek=True,
       alias=("POLYGON_API_KEY",)),
    _k("VITE_TWELVEDATA_API_KEY", (T,), "build", "Twelve Data live prices", publiek=True,
       alias=("TWELVEDATA_API_KEY",)),
    _k("VITE_FMP_API_KEY", (T,), "build", "No longer read by the Trading OS code", publiek=True, nodig="unused"),
    _k("VITE_FRED_API_KEY", (T,), "build", "No longer read by the Trading OS code", publiek=True, nodig="unused"),
    _k("VITE_ALPHAVANTAGE_KEY", (T,), "build", "No longer read by the Trading OS code", publiek=True, nodig="unused"),
)

VERS_BINNEN = timedelta(hours=26)

EDGE_PROJECT_LABEL = {"companion": "AXE Companion", "commodities": "AXE Commodities"}
_NAAM_OK = __import__("re").compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# Plek -> Vercel-project waar die sleutels als env-variabele staan.
VERCEL_PROJECT = {"companion": "axe-companion-os", "build": "trading-os"}
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


def _dax_rijen(dax: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """De tweede VPS (STRATO): per DAX-computer of Claude/Codex er ingelogd is.

    Geen sleutel maar een login; zonder login kan die DAX niet zelf bouwen."""
    uit = []
    for d in dax or []:
        eng = d.get("engines") or (d.get("stats") or {}).get("engines") or {}
        ingelogd = [n for n, k in (("Claude", "claude_logged_in"), ("Codex", "codex_logged_in")) if eng.get(k)]
        if str(d.get("status")) == "error":
            st, detail = "broken", f"DAX is in error: {str(d.get('last_error') or '')[:120]}"
        elif ingelogd:
            st, detail = "works", " and ".join(ingelogd) + " logged in"
        else:
            st, detail = "missing", "Claude and Codex installed, neither logged in"
        uit.append({"name": f"{d.get('id')} login", "purpose": f"Builds for {d.get('owner_agent') or 'agents'}",
                    "where": PLEK_LABEL["dax"], "status": st, "detail": detail, "feeds": [],
                    "need": "optional", "provider": None})
    return uit


def status(sync_rijen: list[dict[str, Any]], nu: datetime, env: Mapping[str, str] | None = None,
           tabel_bewijs: Mapping[str, str | None] | None = None,
           dax: list[dict[str, Any]] | None = None,
           instellingen: Mapping[str, bool] | None = None,
           vercel: Mapping[str, set[str] | frozenset[str]] | None = None,
           edge: Mapping[str, set[str] | frozenset[str]] | None = None) -> dict[str, Any]:
    """Per app de sleutels met een eerlijke status. Nooit een waarde.

    instellingen: per provider-id of hij in AXE Core Settings → Keys is
    ingevuld (user_settings.axe_llm_connections). Zonder: "unseen".
    vercel: per Vercel-project de NAMEN van de production-env. Zonder: "unseen".
    edge: per Supabase-project (companion | commodities) de NAMEN van de
    edge-geheimen. Zonder: "unseen". Een naam die geen variabelenaam is (spatie,
    e-mailadres) komt erbij als "broken": de code vindt hem zo nooit.

    status: works | present | missing | broken | unseen | optional | unused
    - optional: niet gezet, en dat mag (alleen nodig als je die functie wilt)
    - unused:   niet gezet, en niet nodig (vervangen of je gebruikt iets anders)
    """
    env = os.environ if env is None else env
    tabel_bewijs = tabel_bewijs or {}
    sync = {str(r.get("feed_id")): r for r in sync_rijen or []}
    per_app: dict[str, list[dict[str, Any]]] = {a: [] for a in APPS}
    for k in CATALOGUS:
        bewijs = _feed_bewijs(k["feeds"], sync, nu)
        if not bewijs and k.get("bewijs"):
            tabel, _kolom, dagen = k["bewijs"]
            laatst = _tijd(tabel_bewijs.get(tabel)) if tabel_bewijs.get(tabel) else None
            if laatst and (nu - laatst).days <= dagen:
                bewijs = {"status": "works", "feed": tabel, "at": laatst.isoformat()}
        if bewijs and bewijs["status"] == "broken":
            st, detail = "broken", f"{bewijs['feed']}: {bewijs['detail']}"
        elif bewijs:
            st, detail = "works", f"{bewijs['feed']} updated {bewijs['at'][:16].replace('T', ' ')} UTC"
        elif k["plek"] == "vps":
            if (env.get(k["naam"]) or "").strip():
                st, detail = "present", "Set on the VPS; nothing has proven it works yet"
            else:
                st, detail = "missing", "Not set on the VPS"
        elif k["plek"] == "settings" and instellingen is not None and k.get("provider"):
            # 20 nov: Exa en ElevenLabs stonden op "not visible", terwijl ze gewoon
            # in Luka's instellingen staan -- en die kan de VPS lezen (alleen of
            # ze gevuld zijn, nooit de waarde).
            if instellingen.get(str(k["provider"])):
                st, detail = "present", "Filled in under AXE Core Settings → Keys"
            else:
                st, detail = "missing", "Not filled in under AXE Core Settings → Keys"
        elif k["plek"] == "edge" and edge is not None and k.get("project") in edge:
            label = EDGE_PROJECT_LABEL[k["project"]]
            namen = edge[k["project"]]
            raak = next((n for n in (k["naam"], *k.get("alias", ())) if n in namen), None)
            if raak is None:
                st, detail = "missing", f"Not set in Supabase edge secrets ({label})"
            elif raak == k["naam"]:
                st, detail = "present", f"Set in Supabase edge secrets ({label}); nothing has proven it works yet"
            else:
                st, detail = "present", f"Set in Supabase edge secrets ({label}) as {raak}"
        elif vercel is not None and VERCEL_PROJECT.get(k["plek"]) in vercel:
            project = VERCEL_PROJECT[k["plek"]]
            namen = vercel[project]
            raak = next((n for n in (k["naam"], *k.get("alias", ())) if n in namen), None)
            if raak is None:
                st, detail = "missing", f"Not set in Vercel ({project})"
            elif raak == k["naam"]:
                st, detail = "present", f"Set in Vercel ({project}); nothing has proven it works yet"
            else:
                st, detail = "present", f"Set in Vercel ({project}) as {raak}"
                if k["publiek"]:
                    detail += "; the browser build has no VITE_ copy"
        else:
            st, detail = "unseen", f"Lives in {PLEK_LABEL[k['plek']]}; not visible from the VPS"
        if st == "missing" and k["nodig"] == "unused":
            st, detail = "unused", "Not needed: " + k["doel"]
        elif st == "missing" and k["nodig"] == "optional":
            st, detail = "optional", "Not set; only needed if you want this"
        rij = {"name": k["naam"], "purpose": k["doel"], "where": PLEK_LABEL[k["plek"]],
               "status": st, "detail": detail, "feeds": list(k["feeds"]),
               "need": k["nodig"], "provider": k.get("provider")}
        if k["publiek"]:
            rij["warning"] = "VITE_ key: ends up in the browser bundle, readable by anyone with the app"
        for app in k["apps"]:
            per_app[app].append(rij)
    per_app["AXE Core"].extend(_dax_rijen(dax or []))
    for rij in _rare_edge_namen(edge or {}):
        per_app["AXE Companion" if rij["project"] == "companion" else "NorthSea"].append(rij["rij"])
    tellers = {a: {s: sum(1 for r in rows if r["status"] == s)
                   for s in ("works", "present", "missing", "broken", "unseen", "optional", "unused")}
               for a, rows in per_app.items()}
    return {"generated_at": nu.isoformat(), "apps": [
        {"app": a, "manager": MANAGER[a], "counts": tellers[a], "keys": per_app[a]} for a in APPS]}


def _rare_edge_namen(edge: Mapping[str, set[str] | frozenset[str]]) -> list[dict[str, Any]]:
    """Edge-geheimen met een naam die geen variabelenaam is. Een naam met een @
    is waarschijnlijk een waarde die per ongeluk als naam is geplakt: die naam
    tonen we dus NIET, alleen wat er mis is."""
    uit = []
    for project, namen in edge.items():
        for naam in sorted(namen):
            if _NAAM_OK.match(naam):
                continue
            label = EDGE_PROJECT_LABEL.get(project, project)
            if "@" in naam:
                toon, wat = "(name hidden)", "the name looks like an e-mail address -- probably pasted into the name field; remove it"
            else:
                toon, wat = naam, "the name has a space or odd character, so the code never finds it; rename it"
            uit.append({"project": project, "rij": {
                "name": toon, "purpose": "Odd edge-secret name", "where": f"Supabase edge secrets ({label})",
                "status": "broken", "detail": wat, "feeds": [], "need": "required", "provider": None}})
    return uit


def problemen(overzicht: dict[str, Any], app: str) -> list[str]:
    """Korte regels voor de manager van deze app: bewezen kapot, of een
    verplichte sleutel die ontbreekt. Optioneel en ongebruikt is geen melding."""
    for blok in overzicht.get("apps") or []:
        if blok.get("app") == app:
            return [f"{r['name']} {'broken' if r['status'] == 'broken' else 'missing'} ({r['detail']})"
                    for r in blok.get("keys") or []
                    # DAX-rijen zijn geen sleutel maar een server (20 nov: Strato
                    # onbereikbaar → 5x "sleutel werkt niet" → 5 zelf-fix-taken die
                    # nooit konden slagen). DAX meldt zichzelf apart.
                    if r.get("where") != PLEK_LABEL["dax"]
                    and (r["status"] == "broken" or (r["status"] == "missing" and r.get("need") == "required"))]
    return []


def lees(db: Any, nu: datetime | None = None) -> dict[str, Any]:
    nu = nu or datetime.now(timezone.utc)
    try:
        rijen = db.table("intel_sync_log").select("feed_id,last_sync_at,last_error").limit(200).execute().data or []
    except Exception:  # noqa: BLE001 -- zonder bewijs: alleen aanwezigheid
        rijen = []
    tabel_bewijs: dict[str, str | None] = {}
    for k in CATALOGUS:
        if k.get("bewijs") and k["bewijs"][0] not in tabel_bewijs:
            tabel, kolom, _d = k["bewijs"]
            try:
                r = (db.table(tabel).select(kolom).order(kolom, desc=True).limit(1).execute().data or [{}])[0]
                tabel_bewijs[tabel] = r.get(kolom)
            except Exception:  # noqa: BLE001
                tabel_bewijs[tabel] = None
    try:
        dax = db.table("core_dax_computers").select("id,owner_agent,status,last_error,stats").execute().data or []
    except Exception:  # noqa: BLE001
        dax = []
    return status(rijen, nu, tabel_bewijs=tabel_bewijs, dax=dax, instellingen=_instellingen(db),
                  vercel=_vercel_namen(), edge=_edge_namen())


_EDGE_CACHE: dict[str, Any] = {"t": None, "namen": None}


def _edge_namen(nu: datetime | None = None) -> dict[str, frozenset[str]] | None:
    """NAMEN (nooit waarden) van de edge-geheimen per Supabase-project, via de
    edge-functie sleutel-namen. 10 min in geheugen."""
    nu = nu or datetime.now(timezone.utc)
    if _EDGE_CACHE["t"] and nu - _EDGE_CACHE["t"] < timedelta(minutes=10):
        return _EDGE_CACHE["namen"]
    import json
    import urllib.request

    def haal(url: str, headers: dict[str, str]) -> frozenset[str] | None:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=15) as r:  # noqa: S310
                return frozenset(str(n) for n in (json.load(r).get("names") or []))
        except Exception:  # noqa: BLE001 -- dat project blijft dan "unseen"
            return None

    uit: dict[str, frozenset[str]] = {}
    basis = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    sleutel = (os.environ.get("SUPABASE_SERVICE_ROLE") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if basis and sleutel:
        n = haal(f"{basis}/functions/v1/sleutel-namen", {"apikey": sleutel, "Authorization": f"Bearer {sleutel}"})
        if n is not None:
            uit["companion"] = n
    token = (os.environ.get("NORTHSEA_ENGINE_TOKEN") or "").strip()
    if token:
        mcp = (os.environ.get("NORTHSEA_MCP_INTERNAL_URL") or "http://127.0.0.1:8040").rstrip("/")
        n = haal(f"{mcp}/internal/edge-key-names", {"Authorization": f"Bearer {token}"})
        if n is not None:
            uit["commodities"] = n
    _EDGE_CACHE.update(t=nu, namen=uit)
    return uit


_VERCEL_CACHE: dict[str, Any] = {"t": None, "namen": None}


def _vercel_namen(nu: datetime | None = None) -> dict[str, frozenset[str]] | None:
    """Namen (nooit waarden) van de production-env per Vercel-project.

    Zonder ?decrypt: Vercel geeft dan alleen versleutelde waarden terug, en ook
    die gooien we meteen weg -- alleen e["key"] blijft over. 10 min in geheugen.
    """
    nu = nu or datetime.now(timezone.utc)
    if _VERCEL_CACHE["t"] and nu - _VERCEL_CACHE["t"] < timedelta(minutes=10):
        return _VERCEL_CACHE["namen"]
    token = (os.environ.get("VERCEL_TOKEN") or "").strip()
    if not token:
        return None
    import json
    import urllib.request

    uit: dict[str, frozenset[str]] = {}
    for project in sorted(set(VERCEL_PROJECT.values())):
        try:
            req = urllib.request.Request(f"https://api.vercel.com/v10/projects/{project}/env",
                                         headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req, timeout=15) as r:  # noqa: S310 -- vaste https-host
                envs = json.load(r).get("envs") or []
        except Exception:  # noqa: BLE001 -- dat project blijft dan "unseen"
            continue
        uit[project] = frozenset(str(e.get("key")) for e in envs
                                 if "production" in (e.get("target") or []) and e.get("key"))
    _VERCEL_CACHE.update(t=nu, namen=uit)
    return uit


def _instellingen(db: Any) -> dict[str, bool] | None:
    """Welke providers in AXE Core Settings → Keys gevuld zijn. Alleen ja/nee."""
    try:
        rijen = db.table("user_settings").select("value").eq("key", "axe_llm_connections").limit(5).execute().data or []
    except Exception:  # noqa: BLE001 -- dan blijft het "unseen"
        return None
    gevuld: dict[str, bool] = {}
    for r in rijen:
        waarde = r.get("value")
        if not isinstance(waarde, dict):
            continue
        for prov, v in waarde.items():
            sleutel = v.get("key") if isinstance(v, dict) else None
            if isinstance(sleutel, str) and len(sleutel.strip()) > 8:
                gevuld[str(prov)] = True
    return gevuld


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
