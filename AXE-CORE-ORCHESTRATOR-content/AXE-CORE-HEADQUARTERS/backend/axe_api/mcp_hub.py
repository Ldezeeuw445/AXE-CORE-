"""
mcp_hub.py -- echte MCP-verbindingen voor AXE CORE, op de agent-host.

## Waarom dit bestand bestaat

De MCP Center-tab kon nooit iets verbinden (gemeten 14 september):
  - de standaardlijst had verzonnen startcommando's (`npx supabase`) en geen
    adressen;
  - "Test" deed een gewone GET op `/`, `/health`, `/sse` -- geen MCP;
  - een tool aanroepen ging naar `<url>/tools/call`, een pad dat in MCP niet
    bestaat. MCP is JSON-RPC op één adres.

Dit is een kleine client voor MCP over twee transports, zonder SDK:
  - Streamable HTTP (httpx) voor servers op internet;
  - stdio (een proces op deze Mac, regels JSON in en uit) voor servers die je
    met `npx` start.
De officiële Python-SDK ging op 2.x naar een eigen HTTP-laag en de API
verschoof; het protocol zelf is een handvol berichten en staat vast.

## Sjablonen en verbindingen

Een SJABLOON zegt hoe een soort server verbindt (Supabase, Cloudflare ...).
Een VERBINDING is één exemplaar: elk sjabloon heeft er standaard één, en waar
`meerdere` aan staat kun je er meer toevoegen -- drie Supabase-projecten, twee
Cloudflare-accounts. Extra verbindingen staan in ~/.axe/mcp-verbindingen.json
(geen geheimen), hun sleutels in ~/.axe/mcp-sleutels.env (600).

## Waar de sleutels vandaan komen

In deze volgorde: de omgeving, ~/.axe/mcp-sleutels.env (wat je in de tab zelf
invult), de vault op de SSD. GitHub valt terug op `gh auth token`. Een extra
verbinding heeft een eigen sleutelnaam (`NAAM__VERBINDING`); alleen waar dat
veilig is (`deel_sleutel`) valt hij terug op die van het sjabloon. Bij
Cloudflare niet: een tweede account dat stilletjes de sleutel van het eerste
gebruikt, praat met het verkeerde account. Geen enkele route geeft een waarde
terug -- alleen waar hij vandaan komt.

## Wat bewust dicht staat

  - Supabase alleen-lezen (`read_only=true`).
  - Perplexity: alleen `perplexity_search`, max 25 per dag. De dure
    onderzoekstools lopen via /research/perplexity met zijn eigen budget.
  - Stripe: een restricted key, en Stripe vraagt zelf bevestiging bij
    terugbetalingen en uitbetalingen.
  - Playwright: headless en met een profiel in het geheugen (`--isolated`).
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

PROTOCOL = "2025-06-18"
SLEUTEL_BESTAND = os.path.expanduser(os.environ.get("AXE_MCP_SLEUTELS", "~/.axe/mcp-sleutels.env"))
VERBINDINGEN_BESTAND = os.path.expanduser(os.environ.get("AXE_MCP_VERBINDINGEN", "~/.axe/mcp-verbindingen.json"))
VAULT = os.environ.get("AXE_VAULT_ENV", "/Volumes/EagetSSD/AXE-VAULT/secrets.env")
TELLER_BESTAND = os.path.expanduser("~/.axe/mcp-teller.json")
TIMEOUT_S = 30
STDIO_TIMEOUT_S = 120  # de eerste `npx` haalt het pakket nog op

CF_DOCS = "https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/"

SJABLONEN: dict[str, dict[str, Any]] = {
    "github": {
        "naam": "GitHub", "categorie": "dev", "transport": "http",
        "url": "https://api.githubcopilot.com/mcp/",
        "sleutels": ["GITHUB_TOKEN", "GH_TOKEN"], "gh_terugval": True,
        "docs": "https://github.com/github/github-mcp-server",
        "uitleg": "Repo's, issues en pull requests. Gebruikt je `gh`-login als er geen GITHUB_TOKEN staat.",
    },
    "supabase": {
        "naam": "Supabase", "categorie": "storage", "transport": "http",
        "url": "https://mcp.supabase.com/mcp?project_ref={project_ref}&read_only=true",
        "velden": [{"id": "project_ref", "label": "Project-ref", "standaard": "pqnngpcgbdwxavbatbia"}],
        "meerdere": True, "deel_sleutel": True,
        "sleutels": ["SUPABASE_ACCESS_TOKEN"],
        "docs": "https://supabase.com/docs/guides/getting-started/mcp",
        "uitleg": "Tabellen, logs en advies van één project, alleen-lezen. Token: supabase.com/dashboard/account/tokens.",
    },
    "cloudflare": {
        "naam": "Cloudflare", "categorie": "infra", "transport": "http",
        "url": "https://mcp.cloudflare.com/mcp",
        "meerdere": True, "deel_sleutel": False,
        "sleutels": ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
        "docs": CF_DOCS,
        "uitleg": "Pages, Workers en DNS van één account. API-token: dash.cloudflare.com/profile/api-tokens.",
    },
    "cloudflare-docs": {
        "naam": "Cloudflare Docs", "categorie": "dev", "transport": "http",
        "url": "https://docs.mcp.cloudflare.com/mcp", "sleutels": [], "docs": CF_DOCS,
        "uitleg": "De documentatie van Cloudflare doorzoeken. Geen sleutel nodig.",
    },
    "resend": {
        "naam": "Resend", "categorie": "comms", "transport": "http",
        "url": "https://mcp.resend.com/mcp", "meerdere": True, "deel_sleutel": False,
        "sleutels": ["RESEND_API_KEY"], "docs": "https://github.com/resend/resend-mcp",
        "uitleg": "E-mail versturen en domeinen, contacten en broadcasts beheren. API-key: resend.com/api-keys.",
    },
    "firecrawl": {
        "naam": "Firecrawl", "categorie": "ai", "transport": "http",
        "url": "https://mcp.firecrawl.dev/v2/mcp",
        "sleutels": ["FIRECRAWL_API_KEY"], "docs": "https://docs.firecrawl.dev/mcp-server",
        "uitleg": "Elke site scrapen, crawlen en doorzoeken als schone tekst. API-key: firecrawl.dev/app/api-keys.",
    },
    "brave-search": {
        "naam": "Brave Search", "categorie": "ai", "transport": "stdio",
        "commando": ["npx", "-y", "@brave/brave-search-mcp-server"],
        "sleutels": ["BRAVE_API_KEY"], "docs": "https://github.com/brave/brave-search-mcp-server",
        "uitleg": "Actueel web en nieuws zoeken. API-key: api-dashboard.search.brave.com (gratis tegoed per maand).",
    },
    "stripe": {
        "naam": "Stripe", "categorie": "comms", "transport": "http",
        "url": "https://mcp.stripe.com/", "meerdere": True, "deel_sleutel": False,
        "sleutels": ["STRIPE_RESTRICTED_KEY"], "docs": "https://docs.stripe.com/mcp",
        "uitleg": "Saldo, facturen, abonnementen. Gebruik een restricted key (rk_...); Stripe vraagt zelf bevestiging bij terugbetalingen.",
    },
    "figma": {
        "naam": "Figma (desktop)", "categorie": "dev", "transport": "http",
        "url": "http://127.0.0.1:3845/mcp", "sleutels": [], "docs": "https://github.com/figma/mcp-server-guide",
        "uitleg": "Via de Figma-desktopapp: open een bestand in Dev Mode en zet de MCP-server aan. De online Figma-server vraagt een inlog die de hub nog niet kan.",
    },
    "playwright": {
        "naam": "Playwright", "categorie": "dev", "transport": "stdio",
        "commando": ["npx", "-y", "@playwright/mcp@latest", "--headless", "--isolated"],
        "sleutels": [], "docs": "https://github.com/microsoft/playwright-mcp",
        "uitleg": "Een echte browser op deze Mac: pagina's openen, formulieren, tests. Headless, zonder bewaard profiel.",
    },
    "e2b": {
        "naam": "E2B", "categorie": "dev", "transport": "stdio",
        "commando": ["npx", "-y", "@e2b/mcp-server"],
        "sleutels": ["E2B_API_KEY"], "docs": "https://github.com/e2b-dev/mcp-server",
        "uitleg": "Code draaien in een afgesloten sandbox in de cloud. API-key: e2b.dev/dashboard.",
    },
    "perplexity": {
        "naam": "Perplexity", "categorie": "ai", "transport": "http",
        "url": "https://api.perplexity.ai/mcp",
        "sleutels": ["PERPLEXITY_API_KEY"], "toegestaan": ["perplexity_search"], "per_dag": 25,
        "docs": "https://github.com/perplexityai/modelcontextprotocol",
        "uitleg": "Zoeken met actuele bronnen. Alleen perplexity_search, max 25 per dag; onderzoek loopt via [RESEARCH:].",
    },
}

# Terug-compatibel: wie SERVERS leest, krijgt de sjablonen.
SERVERS = SJABLONEN


class McpFout(Exception):
    pass


# ── bestanden ───────────────────────────────────────────────────────────────

def _lees_env_bestand(pad: str) -> dict[str, str]:
    uit: dict[str, str] = {}
    try:
        with open(pad, encoding="utf-8") as f:
            for regel in f:
                regel = regel.strip()
                if not regel or regel.startswith("#") or "=" not in regel:
                    continue
                k, _, v = regel.partition("=")
                uit[k.strip().removeprefix("export ").strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return uit


def _schrijf_prive(pad: str, inhoud: str) -> None:
    os.makedirs(os.path.dirname(pad), exist_ok=True)
    tmp = pad + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(inhoud)
    os.replace(tmp, pad)
    os.chmod(pad, 0o600)


# ── verbindingen ────────────────────────────────────────────────────────────

def _extra_verbindingen() -> list[dict]:
    try:
        with open(VERBINDINGEN_BESTAND, encoding="utf-8") as f:
            data = json.load(f)
        return [v for v in data if isinstance(v, dict) and v.get("sjabloon") in SJABLONEN] if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def verbindingen() -> dict[str, dict]:
    """Alle verbindingen: één per sjabloon, plus wat je hebt toegevoegd."""
    uit: dict[str, dict] = {}
    for sid, s in SJABLONEN.items():
        velden = {v["id"]: v.get("standaard", "") for v in s.get("velden", [])}
        uit[sid] = {"id": sid, "sjabloon": sid, "label": s["naam"], "velden": velden, "extra": False}
    for v in _extra_verbindingen():
        uit[v["id"]] = {"id": v["id"], "sjabloon": v["sjabloon"], "label": v.get("label") or v["id"],
                        "velden": v.get("velden") or {}, "extra": True}
    return uit


def maak_id(sjabloon: str, label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")[:30] or "extra"
    return f"{sjabloon}-{slug}"


def voeg_toe(sjabloon: str, label: str, velden: dict) -> dict:
    s = SJABLONEN.get(sjabloon)
    if not s:
        raise KeyError(sjabloon)
    if not s.get("meerdere"):
        raise ValueError(f"{s['naam']} heeft maar één verbinding.")
    label = (label or "").strip()[:40]
    if not label:
        raise ValueError("Geef de verbinding een naam.")
    schoon = {}
    for veld in s.get("velden", []):
        waarde = str((velden or {}).get(veld["id"], "")).strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]{3,64}", waarde):
            raise ValueError(f"{veld['label']} ontbreekt of bevat vreemde tekens.")
        schoon[veld["id"]] = waarde
    vid = maak_id(sjabloon, label)
    if vid in verbindingen():
        raise ValueError(f"Er is al een verbinding '{label}'.")
    lijst = _extra_verbindingen() + [{"id": vid, "sjabloon": sjabloon, "label": label, "velden": schoon}]
    _schrijf_prive(VERBINDINGEN_BESTAND, json.dumps(lijst, indent=1))
    return verbindingen()[vid]


def verwijder(vid: str) -> None:
    """Een toegevoegde verbinding weg, en zijn eigen sleutel met hem."""
    lijst = _extra_verbindingen()
    weg = next((v for v in lijst if v["id"] == vid), None)
    if not weg:
        raise KeyError(vid)
    naam = _sleutelnaam(weg, vid)
    _schrijf_prive(VERBINDINGEN_BESTAND, json.dumps([v for v in lijst if v["id"] != vid], indent=1))
    eigen = _lees_env_bestand(SLEUTEL_BESTAND)
    if naam and naam in eigen:
        del eigen[naam]
        _schrijf_prive(SLEUTEL_BESTAND, "".join(f"{k}={w}\n" for k, w in eigen.items()))


# ── sleutels ────────────────────────────────────────────────────────────────

def _achtervoegsel(vid: str) -> str:
    return re.sub(r"[^A-Z0-9]", "_", vid.upper())


def _sleutelnaam(v: dict, vid: str) -> Optional[str]:
    s = SJABLONEN[v["sjabloon"]]
    if not s["sleutels"]:
        return None
    basis = s["sleutels"][0]
    return basis if vid == v["sjabloon"] else f"{basis}__{_achtervoegsel(vid)}"


def sleutel_voor(vid: str) -> tuple[Optional[str], str]:
    """(waarde, bron). De waarde verlaat deze module alleen in een header of env."""
    v = verbindingen()[vid]
    s = SJABLONEN[v["sjabloon"]]
    if not s["sleutels"]:
        return None, "niet nodig"
    namen = [_sleutelnaam(v, vid)] if v["extra"] else list(s["sleutels"])
    if v["extra"] and s.get("deel_sleutel"):
        namen += s["sleutels"]
    eigen = _lees_env_bestand(SLEUTEL_BESTAND)
    vault = _lees_env_bestand(VAULT)
    for naam in namen:
        if os.environ.get(naam):
            return os.environ[naam], f"omgeving ({naam})"
        if eigen.get(naam):
            return eigen[naam], f"ingevuld in AXE ({naam})"
        if vault.get(naam):
            return vault[naam], f"vault ({naam})"
    if s.get("gh_terugval") and not v["extra"]:
        try:
            r = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=5)
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout.strip(), "gh-login"
        except (OSError, subprocess.TimeoutExpired):
            pass
    return None, "ontbreekt"


def bewaar_sleutel(vid: str, waarde: str) -> str:
    """Schrijf een zelf ingevulde sleutel weg, alleen leesbaar voor jou (600)."""
    v = verbindingen()[vid]
    naam = _sleutelnaam(v, vid)
    if not naam:
        raise ValueError("Deze verbinding heeft geen sleutel nodig.")
    bestaand = _lees_env_bestand(SLEUTEL_BESTAND)
    bestaand[naam] = waarde.strip()
    _schrijf_prive(SLEUTEL_BESTAND, "".join(f"{k}={w}\n" for k, w in bestaand.items()))
    return naam


# ── het protocol ────────────────────────────────────────────────────────────

def lees_bericht(resp: httpx.Response, verwacht_id: int) -> dict:
    """Het JSON-RPC-antwoord, uit gewone JSON of uit een SSE-stroom."""
    soort = resp.headers.get("content-type", "")
    if "text/event-stream" in soort:
        for regel in resp.text.splitlines():
            if not regel.startswith("data:"):
                continue
            try:
                bericht = json.loads(regel[5:].strip())
            except json.JSONDecodeError:
                continue
            if isinstance(bericht, dict) and bericht.get("id") == verwacht_id:
                return bericht
        raise McpFout("geen antwoord in de SSE-stroom")
    try:
        bericht = resp.json()
    except ValueError as e:
        raise McpFout(f"geen JSON terug (HTTP {resp.status_code})") from e
    if isinstance(bericht, list):
        bericht = next((b for b in bericht if isinstance(b, dict) and b.get("id") == verwacht_id), {})
    return bericht


def _resultaat(bericht: dict) -> dict:
    if "error" in bericht:
        fout = bericht["error"] or {}
        raise McpFout(str(fout.get("message") or fout)[:300])
    return bericht.get("result") or {}


def url_voor(vid: str) -> str:
    v = verbindingen()[vid]
    return SJABLONEN[v["sjabloon"]]["url"].format(**v["velden"])


class HttpSessie:
    def __init__(self, vid: str):
        self.url = url_voor(vid)
        self.client: Optional[httpx.AsyncClient] = None
        self.sessie: Optional[str] = None
        self.volgnummer = 0
        sleutel, _ = sleutel_voor(vid)
        self.basis = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        if sleutel:
            self.basis["Authorization"] = f"Bearer {sleutel}"

    async def __aenter__(self):
        self.client = httpx.AsyncClient(timeout=TIMEOUT_S * 2)
        return self

    async def __aexit__(self, *exc):
        await self.client.aclose()

    def _headers(self) -> dict:
        h = dict(self.basis)
        if self.sessie:
            h["Mcp-Session-Id"] = self.sessie
            h["MCP-Protocol-Version"] = PROTOCOL
        return h

    async def verzoek(self, methode: str, params: Optional[dict] = None) -> dict:
        self.volgnummer += 1
        nr = self.volgnummer
        r = await self.client.post(self.url, headers=self._headers(),
                                   json={"jsonrpc": "2.0", "id": nr, "method": methode, "params": params or {}})
        if r.status_code in (401, 403):
            raise McpFout(f"sleutel geweigerd (HTTP {r.status_code})")
        if r.status_code >= 400:
            raise McpFout(f"HTTP {r.status_code}: {r.text[:200]}")
        if r.headers.get("mcp-session-id"):
            self.sessie = r.headers["mcp-session-id"]
        return _resultaat(lees_bericht(r, nr))

    async def melding(self, methode: str) -> None:
        await self.client.post(self.url, headers=self._headers(), json={"jsonrpc": "2.0", "method": methode})


class StdioSessie:
    """Een MCP-server als proces op deze Mac: één JSON-bericht per regel."""

    def __init__(self, vid: str):
        v = verbindingen()[vid]
        s = SJABLONEN[v["sjabloon"]]
        self.commando = s["commando"]
        self.env = {**os.environ}
        # De omgeving van de app kan sleutels van andere diensten bevatten; die
        # hoort een los npm-pakket niet te zien.
        for k in list(self.env):
            if re.search(r"(KEY|TOKEN|SECRET|PASSWORD|SERVICE_ROLE)", k):
                del self.env[k]
        sleutel, _ = sleutel_voor(vid)
        if sleutel and s["sleutels"]:
            self.env[s["sleutels"][0]] = sleutel
        self.proc: Optional[asyncio.subprocess.Process] = None
        self.volgnummer = 0

    async def __aenter__(self):
        try:
            self.proc = await asyncio.create_subprocess_exec(
                *self.commando, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE, env=self.env, limit=16 * 1024 * 1024,
            )
        except OSError as e:
            raise McpFout(f"kon {self.commando[0]} niet starten: {e}") from e
        return self

    async def __aexit__(self, *exc):
        if self.proc and self.proc.returncode is None:
            try:
                self.proc.stdin.close()
                await asyncio.wait_for(self.proc.wait(), timeout=3)
            except (asyncio.TimeoutError, OSError):
                self.proc.kill()

    async def _stuur(self, bericht: dict) -> None:
        self.proc.stdin.write((json.dumps(bericht) + "\n").encode())
        await self.proc.stdin.drain()

    async def verzoek(self, methode: str, params: Optional[dict] = None) -> dict:
        self.volgnummer += 1
        nr = self.volgnummer
        await self._stuur({"jsonrpc": "2.0", "id": nr, "method": methode, "params": params or {}})
        eind = time.monotonic() + STDIO_TIMEOUT_S
        while True:
            rest = eind - time.monotonic()
            if rest <= 0:
                raise McpFout(f"geen antwoord op {methode} binnen {STDIO_TIMEOUT_S}s")
            regel = await asyncio.wait_for(self.proc.stdout.readline(), timeout=rest)
            if not regel:
                fout = (await self.proc.stderr.read())[-300:].decode(errors="replace")
                raise McpFout(f"proces stopte: {fout.strip() or 'geen uitvoer'}")
            try:
                bericht = json.loads(regel)
            except json.JSONDecodeError:
                continue  # logregels op stdout negeren
            if isinstance(bericht, dict) and bericht.get("id") == nr:
                return _resultaat(bericht)

    async def melding(self, methode: str) -> None:
        await self._stuur({"jsonrpc": "2.0", "method": methode})


def sessie_voor(vid: str):
    return StdioSessie(vid) if SJABLONEN[verbindingen()[vid]["sjabloon"]]["transport"] == "stdio" else HttpSessie(vid)


async def _open(s) -> dict:
    info = await s.verzoek("initialize", {
        "protocolVersion": PROTOCOL, "capabilities": {},
        "clientInfo": {"name": "axe-core", "version": "1.0"},
    })
    await s.melding("notifications/initialized")
    return info


async def _tools(s) -> list[dict]:
    alles: list[dict] = []
    cursor = None
    for _ in range(10):
        res = await s.verzoek("tools/list", {"cursor": cursor} if cursor else {})
        alles += res.get("tools") or []
        cursor = res.get("nextCursor")
        if not cursor:
            break
    return alles


def zichtbare_tools(sjabloon: str, tools: list[dict]) -> list[dict]:
    toegestaan = SJABLONEN[sjabloon].get("toegestaan")
    return [t for t in tools if not toegestaan or t.get("name") in toegestaan]


# ── dagteller ───────────────────────────────────────────────────────────────

def _teller() -> dict:
    try:
        with open(TELLER_BESTAND, encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def mag_nog(sjabloon: str, dag: str, teller: Optional[dict] = None) -> bool:
    maximum = SJABLONEN[sjabloon].get("per_dag")
    if not maximum:
        return True
    t = _teller() if teller is None else teller
    return int(t.get(dag, {}).get(sjabloon, 0)) < maximum


def tel(sjabloon: str, dag: str) -> None:
    t = _teller()
    t = {dag: t.get(dag, {})}
    t[dag][sjabloon] = int(t[dag].get(sjabloon, 0)) + 1
    os.makedirs(os.path.dirname(TELLER_BESTAND), exist_ok=True)
    with open(TELLER_BESTAND, "w", encoding="utf-8") as f:
        json.dump(t, f)


# ── wat de routes doen ──────────────────────────────────────────────────────

def overzicht() -> dict:
    lijst = []
    for vid, v in verbindingen().items():
        s = SJABLONEN[v["sjabloon"]]
        _, bron = sleutel_voor(vid)
        lijst.append({
            "id": vid, "sjabloon": v["sjabloon"], "naam": v["label"] if v["extra"] else s["naam"],
            "categorie": s["categorie"], "docs": s["docs"], "uitleg": s["uitleg"], "transport": s["transport"],
            "velden": v["velden"], "extra": v["extra"],
            "sleutelnaam": _sleutelnaam(v, vid), "sleutel": bron, "klaar": bron != "ontbreekt",
            "per_dag": s.get("per_dag"),
        })
    sjablonen = [{"id": sid, "naam": s["naam"], "velden": s.get("velden", [])}
                 for sid, s in SJABLONEN.items() if s.get("meerdere")]
    return {"servers": lijst, "sjablonen": sjablonen}


async def test(vid: str) -> dict:
    alle = verbindingen()
    if vid not in alle:
        raise KeyError(vid)
    sjabloon = alle[vid]["sjabloon"]
    _, bron = sleutel_voor(vid)
    if bron == "ontbreekt":
        return {"status": "sleutel_ontbreekt", "sleutelnaam": _sleutelnaam(alle[vid], vid)}
    start = time.monotonic()
    try:
        async with sessie_voor(vid) as s:
            info = await _open(s)
            tools = zichtbare_tools(sjabloon, await _tools(s))
    except (McpFout, httpx.HTTPError, asyncio.TimeoutError, OSError) as e:
        return {"status": "offline", "fout": str(e)[:300] or type(e).__name__, "latency": int((time.monotonic() - start) * 1000)}
    return {
        "status": "online", "latency": int((time.monotonic() - start) * 1000),
        "server": (info.get("serverInfo") or {}).get("name"),
        "tools": [{"name": t.get("name"), "description": (t.get("description") or "")[:200]} for t in tools],
    }


async def roep(vid: str, tool: str, argumenten: dict) -> dict:
    alle = verbindingen()
    if vid not in alle:
        raise KeyError(vid)
    sjabloon = alle[vid]["sjabloon"]
    s_def = SJABLONEN[sjabloon]
    toegestaan = s_def.get("toegestaan")
    if toegestaan and tool not in toegestaan:
        return {"status": "error", "error": f"{tool} staat voor {s_def['naam']} niet open. Toegestaan: {', '.join(toegestaan)}"}
    dag = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not mag_nog(sjabloon, dag):
        return {"status": "error", "error": f"Dagbudget van {s_def['per_dag']} aanroepen voor {s_def['naam']} is op (reset 00:00 UTC)."}
    try:
        async with sessie_voor(vid) as s:
            await _open(s)
            res = await s.verzoek("tools/call", {"name": tool, "arguments": argumenten or {}})
    except (McpFout, httpx.HTTPError, asyncio.TimeoutError, OSError) as e:
        return {"status": "error", "error": str(e)[:300] or type(e).__name__}
    tel(sjabloon, dag)
    return {"status": "error" if res.get("isError") else "ok", "result": res}
