"""Eén planner voor heel AXE: uitvoeren met een lease, elke run in het grootboek.

## Waarom dit bestaat

`core_schedules` + `/cron/tick` bestond al, maar:
  - een job die langer dan een minuut duurde kon de volgende tick nog eens starten
    (next_run_at werd pas NA de run verzet);
  - van een run bleef alleen `last_result` over, overschreven bij de volgende;
  - alles draaide op de VPS, terwijl de planner en het opruimen op de Mac horen;
  - wat pg_cron in Supabase deed (12 jobs) zag je nergens.

Nu:
  - `core_claim_due_schedules(executor, …)` claimt atomair met een lease; de VPS
    claimt 'vps', de Mac 'mac'. Twee workers pakken nooit dezelfde job;
  - elke run staat in `core_job_runs` (uniek per job + gepland moment, dus een
    herhaalde tick maakt geen tweede run);
  - na MAX_FAILS mislukkingen op rij zet de job zichzelf uit en meldt dat, in plaats
    van elke minuut dezelfde fout;
  - de agenda rekent vooruit voor alle jobs, ook pg_cron, per app.

Deze module is puur (behalve `Uitvoerder`, die een Supabase-client krijgt) zodat
de regels getest worden zonder netwerk.
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional

from croniter import croniter

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

APPS = ("axe_core", "axe_companion", "trading_os", "axon_memory", "northsea")
EXECUTORS = ("vps", "mac", "supabase")
# Wat de tick kan uitvoeren, per uitvoerder. 'observed' draait elders en meldt zijn runs.
UITVOERBAAR = {
    "vps": ("prompt", "exec", "webhook", "crew", "northsea"),
    "mac": ("exec", "webhook", "planner"),
}
ALLE_SOORTEN = ("prompt", "exec", "webhook", "crew", "observed", "planner", "northsea")
MAX_FAILS = 5
# Jobs die elk uur of vaker draaien krijgen in de agenda één regel per dag, niet honderd.
SAMENVOEG_TOT_MIN = 60


def _tz(naam: Optional[str]):
    if ZoneInfo is None or not naam or naam == "UTC":
        return timezone.utc
    try:
        return ZoneInfo(naam)
    except Exception:
        return timezone.utc


def geldig(cron_expr: str) -> bool:
    return bool(cron_expr) and croniter.is_valid(cron_expr)


def volgende(cron_expr: str, tz_naam: str = "UTC", na: Optional[datetime] = None) -> datetime:
    if not geldig(cron_expr):
        raise ValueError(f"Invalid cron expression: {cron_expr!r}")
    tz = _tz(tz_naam)
    basis = (na or datetime.now(timezone.utc)).astimezone(tz)
    nxt = croniter(cron_expr, basis).get_next(datetime)
    if nxt.tzinfo is None:
        nxt = nxt.replace(tzinfo=tz)
    return nxt.astimezone(timezone.utc)


def runs_tussen(cron_expr: str, tz_naam: str, van: datetime, tot: datetime, max_n: int = 500) -> list[datetime]:
    """Alle geplande momenten in [van, tot), hooguit max_n."""
    if not geldig(cron_expr) or tot <= van:
        return []
    tz = _tz(tz_naam)
    it = croniter(cron_expr, (van - timedelta(seconds=1)).astimezone(tz))
    uit: list[datetime] = []
    while len(uit) < max_n:
        t = it.get_next(datetime)
        if t.tzinfo is None:
            t = t.replace(tzinfo=tz)
        t = t.astimezone(timezone.utc)
        if t >= tot:
            break
        if t >= van:
            uit.append(t)
    return uit


def interval_minuten(cron_expr: str, tz_naam: str = "UTC", ref: Optional[datetime] = None) -> Optional[float]:
    """Kortste afstand tussen twee runs rond ref (voor 'elke 10 min'); None bij ongeldig."""
    if not geldig(cron_expr):
        return None
    start = ref or datetime.now(timezone.utc)
    runs = runs_tussen(cron_expr, tz_naam, start, start + timedelta(days=8), max_n=50)
    if len(runs) < 2:
        return None
    return min((b - a).total_seconds() / 60 for a, b in zip(runs, runs[1:]))


def app_of(v: Any) -> str:
    return v if v in APPS else "axe_core"


def agenda(schedules: list[dict], pg_jobs: list[dict], van: datetime, tot: datetime, tz_naam: str = "Europe/Amsterdam") -> list[dict]:
    """Alle geplande runs van alle jobs tussen van en tot, per app gekleurd door de client.

    Frequente jobs (elk uur of vaker) worden per lokale dag samengevoegd tot één item met
    `herhaling` en `aantal`, anders is de agenda onleesbaar (mt5-sync draait 144x per dag).
    """
    lokaal = _tz(tz_naam)
    items: list[dict] = []

    def voeg_toe(key: str, bron: str, app: str, naam: str, executor: str, cron_expr: str, tz_job: str, soort: str, extra: dict) -> None:
        runs = runs_tussen(cron_expr, tz_job, van, tot, max_n=5000)
        if not runs:
            return
        stap = interval_minuten(cron_expr, tz_job, van)
        if stap is not None and stap <= SAMENVOEG_TOT_MIN:
            per_dag: dict[str, list[datetime]] = {}
            for r in runs:
                per_dag.setdefault(r.astimezone(lokaal).date().isoformat(), []).append(r)
            for dag, lijst in sorted(per_dag.items()):
                items.append({"key": f"{key}:{dag}", "job_key": key, "bron": bron, "app": app, "naam": naam, "executor": executor,
                              "soort": soort, "at": lijst[0].isoformat(), "tot": lijst[-1].isoformat(), "aantal": len(lijst),
                              "herhaling": f"elke {int(stap)} min", "cron": cron_expr, **extra})
        else:
            for r in runs:
                items.append({"key": f"{key}:{r.isoformat()}", "job_key": key, "bron": bron, "app": app, "naam": naam, "executor": executor,
                              "soort": soort, "at": r.isoformat(), "tot": None, "aantal": 1, "herhaling": None, "cron": cron_expr, **extra})

    for s in schedules:
        if not s.get("enabled") or not geldig(s.get("cron_expr") or ""):
            continue
        meta = s.get("metadata") or {}
        voeg_toe(s.get("job_key") or f"schedule:{s.get('id')}", "schedule", app_of(s.get("app") or meta.get("app")), s.get("name") or "?",
                 s.get("executor") or "vps", s["cron_expr"], s.get("timezone") or "UTC", s.get("action_type") or "?",
                 {"schedule_id": s.get("id"), "laatste_status": s.get("last_status")})
    for j in pg_jobs:
        if not j.get("active") or not geldig(j.get("schedule") or ""):
            continue
        voeg_toe(f"pg_cron:{j.get('jobname')}", "pg_cron", app_of(j.get("app")), j.get("jobname") or "?", "supabase",
                 j["schedule"], "UTC", "pg_cron", {})
    return sorted(items, key=lambda i: i["at"])


# Een run die langer dan zijn eigen looptijd plus deze marge op 'running' staat,
# draait nergens meer: het proces dat hem startte is weg.
HANG_MARGE_S = 120


def na_run(status: str, fouten_op_rij: int, max_fails: int = MAX_FAILS) -> tuple[int, bool]:
    """(nieuwe teller, uitzetten?) na een run. Alleen een geslaagde run zet de teller terug."""
    if status == "ok":
        return 0, False
    if status == "skipped":
        return fouten_op_rij, False
    teller = fouten_op_rij + 1
    return teller, teller >= max_fails


def _is_dubbel(fout: Exception) -> bool:
    tekst = f"{getattr(fout, 'code', '')} {fout}"
    return "23505" in tekst or "duplicate key" in tekst


class Uitvoerder:
    """Claimt en draait de jobs van één uitvoerder ('vps' of 'mac')."""

    def __init__(self, sb: Callable[[], Any], executor: str, owner: str,
                 actie: Callable[[str, dict], Awaitable[dict]],
                 meld: Optional[Callable[[str, dict, dict], None]] = None,
                 nu: Callable[[], datetime] = lambda: datetime.now(timezone.utc)):
        if executor not in UITVOERBAAR:
            raise ValueError(f"unknown executor {executor}")
        self.sb, self.executor, self.owner, self.actie, self.meld, self.nu = sb, executor, owner, actie, meld, nu

    async def tick(self, limiet: int = 20) -> list[dict]:
        rijen = self.sb().rpc("core_claim_due_schedules", {"p_executor": self.executor, "p_owner": self.owner,
                                                            "p_lease_s": 900, "p_limit": limiet}).execute().data or []
        uit = []
        for s in rijen:
            uit.append(await self.voer_uit(s, trigger="cron"))
        return uit

    def _moment_al_gedaan(self, s: dict, gepland: Optional[str], nu: datetime, trigger: str) -> dict:
        """Er bestaat al een run voor dit moment (unieke index job_key+scheduled_for).

        Drie gevallen, en alleen de eerste is "echt bezet":
          1. die run loopt nog binnen zijn looptijd -> een andere tick doet hem; overslaan.
          2. die run staat nog op 'running' maar is ver over zijn looptijd -> het proces
             stierf halverwege (herstart, reboot). Afsluiten als timeout.
          3. die run is klaar -> alleen next_run_at is toen niet doorgeschoven.
        In 2 en 3 schuift next_run_at door. Zonder dat botste elke tick eeuwig op
        hetzelfde moment: zo stond de planner stil sinds 17 sep en de NorthSea-engine
        sinds 23 sep 01:03, terwijl last_status 'ok' bleef zeggen (23 sep 2026).
        """
        patch: dict[str, Any] = {"lease_owner": None, "lease_until": None}
        job_key = s.get("job_key") or f"schedule:{s['id']}"
        limiet = max(5, min(int(s.get("max_runtime_s") or 300), 3600))
        bestaand = None
        try:
            bestaand = ((self.sb().table("core_job_runs").select("id,status,started_at")
                         .eq("job_key", job_key).eq("scheduled_for", gepland).limit(1).execute().data) or [None])[0]
        except Exception:  # noqa: BLE001 — niet kunnen lezen = het oude, veilige gedrag
            bestaand = None

        status, reden = "skipped", "run voor dit moment bestond al"
        if bestaand and bestaand.get("status") == "running":
            try:
                gestart = datetime.fromisoformat(str(bestaand.get("started_at")))
            except ValueError:
                gestart = None
            leeftijd = (nu - gestart).total_seconds() if gestart else float("inf")
            if leeftijd < limiet + HANG_MARGE_S:
                self.sb().table("core_schedules").update(patch).eq("id", s["id"]).execute()
                return {"id": s["id"], "name": s.get("name"), "status": "skipped", "reden": "run voor dit moment loopt nog"}
            fout = (f"abandoned: still 'running' after {int(leeftijd)}s (max {limiet}s) -- "
                    "the process died mid-run; closed so the schedule can continue")
            self.sb().table("core_job_runs").update({
                "status": "timeout", "finished_at": nu.isoformat(), "error": fout,
            }).eq("id", bestaand["id"]).execute()
            teller, _ = na_run("timeout", int(s.get("consecutive_failures") or 0))
            patch.update({"last_run_at": nu.isoformat(), "last_status": "timeout", "last_result": fout,
                          "consecutive_failures": teller})
            status, reden = "timeout", "hangende run afgesloten"

        if trigger == "cron" and s.get("cron_expr"):
            try:
                patch["next_run_at"] = volgende(s["cron_expr"], s.get("timezone") or "UTC", nu).isoformat()
            except (ValueError, KeyError):
                pass
        self.sb().table("core_schedules").update(patch).eq("id", s["id"]).execute()
        return {"id": s["id"], "name": s.get("name"), "status": status, "reden": reden}

    async def voer_uit(self, s: dict, trigger: str = "cron") -> dict:
        start = self.nu()
        gepland = s.get("next_run_at") if trigger == "cron" else None
        run_id = None
        try:
            ins = self.sb().table("core_job_runs").insert({
                "job_key": s.get("job_key") or f"schedule:{s['id']}", "job_name": s.get("name") or "?",
                "app": app_of(s.get("app") or (s.get("metadata") or {}).get("app")), "source": "schedule",
                "schedule_id": s["id"], "executor": self.executor, "trigger": trigger, "scheduled_for": gepland,
                "started_at": start.isoformat(), "status": "running", "metadata": {"owner": self.owner, "action_type": s.get("action_type")},
            }).execute()
            run_id = (ins.data or [{}])[0].get("id")
        except Exception as e:  # noqa: BLE001
            if _is_dubbel(e):
                return self._moment_al_gedaan(s, gepland, start, trigger)
            raise

        soort = s.get("action_type") or ""
        if soort not in UITVOERBAAR[self.executor]:
            resultaat = {"status": "fail", "output": f"action_type '{soort}' kan niet op executor '{self.executor}'"}
        else:
            limiet = max(5, min(int(s.get("max_runtime_s") or 300), 3600))
            t0 = time.monotonic()
            try:
                resultaat = await asyncio.wait_for(self.actie(soort, s.get("action_payload") or {}), timeout=limiet)
            except asyncio.TimeoutError:
                resultaat = {"status": "timeout", "output": f"timed out after {limiet}s"}
            except Exception as e:  # noqa: BLE001 — een kapotte job mag de planner niet stoppen
                resultaat = {"status": "fail", "output": str(e)[:2000]}
            resultaat["duration_ms"] = int((time.monotonic() - t0) * 1000)
        status = resultaat.get("status") if resultaat.get("status") in ("ok", "fail", "timeout", "skipped") else "fail"
        einde = self.nu()
        uitvoer = str(resultaat.get("output") or "")[:4000]
        if run_id:
            self.sb().table("core_job_runs").update({
                "status": status, "finished_at": einde.isoformat(), "duration_ms": resultaat.get("duration_ms"),
                "output": uitvoer if status == "ok" else None, "error": None if status == "ok" else uitvoer,
            }).eq("id", run_id).execute()

        teller, uit = na_run(status, int(s.get("consecutive_failures") or 0))
        patch: dict[str, Any] = {"last_run_at": einde.isoformat(), "last_status": status, "last_result": uitvoer,
                                 "lease_owner": None, "lease_until": None, "consecutive_failures": teller}
        if trigger == "cron":
            try:
                patch["next_run_at"] = volgende(s["cron_expr"], s.get("timezone") or "UTC", einde).isoformat()
            except (ValueError, KeyError):
                patch["enabled"], patch["next_run_at"] = False, None
        if uit:
            patch["enabled"], patch["next_run_at"] = False, None
        self.sb().table("core_schedules").update(patch).eq("id", s["id"]).execute()
        if self.meld:
            try:
                self.meld(s.get("name") or "?", s.get("action_payload") or {}, {"status": status, "output": uitvoer, "uitgezet": uit})
            except Exception:  # noqa: BLE001
                pass
        return {"id": s["id"], "name": s.get("name"), "status": status, "run_id": run_id, "uitgezet": uit}


def rapport_rij(body: dict, nu: datetime) -> dict:
    """Een run die elders draaide (launchd, de planner-lus) als grootboekregel. Valideert streng."""
    job_key = str(body.get("job_key") or "").strip()
    if not job_key or len(job_key) > 120:
        raise ValueError("job_key required (max 120)")
    status = body.get("status")
    if status not in ("ok", "fail", "timeout", "skipped", "running"):
        raise ValueError("status must be ok|fail|timeout|skipped|running")
    bron = body.get("source") or "launchd"
    if bron not in ("launchd", "planner", "northsea", "manual"):
        raise ValueError("source must be launchd|planner|northsea|manual")
    executor = body.get("executor") or "mac"
    if executor not in EXECUTORS:
        raise ValueError("executor must be vps|mac|supabase")

    def tijd(v: Any, standaard: Optional[datetime]) -> Optional[str]:
        if v in (None, ""):
            return standaard.isoformat() if standaard else None
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()

    start = tijd(body.get("started_at"), nu)
    einde = tijd(body.get("finished_at"), nu if status != "running" else None)
    duur = None
    if start and einde:
        duur = int((datetime.fromisoformat(einde) - datetime.fromisoformat(start)).total_seconds() * 1000)
    tekst = str(body.get("output") or "")[:4000]
    return {"job_key": job_key, "job_name": str(body.get("job_name") or job_key)[:200], "app": app_of(body.get("app")),
            "source": bron, "executor": executor, "trigger": "observed", "scheduled_for": tijd(body.get("scheduled_for"), None),
            "started_at": start, "finished_at": einde, "status": status, "duration_ms": duur,
            "output": tekst if status == "ok" else None, "error": None if status == "ok" else (str(body.get("error") or tekst)[:4000] or None),
            "metadata": body.get("metadata") if isinstance(body.get("metadata"), dict) else {}}
