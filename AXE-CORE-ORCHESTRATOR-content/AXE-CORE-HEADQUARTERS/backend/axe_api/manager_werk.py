"""Managers die werken zoals Grok Bot: altijd aan, ook als de app dicht is.

Luka, 20 nov 2026: "de managers moeten in plaats van alleen meldingen sturen
ook echt werken als grokbot. en ook echt nu."

Gemeten die avond: in 2 dagen ~190 meldingen van de managers, in 4 dagen maar
12 keer zelf iets opgepakt. En het antwoord op een bericht van Luka in de
Managers-tab maakte de APP (managerAntwoord.ts) -- app dicht = geen antwoord,
geen actie. Grok Bot draait op een server en is er gewoon.

Deze dienst draait elke 2 minuten op de VPS en doet drie dingen:

1. Antwoorden. Een opdracht van Luka aan een manager waar na 3 minuten nog
   geen antwoord op staat (app dicht, of de app kreeg geen model) beantwoordt
   de manager hier, met de gratis modellen (Groq, OpenRouter, de eigen
   modelbox) en zijn eigen context (manager_context.py).
2. Doen. Vraagt het werk, dan wordt het een gewone agent-taak op naam van de
   manager (core_tasks, capability agentic): de task-worker voert hem uit met
   de tools en grenzen die de manager al had. Geen mail, geen geld, geen orders.
3. Terugmelden. Is een taak van een manager klaar (of mislukt), dan vertelt
   hij Luka in de chat wat er gebeurd is -- één keer per taak.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

log = logging.getLogger("axe_manager_werk")

MANAGERS: tuple[str, ...] = ("axemanager", "projectsmgr", "companionmgr", "axon", "tradingos", "northseamgr")
LUKA = "luka"
ANTWOORD_NA = timedelta(minutes=3)       # zo lang krijgt de app de kans
NIET_OUDER_DAN = timedelta(hours=24)     # oudere opdrachten niet alsnog oprakelen
MAX_ANTWOORDEN_PER_RONDE = 2
MAX_TAKEN_PER_DAG = 8                    # per manager
GRATIS = ("groq", "openrouter", "ollama")
OPEN = ("pending", "queued", "retrying", "waiting_approval", "planning", "running", "in_progress", "verifying")
KLAAR = ("completed", "failed", "cancelled", "blocked")

NAAM = {
    "axemanager": "AXE CORE Manager (de baas)", "projectsmgr": "Projects Manager",
    "companionmgr": "AXE Companion Manager", "axon": "AXON Memory Manager",
    "tradingos": "Trading OS Manager", "northseamgr": "NorthSea Desk Manager",
}


def _tijd(s: Any) -> datetime | None:
    try:
        t = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


# ── 1. welke opdrachten wachten op een antwoord ────────────────────────────

def onbeantwoord(berichten: list[dict[str, Any]], agent: str, nu: datetime) -> list[dict[str, Any]]:
    """Opdrachten van Luka aan `agent` zonder antwoord van `agent` erna.

    Puur: krijgt de draad (alle richtingen, willekeurige volgorde)."""
    eigen = sorted(
        (b for b in berichten
         if (b.get("from_agent") == LUKA and b.get("to_agent") == agent and b.get("kind") == "directive")
         or (b.get("from_agent") == agent and b.get("to_agent") == LUKA)),
        key=lambda b: _tijd(b.get("created_at")) or nu,
    )
    wacht: list[dict[str, Any]] = []
    for b in eigen:
        if b.get("from_agent") == agent:
            wacht = []                      # alles daarvoor is beantwoord
        else:
            wacht.append(b)
    return [b for b in wacht
            if (t := _tijd(b.get("created_at"))) and ANTWOORD_NA <= nu - t <= NIET_OUDER_DAN]


# ── 2. het antwoord + wat er gedaan moet worden ────────────────────────────

SYSTEEM = """Je bent {naam}, een van de managers van AXE CORE, het bedrijfssysteem van Luka.
Je werkt zoals Grok Bot: je bent altijd aan, je denkt mee als mede-oprichter en je
DOET het werk zelf in plaats van het alleen te melden.

Grenzen (hard): nooit mail of berichten versturen, nooit geld, betalingen of
abonnementen, nooit trading-orders, nooit iets goedkeuren namens Luka, nooit
productie-deploys buiten de normale weg, nooit iets verwijderen zonder Luka,
nooit sleutels/geheimen wijzigen (Vercel, Supabase, .env): dat doet alleen Luka --
zeg hem dan precies welke en waar.

Antwoord ALLEEN met JSON, zonder uitleg eromheen:
{{"antwoord": "<wat je Luka terugzegt: kort, gewone taal, Nederlands>",
  "taken": ["<concrete opdracht die je nu zelf uitvoert met je tools>", ...]}}

- "taken" leeg als er niets te doen is (een vraag, een bedankje).
- Elke taak is één zelfstandige opdracht met genoeg context om zonder het gesprek uit
  te voeren. Hooguit 3.
- Kun je iets niet zelf (een login, een betaling, een keuze van Luka), zeg dan in
  "antwoord" precies wat Luka moet doen, en maak er geen taak van.
- Zeg in "antwoord" wat je gaat doen ("Ik ga nu ..."), niet "ik zal het doorgeven".

METINGEN VAN NU (zojuist gemeten -- dit is de waarheid; oude verslagen hieronder
kunnen fout zijn, en spreken ze een meting tegen, dan geldt de meting):
{metingen}

- Een taak is een DOEL in gewone zinnen ("Zoek uit waarom feed X sinds gisteren
  niet ververst en repareer het"), nooit een los shell-commando.
- Staat een fout al bij "Al gedaan op orchestrator", of was hij lang niet meer
  (zie "laatst ... geleden"), dan is hij waarschijnlijk opgelost: maak er hooguit
  een korte controle-taak van, geen nieuwe reparatie.
- Beweer niets over je terrein dat niet in de metingen of je context staat; weet je
  het niet, maak er dan een uitzoek-taak van.

Wat je verder weet (open taken, eerdere verslagen -- kan verouderd zijn):
{context}"""


def _json_uit(tekst: str) -> dict[str, Any] | None:
    m = re.search(r"\{.*\}", tekst or "", re.S)
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
    except ValueError:
        return None
    return d if isinstance(d, dict) else None


def lees_antwoord(tekst: str) -> tuple[str, list[str]]:
    """Model-uitvoer → (antwoord, taken). Geen JSON = de tekst zelf, geen taken."""
    d = _json_uit(tekst)
    if not d:
        return (tekst or "").strip()[:3000], []
    antwoord = str(d.get("antwoord") or "").strip()[:3000]
    taken = [str(t).strip()[:1500] for t in (d.get("taken") or []) if str(t).strip()][:3]
    return antwoord, taken


def _draai(coro_maker: Callable[[], Any]) -> Any:
    """Async LLM-aanroep vanuit deze sync dienst, ook als er al een loop draait."""
    uit: dict[str, Any] = {}

    def doe() -> None:
        try:
            uit["v"] = asyncio.run(coro_maker())
        except Exception as e:  # noqa: BLE001
            uit["e"] = e

    t = threading.Thread(target=doe, daemon=True)
    t.start()
    t.join(150)
    if "e" in uit:
        raise uit["e"]
    if "v" not in uit:
        raise TimeoutError("geen antwoord binnen 150 s")
    return uit["v"]


# Kopjes in manager_context waaronder de manager zijn EIGEN eerdere conclusies
# terugleest. 20 nov gemeten: een fout verslag ("Companion draait niet, de
# database is leeg") ging zo elke ronde opnieuw mee als feit, en won het van een
# meting die zei dat de site HTTP 200 gaf. Die blokken laten we hier weg.
_ZELFVERSTERKEND = ("Je laatste taakverslagen", "Wat je zelf laatst zei/deed")


def zonder_eigen_verslagen(tekst: str) -> str:
    uit: list[str] = []
    overslaan = False
    for regel in (tekst or "").splitlines():
        if regel.strip() and not regel.startswith(("-", " ")):
            overslaan = regel.strip().startswith(_ZELFVERSTERKEND)
        if not overslaan:
            uit.append(regel)
    return "\n".join(uit).strip()


def _context(db: Any, agent: str) -> str:
    try:
        import manager_context as _mc
        tekst, _bronnen = _mc.lees_context_met_bronnen(db, agent)
        return zonder_eigen_verslagen(tekst or "")[:6000]
    except Exception:  # noqa: BLE001 -- zonder context antwoordt hij nog steeds
        return "(context niet beschikbaar)"


APP_VAN = {"companionmgr": "AXE Companion", "tradingos": "Trading OS", "northseamgr": "NorthSea",
           "projectsmgr": "AXE Core", "axemanager": "AXE Core", "axon": "AXON Memory"}


def _http_status(url: str, timeout: float = 8.0) -> str:
    try:
        import httpx
        r = httpx.get(url, timeout=timeout, follow_redirects=True)
        return f"HTTP {r.status_code}"
    except Exception as e:  # noqa: BLE001
        return f"onbereikbaar ({e.__class__.__name__})"


def metingen(db: Any, agent: str, nu: datetime, http: Callable[[str], str] | None = None) -> list[str]:
    """Wat er NU waar is in het terrein van deze manager. Elke meting los: één
    die faalt houdt de rest niet tegen."""
    http = http or _http_status
    regels: list[str] = []

    def meet(fn: Callable[[], str | None]) -> None:
        try:
            r = fn()
            if r:
                regels.append(r)
        except Exception as e:  # noqa: BLE001
            regels.append(f"(meting mislukt: {str(e)[:80]})")

    if agent in ("companionmgr", "tradingos"):
        def feeds() -> str:
            rijen = (db.table("intel_sync_log").select("feed_id,last_sync_at,last_error").limit(200)
                     .execute().data) or []
            vers = [r for r in rijen if (t := _tijd(r.get("last_sync_at"))) and nu - t < timedelta(hours=26)]
            fout = [r["feed_id"] for r in rijen if str(r.get("last_error") or "").strip()]
            return (f"Intel-feeds: {len(vers)} van {len(rijen)} ververst in de laatste 26 uur"
                    + (f"; met fout: {', '.join(map(str, fout[:6]))}" if fout else "; geen fouten"))
        meet(feeds)
    if agent == "companionmgr":
        meet(lambda: f"axecompanion.com: {http('https://axecompanion.com')}")
    if agent == "northseamgr":
        meet(lambda: f"NorthSea-server (MCP): {http('http://127.0.0.1:8040/health', 5.0)}")
    if agent in ("projectsmgr", "axemanager"):
        def taken() -> str:
            rijen = (db.table("core_tasks").select("status,error,created_at")
                     .gte("created_at", (nu - timedelta(hours=24)).isoformat()).limit(500).execute().data) or []
            tel: dict[str, int] = {}
            for r in rijen:
                tel[str(r.get("status"))] = tel.get(str(r.get("status")), 0) + 1
            oorzaken: dict[str, list[datetime]] = {}
            for r in rijen:
                if r.get("status") != "failed":
                    continue
                e = r.get("error")
                m = " ".join(str((e.get("message") if isinstance(e, dict) else e) or "?").split())[:90]
                if (t := _tijd(r.get("created_at"))):
                    oorzaken.setdefault(m, []).append(t)
            # Hard, niet aan het model overgelaten (20 nov: Groq bleef een fout
            # 'oplossen' die al 21 uur niet meer voorkwam): wat > 3 uur stil is,
            # heet gestopt en staat apart.
            actief = {m: ts for m, ts in oorzaken.items() if nu - max(ts) <= timedelta(hours=3)}
            gestopt = {m: ts for m, ts in oorzaken.items() if nu - max(ts) > timedelta(hours=3)}
            top = sorted(actief.items(), key=lambda x: -len(x[1]))[:3]

            def geleden(t: datetime) -> str:
                u = int((nu - t).total_seconds() // 3600)
                return f"{u} u geleden" if u else f"{int((nu - t).total_seconds() // 60)} min geleden"
            uit = (f"Taken laatste 24 uur: {', '.join(f'{k} {v}' for k, v in sorted(tel.items()))}. "
                   + ("Faalt NU (laatste 3 uur): " + " | ".join(
                       f"{len(ts)}x {m} (laatst {geleden(max(ts))})" for m, ts in top) if top
                      else "Faalt NU: niets in de laatste 3 uur."))
            if gestopt:
                uit += (" Gestopt (al > 3 uur niet meer, vermoedelijk opgelost -- NIET opnieuw repareren): "
                        + " | ".join(f"{m[:60]} (laatst {geleden(max(ts))})" for m, ts in
                                     sorted(gestopt.items(), key=lambda x: -len(x[1]))[:3]))
            return uit
        meet(taken)

        def commits() -> str | None:
            # Wat er al gerepareerd is (20 nov: de proef wilde een fout oplossen
            # die een uur eerder al op orchestrator stond).
            import httpx, os
            tok = (os.environ.get("GITHUB_TOKEN") or "").strip()
            if not tok:
                return None
            r = httpx.get("https://api.github.com/repos/Ldezeeuw445/AXE-CORE-/commits",
                          params={"sha": "orchestrator", "since": (nu - timedelta(hours=24)).isoformat(), "per_page": 12},
                          headers={"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"}, timeout=8)
            if r.status_code != 200:
                return None
            kop = [str((c.get("commit") or {}).get("message") or "").split("\n")[0][:100] for c in r.json()]
            return ("Al gedaan op orchestrator (24 u, staat binnen ~30 min op beide Macs): "
                    + " | ".join(kop)) if kop else None
        meet(commits)
    if agent in ("projectsmgr", "axemanager"):
        def strato() -> str:
            # 20 nov: de eerste eigen ronde wilde "de sleutel dax-northsea-01
            # repareren" terwijl de hele DAX-server onbereikbaar was.
            import os, socket
            host = (os.environ.get("AXE_DAX_DOCKER_HOST_STRATO") or "").split("@")[-1].split(":")[0].strip("/")
            if not host:
                return "DAX-server (Strato): niet ingesteld"
            try:
                socket.create_connection((host, 22), timeout=5).close()
                return "DAX-server (Strato): bereikbaar"
            except OSError:
                return ("DAX-server (Strato): ONBEREIKBAAR. Alle DAX-fouten (docker inspect, dax-*-logins) "
                        "komen hiervandaan; alleen Luka kan hem herstarten in het Strato-paneel. "
                        "Repareer niets aan DAX zelf.")
        meet(strato)
    app = APP_VAN.get(agent)
    if app:
        def sleutels() -> str:
            import sleutels as _sl
            p = _sl.problemen(_sl.lees(db, nu), app)
            return "Sleutels: " + ("; ".join(p[:4]) if p else "geen kapotte of ontbrekende verplichte sleutels")
        meet(sleutels)
    return regels or ["(geen metingen voor dit terrein)"]


def denk(db: Any, agent: str, opdrachten: list[dict[str, Any]], geschiedenis: list[dict[str, Any]],
         chat: Callable[..., Any] | None = None) -> tuple[str, list[str], str]:
    """Het model vragen. Geeft (antwoord, taken, welk model)."""
    berichten: list[dict[str, str]] = [
        {"role": "system", "content": SYSTEEM.format(
            naam=NAAM.get(agent, agent), context=_context(db, agent),
            metingen="\n".join(f"- {r}" for r in metingen(db, agent, datetime.now(timezone.utc))))}]
    for b in geschiedenis[-10:]:
        rol = "user" if b.get("from_agent") == LUKA else "assistant"
        berichten.append({"role": rol, "content": str(b.get("body") or "")[:1500]})
    berichten.append({"role": "user", "content": "\n\n".join(str(o.get("body") or "") for o in opdrachten)[:4000]})
    if chat is None:
        import llm_cascade as _llm
        tekst, model = _draai(lambda: _llm.chat(berichten, max_tokens=900, timeout=45.0, alleen=GRATIS))
    else:
        tekst, model = chat(berichten)
    antwoord, taken = lees_antwoord(tekst)
    return antwoord, taken, model


# ── opslaan ────────────────────────────────────────────────────────────────

def _taken_vandaag(db: Any, agent: str, nu: datetime) -> int:
    try:
        rijen = (db.table("core_tasks").select("id").eq("requested_by", agent)
                 .gte("created_at", (nu - timedelta(hours=24)).isoformat()).limit(50).execute().data) or []
        return len(rijen)
    except Exception:  # noqa: BLE001
        return MAX_TAKEN_PER_DAG  # niet kunnen tellen = voorzichtig: geen nieuwe


def maak_taak(db: Any, agent: str, opdracht: str, nu: datetime, bron_id: Any = None) -> dict[str, Any] | None:
    rij = {
        "title": f"{NAAM.get(agent, agent).split(' (')[0]}: {opdracht[:90]}",
        "goal": (f"You are {agent}, one of the AXE managers, working for Luka like Grok Bot does: you do the work "
                 f"yourself. Task from your conversation with Luka:\n\n{opdracht}\n\n"
                 "Use your tools: read the relevant code, logs and state, then act. Stay inside your limits "
                 "(no mail, no money, no orders, no approvals on Luka's behalf, no production deploys outside the "
                 "normal path, no deleting). If something truly needs Luka (a login, a payment, a decision), say "
                 "exactly what he must do. End with: what you found, what you changed, and whether it is done."),
        "status": "queued", "priority": "high", "source_app": "axe_core",
        "requested_by": agent, "capability": "agentic", "assignee": agent,
        "metadata": {"agent": agent, "manager": True, "uit_gesprek": True, "bericht_id": bron_id, "app": "axe_core"},
        "created_at": nu.isoformat(),
    }
    try:
        data = db.table("core_tasks").insert(rij).execute().data or []
        return data[0] if data else rij
    except Exception as e:  # noqa: BLE001
        log.warning("taak maken voor %s mislukte: %s", agent, e)
        return None


def _zeg(db: Any, agent: str, tekst: str) -> None:
    db.table("core_manager_messages").insert({
        "from_agent": agent, "to_agent": LUKA, "kind": "report", "body": tekst[:4000]}).execute()


# ── 3. terugmelden als een taak klaar is ───────────────────────────────────

def _samenvatting(t: dict[str, Any]) -> str:
    for veld in ("result", "error"):
        v = t.get(veld)
        if isinstance(v, dict):
            for k in ("summary", "output", "message", "text"):
                if isinstance(v.get(k), str) and v[k].strip():
                    return " ".join(v[k].split())[:600]
        elif isinstance(v, str) and v.strip():
            return " ".join(v.split())[:600]
    return ""


def meld_tekst(t: dict[str, Any]) -> str:
    titel = str(t.get("title") or "taak").split(": ", 1)[-1]
    wat = _samenvatting(t)
    if t.get("status") == "completed":
        return f"Klaar: {titel}." + (f"\n\n{wat}" if wat else "")
    return (f"Dit lukte niet: {titel} ({t.get('status')})." + (f"\n\n{wat}" if wat else "")
            + "\n\nIk kijk of ik het anders kan oplossen; lukt dat niet, dan zeg ik je wat er nodig is.")


def meld_klaar(db: Any, nu: datetime) -> int:
    try:
        rijen = (db.table("core_tasks").select("id,title,status,result,error,metadata,requested_by,completed_at")
                 .in_("requested_by", list(MANAGERS)).in_("status", list(KLAAR))
                 .gte("completed_at", (nu - NIET_OUDER_DAN).isoformat()).limit(50).execute().data) or []
    except Exception:  # noqa: BLE001
        return 0
    n = 0
    for t in rijen:
        meta = t.get("metadata") or {}
        if not meta.get("manager") or meta.get("gemeld"):
            continue
        try:
            _zeg(db, t["requested_by"], meld_tekst(t))
            db.table("core_tasks").update({"metadata": {**meta, "gemeld": nu.isoformat()}}).eq("id", t["id"]).execute()
            n += 1
        except Exception as e:  # noqa: BLE001
            log.warning("terugmelden %s mislukte: %s", t.get("id"), e)
    return n


# ── de dienst ──────────────────────────────────────────────────────────────

def _draad(db: Any, nu: datetime) -> list[dict[str, Any]]:
    return (db.table("core_manager_messages").select("id,from_agent,to_agent,kind,body,created_at")
            .or_(f"from_agent.eq.{LUKA},to_agent.eq.{LUKA}")
            .gte("created_at", (nu - timedelta(days=3)).isoformat())
            .order("created_at", desc=True).limit(400).execute().data) or []


def run(db: Any, nu: datetime, chat: Callable[..., Any] | None = None) -> dict[str, Any]:
    uit: dict[str, Any] = {"beantwoord": [], "taken": 0, "gemeld": 0, "fouten": []}
    try:
        berichten = _draad(db, nu)
    except Exception as e:  # noqa: BLE001
        return {**uit, "fouten": [f"draad: {e}"[:200]]}
    rondes = 0
    for agent in MANAGERS:
        if rondes >= MAX_ANTWOORDEN_PER_RONDE:
            break
        wacht = onbeantwoord(berichten, agent, nu)
        if not wacht:
            continue
        rondes += 1
        geschiedenis = sorted(
            (b for b in berichten if (b.get("from_agent") == LUKA and b.get("to_agent") == agent)
             or (b.get("from_agent") == agent and b.get("to_agent") == LUKA)),
            key=lambda b: str(b.get("created_at")))
        geschiedenis = [b for b in geschiedenis if b not in wacht]
        try:
            antwoord, taken, model = denk(db, agent, wacht, geschiedenis, chat=chat)
        except Exception as e:  # noqa: BLE001
            uit["fouten"].append(f"{agent}: {e}"[:200])
            continue
        ruimte = max(0, MAX_TAKEN_PER_DAG - _taken_vandaag(db, agent, nu))
        gestart = [t for t in taken[:ruimte] if maak_taak(db, agent, t, nu, wacht[-1].get("id"))]
        if taken and not gestart:
            antwoord += "\n\n(Ik zit aan mijn maximum van vandaag; ik pak dit morgen op, of zeg het als het nu moet.)"
        if not antwoord:
            antwoord = "Ik ga ermee aan de slag." if gestart else "Gezien."
        if gestart:
            antwoord += "\n\nGestart:\n" + "\n".join(f"- {t[:160]}" for t in gestart)
        _zeg(db, agent, antwoord)
        uit["beantwoord"].append({"agent": agent, "model": model, "taken": len(gestart)})
        uit["taken"] += len(gestart)
    uit["gemeld"] = meld_klaar(db, nu)
    # Eén eigen ronde per run (max ~60 s), de managers om de beurt: elke 2 min één.
    if not uit["beantwoord"]:
        agent = MANAGERS[(nu.hour * 30 + nu.minute // 2) % len(MANAGERS)]
        try:
            if (gestart := eigen_ronde(db, agent, nu, chat=chat)):
                uit["eigen_ronde"] = {"agent": agent, "taak": gestart[:120]}
                uit["taken"] += 1
        except Exception as e:  # noqa: BLE001
            uit["fouten"].append(f"ronde {agent}: {e}"[:200])
    return uit


# ── 4. eigen initiatief: zonder dat Luka iets vraagt ───────────────────────

RONDE_ELKE = timedelta(hours=2)
RONDE_VRAAG = ("Je eigen ronde (Luka vroeg niets): kijk naar je metingen. Is er iets dat NU faalt of "
               "stuk is in jouw terrein en dat je zelf kunt oplossen? Pak dan precies één ding op als taak "
               "en zeg in één zin wat en waarom. Is alles in orde of is niets van jou op te lossen, geef dan "
               "\"taken\": [] en als antwoord alleen: \"rustig\".")


def _laatste_ronde(db: Any, agent: str) -> datetime | None:
    try:
        rijen = (db.table("core_tasks").select("created_at,status,metadata").eq("requested_by", agent)
                 .order("created_at", desc=True).limit(20).execute().data) or []
    except Exception:  # noqa: BLE001
        return datetime.now(timezone.utc)  # niet kunnen lezen = deze ronde overslaan
    for r in rijen:
        if (r.get("metadata") or {}).get("eigen_ronde"):
            return _tijd(r.get("created_at"))
    return None


def _heeft_open_taak(db: Any, agent: str) -> bool:
    try:
        return bool((db.table("core_tasks").select("id").eq("requested_by", agent)
                     .in_("status", list(OPEN)).limit(1).execute().data) or [])
    except Exception:  # noqa: BLE001
        return True


def eigen_ronde(db: Any, agent: str, nu: datetime, chat: Callable[..., Any] | None = None) -> str | None:
    """Eén initiatief-ronde. Geeft de gestarte taak, of None."""
    laatst = max([t for t in (_laatste_ronde(db, agent), _RUSTIG.get(agent)) if t], default=None)
    if laatst and nu - laatst < RONDE_ELKE:
        return None
    if _heeft_open_taak(db, agent) or _taken_vandaag(db, agent, nu) >= MAX_TAKEN_PER_DAG:
        return None
    antwoord, taken, _model = denk(db, agent, [{"body": RONDE_VRAAG}], [], chat=chat)
    if not taken:
        # Ook een rustige ronde telt, anders vraagt hij het elke 2 minuten opnieuw.
        _markeer_ronde(db, agent, nu)
        return None
    taak = maak_taak(db, agent, taken[0], nu)
    if not taak:
        return None
    if taak.get("id"):
        try:
            meta = {**(taak.get("metadata") or {}), "eigen_ronde": True}
            db.table("core_tasks").update({"metadata": meta}).eq("id", taak["id"]).execute()
        except Exception:  # noqa: BLE001
            pass
    zin = antwoord if antwoord and antwoord.lower() != "rustig" else "Ik zag iets dat ik zelf kan oplossen."
    _zeg(db, agent, f"{zin}\n\nIk pak dit nu zelf op:\n- {taken[0][:200]}")
    return taken[0]


def _markeer_ronde(db: Any, agent: str, nu: datetime) -> None:
    """Een rustige ronde vastleggen zonder een taak te maken: in de agent-events."""
    _RUSTIG[agent] = nu


_RUSTIG: dict[str, datetime] = {}


def dienst() -> dict[str, Any]:
    return {
        "agent": "managerwerk", "name": "Managers aan het werk",
        "job_key": "axe_core:staande-managerwerk", "cron_expr": "*/2 * * * *",
        "wat": "Answer Luka's messages to the managers (also with the app closed), turn the work into "
               "manager tasks, report back when they finish. Free models only. No mail, money or orders.",
        "run": run,
    }


__all__ = ["run", "dienst", "onbeantwoord", "lees_antwoord", "meld_tekst", "meld_klaar"]
