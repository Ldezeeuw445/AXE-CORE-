"""De zes Grok Bot-managers: identiteit, pulse, peer-berichten, harde grenzen.

Luka, 27 okt 2026: dezelfde bots als in Grok Bot, naast de bestaande
24/7-agents, niet in plaats van. staande_diensten.py plant de pulses;
deze module voert ze uit. Geen tweede war room, geen mail, geen orders,
geen geld, geen auto_send_*-vlaggen.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime
from typing import Any

log = logging.getLogger("axe_grok_managers")

GROK_IDS: tuple[str, ...] = (
    "axemanager",
    "projectsmgr",
    "companionmgr",
    "axon",
    "tradingos",
    "northseamgr",
)

BAAS = "axemanager"

AUTO_SEND_VLAGGEN = (
    "auto_send_qualification",
    "auto_reply_nonbinding",
    "auto_send_followups",
)

REPO_SCOPE: dict[str, dict[str, Any]] = {
    "axemanager": {"repos": ["AXE-CORE-"], "tools": "full"},
    "projectsmgr": {"repos": ["AXE-CORE-"], "tools": "write"},
    "companionmgr": {"repos": ["AXE-COMPANION-OS-"], "tools": "write"},
    "axon": {"repos": ["axon-memory"], "supabase": "ktaditgtbubonrahyiig", "tools": "write"},
    "tradingos": {"repos": ["trading-os-app", "axe-trading-core", "TRADING-OS"], "tools": "read"},
    "northseamgr": {"repos": ["AXE-CORE-"], "tools": "read"},
}

PULSE_CRON: dict[str, str] = {
    "axemanager": "*/10 * * * *",
    "projectsmgr": "*/15 * * * *",
    "companionmgr": "*/20 * * * *",
    "axon": "*/20 * * * *",
    "tradingos": "*/15 * * * *",
    "northseamgr": "*/15 * * * *",
}

_SEND_RE = re.compile(
    r"\b(send[-_ ]?email|send[-_ ]?message|verstuur|outbound|smtp|mailgun|sendgrid|imessage|whatsapp)\b",
    re.I,
)
_TRADE_RE = re.compile(
    r"\b(place[-_ ]?order|live[-_ ]?order|broker|metaapi|mt5|open (a )?(long|short)|market order)\b",
    re.I,
)
_MONEY_RE = re.compile(r"\b(wire[-_ ]?transfer|send[-_ ]?money|buy credits|top up|iban|bank details)\b", re.I)
_DEAL_RE = re.compile(
    r"\b(deal go|go/no-go|stage move|close (the )?deal|disclose (identity|counterparty)|auto_disclose)\b",
    re.I,
)
_NON_HUMAN = re.compile(r"manager|service:|bot\b|axe-core|northsea-desk|\bagent\b", re.I)


class Verboden(ValueError):
    """Harde grens: de pulse mag dit niet doen."""

    def __init__(self, code: str, reason: str):
        super().__init__(reason)
        self.code = code
        self.reason = reason


def is_human_principal(principal: str | None, client_id: str | None = None) -> bool:
    """Alleen Luka (allowlist). Een manager keurt nooit zichzelf goed."""
    p = (principal or "").strip().lower()
    c = (client_id or "").strip().lower()
    if not p:
        return False
    if p in GROK_IDS or c in GROK_IDS:
        return False
    if _NON_HUMAN.search(p) or (c and _NON_HUMAN.search(c)):
        return False
    allowed = {
        x.strip().lower()
        for x in os.environ.get("NORTHSEA_HUMAN_PRINCIPALS", "").split(",")
        if x.strip()
    }
    allowed.update({"luka", "claude-ai"})
    return p in allowed


def mag_peer_bericht(from_agent: str, to_agent: str) -> bool:
    if from_agent not in GROK_IDS or to_agent not in GROK_IDS or from_agent == to_agent:
        return False
    if from_agent == BAAS:
        return True
    return to_agent == BAAS


def toets_actie(
    soort: str,
    tekst: str = "",
    *,
    principal: str | None = None,
    client_id: str | None = None,
    bestaande_thread: bool = False,
    luka_ja: bool = False,
) -> None:
    blob = f"{soort} {tekst}".lower()
    if any(v in blob for v in AUTO_SEND_VLAGGEN):
        raise Verboden("auto_send", "Never flip auto_send_* flags.")
    if _TRADE_RE.search(blob) or soort == "live_order":
        raise Verboden("live_trade", "No live trading orders.")
    if _MONEY_RE.search(blob) or soort == "money":
        raise Verboden("money", "No money movement.")
    if _DEAL_RE.search(blob) or soort == "deal_move":
        raise Verboden("deal", "No deal go/no-go, stage move or identity disclosure.")
    if _SEND_RE.search(blob) or soort == "send":
        chase_ok = bestaande_thread and luka_ja and is_human_principal(principal, client_id)
        if not chase_ok:
            if not is_human_principal(principal, client_id):
                raise Verboden(
                    "not_human",
                    "Sends need Luka (is_human). Managers cannot approve themselves.",
                )
            raise Verboden(
                "send",
                "No out-of-plan send. Existing-thread chase only after Luka's own yes.",
            )


def _rijen(db: Any, tabel: str, kolommen: str, limiet: int = 200, **eq: Any) -> list[dict[str, Any]]:
    try:
        q = db.table(tabel).select(kolommen)
        for k, v in eq.items():
            q = q.eq(k, v)
        return q.limit(limiet).execute().data or []
    except Exception as exc:  # noqa: BLE001
        log.warning("grok: %s onleesbaar (%s)", tabel, exc)
        return []


def _schrijf(db: Any, tabel: str, rij: dict[str, Any]) -> dict[str, Any] | None:
    try:
        data = db.table(tabel).insert(rij).execute().data or []
        return data[0] if data else rij
    except Exception as exc:  # noqa: BLE001
        log.warning("grok: kon %s niet schrijven (%s)", tabel, exc)
        return None


def stuur_bericht(db: Any, from_agent: str, to_agent: str, kind: str, body: str) -> dict[str, Any] | None:
    if not mag_peer_bericht(from_agent, to_agent):
        raise Verboden("peer", f"{from_agent} may not message {to_agent}")
    toets_actie(kind, body)
    return _schrijf(db, "core_manager_messages", {
        "from_agent": from_agent,
        "to_agent": to_agent,
        "kind": kind,
        "body": body[:4000],
    })


def inbox(db: Any, agent: str) -> list[dict[str, Any]]:
    return [
        r for r in _rijen(db, "core_manager_messages", "id,from_agent,to_agent,kind,body,created_at,read_at", limiet=80)
        if r.get("to_agent") == agent and not r.get("read_at")
    ]


def _les_schrijven(db: Any, agent: str, les: str) -> str:
    """Alleen een échte les, via het geheugenhek (cap 120, geen HOLD/cycle)."""
    if not les or not les.strip():
        return "leeg"
    try:
        from memory_schrijfhek import inhoud_hash, mag_schrijven
    except Exception:  # noqa: BLE001
        return "hek_ontbreekt"
    reden = mag_schrijven(key=f"mgr:{agent}:les", content=les)
    if reden != "ok":
        return reden
    h = inhoud_hash(les)
    _schrijf(db, "memory", {
        "agent": f"axe_{agent}",
        "kind": "lesson",
        "key": f"mgr:{agent}:les:{h}",
        "content": les.strip()[:2000],
        "source": f"standing:{agent}",
        "metadata": {"agentId": agent, "kind": "lesson"},
    })
    return "ok"


def _vraag_luka(db: Any, agent: str, wat: str, waarom: str) -> None:
    """Zet een echte core_approvals-rij klaar. Managers keuren dit niet zelf."""
    toets_actie("ask", wat)
    bestaande = _rijen(db, "core_approvals", "id,title,status", status="pending")
    if any((r.get("title") or "") == wat for r in bestaande):
        return
    taak = _schrijf(db, "core_tasks", {
        "title": wat,
        "status": "waiting_approval",
        "assignee": agent,
        "capability": "task_manage",
        "source_app": "axe_core",
        "metadata": {"agent": agent, "goedkeuring": "nodig", "manager": True},
        "goal": waarom,
    })
    taak_id = (taak or {}).get("id")
    # Via de ene helper die de planner en de crews ook gebruiken. Hier stond
    # een eigen insert met de kolommen `wat` en `waarom`, die core_approvals
    # niet heeft: de insert faalde stil (_schrijf slikt fouten), dus sinds
    # 27 okt heeft geen manager ooit een kaart bij Luka kunnen neerleggen.
    # Gevonden 6 nov: de NorthSea-melding kwam wel, de kaart niet.
    if not taak_id:
        return
    from goedkeuring_melding import vraag_luka
    vraag_luka(
        db, taak_id,
        titel=wat, detail=waarom, kind="manager_ask",
        requested_by=agent, metadata={"agent": agent, "manager": True},
    )


def run_axemanager(db: Any, nu: datetime) -> dict[str, Any]:
    """Baas: leest rapporten, stuurt richting, beveelt eerst, vraagt Luka zelden."""
    pending = _rijen(db, "core_approvals", "id,title,status", status="pending")
    taken = _rijen(db, "core_tasks", "id,status,assignee")
    rapporten = inbox(db, BAAS)
    roosters = _rijen(db, "core_schedules", "name,job_key,last_status,last_result,enabled")
    mgr_jobs = [r for r in roosters if str(r.get("job_key") or "").startswith("axe_core:staande-")
                and any(k in str(r.get("job_key")) for k in GROK_IDS)]
    for r in rapporten:
        try:
            db.table("core_manager_messages").update({
                "read_at": nu.isoformat(),
            }).eq("id", r["id"]).execute()
        except Exception:  # noqa: BLE001
            pass
    queued = sum(1 for t in taken if t.get("status") in ("queued", "retrying", "pending", "waiting_approval"))
    aanbeveling = (
        f"Aanbeveling: {len(pending)} vragen voor jou, {queued} taken open, "
        f"{len(rapporten)} rapporten van managers."
        if pending or queued or rapporten else
        "Aanbeveling: niets buiten het plan; managers lopen, geen ja nodig."
    )
    for andere in GROK_IDS:
        if andere == BAAS:
            continue
        stuur_bericht(db, BAAS, andere, "directive",
                      f"Pulse {nu.strftime('%H:%M')} UTC. Rapporteer blokkades; stuur niets, verhandel niets.")
    return {
        "job": "orchestrate managers",
        "aanbeveling": aanbeveling,
        "pending_ok": len(pending),
        "queued": queued,
        "rapporten": len(rapporten),
        "manager_jobs": len(mgr_jobs),
        "taal": "nl",
    }


OPEN_TAAK = ("pending", "queued", "retrying", "waiting_approval", "planning", "running", "in_progress", "verifying")


def _open_taken(db: Any) -> list[dict[str, Any]]:
    """Alleen de open rijen. Zonder filter las de manager 200 willekeurige van
    ruim 2.200 taken (vooral oude afgeronde) en telde daarop."""
    try:
        return (db.table("core_tasks").select("id,status,assignee,title,capability,created_at,updated_at,metadata")
                .in_("status", list(OPEN_TAAK)).limit(1000).execute().data) or []
    except Exception as exc:  # noqa: BLE001
        log.warning("grok: open taken onleesbaar (%s)", exc)
        return []


def _rapporteer_bij_verandering(db: Any, agent: str, body: str) -> bool:
    """Een rapport aan de baas alleen als het iets nieuws zegt.

    Elk kwartier "31 open rows" is ruis in het managersgesprek dat Luka leest.
    """
    try:
        eerdere = (db.table("core_manager_messages").select("body,created_at").eq("from_agent", agent)
                   .eq("to_agent", BAAS).eq("kind", "report").order("created_at", desc=True)
                   .limit(1).execute().data) or []
    except Exception:  # noqa: BLE001 -- liever één rapport te veel dan stil
        eerdere = []
    if eerdere and (eerdere[0].get("body") or "").strip() == body.strip():
        return False
    stuur_bericht(db, agent, BAAS, "report", body)
    return True


def _dagoverzicht(db: Any, nu: datetime, naam: str, bevindingen: list[Any]) -> bool:
    if not _dagoverzicht_tijd(nu):
        return False
    try:
        from goedkeuring_melding import schrijf_goedkeuring_melding
        regels = [f"{b.titel}. {b.detail}".strip() for b in bevindingen][:5]
        # Zelfde kop binnen 24 uur = geen tweede (ontdubbeling in de melding).
        return schrijf_goedkeuring_melding(
            db, f"{naam} vandaag {nu.strftime('%d-%m')}", " | ".join(regels) or "Niets dat op jou wacht.") is not None
    except Exception:  # noqa: BLE001
        return False


def _ruim_dubbele_voorstellen_op(db: Any, rijen: list[dict[str, Any]], nu: datetime) -> list[dict[str, Any]]:
    """Wat de manager zelf mag oplossen: dubbele `pending`-voorstellen.

    Alleen voorstellen die nog niemand oppakte; de nieuwste blijft staan, de
    rest wordt `cancelled` met de reden erbij (terug te zetten als het fout was).
    """
    import projecten_bewaker as pb
    opgeruimd = []
    for r in pb.dubbele_voorstellen(rijen)[:pb.MAX_OPRUIMEN_PER_PULSE]:
        meta = r.get("metadata") if isinstance(r.get("metadata"), dict) else {}
        try:
            db.table("core_tasks").update({
                "status": "cancelled",
                "metadata": {**meta, "opgeruimd_door": "projectsmgr", "reden": "dubbel voorstel",
                             "opgeruimd_op": nu.isoformat()},
            }).eq("id", r["id"]).eq("status", "pending").execute()
            opgeruimd.append(r)
        except Exception as exc:  # noqa: BLE001
            log.warning("projectsmgr: kon dubbel voorstel %s niet opruimen (%s)", r.get("id"), exc)
    return opgeruimd


def run_projectsmgr(db: Any, nu: datetime) -> dict[str, Any]:
    """Eigenaar van de takenlijst: ziet wat stilstaat, ruimt dubbels op, roept
    Luka alleen voor wat hij zelf niet kan oplossen."""
    import projecten_bewaker as pb
    rijen = _open_taken(db)
    opgeruimd = _ruim_dubbele_voorstellen_op(db, rijen, nu)
    weg = {r.get("id") for r in opgeruimd}
    rijen = [r for r in rijen if r.get("id") not in weg]

    bevindingen = pb.beoordeel(rijen, nu)
    voor_luka = [b for b in bevindingen if b.voor == "luka"]
    for b in voor_luka:
        _vraag_luka(db, "projectsmgr", b.titel, b.detail)
    overzicht = _dagoverzicht(db, nu, "Taken", bevindingen)

    delen = [b.titel for b in bevindingen]
    if opgeruimd:
        delen.insert(0, f"{len(opgeruimd)} dubbele voorstellen opgeruimd")
    gerapporteerd = _rapporteer_bij_verandering(
        db, "projectsmgr", "Taken: " + ("; ".join(delen) if delen else "niets staat stil") + ".")
    return {
        "job": "projects and tasks",
        "open": len(rijen),
        "voor_luka": [b.code for b in voor_luka],
        "bevindingen": [b.code for b in bevindingen],
        "opgeruimd": len(opgeruimd),
        "dagoverzicht": overzicht,
        "gerapporteerd": gerapporteerd,
        "directives": len(inbox(db, "projectsmgr")),
    }


ROOSTER_KOLOMMEN = ("id,name,app,job_key,enabled,last_status,last_result,consecutive_failures,"
                   "next_run_at,last_run_at,lease_owner,lease_until,metadata")


def _herkans_vroeg(db: Any, rijen: list[dict[str, Any]], nu: datetime) -> list[dict[str, Any]]:
    """Wat de manager zelf mag oplossen: na een tijdelijke fout (502, time-out)
    de terugval-rust van de planner inkorten, één keer per uur per job.

    8 nov: een databasestoring van een uur hield de NorthSea-motor door de
    6-uursrust tot 14:13 stil. De job blijft dezelfde job met dezelfde grenzen.
    """
    import roosters_bewaker as rb
    gedaan = []
    for r in rb.herkansen(rijen, nu):
        meta = r.get("metadata") if isinstance(r.get("metadata"), dict) else {}
        try:
            db.table("core_schedules").update({
                "next_run_at": nu.isoformat(),
                "metadata": {**meta, "vroeg_herkanst_op": nu.isoformat(), "vroeg_herkanst_door": "companionmgr"},
            }).eq("id", r["id"]).eq("enabled", True).execute()
            gedaan.append(r)
        except Exception as exc:  # noqa: BLE001
            log.warning("companionmgr: kon %s niet herkansen (%s)", r.get("job_key"), exc)
    return gedaan


def run_companionmgr(db: Any, nu: datetime) -> dict[str, Any]:
    """Eigenaar van de vaste jobs: ziet wat faalt of blijft liggen, herkanst
    na een tijdelijke storing, roept Luka alleen als het blijft falen."""
    import roosters_bewaker as rb
    rijen = _rijen(db, "core_schedules", ROOSTER_KOLOMMEN, limiet=500)
    herkanst = _herkans_vroeg(db, rijen, nu)
    bevindingen = rb.beoordeel(rijen, nu)
    voor_luka = [b for b in bevindingen if b.voor == "luka"]
    for b in voor_luka:
        _vraag_luka(db, "companionmgr", b.titel, b.detail)
    overzicht = _dagoverzicht(db, nu, "Vaste jobs", bevindingen)

    delen = [b.titel for b in bevindingen]
    if herkanst:
        delen.insert(0, "nu opnieuw gestart: " + ", ".join(str(r.get("name") or r.get("job_key")) for r in herkanst))
    gerapporteerd = _rapporteer_bij_verandering(
        db, "companionmgr", "Vaste jobs: " + ("; ".join(delen) if delen else "alles draait") + ".")
    aan = [r for r in rijen if r.get("enabled")]
    return {
        "job": "companion and standing jobs owner",
        "repo": "AXE-COMPANION-OS-",
        "jobs": len(aan),
        "failing": sum(1 for r in aan if r.get("last_status") in ("fail", "timeout")),
        "herkanst": [r.get("job_key") for r in herkanst],
        "voor_luka": [b.code for b in voor_luka],
        "bevindingen": [b.code for b in bevindingen],
        "dagoverzicht": overzicht,
        "gerapporteerd": gerapporteerd,
        "deployed": 0,
    }


def run_axon(db: Any, nu: datetime) -> dict[str, Any]:
    memories = _rijen(db, "memory", "id,agent,kind", limiet=50)
    rag = _rijen(db, "rag_memories", "id", limiet=20)
    stuur_bericht(
        db, "axon", BAAS, "report",
        f"AXON pulse. memory seen {len(memories)}, rag {len(rag)}. No HOLD writes.",
    )
    return {
        "job": "axon memory owner",
        "repo": "axon-memory",
        "supabase": "ktaditgtbubonrahyiig",
        "memory_seen": len(memories),
        "rag_seen": len(rag),
        "invented": 0,
    }


def _nieuwste(db: Any, tabel: str, kolommen: str, kolom: str) -> dict[str, Any] | None:
    """De nieuwste rij op `kolom`. Zonder sorteren gaf de database zomaar een rij."""
    try:
        rijen = (db.table(tabel).select(kolommen).order(kolom, desc=True).limit(1).execute().data) or []
    except Exception as exc:  # noqa: BLE001
        log.warning("grok: %s onleesbaar (%s)", tabel, exc)
        return None
    return rijen[0] if rijen else None


def run_tradingos(db: Any, nu: datetime) -> dict[str, Any]:
    """Eigenaar van Trading OS (alleen lezen): zegt eerlijk hoe vers de data is.
    Geen orders, geen advies; een oude bias heet niet actueel."""
    import intel_bewaker as ib
    tide = _nieuwste(db, "intel_market_tide", "bias,snapshot_time", "snapshot_time")
    feeds = _rijen(db, "intel_sync_log", "feed_id,source,last_sync_at,rows_synced,last_error", limiet=100)
    sig = ib.signaal(tide, nu)
    bevindingen = ib.beoordeel(feeds, tide, nu)
    overzicht = _dagoverzicht(db, nu, "Trading OS", bevindingen)
    kop = f"bias {sig['bias']} ({sig['at']})" if sig["vers"] else "geen actueel signaal"
    gerapporteerd = _rapporteer_bij_verandering(
        db, "tradingos", f"Trading OS: {kop}; "
        + ("; ".join(b.titel for b in bevindingen if b.code != "signaal_oud") or "feeds vers")
        + ". Orders: 0.")
    return {
        "job": "trading os owner",
        "repos": list(REPO_SCOPE["tradingos"]["repos"]),
        "bias": sig["bias"],
        "signaal_op": sig["at"],
        "bevindingen": [b.code for b in bevindingen],
        "dagoverzicht": overzicht,
        "gerapporteerd": gerapporteerd,
        "orders": 0,
        "live": False,
    }


# Eén keer per dag een overzicht, bij de eerste pulse na dit uur (Amsterdam).
DAGOVERZICHT_UUR = 8


def _dagoverzicht_tijd(nu: datetime) -> bool:
    try:
        from zoneinfo import ZoneInfo
        lokaal = nu.astimezone(ZoneInfo("Europe/Amsterdam"))
    except Exception:  # noqa: BLE001
        lokaal = nu
    return lokaal.hour >= DAGOVERZICHT_UUR


def meld_mailduidingen(db: Any) -> int:
    """Afgeronde leesbeurten van de mailwachter (northsea_mailwachter.zet_analyse_klaar)
    naar Luka: een bericht in het managersgesprek en een melding in de bel.

    Een taak die klaar is maar nergens gemeld wordt, is voor Luka niet gebeurd.
    Elke duiding één keer: daarna staat metadata.gemeld op True.
    """
    from northsea_mailwachter import ANALYSE_DOOR
    try:
        rijen = (db.table("core_tasks").select("id,title,result,metadata,status")
                 .eq("requested_by", ANALYSE_DOOR).eq("status", "completed").execute().data) or []
    except Exception:  # noqa: BLE001
        return 0
    gemeld = 0
    for r in rijen:
        meta = r.get("metadata") if isinstance(r.get("metadata"), dict) else {}
        if meta.get("gemeld"):
            continue
        res = r.get("result") if isinstance(r.get("result"), dict) else {}
        duiding = str(res.get("summary") or "").strip()
        if not duiding:
            continue
        kop = str(r.get("title") or "NorthSea mail")[:120]
        try:
            stuur_bericht(db, "northseamgr", BAAS, "report", f"{kop}\n{duiding}")
        except Verboden:
            pass  # de tekst van een model mag de melding hieronder niet tegenhouden
        try:
            from goedkeuring_melding import LUKA_USER_ID, melding_voor_goedkeuring
            db.table("core_notifications").insert({
                "recipient": LUKA_USER_ID, "type": "info",
                "message": melding_voor_goedkeuring(kop, duiding[:600]),
            }).execute()
            db.table("core_tasks").update({"metadata": {**meta, "gemeld": True}}).eq("id", r["id"]).execute()
            gemeld += 1
        except Exception:  # noqa: BLE001 -- volgende pulse opnieuw
            continue
    return gemeld


def run_northseamgr(db: Any, nu: datetime, ophaler: Any = None) -> dict[str, Any]:
    """NorthSea-eigenaar: kijkt in de échte NorthSea-database, niet in AXE's eigen tabellen.

    Wat Luka moet doen wordt een vraag (approval + push). De rest komt één keer
    per dag in een overzicht. Niets versturen, niets goedkeuren, geen vlaggen.
    """
    import northsea_bewaker as bewaker
    duidingen = meld_mailduidingen(db)
    try:
        health, ops, metrics = bewaker.haal(ophaler)
    except Exception as exc:  # noqa: BLE001
        # Niet stil zijn als hij niet kan kijken: dat was precies het probleem.
        stuur_bericht(db, "northseamgr", BAAS, "report",
                      f"NorthSea: kan de desk niet lezen ({str(exc)[:160]}).")
        return {"job": "northsea desk owner", "priority": "first deal", "gelezen": False, "fout": str(exc)[:300],
                "sent": 0, "flags": "untouched"}

    bevindingen = bewaker.beoordeel(health, ops, metrics, nu)
    voor_luka = [b for b in bevindingen if b.voor == "luka"]
    for b in voor_luka:
        _vraag_luka(db, "northseamgr", b.titel, b.detail)

    overzicht = False
    if _dagoverzicht_tijd(nu):
        try:
            from goedkeuring_melding import schrijf_goedkeuring_melding
            regels = [f"{b.titel}. {b.detail}".strip() for b in bevindingen][:5]
            kop = f"NorthSea vandaag {nu.strftime('%d-%m')}"
            # Zelfde kop binnen 24 uur = geen tweede (ontdubbeling in de melding).
            overzicht = schrijf_goedkeuring_melding(
                db, kop, " | ".join(regels) or "Niets dat op jou wacht.") is not None
        except Exception:  # noqa: BLE001
            overzicht = False

    samenvatting = "; ".join(b.titel for b in bevindingen) or "desk loopt, niets voor Luka"
    stuur_bericht(db, "northseamgr", BAAS, "report", f"NorthSea: {samenvatting}.")
    return {
        "job": "northsea desk owner",
        "priority": "first deal",
        "gelezen": True,
        "voor_luka": [b.code for b in voor_luka],
        "bevindingen": [b.code for b in bevindingen],
        "dagoverzicht": overzicht,
        "mailduidingen": duidingen,
        "sent": 0,
        "flags": "untouched",
    }


RUNNERS: dict[str, Any] = {
    "axemanager": run_axemanager,
    "projectsmgr": run_projectsmgr,
    "companionmgr": run_companionmgr,
    "axon": run_axon,
    "tradingos": run_tradingos,
    "northseamgr": run_northseamgr,
}


def diensten() -> tuple[dict[str, Any], ...]:
    namen = {
        "axemanager": "AXE CORE Manager pulse",
        "projectsmgr": "Projects Manager pulse",
        "companionmgr": "AXE Companion Manager pulse",
        "axon": "AXON Memory Manager pulse",
        "tradingos": "Trading OS Manager pulse",
        "northseamgr": "Northsea Desk Manager pulse",
    }
    wat = {
        "axemanager": "Direct other managers; Dutch recommendation first; ask Luka only out-of-plan.",
        "projectsmgr": "Read project/task rows; assign to specialists. No sends.",
        "companionmgr": "Companion repo/VPS/smoke. No out-of-plan deploy.",
        "axon": "AXON Memory owner. Real lessons only, cap respected.",
        "tradingos": "Trading OS owner. Never live orders.",
        "northseamgr": "NorthSea desk. Sends only after Luka; never flip auto_send_*.",
    }
    return tuple(
        {
            "agent": aid,
            "name": namen[aid],
            "job_key": f"axe_core:staande-{aid}",
            "cron_expr": PULSE_CRON[aid],
            "wat": wat[aid],
            "run": RUNNERS[aid],
        }
        for aid in GROK_IDS
    )
