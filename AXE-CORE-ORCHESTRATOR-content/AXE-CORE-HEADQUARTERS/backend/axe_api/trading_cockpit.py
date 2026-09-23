"""
trading_cockpit.py -- alleen-lezen zicht op het tradingbureau voor een externe cockpit.

## Wat dit is

`/trading/*` geeft een telefoon of een tweede scherm hetzelfde beeld als de
app: accounts, risico, open posities, beslissingen (PASS/BLOCK/WAIT), de
research-crew, P&L, bewijs per omgeving, de Strategy Lab en de autopilot-status
met zijn lease. Alles achter dezelfde bearer-auth als de rest van de API.

## Wat dit NIET is

- Geen schrijfpad. Geen order, geen schakelaar, geen instelling: daarvoor is de
  app, waar de pre-trade-poort zit.
- Geen geheimen. MetaAPI-tokens staan in `trading_accounts` in user_settings;
  accounts gaan hier door een witte lijst van velden, en elk antwoord gaat
  daarna nog door `scrub`, dat recursief elke sleutel verwijdert die naar een
  geheim riekt. Twee lagen, omdat een nieuw veld in de app anders stilletjes
  meelift.

De vormfuncties zijn puur (rijen in, dict uit) zodat ze zonder database te
testen zijn; `load` is de enige die Supabase aanraakt.
"""
from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Callable, Optional

DESK_USER_ID = os.environ.get("TRADING_DESK_USER_ID", "acff7a12-1111-481d-a7a9-cc07583b8069")

K_ACCOUNTS = "trading_accounts"
K_AUTOPILOT_ENABLED = "axe_trading_autopilot_enabled"
K_AUTOPILOT_INTERVAL = "axe_trading_autopilot_interval_min"
K_AUTOPILOT_LAST_RUN = "axe_trading_autopilot_last_run"
K_AUTOPILOT_LAST_RESULT = "axe_trading_autopilot_last_result"
K_TRACES = "axe_trading_decision_traces"
K_REPORTS = "axe_trading_intel_reports"
K_LAB_RUNS = "axe_strategy_lab_runs"
K_LEARNING = "axe_trading_agent_learning"
P_RISK = "axe_trading_risk_profile"
P_BREAKER = "axe_trading_circuit_breaker"

EXACT_KEYS = [
    K_ACCOUNTS, K_AUTOPILOT_ENABLED, K_AUTOPILOT_INTERVAL, K_AUTOPILOT_LAST_RUN,
    K_AUTOPILOT_LAST_RESULT, K_TRACES, K_REPORTS, K_LAB_RUNS, K_LEARNING,
]

ACCOUNT_FIELDS = ("id", "label", "region", "enabled", "run", "environment",
                  "liveFrameworks", "allowPartialCoverage", "addedAt")

_SECRET_KEY = re.compile(r"(token|secret|password|passwd|api[_-]?key|apikey|credential|private[_-]?key|authorization|^key$)", re.I)


def scrub(value: Any) -> Any:
    """Verwijder recursief elke sleutel die naar een geheim riekt."""
    if isinstance(value, dict):
        return {k: scrub(v) for k, v in value.items() if not _SECRET_KEY.search(str(k))}
    if isinstance(value, list):
        return [scrub(v) for v in value]
    return value


def _mask(account_id: Optional[str]) -> Optional[str]:
    return f"{account_id[:8]}…" if account_id else None


def shape_accounts(state: Any) -> list[dict]:
    accounts = (state or {}).get("accounts") or [] if isinstance(state, dict) else []
    out = []
    for a in accounts:
        if not isinstance(a, dict):
            continue
        row = {f: a.get(f) for f in ACCOUNT_FIELDS if f in a}
        row["metaApiAccount"] = _mask(a.get("accountId"))
        row["connected"] = bool(a.get("token")) and bool(a.get("accountId"))
        out.append(row)
    return out


def _account_key(key: str, prefix: str) -> str:
    return key[len(prefix) + 1:] if key.startswith(prefix + ":") else "default"


def shape_risk(settings: dict[str, Any]) -> dict:
    risk = {_account_key(k, P_RISK): v for k, v in settings.items() if k == P_RISK or k.startswith(P_RISK + ":")}
    breakers = {_account_key(k, P_BREAKER): v for k, v in settings.items() if k == P_BREAKER or k.startswith(P_BREAKER + ":")}
    return {"profiles": risk, "breakers": breakers}


def shape_autopilot(settings: dict[str, Any], lease: Optional[dict]) -> dict:
    last = settings.get(K_AUTOPILOT_LAST_RUN)
    interval = settings.get(K_AUTOPILOT_INTERVAL) or 15
    next_due = None
    if isinstance(last, str):
        try:
            t = datetime.fromisoformat(last.replace("Z", "+00:00")).timestamp() + float(interval) * 60
            next_due = datetime.fromtimestamp(t, tz=timezone.utc).isoformat()
        except ValueError:
            next_due = None
    return {
        "enabled": bool(settings.get(K_AUTOPILOT_ENABLED, False)),
        "intervalMin": interval,
        "lastRunAt": last,
        "nextDueAt": next_due,
        "lastResult": (settings.get(K_AUTOPILOT_LAST_RESULT) or None),
        "lease": lease,
        "leaseNote": None if lease else "no cross-device lease row (migration 20260922120000 not applied, or no cycle claimed yet)",
    }


def shape_decisions(traces: Any, limit: int = 20) -> list[dict]:
    out = []
    for t in (traces or [])[:limit]:
        if not isinstance(t, dict):
            continue
        v = t.get("verdict")
        base = {
            "decisionId": t.get("decisionId"), "createdAt": t.get("createdAt"), "symbol": t.get("symbol"),
            "action": t.get("finalAction"), "confidence": t.get("confidence"),
            "strategy": t.get("strategy"), "timeframe": t.get("timeframe"),
        }
        if isinstance(v, dict):
            base.update({
                "state": v.get("state"), "blockReason": v.get("blockReason"), "gates": v.get("gates") or [],
                "sizing": v.get("sizing"), "account": v.get("account"), "execution": v.get("execution"),
                "contributions": v.get("contributions"), "outcome": v.get("outcome"),
                "confidenceFloor": v.get("confidenceFloor"),
            })
        else:
            # Een spoor van vóór de gestructureerde oordelen: zeg dat, verzin geen staat.
            base.update({"state": None, "blockReason": t.get("blockedByRisk"), "legacy": True})
        out.append(base)
    return out


def _num(x: Any) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def shape_positions(trades: list[dict]) -> list[dict]:
    keep = ("id", "account_id", "account_label", "venue", "symbol", "side", "qty", "entry_price",
            "stop_loss", "take_profit", "strategy", "timeframe", "confidence", "opened_at")
    return [{k: t.get(k) for k in keep} for t in trades if t.get("status") == "open"]


def shape_pnl(trades: list[dict], now: Optional[datetime] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    today = now.date().isoformat()
    per: dict[str, dict] = {}
    for t in trades:
        if t.get("status") != "closed":
            continue
        acc = t.get("account_label") or t.get("account_id") or t.get("venue") or "unknown"
        p = per.setdefault(acc, {"closed": 0, "wins": 0, "losses": 0, "pnl": 0.0, "pnlToday": 0.0})
        pnl = _num(t.get("pnl"))
        p["closed"] += 1
        p["pnl"] += pnl
        if pnl > 0:
            p["wins"] += 1
        elif pnl < 0:
            p["losses"] += 1
        if str(t.get("closed_at") or "")[:10] == today:
            p["pnlToday"] += pnl
    for p in per.values():
        p["winRate"] = p["wins"] / p["closed"] if p["closed"] else None
        p["pnl"] = round(p["pnl"], 2)
        p["pnlToday"] = round(p["pnlToday"], 2)
    return {"byAccount": per, "note": "realised P&L of closed trades in core_trading_trades (last 1000)"}


def shape_evidence(trades: list[dict], accounts_state: Any) -> dict:
    """Gesloten trades per bewijsomgeving (paper / demo / live / unknown), zoals evidence.ts ze scheidt.

    `core_trading_trades.account_id` is het MetaAPI-account-id, niet het interne
    id; daarom op de ruwe staat gekoppeld (dat id verlaat de server niet).
    """
    env_by_id: dict[Any, Any] = {}
    raw = (accounts_state or {}).get("accounts") or [] if isinstance(accounts_state, dict) else []
    for a in raw:
        if isinstance(a, dict):
            env_by_id[a.get("accountId")] = a.get("environment")
            env_by_id[a.get("id")] = a.get("environment")
    out: dict[str, dict] = {}
    for t in trades:
        if t.get("status") != "closed":
            continue
        if t.get("venue") == "paper":
            env = "paper"
        else:
            env = env_by_id.get(t.get("account_id")) or "unknown"
        e = out.setdefault(env, {"closed": 0, "wins": 0, "pnl": 0.0})
        e["closed"] += 1
        e["wins"] += 1 if _num(t.get("pnl")) > 0 else 0
        e["pnl"] = round(e["pnl"] + _num(t.get("pnl")), 2)
    for e in out.values():
        e["winRate"] = e["wins"] / e["closed"] if e["closed"] else None
    return out


def shape_crew(reports: Any, limit: int = 12) -> list[dict]:
    latest: dict[str, dict] = {}
    for r in reports or []:
        if not isinstance(r, dict) or not r.get("ticker"):
            continue
        cur = latest.get(r["ticker"])
        if cur is None or str(r.get("createdAt") or "") > str(cur.get("createdAt") or ""):
            latest[r["ticker"]] = r
    rows = sorted(latest.values(), key=lambda r: str(r.get("createdAt") or ""), reverse=True)[:limit]
    return [{
        "symbol": r.get("ticker"), "signal": r.get("signal"), "confidence": r.get("confidence"),
        "status": r.get("status"), "createdAt": r.get("createdAt"),
        "thesis": (r.get("thesis") or "")[:400],
    } for r in rows]


def shape_lab(runs: Any, limit: int = 12) -> list[dict]:
    out = []
    for r in (runs or [])[:limit]:
        if not isinstance(r, dict):
            continue
        meta = r.get("meta") or {}
        m = (r.get("run") or {}).get("metrics") or r.get("metrics") or {}
        out.append({
            "id": r.get("id"), "savedAt": r.get("savedAt") or r.get("createdAt"),
            "symbol": meta.get("symbol"), "timeframe": meta.get("timeframe"), "strategy": meta.get("strategyLabel"),
            "from": meta.get("from"), "to": meta.get("to"),
            "trades": m.get("totalTrades"), "netReturnPct": m.get("netReturnPct"),
            "maxDrawdownPct": m.get("maxDrawdownPct"), "profitFactor": m.get("profitFactor"),
            "funded": (r.get("funded") or {}).get("status") if isinstance(r.get("funded"), dict) else None,
        })
    return out


def shape_overview(settings: dict[str, Any], trades: list[dict], lease: Optional[dict]) -> dict:
    accounts = shape_accounts(settings.get(K_ACCOUNTS))
    learning = settings.get(K_LEARNING) or {}
    return scrub({
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "accounts": accounts,
        "risk": shape_risk(settings),
        "autopilot": shape_autopilot(settings, lease),
        "positions": shape_positions(trades),
        "decisions": shape_decisions(settings.get(K_TRACES)),
        "crew": shape_crew(settings.get(K_REPORTS)),
        "pnl": shape_pnl(trades),
        "evidence": shape_evidence(trades, settings.get(K_ACCOUNTS)),
        "lab": shape_lab(settings.get(K_LAB_RUNS)),
        "learning": {k: learning.get(k) for k in ("tradesClosed", "wins", "losses", "winRate",
                                                  "learnedMinConfidence", "lastLesson", "updatedAt")
                     if isinstance(learning, dict)},
    })


# ── Supabase ────────────────────────────────────────────────────────────────

_cache: dict[str, tuple[float, dict]] = {}
CACHE_S = 15


def load(client: Any, user_id: str = DESK_USER_ID) -> tuple[dict[str, Any], list[dict], Optional[dict]]:
    """Alleen SELECTs. Service role (RLS omzeild), dus expliciet op user_id gefilterd."""
    rows = (client.table("user_settings").select("key,value").eq("user_id", user_id)
            .in_("key", EXACT_KEYS).execute().data or [])
    for prefix in (P_RISK, P_BREAKER):
        rows += (client.table("user_settings").select("key,value").eq("user_id", user_id)
                 .like("key", f"{prefix}%").execute().data or [])
    settings = {r["key"]: r.get("value") for r in rows}

    # user_id is nullable en wordt door tradingTradesService niet gezet: bureau-gebruiker of leeg.
    trades = (client.table("core_trading_trades").select("*").or_(f"user_id.eq.{user_id},user_id.is.null")
              .order("opened_at", desc=True).limit(1000).execute().data or [])

    lease = None
    try:
        res = (client.table("core_autopilot_lease").select("holder,expires_at,last_slot,heartbeat_at,status")
               .eq("id", "trading-autopilot").limit(1).execute())
        lease = (res.data or [None])[0]
    except Exception:  # tabel nog niet gemigreerd: dat zegt shape_autopilot
        lease = None
    return settings, trades, lease


def overview(client_factory: Callable[[], Any]) -> dict:
    hit = _cache.get("overview")
    if hit and time.time() - hit[0] < CACHE_S:
        return hit[1]
    settings, trades, lease = load(client_factory())
    data = shape_overview(settings, trades, lease)
    _cache["overview"] = (time.time(), data)
    return data


SECTIONS = ("accounts", "risk", "autopilot", "positions", "decisions", "crew", "pnl", "evidence", "lab", "learning")


def build_router(client_factory: Callable[[], Any]):
    from fastapi import APIRouter, HTTPException

    router = APIRouter()

    @router.get("/overview")
    async def trading_overview():
        return overview(client_factory)

    @router.get("/{section}")
    async def trading_section(section: str):
        if section not in SECTIONS:
            raise HTTPException(status_code=404, detail=f"unknown section — one of {', '.join(SECTIONS)}")
        data = overview(client_factory)
        return {"generatedAt": data["generatedAt"], section: data[section]}

    return router
