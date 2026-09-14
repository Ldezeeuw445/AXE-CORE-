"""
mcp_hub.py -- echte MCP-verbindingen voor AXE CORE, op de agent-host.

## Waarom dit bestand bestaat

De MCP Center-tab kon nooit iets verbinden (gemeten 14 september):
  - de standaardlijst had verzonnen startcommando's (`npx supabase`) en geen
    adressen;
  - "Test" deed een gewone GET op `/`, `/health`, `/sse` -- geen MCP;
  - een tool aanroepen ging naar `<url>/tools/call`, een pad dat in MCP niet
    bestaat. MCP is JSON-RPC op één adres.

Dit is een kleine client voor MCP over Streamable HTTP, rechtstreeks op httpx.
Niet de officiële Python-SDK: die ging op 2.x naar een eigen HTTP-laag
(httpx2) en de API verschoof; het protocol zelf is een handvol berichten en
staat vast in de spec.

## Waar het draait en waar de sleutels staan

Op de agent-host (de Mac mini), niet op de VPS: daar staan de abonnementen al,
en deze route hoeft niet uitgerold te worden om te werken. Sleutels komen uit,
in deze volgorde: de omgeving, `~/.axe/mcp-sleutels.env` (wat je in de tab zelf
invult), de vault op de SSD. GitHub valt daarna terug op `gh auth token`, zodat
je bestaande GitHub-login meteen werkt. Geen enkele route geeft een waarde
terug -- alleen of er een is.

## Wat bewust dicht staat

  - Supabase alleen-lezen en op het AXE-project (`read_only=true`).
  - Perplexity: alleen `perplexity_search` (ruwe zoekresultaten, geen LLM) en
    hooguit 25 aanroepen per dag. De dure onderzoekstools lopen via
    /research/perplexity met zijn eigen budget.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

PROTOCOL = "2025-06-18"
SLEUTEL_BESTAND = os.path.expanduser(os.environ.get("AXE_MCP_SLEUTELS", "~/.axe/mcp-sleutels.env"))
VAULT = os.environ.get("AXE_VAULT_ENV", "/Volumes/EagetSSD/AXE-VAULT/secrets.env")
TELLER_BESTAND = os.path.expanduser("~/.axe/mcp-teller.json")
TIMEOUT_S = 30

SUPABASE_PROJECT = os.environ.get("AXE_SUPABASE_PROJECT", "pqnngpcgbdwxavbatbia")

SERVERS: dict[str, dict[str, Any]] = {
    "github": {
        "naam": "GitHub", "categorie": "dev",
        "url": "https://api.githubcopilot.com/mcp/",
        "sleutels": ["GITHUB_TOKEN", "GH_TOKEN"], "gh_terugval": True,
        "docs": "https://github.com/github/github-mcp-server",
        "uitleg": "Repo's, issues en pull requests. Gebruikt je `gh`-login als er geen GITHUB_TOKEN staat.",
    },
    "supabase": {
        "naam": "Supabase", "categorie": "storage",
        "url": f"https://mcp.supabase.com/mcp?project_ref={SUPABASE_PROJECT}&read_only=true",
        "sleutels": ["SUPABASE_ACCESS_TOKEN"],
        "docs": "https://supabase.com/docs/guides/getting-started/mcp",
        "uitleg": "Tabellen, logs en advies van het AXE-project. Alleen-lezen. Token: supabase.com/dashboard/account/tokens.",
    },
    "cloudflare": {
        "naam": "Cloudflare", "categorie": "infra",
        "url": "https://mcp.cloudflare.com/mcp",
        "sleutels": ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
        "docs": "https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/",
        "uitleg": "Pages, Workers, DNS (Axon Memory, Companion). API-token: dash.cloudflare.com/profile/api-tokens.",
    },
    "cloudflare-docs": {
        "naam": "Cloudflare Docs", "categorie": "dev",
        "url": "https://docs.mcp.cloudflare.com/mcp",
        "sleutels": [], "docs": "https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/",
        "uitleg": "De documentatie van Cloudflare doorzoeken. Geen sleutel nodig.",
    },
    "perplexity": {
        "naam": "Perplexity", "categorie": "ai",
        "url": "https://api.perplexity.ai/mcp",
        "sleutels": ["PERPLEXITY_API_KEY"],
        "toegestaan": ["perplexity_search"], "per_dag": 25,
        "docs": "https://github.com/perplexityai/modelcontextprotocol",
        "uitleg": "Zoeken met actuele bronnen. Alleen perplexity_search, max 25 per dag; onderzoek loopt via [RESEARCH:].",
    },
}


class McpFout(Exception):
    pass


# ── sleutels ────────────────────────────────────────────────────────────────

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


def sleutel_voor(server_id: str) -> tuple[Optional[str], str]:
    """(waarde, bron). De waarde verlaat deze module alleen in een header."""
    s = SERVERS[server_id]
    if not s["sleutels"]:
        return None, "niet nodig"
    for naam in s["sleutels"]:
        if os.environ.get(naam):
            return os.environ[naam], f"omgeving ({naam})"
    eigen = _lees_env_bestand(SLEUTEL_BESTAND)
    for naam in s["sleutels"]:
        if eigen.get(naam):
            return eigen[naam], f"ingevuld in AXE ({naam})"
    vault = _lees_env_bestand(VAULT)
    for naam in s["sleutels"]:
        if vault.get(naam):
            return vault[naam], f"vault ({naam})"
    if s.get("gh_terugval"):
        try:
            r = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=5)
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout.strip(), "gh-login"
        except (OSError, subprocess.TimeoutExpired):
            pass
    return None, "ontbreekt"


def bewaar_sleutel(server_id: str, waarde: str) -> str:
    """Schrijf een zelf ingevulde sleutel weg, alleen leesbaar voor jou (600)."""
    naam = SERVERS[server_id]["sleutels"][0]
    bestaand = _lees_env_bestand(SLEUTEL_BESTAND)
    bestaand[naam] = waarde.strip()
    os.makedirs(os.path.dirname(SLEUTEL_BESTAND), exist_ok=True)
    tmp = SLEUTEL_BESTAND + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        for k, v in bestaand.items():
            f.write(f"{k}={v}\n")
    os.replace(tmp, SLEUTEL_BESTAND)
    os.chmod(SLEUTEL_BESTAND, 0o600)
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


class Sessie:
    def __init__(self, server_id: str, client: httpx.AsyncClient):
        self.id = server_id
        self.url = SERVERS[server_id]["url"]
        self.client = client
        self.sessie: Optional[str] = None
        self.volgnummer = 0
        sleutel, _ = sleutel_voor(server_id)
        self.basis_headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        if sleutel:
            self.basis_headers["Authorization"] = f"Bearer {sleutel}"

    def _headers(self) -> dict:
        h = dict(self.basis_headers)
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
        bericht = lees_bericht(r, nr)
        if "error" in bericht:
            fout = bericht["error"] or {}
            raise McpFout(str(fout.get("message") or fout)[:300])
        return bericht.get("result") or {}

    async def melding(self, methode: str) -> None:
        await self.client.post(self.url, headers=self._headers(), json={"jsonrpc": "2.0", "method": methode})

    async def open(self) -> dict:
        info = await self.verzoek("initialize", {
            "protocolVersion": PROTOCOL, "capabilities": {},
            "clientInfo": {"name": "axe-core", "version": "1.0"},
        })
        await self.melding("notifications/initialized")
        return info

    async def tools(self) -> list[dict]:
        alles: list[dict] = []
        cursor = None
        for _ in range(10):
            res = await self.verzoek("tools/list", {"cursor": cursor} if cursor else {})
            alles += res.get("tools") or []
            cursor = res.get("nextCursor")
            if not cursor:
                break
        return alles


def zichtbare_tools(server_id: str, tools: list[dict]) -> list[dict]:
    toegestaan = SERVERS[server_id].get("toegestaan")
    return [t for t in tools if not toegestaan or t.get("name") in toegestaan]


# ── dagteller ───────────────────────────────────────────────────────────────

def _teller() -> dict:
    try:
        with open(TELLER_BESTAND, encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def mag_nog(server_id: str, dag: str, teller: Optional[dict] = None) -> bool:
    maximum = SERVERS[server_id].get("per_dag")
    if not maximum:
        return True
    t = _teller() if teller is None else teller
    return int(t.get(dag, {}).get(server_id, 0)) < maximum


def tel(server_id: str, dag: str) -> None:
    t = _teller()
    t = {dag: t.get(dag, {})}
    t[dag][server_id] = int(t[dag].get(server_id, 0)) + 1
    os.makedirs(os.path.dirname(TELLER_BESTAND), exist_ok=True)
    with open(TELLER_BESTAND, "w", encoding="utf-8") as f:
        json.dump(t, f)


# ── wat de routes doen ──────────────────────────────────────────────────────

def overzicht() -> list[dict]:
    uit = []
    for sid, s in SERVERS.items():
        _, bron = sleutel_voor(sid)
        uit.append({
            "id": sid, "naam": s["naam"], "categorie": s["categorie"], "docs": s["docs"],
            "uitleg": s["uitleg"], "sleutelnaam": (s["sleutels"] or [None])[0],
            "sleutel": bron, "klaar": bron != "ontbreekt",
            "per_dag": s.get("per_dag"),
        })
    return uit


async def test(server_id: str) -> dict:
    if server_id not in SERVERS:
        raise KeyError(server_id)
    _, bron = sleutel_voor(server_id)
    if bron == "ontbreekt":
        return {"status": "sleutel_ontbreekt", "sleutelnaam": SERVERS[server_id]["sleutels"][0]}
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            s = Sessie(server_id, client)
            info = await s.open()
            tools = zichtbare_tools(server_id, await s.tools())
    except (McpFout, httpx.HTTPError) as e:
        return {"status": "offline", "fout": str(e)[:300], "latency": int((time.monotonic() - start) * 1000)}
    return {
        "status": "online", "latency": int((time.monotonic() - start) * 1000),
        "server": (info.get("serverInfo") or {}).get("name"),
        "tools": [{"name": t.get("name"), "description": (t.get("description") or "")[:200]} for t in tools],
    }


async def roep(server_id: str, tool: str, argumenten: dict) -> dict:
    if server_id not in SERVERS:
        raise KeyError(server_id)
    toegestaan = SERVERS[server_id].get("toegestaan")
    if toegestaan and tool not in toegestaan:
        return {"status": "error", "error": f"{tool} staat voor {SERVERS[server_id]['naam']} niet open. Toegestaan: {', '.join(toegestaan)}"}
    dag = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not mag_nog(server_id, dag):
        return {"status": "error", "error": f"Dagbudget van {SERVERS[server_id]['per_dag']} aanroepen voor {SERVERS[server_id]['naam']} is op (reset 00:00 UTC)."}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S * 2) as client:
            s = Sessie(server_id, client)
            await s.open()
            res = await s.verzoek("tools/call", {"name": tool, "arguments": argumenten or {}})
    except (McpFout, httpx.HTTPError) as e:
        return {"status": "error", "error": str(e)[:300]}
    tel(server_id, dag)
    return {"status": "error" if res.get("isError") else "ok", "result": res}
