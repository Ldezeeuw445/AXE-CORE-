"""Vaste agents (BOUWLIJST, 25 nov): ochtendbrief elke dag, roadmap-check maandag,
opruimlijst vrijdag, weekreview zondag.

Elke brief is een bericht van de AXE CORE Manager in Luka's gesprek (Managers-tab, en
doorzoekbaar in Chats). Gemaakt uit de echte tabellen, zonder model: dus ook als alle
gratis modellen op hun limiet zitten. Alleen lezen en één chatbericht; nooit versturen,
kopen of wissen. Wat Luka moet doen staat bovenaan onder "Needs you".

    ochtendbrief   08:00 dagelijks   wacht op jou, wat mislukte en wat af ging (24 u), wat stuk is
    roadmap        08:15 maandag     open voorstellen per app, wat het langst stil ligt, tempo vorige week
    opruimlijst    16:30 vrijdag     voorstellen > 30 dagen, mislukt en nooit opnieuw, steeds falende jobs
    weekreview     18:00 zondag      de week in cijfers, de grootste foutoorzaken, wat nog open staat
"""
from __future__ import annotations

import logging
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

log = logging.getLogger("vaste_briefs")

AGENT = "axemanager"
MAX_REGELS = 6


def _tijd(v: Any) -> datetime | None:
    try:
        t = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _titel(r: dict[str, Any], n: int = 70) -> str:
    return " ".join(str(r.get("title") or "?").split())[:n]


def _foutsoort(r: dict[str, Any]) -> str:
    e = r.get("error") if isinstance(r.get("error"), dict) else {}
    tekst = str(e.get("message") or e.get("code") or "unknown")
    tekst = re.sub(r"[0-9a-f]{8}-[0-9a-f-]{27,}", "<id>", tekst)
    return " ".join(tekst.split())[:70]


def _lijst(regels: list[str], kop: str) -> list[str]:
    if not regels:
        return []
    meer = len(regels) - MAX_REGELS
    return [kop] + [f"- {r}" for r in regels[:MAX_REGELS]] + ([f"- ... and {meer} more"] if meer > 0 else [])


def _in(rijen: list[dict[str, Any]], veld: str, sinds: datetime) -> list[dict[str, Any]]:
    return [r for r in rijen if (t := _tijd(r.get(veld))) and t >= sinds]


# ── de vier briefs (puur: rijen in, tekst uit) ─────────────────────────────

def ochtendbrief(d: dict[str, list[dict[str, Any]]], nu: datetime) -> str:
    sinds = nu - timedelta(hours=24)
    wacht = [_titel(a) for a in d["approvals"]]
    klaar = [r for r in _in(d["taken"], "completed_at", sinds) if r.get("status") == "completed"]
    mis = [r for r in _in(d["taken"], "updated_at", sinds) if r.get("status") == "failed"]
    feeds = [f"{f['feed_id']}: {str(f.get('last_error'))[:60]}" for f in d["feeds"] if f.get("last_error")]
    jobs = [f"{j.get('name')} ({j.get('consecutive_failures')}x)" for j in d["roosters"]
            if int(j.get("consecutive_failures") or 0) >= 2]
    regels = [f"Good morning. Last 24h: {len(klaar)} tasks done, {len(mis)} failed, {len(wacht)} waiting on you."]
    regels += _lijst(wacht, "Needs you:")
    regels += _lijst([_titel(r) for r in klaar], "Done:")
    regels += _lijst([f"{_titel(r, 50)} -- {_foutsoort(r)}" for r in mis], "Failed:")
    regels += _lijst(feeds + jobs, "Broken right now:")
    if len(regels) == 1:
        regels.append("Nothing needs you and nothing is broken.")
    return "Morning brief\n" + "\n".join(regels)


def roadmap(d: dict[str, list[dict[str, Any]]], nu: datetime) -> str:
    open_ = [r for r in d["taken"] if r.get("status") == "pending"]
    per_app = Counter(str((r.get("metadata") or {}).get("app") or r.get("assignee") or "other") for r in open_)
    oudste = sorted(open_, key=lambda r: str(r.get("created_at") or ""))[:MAX_REGELS]
    week = nu - timedelta(days=7)
    klaar_week = [r for r in _in(d["taken"], "completed_at", week) if r.get("status") == "completed"]
    regels = [f"Roadmap check. {len(open_)} open proposals; last week {len(klaar_week)} tasks done."]
    regels += _lijst([f"{app}: {n}" for app, n in per_app.most_common()], "Open per app:")
    regels += _lijst([f"{_titel(r)} (since {str(r.get('created_at'))[:10]})" for r in oudste], "Waiting longest:")
    regels.append("Pick what matters this week; I keep the rest parked.")
    return "\n".join(regels)


def opruimlijst(d: dict[str, list[dict[str, Any]]], nu: datetime) -> str:
    oud = [r for r in d["taken"] if r.get("status") == "pending"
           and (t := _tijd(r.get("created_at"))) and t < nu - timedelta(days=30)]
    week = nu - timedelta(days=7)
    mis = [r for r in _in(d["taken"], "updated_at", week) if r.get("status") == "failed"]
    opnieuw = {str((r.get("metadata") or {}).get("retry_of") or "") for r in d["taken"]}
    nooit_opnieuw = [r for r in mis if str(r.get("id")) not in opnieuw]
    jobs = [f"{j.get('name')} ({j.get('consecutive_failures')}x in a row)" for j in d["roosters"]
            if int(j.get("consecutive_failures") or 0) >= 3]
    regels = [f"Friday clean-up list. Nothing is removed without your yes."]
    regels += _lijst([_titel(r) for r in oud], f"Proposals older than 30 days ({len(oud)}): drop or plan?")
    regels += _lijst([f"{_titel(r, 50)} -- {_foutsoort(r)}" for r in nooit_opnieuw],
                     f"Failed this week and never retried ({len(nooit_opnieuw)}):")
    regels += _lijst(jobs, "Jobs that keep failing:")
    if len(regels) == 1:
        regels.append("Nothing to clean up this week.")
    return "\n".join(regels)


def weekreview(d: dict[str, list[dict[str, Any]]], nu: datetime) -> str:
    week = nu - timedelta(days=7)
    in_week = _in(d["taken"], "updated_at", week)
    st = Counter(str(r.get("status")) for r in in_week)
    oorzaken = Counter(_foutsoort(r) for r in in_week if r.get("status") == "failed").most_common(3)
    feeds_ok = sum(1 for f in d["feeds"] if not f.get("last_error"))
    regels = [f"Week review. {st.get('completed', 0)} done, {st.get('failed', 0)} failed, "
              f"{st.get('blocked', 0)} blocked, {st.get('cancelled', 0)} cancelled; "
              f"{len(d['approvals'])} still waiting on you."]
    regels += _lijst([f"{n}x {o}" for o, n in oorzaken], "Biggest failure causes:")
    regels.append(f"Intel feeds: {feeds_ok} of {len(d['feeds'])} healthy.")
    regels += _lijst([_titel(a) for a in d["approvals"]], "Open on your side:")
    return "\n".join(regels)


SOORTEN = {"ochtendbrief": ochtendbrief, "roadmap": roadmap, "opruimlijst": opruimlijst, "weekreview": weekreview}


# ── I/O ────────────────────────────────────────────────────────────────────

def verzamel(db: Any, nu: datetime) -> dict[str, list[dict[str, Any]]]:
    sinds = (nu - timedelta(days=45)).isoformat()

    def rij(tabel: str, kol: str, **f: Any) -> list[dict[str, Any]]:
        try:
            q = db.table(tabel).select(kol)
            for k, v in f.items():
                q = q.eq(k, v)
            return q.limit(1000).execute().data or []
        except Exception as exc:  # noqa: BLE001
            log.warning("vaste_briefs: %s onleesbaar (%s)", tabel, exc)
            return []
    try:
        taken = (db.table("core_tasks").select("id,title,status,assignee,metadata,error,created_at,updated_at,completed_at")
                 .gte("updated_at", sinds).limit(2000).execute().data) or []
    except Exception as exc:  # noqa: BLE001
        log.warning("vaste_briefs: taken onleesbaar (%s)", exc)
        taken = []
    # Open voorstellen die al lang stil liggen vallen buiten het venster van 45 dagen.
    taken += [r for r in rij("core_tasks", "id,title,status,assignee,metadata,error,created_at,updated_at,completed_at",
                             status="pending") if r.get("id") not in {t.get("id") for t in taken}]
    return {
        "taken": taken,
        "approvals": rij("core_approvals", "id,title,status,created_at", status="pending"),
        "feeds": rij("intel_sync_log", "feed_id,last_sync_at,last_error"),
        "roosters": rij("core_schedules", "name,enabled,consecutive_failures,last_status", enabled=True),
    }


def run(soort: str, db: Any, nu: datetime) -> dict[str, Any]:
    import manager_draad as md
    tekst = SOORTEN[soort](verzamel(db, nu), nu)
    verstuurd = md.vertel_luka(db, AGENT, tekst)
    return {"job": f"vaste brief: {soort}", "verstuurd": verstuurd, "regels": tekst.count("\n") + 1}


def diensten() -> tuple[dict[str, Any], ...]:
    def maak(soort: str, naam: str, cron: str, wat: str) -> dict[str, Any]:
        return {"agent": f"brief-{soort}", "name": naam, "job_key": f"axe_core:staande-brief-{soort}",
                "cron_expr": cron, "wat": wat, "run": lambda db, nu, s=soort: run(s, db, nu)}
    return (
        maak("ochtendbrief", "Morning brief", "0 8 * * *",
             "Every morning: what waits on Luka, what failed and got done in 24h, what is broken. "
             "One message in the AXE CORE Manager chat; reads only, never sends or deletes."),
        maak("roadmap", "Roadmap check (Monday)", "15 8 * * 1",
             "Monday: open proposals per app, what waits longest, last week's pace. One chat message; reads only."),
        maak("opruimlijst", "Clean-up list (Friday)", "30 16 * * 5",
             "Friday: proposals older than 30 days, failures never retried, jobs that keep failing. "
             "A list for Luka; nothing is removed."),
        maak("weekreview", "Week review (Sunday)", "0 18 * * 0",
             "Sunday: the week in numbers, biggest failure causes, feeds health, what still waits on Luka. "
             "One chat message; reads only."),
    )


__all__ = ["SOORTEN", "verzamel", "run", "diensten"]
