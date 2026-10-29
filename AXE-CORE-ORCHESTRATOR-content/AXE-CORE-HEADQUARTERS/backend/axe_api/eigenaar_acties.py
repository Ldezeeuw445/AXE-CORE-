"""Wat alleen Luka kan doen, en of het al gedaan is.

Sessies schreven zulke stappen in een chat of in docs/programma, en daar raakten
ze kwijt: op 17 okt stonden vier stappen al dagen open en liep de NorthSea-lus
intussen op naar ~1.100 schrijfacties per uur. Hier staan ze op één plek, elk met
een meting die zegt of hij gedaan is. De bewaker op de Mac mini meet ze elke
ronde, zet ze in de status-snapshot en zet één keer per dag (vanaf 08:00
Amsterdam) een herinnering in de bel zolang er iets openstaat. Die bel wordt in
de Tauri-app een macOS-melding en op de A17 een native Device Manager-melding.

Een stap verdwijnt pas als de meting hem gedaan noemt, niet als iemand zegt dat
hij klaar is. Kan een stap van hier niet gemeten worden, dan blijft hij open met
die reden erbij, in plaats van stil als gedaan te tellen.

Een nieuwe stap: een regel in ACTIES plus een meetfunctie in METINGEN. Is hij
gedaan, dan mag hij weg; laten staan kan ook, hij meldt dan niets meer.

Weg sinds 19 okt: northsea-engine-fix (live gemeten 17 okt: nul schrijfacties per
tick, zie het incident) en axon-key-migration (door Luka toegepast gemeld). Op de
Mac mini waren ze niet meetbaar en bleven ze elke ochtend als open terugkomen. De
meetfuncties blijven staan voor wie ze met de juiste sleutels opnieuw wil gebruiken.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Awaitable, Callable, Optional
from zoneinfo import ZoneInfo

import httpx

USER_ID = "acff7a12-1111-481d-a7a9-cc07583b8069"
AMSTERDAM = ZoneInfo("Europe/Amsterdam")
HERINNER_VANAF_UUR = 8
BOUW_REPOS = ("trading-os", "axe-companion", "axon-memory")
AXON_OAUTH = "https://mcp.axon-memory.com/.well-known/oauth-authorization-server"
AXON_APP = "https://app.axon-memory.com"
# Een zin die alleen de toestemmingspagina van PR #2 heeft (src/pages/ConnectAuthorize.jsx).
AXON_CONSENT_TEKST = "AXON has not verified this app"
# Meten kost een paar verzoeken en één bundel van ~2 MB; elke minuut is zonde.
MEET_ELKE = timedelta(minutes=15)
# De lus van vóór 1c25cf93 werkt elke tick ~85 action_queue-rijen bij (gemeten 17 okt:
# 146 rijen in 20 minuten). Na de fix wacht een budgetstempel tot de volgende dag.
NORTHSEA_LUS_VENSTER = timedelta(minutes=20)
NORTHSEA_LUS_DREMPEL = 30

ACTIES = (
    {
        "id": "build-loop-canon",
        "title": "Build loop: give it the programme tasks",
        "how": "Supabase SQL editor (project AXE Companion): run "
               "docs/programma/acties/2026-10-16-bouwlus-krijgt-de-canon.sql.",
    },
    {
        "id": "product-registry",
        "title": "Product registry: close it to customers and add NorthSea",
        "how": "Supabase SQL editor (project AXE Companion): run "
               "supabase/migrations/20261016191337_productregister.sql.",
    },
    {
        "id": "axon-pr2-live",
        "title": "AXON: put the PR #2 frontend live (consent screen)",
        "how": "On the Mac mini, in axon-memory-app on main: npm run build && "
               "npx wrangler pages deploy dist --project-name axon-app --branch main.",
    },
    {
        "id": "northsea-n4-deploy",
        "title": "NorthSea: deploy 1.5.0 (discovery keeps every candidate in sourcing_candidates)",
        "how": "On the iMac in the HQ folder: bash backend/northsea_mcp/deploy/deploy.sh check, "
               "then bash backend/northsea_mcp/deploy/deploy.sh deploy.",
    },
    {
        "id": "axe-api-deploy",
        "title": "AXE Core API: deploy the approval fix and the Ollama box check (20 Oct)",
        "how": "Since 28 Oct the Macs deploy this themselves (axe-autosync, vps_sync.py auto: clean box and "
               "green tests only, rolled back on a bad /health). If it stays open, read "
               "~/Library/Logs/axe-autodeploy.log on the iMac; by hand: python3 scripts/vps_sync.py check, "
               "then python3 scripts/vps_sync.py deploy.",
    },
    {
        "id": "vps-github-key",
        "title": "VPS: a new GitHub key (the old one gets 401, so the DAX bots cannot clone or push)",
        "how": "Make a token on github.com > Settings > Developer settings > Personal access tokens "
               "(classic: scope repo; or fine-grained: Contents and Pull requests read/write on your repos, "
               "1 year). Then on the iMac in the HQ folder: bash scripts/zet_github_token.sh and paste it. "
               "It checks the key with GitHub first, never shows it, and restarts the API.",
    },
    {
        "id": "phone-push",
        "title": "Phone: Device Manager native notifications",
        "how": "Rebuild com.axecore.core with docs/android/notify/ (WorkManager poll of "
               "core_notifications). First launch: Android POST_NOTIFICATIONS prompt. No "
               "Settings web-push. Open HQ once signed-in so the session reaches WorkManager.",
    },
    {
        "id": "northsea-inventory-job-off",
        "title": "Scheduler: switch off the one-off NorthSea inventory job",
        "how": "Supabase SQL editor: update public.core_schedules set enabled = false "
               "where job_key = 'northsea:uitrol-inventaris';",
    },
)

Meting = Callable[..., Awaitable[tuple[Optional[bool], str]]]


def _rest(key: str, **extra: str) -> dict:
    return {"apikey": key, "Authorization": f"Bearer {key}", **extra}


async def _northsea_lus(client, supabase_url, key, env, nu):
    url = (env.get("NORTHSEA_SUPABASE_URL") or "").strip().rstrip("/")
    sk = (env.get("NORTHSEA_SUPABASE_SERVICE_ROLE") or "").strip()
    if not url or not sk:
        return None, "cannot measure here: no NORTHSEA_SUPABASE_URL on this host"
    sinds = (nu - NORTHSEA_LUS_VENSTER).isoformat()
    r = await client.get(url + "/rest/v1/action_queue", headers=_rest(sk, Prefer="count=exact", Range="0-0"),
                         params={"select": "id", "updated_at": f"gte.{sinds}"})
    m = re.search(r"/(\d+)$", r.headers.get("content-range", ""))
    if not r.is_success or not m:
        return None, f"cannot measure: action_queue answered {r.status_code}"
    n = int(m.group(1))
    return n <= NORTHSEA_LUS_DREMPEL, f"{n} action_queue rows touched in the last 20 minutes"


async def _bouwlus_canon(client, supabase_url, key, env, nu):
    r = await client.get(supabase_url + "/rest/v1/core_bouw_apps", headers=_rest(key),
                         params={"select": "repo,opdracht"})
    rijen = r.json() if r.is_success else None
    if not isinstance(rijen, list):
        return None, f"cannot measure: core_bouw_apps answered {r.status_code}"
    zonder = [b for b in BOUW_REPOS
              if not any(isinstance(x, dict) and x.get("repo") == b and (x.get("opdracht") or "").strip() for x in rijen)]
    return not zonder, ("no task list for " + ", ".join(zonder)) if zonder else "all three apps have their tasks"


async def _productregister(client, supabase_url, key, env, nu):
    r = await client.get(supabase_url + "/rest/v1/registered_apps", headers=_rest(key),
                         params={"select": "product_key", "product_key": "eq.northsea"})
    if r.status_code == 400:
        return False, "registered_apps has no product_key column yet"
    rijen = r.json() if r.is_success else None
    if not isinstance(rijen, list):
        return None, f"cannot measure: registered_apps answered {r.status_code}"
    return len(rijen) == 1, "NorthSea is registered" if rijen else "NorthSea row missing"


async def _axon_live(client, supabase_url, key, env, nu):
    """Functions en frontend van PR #2. De functions bleken op 17 okt eerder live dan de
    frontend; alleen samen is het af."""
    r = await client.get(AXON_OAUTH)
    data = r.json() if r.is_success else None
    if not isinstance(data, dict) or not isinstance(data.get("code_challenge_methods_supported"), list):
        return None, f"cannot measure: OAuth metadata answered {r.status_code}"
    methodes = data["code_challenge_methods_supported"]
    if methodes != ["S256"]:
        return False, "edge functions not deployed (PKCE offers " + ", ".join(map(str, methodes)) + ")"
    pagina = await client.get(AXON_APP + "/")
    bundels = sorted(set(re.findall(r'/assets/[A-Za-z0-9_.-]+\.js', pagina.text))) if pagina.is_success else []
    if not bundels:
        return None, f"cannot measure: the app answered {pagina.status_code} without a bundle"
    for pad in bundels:
        b = await client.get(AXON_APP + pad)
        if b.is_success and AXON_CONSENT_TEKST in b.text:
            return True, "functions and consent screen are live"
    return False, "functions live, frontend still the old build"


async def _axon_migratie(client, supabase_url, key, env, nu):
    """Na de migratie heeft anon geen enkel recht meer op api_keys; ervoor gaf RLS een
    lege lijst. Met de publieke anon-sleutel, precies wat elke browser ook heeft."""
    url = (env.get("AXON_SUPABASE_URL") or "").strip().rstrip("/")
    anon = (env.get("AXON_SUPABASE_ANON_KEY") or "").strip()
    if not url or not anon:
        return None, "cannot measure here: no AXON_SUPABASE_URL / AXON_SUPABASE_ANON_KEY on this host"
    r = await client.get(url + "/rest/v1/api_keys", headers=_rest(anon), params={"select": "id", "limit": "1"})
    if r.status_code in (401, 403):
        return True, "anon has no rights on api_keys"
    if r.is_success:
        return False, "anon can still query api_keys (old policy)"
    return None, f"cannot measure: api_keys answered {r.status_code}"


NORTHSEA_MCP_HEALTH = "https://mcp.northseacommodity.com/health"
NORTHSEA_N4_VERSIE = (1, 5, 0)


def _versie(tekst: str) -> tuple[int, ...]:
    try:
        return tuple(int(x) for x in str(tekst).split(".")[:3])
    except ValueError:
        return ()


async def _northsea_n4(client, supabase_url, key, env, nu):
    r = await client.get(NORTHSEA_MCP_HEALTH)
    data = r.json() if r.is_success else None
    if not isinstance(data, dict) or not data.get("version"):
        return None, f"cannot measure: northsea-mcp /health answered {r.status_code}"
    return _versie(data["version"]) >= NORTHSEA_N4_VERSIE, f"northsea-mcp runs {data['version']}"


async def _vps_github(client, supabase_url, key, env, nu):
    """/health meet sinds 29 okt of GitHub de sleutel van de VPS aanvaardt."""
    url = (env.get("AXE_MONITOR_API_URL") or "https://api.axecompanion.com").rstrip("/")
    r = await client.get(url + "/health")
    data = r.json() if r.is_success else None
    gh = ((data or {}).get("checks") or {}).get("github") if isinstance(data, dict) else None
    if not isinstance(gh, dict):
        return None, "cannot measure: /health has no github check yet"
    if gh.get("state") == "ok":
        return True, "GitHub accepts the VPS key"
    return (False if gh.get("state") == "fail" else None), str(gh.get("detail") or gh.get("state"))


async def _api_health(client, supabase_url, key, env, nu):
    """Na de uitrol van 20 okt meet /health ook de Ollama box (checks.ollama_box).

    Die check komt in dezelfde uitrol als de idempotente approval-beslissing
    (task_runtime.py), dus zijn aanwezigheid bewijst dat de VPS die ook heeft.
    """
    url = (env.get("AXE_MONITOR_API_URL") or "https://api.axecompanion.com").rstrip("/")
    r = await client.get(url + "/health")
    data = r.json() if r.is_success else None
    if not isinstance(data, dict):
        return None, f"cannot measure: /health answered {r.status_code}"
    checks = data.get("checks")
    if isinstance(checks, dict) and "ollama_box" in checks:
        return True, "live; degraded: " + (", ".join(data.get("degraded") or []) or "none")
    if isinstance(checks, dict):
        return False, "/health has checks but no ollama_box yet (20 Oct deploy not on the VPS)"
    return False, "/health has no dependency checks yet (old main.py)"


async def _push_abonnement(client, supabase_url, key, env, nu):
    """Web-push-rijen tellen niet. De A17 hoort via Device Manager + last_seen."""
    r = await client.get(supabase_url + "/rest/v1/core_axe_devices", headers=_rest(key),
                         params={"select": "device_id,platform,device_type,capabilities,last_seen",
                                 "device_type": "eq.mobile"})
    rijen = r.json() if r.is_success else None
    if not isinstance(rijen, list):
        return None, f"cannot measure: core_axe_devices answered {r.status_code}"
    sinds = nu - timedelta(hours=24)
    for x in rijen:
        if not isinstance(x, dict):
            continue
        if str(x.get("platform") or "").lower() != "android":
            continue
        caps = x.get("capabilities") or []
        if not isinstance(caps, list):
            caps = [caps]
        if "native_notify" not in caps:
            continue
        try:
            t = datetime.fromisoformat(str(x.get("last_seen") or "").replace("Z", "+00:00"))
        except ValueError:
            continue
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        if t >= sinds:
            return True, f"{x.get('device_id')} native_notify {x.get('last_seen')}"
    return False, "no Android Device Manager heartbeat with native_notify in the last 24h"


async def _inventaris_uit(client, supabase_url, key, env, nu):
    r = await client.get(supabase_url + "/rest/v1/core_schedules", headers=_rest(key),
                         params={"select": "enabled", "job_key": "eq.northsea:uitrol-inventaris"})
    rijen = r.json() if r.is_success else None
    if not isinstance(rijen, list):
        return None, f"cannot measure: core_schedules answered {r.status_code}"
    aan = any(isinstance(x, dict) and x.get("enabled") is not False for x in rijen)
    return not aan, "still enabled" if aan else "off"


METINGEN: dict[str, Meting] = {
    "build-loop-canon": _bouwlus_canon,
    "product-registry": _productregister,
    "axon-pr2-live": _axon_live,
    "northsea-n4-deploy": _northsea_n4,
    "axe-api-deploy": _api_health,
    "vps-github-key": _vps_github,
    "phone-push": _push_abonnement,
    "northsea-inventory-job-off": _inventaris_uit,
}


async def meet(client, supabase_url: str, key: str, env, nu: datetime) -> list[dict]:
    """Elke stap met done (True/False/None) en wat er gemeten is. Gooit nooit."""
    uit = []
    for actie in ACTIES:
        try:
            done, gemeten = await METINGEN[actie["id"]](client, supabase_url, key, env, nu)
        except (httpx.HTTPError, ValueError, KeyError) as e:
            done, gemeten = None, f"cannot measure: {type(e).__name__}"
        uit.append({**actie, "done": done, "measured": gemeten})
    return uit


_CACHE: dict = {}


async def meet_af_en_toe(client, supabase_url: str, key: str, env, nu: datetime) -> list[dict]:
    """meet(), maar hooguit eens per MEET_ELKE; daartussen de vorige stand."""
    if _CACHE.get("tot") and nu < _CACHE["tot"]:
        return _CACHE["stand"]
    stand = await meet(client, supabase_url, key, env, nu)
    _CACHE.update(stand=stand, tot=nu + MEET_ELKE)
    return stand


def herinnering(stand: list[dict], nu: datetime, laatst: Optional[str]) -> Optional[tuple[str, str]]:
    """(datum, tekst) als er vandaag nog herinnerd moet worden, anders None."""
    lokaal = nu.astimezone(AMSTERDAM)
    vandaag = lokaal.date().isoformat()
    open_ = [a for a in stand if a.get("done") is not True]
    if not open_ or laatst == vandaag or lokaal.hour < HERINNER_VANAF_UUR:
        return None
    regels = [f"{i}. {a['title']} ({a['measured']}). {a['how']}" for i, a in enumerate(open_, 1)]
    kop = f"Owner actions: {len(open_)} open"
    return vandaag, kop + "\n" + "\n".join(regels)


async def herinner(client, supabase_url: str, key: str, stand: list[dict], nu: datetime, map_: Path) -> bool:
    """Eén bel-rij per dag. Hetzelfde id per datum: een herhaalde poging na een
    timeout kan nooit twee rijen geven. Pas na een geslaagde schrijfactie geldt
    vandaag als gedaan."""
    pad = map_ / "eigenaar_acties.json"
    try:
        laatst = json.loads(pad.read_text()).get("laatst")
    except (OSError, ValueError):
        laatst = None
    h = herinnering(stand, nu, laatst)
    if h is None:
        return False
    datum, tekst = h
    r = await client.post(supabase_url + "/rest/v1/core_notifications", params={"on_conflict": "id"},
                          headers=_rest(key, Prefer="resolution=ignore-duplicates"),
                          json={"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"axe-eigenaar-acties/{datum}")),
                                "recipient": USER_ID, "type": "warning", "message": tekst[:1900],
                                "read": False, "created_at": nu.isoformat()})
    r.raise_for_status()
    pad.write_text(json.dumps({"laatst": datum}))
    return True
