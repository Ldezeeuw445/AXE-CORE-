"""Usage & Credits — stap 1 van plan B.

Telt sessies per codeer-stoel en per app, uit core_tasks + core_coding_seats.
Schrijft niets. De load balancer (stap 2) leest `config_voor_balancer()`.

Indicative caps, niet de factuur van de aanbieder: Claude Pro ~3 sessies/dag
per stoel (5-uursvenster), ChatGPT ~2, Cursor twee accounts, tweede Grok Bot
(twins), vrije VPS (OpenHands + Qwen-coder via Ollama) voor klein werk.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable
from zoneinfo import ZoneInfo

AMS = ZoneInfo("Europe/Amsterdam")
VENSTER_STANDAARD_U = 5
TAKEN_LIMIET = 800
TAKEN_DAGEN = 7

# Stoelen die meetellen voor "is het werk gelijk verdeeld?".
SPREAD_IDS = (
    "claude2", "claude3", "claude4",
    "codex", "codex2",
    "cursor", "cursor2",
)

STOELEN: tuple[dict[str, Any], ...] = (
    {"id": "claude2", "label": "Claude Pro 2", "family": "claude", "kind": "paid",
     "sessions_min": 0, "sessions_max": 3, "window_hours": 5,
     "notes": "5-hour window, ~3 sessions/day"},
    {"id": "claude3", "label": "Claude Pro 3", "family": "claude", "kind": "paid",
     "sessions_min": 0, "sessions_max": 3, "window_hours": 5,
     "notes": "5-hour window, ~3 sessions/day"},
    {"id": "claude4", "label": "Claude Pro 4", "family": "claude", "kind": "paid",
     "sessions_min": 0, "sessions_max": 3, "window_hours": 5,
     "notes": "5-hour window, ~3 sessions/day"},
    {"id": "codex", "label": "ChatGPT Plus", "family": "chatgpt", "kind": "paid",
     "sessions_min": 0, "sessions_max": 2, "window_hours": None,
     "notes": "~2 sessions/day"},
    {"id": "codex2", "label": "ChatGPT Plus 2", "family": "chatgpt", "kind": "paid",
     "sessions_min": 0, "sessions_max": 2, "window_hours": None,
     "notes": "~2 sessions/day"},
    {"id": "cursor", "label": "Cursor Pro", "family": "cursor", "kind": "paid",
     "sessions_min": 0, "sessions_max": 3, "window_hours": None,
     "notes": "own Cursor account"},
    {"id": "cursor2", "label": "Cursor Pro 2", "family": "cursor", "kind": "paid",
     "sessions_min": 0, "sessions_max": 3, "window_hours": None,
     "notes": "second Cursor account (hotmail), via CURSOR2_API_KEY"},
    {"id": "xai", "label": "Grok (xAI)", "family": "grok", "kind": "grok",
     "sessions_min": 0, "sessions_max": 8, "window_hours": None,
     "notes": "VPS XAI_API_KEY; first of the Grok Bot twins"},
    {"id": "xai2", "label": "Grok Bot 2 (twins)", "family": "grok", "kind": "grok",
     "sessions_min": 0, "sessions_max": 8, "window_hours": None,
     "notes": "second Grok Bot account — not in core_coding_seats yet"},
    {"id": "openhands", "label": "OpenHands (VPS)", "family": "vps", "kind": "free-vps",
     "sessions_min": 0, "sessions_max": 24, "window_hours": None,
     "notes": "free VPS capacity for small/routine tasks"},
    {"id": "ollama", "label": "Qwen-coder (Ollama)", "family": "vps", "kind": "free-vps",
     "sessions_min": 0, "sessions_max": 24, "window_hours": None,
     "notes": "local Ollama on the VPS; small/routine only"},
)

APPS: tuple[dict[str, Any], ...] = (
    {"id": "axe-core", "label": "AXE Core", "sessions_min": 3, "sessions_max": 3,
     "notes": "indicative daily budget"},
    {"id": "axe-companion", "label": "AXE Companion", "sessions_min": 2, "sessions_max": 3,
     "notes": "indicative daily budget"},
    {"id": "trading-os", "label": "Trading OS", "sessions_min": 2, "sessions_max": 3,
     "notes": "indicative daily budget"},
    {"id": "axon-memory", "label": "AXON Memory", "sessions_min": 1, "sessions_max": 2,
     "notes": "indicative daily budget"},
    {"id": "axe-developer", "label": "AXE Developer", "sessions_min": 1, "sessions_max": 2,
     "notes": "indicative daily budget"},
)

STOEL_IDS = frozenset(s["id"] for s in STOELEN)
APP_IDS = frozenset(a["id"] for a in APPS)

_STOEL_ALIAS = {
    "claude-tweede": "claude2", "claude_2": "claude2", "claude-2": "claude2",
    "claude-derde": "claude3", "claude_3": "claude3", "claude-3": "claude3",
    "claude-vierde": "claude4", "claude_4": "claude4", "claude-4": "claude4",
    "codex-tweede": "codex2", "codex_2": "codex2", "chatgpt": "codex",
    "chatgpt2": "codex2", "gpt": "codex",
    "codex-derde": "codex3",
    "cursor-tweede": "cursor2", "cursor_2": "cursor2", "cursor-2": "cursor2",
    "grok": "xai", "grok-bot": "xai", "x-ai": "xai",
    "grok2": "xai2", "grok-2": "xai2", "xai-2": "xai2", "twins": "xai2",
    "qwen": "ollama", "qwen-coder": "ollama", "qwen_coder": "ollama",
}

_APP_ALIAS = {
    "axe_core": "axe-core", "axecore": "axe-core", "core": "axe-core",
    "axe-core-": "axe-core", "headquarters": "axe-core",
    "axemanager": "axe-core", "projectsmgr": "axe-core",
    "axe_companion": "axe-companion", "companion": "axe-companion",
    "axe-companion-os-": "axe-companion", "companionmgr": "axe-companion",
    "companion os": "axe-companion",
    "trading": "trading-os", "tradingos": "trading-os", "trading_os": "trading-os",
    "trading-os-app": "trading-os", "trading-axe-os": "trading-os",
    "trading_axe_os": "trading-os", "axe-trading-core": "trading-os",
    "tradingosmgr": "trading-os",
    "axon": "axon-memory", "axon_memory": "axon-memory",
    "developer": "axe-developer", "code-agent": "axe-developer",
    "code_agent": "axe-developer", "code-editor": "axe-developer",
    "axe_developer": "axe-developer", "axe-dev": "axe-developer",
}

_GEEN_SESSIE = frozenset({
    "pending", "queued", "cancelled", "canceled", "rejected", "blocked",
})
_GEHEIM = re.compile(
    r"(sk-(ant-|proj-)?[A-Za-z0-9_-]{16,}|(sk|rk)_live_[A-Za-z0-9]{16,}|"
    r"sb_secret_[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|"
    r"xox[abp]-[A-Za-z0-9-]{16,}|CURSOR2_API_KEY\s*=\s*\S+|XAI_API_KEY\s*=\s*\S+)",
    re.I,
)


def catalogus() -> dict[str, Any]:
    """De vaste caps. Stap 2 leest dit, of de tabel als die bestaat."""
    return {
        "timezone": "Europe/Amsterdam",
        "spread_seat_ids": list(SPREAD_IDS),
        "seats": [dict(s) for s in STOELEN],
        "apps": [dict(a) for a in APPS],
    }


def config_voor_balancer(cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    """Vorm die de load balancer (stap 2) mag importeren of via de API lezen."""
    bron = cfg or catalogus()
    return {
        "timezone": bron.get("timezone") or "Europe/Amsterdam",
        "spread_seat_ids": list(bron.get("spread_seat_ids") or SPREAD_IDS),
        "seats": [
            {k: s.get(k) for k in (
                "id", "label", "family", "kind", "sessions_min",
                "sessions_max", "window_hours", "notes",
            )}
            for s in bron.get("seats") or []
        ],
        "apps": [
            {k: a.get(k) for k in ("id", "label", "sessions_min", "sessions_max", "notes")}
            for a in bron.get("apps") or []
        ],
    }


def catalogus_uit(rijen: Iterable[dict[str, Any]] | None) -> dict[str, Any]:
    """Tabelrijen over de code-catalogus: zelfde ids, gewijzigde caps winnen."""
    basis = catalogus()
    if not rijen:
        return basis
    stoelen = {s["id"]: dict(s) for s in basis["seats"]}
    apps = {a["id"]: dict(a) for a in basis["apps"]}
    for rij in rijen:
        soort = str(rij.get("kind") or "").strip()
        sid = str(rij.get("id") or "").strip()
        if not sid:
            continue
        doel = stoelen if soort == "seat" else apps if soort == "app" else None
        if doel is None:
            continue
        huidig = doel.get(sid) or {"id": sid, "kind": soort}
        for veld in ("label", "family", "kind", "notes"):
            if rij.get(veld) not in (None, ""):
                huidig[veld] = rij[veld]
        for veld in ("sessions_min", "sessions_max", "window_hours"):
            if rij.get(veld) is not None:
                try:
                    huidig[veld] = int(rij[veld]) if rij[veld] is not None else None
                except (TypeError, ValueError):
                    pass
        doel[sid] = huidig
    basis["seats"] = list(stoelen.values())
    basis["apps"] = list(apps.values())
    return basis


def tot_dt(waarde: Any) -> datetime | None:
    if waarde is None or waarde == "":
        return None
    if isinstance(waarde, datetime):
        dt = waarde
    elif isinstance(waarde, (int, float)):
        n = float(waarde)
        if n > 1e12:
            n /= 1000.0
        dt = datetime.fromtimestamp(n, tz=timezone.utc)
    else:
        tekst = str(waarde).strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(tekst)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def dag_start(nu: datetime) -> datetime:
    lokaal = nu.astimezone(AMS)
    return lokaal.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


def week_start(nu: datetime) -> datetime:
    lokaal = nu.astimezone(AMS)
    maandag = lokaal - timedelta(days=lokaal.weekday())
    return maandag.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


def normaliseer_stoel(raw: Any) -> str | None:
    if raw is None or raw == "":
        return None
    s = str(raw).strip().lower()
    if ":" in s:
        s = s.rsplit(":", 1)[-1]
    s = _STOEL_ALIAS.get(s, s)
    if s in STOEL_IDS:
        return s
    return None


def herken_app(raw: Any) -> str | None:
    if raw is None or raw == "":
        return None
    s = str(raw).strip().lower().replace("_", "-")
    if s in APP_IDS:
        return s
    if s in _APP_ALIAS:
        return _APP_ALIAS[s]
    for sleutel, app in (
        ("trading-os", "trading-os"),
        ("trading os", "trading-os"),
        ("companion", "axe-companion"),
        ("axon-memory", "axon-memory"),
        ("axon memory", "axon-memory"),
        ("developer", "axe-developer"),
        ("axe core", "axe-core"),
        ("axe-core", "axe-core"),
    ):
        if sleutel in s:
            return app
    return _APP_ALIAS.get(s.replace(" ", "-"))


def taak_stoel(taak: dict[str, Any]) -> str | None:
    payload = taak.get("payload") if isinstance(taak.get("payload"), dict) else {}
    result = taak.get("result") if isinstance(taak.get("result"), dict) else {}
    meta = taak.get("metadata") if isinstance(taak.get("metadata"), dict) else {}
    bewijs = meta.get("bewijs") if isinstance(meta.get("bewijs"), dict) else {}
    for bron in (payload, result, meta, bewijs):
        for sleutel in ("engine", "seat", "seat_id", "motor"):
            gevonden = normaliseer_stoel(bron.get(sleutel))
            if gevonden:
                return gevonden
    return None


def taak_app(taak: dict[str, Any]) -> str | None:
    payload = taak.get("payload") if isinstance(taak.get("payload"), dict) else {}
    meta = taak.get("metadata") if isinstance(taak.get("metadata"), dict) else {}
    bewijs = meta.get("bewijs") if isinstance(meta.get("bewijs"), dict) else {}
    # source_app is almost always axe_core (planner). Repo/title/bewijs first.
    for raw in (
        meta.get("app"), payload.get("app"), payload.get("repo"),
        bewijs.get("repo"), bewijs.get("app"),
        taak.get("title"), taak.get("capability"),
    ):
        app = herken_app(raw)
        if app:
            return app
    return herken_app(taak.get("source_app"))


def is_sessie(taak: dict[str, Any]) -> bool:
    status = str(taak.get("status") or "").strip().lower()
    if status in _GEEN_SESSIE:
        return False
    return True


def taak_moment(taak: dict[str, Any]) -> datetime | None:
    for sleutel in ("started_at", "completed_at", "updated_at", "created_at"):
        dt = tot_dt(taak.get(sleutel))
        if dt:
            return dt
    return None


def _schoon(tekst: Any, limiet: int = 240) -> str | None:
    if tekst is None:
        return None
    s = " ".join(str(tekst).split())
    if not s:
        return None
    s = _GEHEIM.sub("[redacted]", s)
    return s[:limiet]


def _fout_van_taak(taak: dict[str, Any]) -> str | None:
    err = taak.get("error")
    if isinstance(err, dict):
        return _schoon(err.get("message") or err.get("code"))
    if err:
        return _schoon(err)
    result = taak.get("result") if isinstance(taak.get("result"), dict) else {}
    return _schoon(result.get("error") or result.get("limit_message"))


def _stoelrij(rijen: list[dict[str, Any]], sid: str) -> dict[str, Any] | None:
    treffers = []
    for rij in rijen:
        key = normaliseer_stoel(rij.get("seat_id") or rij.get("id"))
        if key == sid:
            treffers.append(rij)
    if not treffers:
        return None

    def versheid(rij: dict[str, Any]) -> float:
        dt = tot_dt(rij.get("last_seen_at") or rij.get("updated_at"))
        return dt.timestamp() if dt else 0.0

    treffers.sort(key=versheid, reverse=True)
    win = dict(treffers[0])
    if win.get("logged_in") is not True:
        ingelogd = next((r for r in treffers if r.get("logged_in") is True), None)
        if ingelogd:
            win["logged_in"] = True
            if not win.get("email"):
                win["email"] = ingelogd.get("email")
    return win


def budget_stand(today: int, minimum: int, maximum: int) -> str:
    if today < minimum:
        return "under"
    if today > maximum:
        return "over"
    return "met"


def venster_vrij(
    *,
    window_hours: int | None,
    rate_limit_until: Any,
    run_times: list[datetime],
    nu: datetime,
) -> datetime | None:
    tot = tot_dt(rate_limit_until)
    if tot and tot > nu:
        return tot
    uren = int(window_hours or 0)
    if uren <= 0:
        return None
    grens = nu - timedelta(hours=uren)
    in_venster = [t for t in run_times if t > grens]
    if not in_venster:
        return None
    return min(in_venster) + timedelta(hours=uren)


def spreiding(per_stoel: dict[str, int], ids: Iterable[str]) -> dict[str, Any]:
    volgorde = [i for i in ids if i in per_stoel or i in SPREAD_IDS]
    if not volgorde:
        volgorde = list(SPREAD_IDS)
    cijfers = [int(per_stoel.get(i) or 0) for i in volgorde]
    totaal = sum(cijfers)
    if totaal == 0:
        return {
            "even": True,
            "delta": 0,
            "paid_today": 0,
            "target_each": 0.0,
            "seats": [{"id": i, "sessions_today": 0, "share": 0.0} for i in volgorde],
            "note": "No paid-seat sessions yet today.",
        }
    mx, mn = max(cijfers), min(cijfers)
    even = (mx - mn) <= 1
    n = len(volgorde)
    doel = round(totaal / n, 2)
    zwaar = volgorde[cijfers.index(mx)]
    licht = volgorde[cijfers.index(mn)]
    note = (
        f"Even: each paid seat is within 1 session of the others ({totaal} today)."
        if even else
        f"Uneven: {zwaar} has {mx}, {licht} has {mn} (target ~{doel} each)."
    )
    return {
        "even": even,
        "delta": mx - mn,
        "paid_today": totaal,
        "target_each": doel,
        "seats": [
            {"id": i, "sessions_today": c, "share": round(c / totaal, 4)}
            for i, c in zip(volgorde, cijfers)
        ],
        "note": note,
    }


def aggregeer(
    taken: list[dict[str, Any]] | None = None,
    stoelen: list[dict[str, Any]] | None = None,
    *,
    nu: datetime | None = None,
    config_rijen: list[dict[str, Any]] | None = None,
    catalogus_override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pure aggregatie. Geen I/O, geen geheimen."""
    moment = (nu or datetime.now(timezone.utc)).astimezone(timezone.utc)
    cfg = catalogus_override or catalogus_uit(config_rijen)
    today0 = dag_start(moment)
    week0 = week_start(moment)
    taken = [t for t in (taken or []) if isinstance(t, dict) and is_sessie(t)]
    stoel_rijen = [s for s in (stoelen or []) if isinstance(s, dict)]

    per_stoel_today: dict[str, int] = {}
    per_stoel_week: dict[str, int] = {}
    per_stoel_tijden: dict[str, list[datetime]] = {}
    per_stoel_fout: dict[str, tuple[datetime, str]] = {}
    per_app_today: dict[str, int] = {}
    per_app_week: dict[str, int] = {}

    for taak in taken:
        when = taak_moment(taak)
        if when is None:
            continue
        sid = taak_stoel(taak)
        app = taak_app(taak)
        if sid:
            per_stoel_tijden.setdefault(sid, []).append(when)
            if when >= week0:
                per_stoel_week[sid] = per_stoel_week.get(sid, 0) + 1
            if when >= today0:
                per_stoel_today[sid] = per_stoel_today.get(sid, 0) + 1
            if str(taak.get("status") or "").lower() == "failed":
                msg = _fout_van_taak(taak)
                if msg:
                    vorig = per_stoel_fout.get(sid)
                    if vorig is None or when > vorig[0]:
                        per_stoel_fout[sid] = (when, msg)
        if app:
            if when >= week0:
                per_app_week[app] = per_app_week.get(app, 0) + 1
            if when >= today0:
                per_app_today[app] = per_app_today.get(app, 0) + 1

    seat_out = []
    for spec in cfg["seats"]:
        sid = spec["id"]
        rij = _stoelrij(stoel_rijen, sid)
        times = sorted(per_stoel_tijden.get(sid) or [])
        until = venster_vrij(
            window_hours=spec.get("window_hours"),
            rate_limit_until=(rij or {}).get("rate_limit_until"),
            run_times=times,
            nu=moment,
        )
        last_fail = per_stoel_fout.get(sid)
        last_limit = _schoon((rij or {}).get("last_limit_message"))
        last_limit_at = tot_dt((rij or {}).get("rate_limit_until"))
        limited = bool((rij or {}).get("rate_limited")) or bool(until and until > moment)
        seat_out.append({
            "id": sid,
            "label": spec.get("label") or sid,
            "family": spec.get("family"),
            "kind": spec.get("kind"),
            "notes": spec.get("notes"),
            "sessions_today": per_stoel_today.get(sid, 0),
            "sessions_week": per_stoel_week.get(sid, 0),
            "sessions_min": int(spec.get("sessions_min") or 0),
            "sessions_max": int(spec.get("sessions_max") or 0),
            "window_hours": spec.get("window_hours"),
            "window_free_at": until.isoformat() if until else None,
            "window_open": until is None or until <= moment,
            "rate_limited": limited,
            "last_limit": last_limit,
            "last_limit_at": last_limit_at.isoformat() if last_limit_at else None,
            "last_failure": last_fail[1] if last_fail else last_limit,
            "last_failure_at": last_fail[0].isoformat() if last_fail else None,
            "logged_in": None if rij is None else rij.get("logged_in"),
            "email": (rij or {}).get("email"),
            "machine": (rij or {}).get("machine") or (rij or {}).get("host"),
            "current_task": (rij or {}).get("current_task"),
            "seen": rij is not None,
        })

    app_out = []
    for spec in cfg["apps"]:
        aid = spec["id"]
        today = per_app_today.get(aid, 0)
        lo = int(spec.get("sessions_min") or 0)
        hi = int(spec.get("sessions_max") or lo)
        stand = budget_stand(today, lo, hi)
        app_out.append({
            "id": aid,
            "label": spec.get("label") or aid,
            "notes": spec.get("notes"),
            "sessions_today": today,
            "sessions_week": per_app_week.get(aid, 0),
            "sessions_min": lo,
            "sessions_max": hi,
            "stand": stand,
            "met": stand == "met",
        })

    spread_ids = list(cfg.get("spread_seat_ids") or SPREAD_IDS)
    spread = spreiding(per_stoel_today, spread_ids)
    apps_met = sum(1 for a in app_out if a["met"])
    return {
        "generated_at": moment.isoformat(),
        "timezone": cfg.get("timezone") or "Europe/Amsterdam",
        "seats": seat_out,
        "apps": app_out,
        "spread": spread,
        "apps_met": apps_met,
        "apps_total": len(app_out),
        "config": config_voor_balancer(cfg),
    }


def lees_config(db: Any) -> list[dict[str, Any]] | None:
    """None = tabel ontbreekt of lezen faalde; caller valt terug op de catalogus."""
    if db is None:
        return None
    try:
        data = db.table("core_usage_config").select("*").execute().data
    except Exception:
        return None
    return list(data or [])


def lees_taken(db: Any, nu: datetime | None = None) -> list[dict[str, Any]]:
    if db is None:
        return []
    moment = nu or datetime.now(timezone.utc)
    sinds = (moment - timedelta(days=TAKEN_DAGEN)).isoformat()
    try:
        data = (
            db.table("core_tasks")
            .select(
                "id,title,status,source_app,assignee,capability,"
                "payload,metadata,result,error,created_at,updated_at,"
                "completed_at,started_at"
            )
            .gte("created_at", sinds)
            .order("created_at", desc=True)
            .limit(TAKEN_LIMIET)
            .execute()
            .data
        )
    except Exception:
        return []
    return list(data or [])


def snapshot(
    db: Any = None,
    *,
    stoelen: list[dict[str, Any]] | None = None,
    nu: datetime | None = None,
) -> dict[str, Any]:
    """I/O-rand: taken + optionele configtabel, daarna pure aggregatie."""
    return aggregeer(
        lees_taken(db, nu) if db is not None else [],
        stoelen or [],
        nu=nu,
        config_rijen=lees_config(db),
    )
