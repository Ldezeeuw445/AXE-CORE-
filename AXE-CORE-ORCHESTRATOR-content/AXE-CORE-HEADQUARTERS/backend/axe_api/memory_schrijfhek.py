"""Wanneer mag een agent of cron iets in het geheugen zetten?

Geheugen is wat AXE leert, geen run-log. Dezelfde regels als
`src/domain/memory/memoryWriteGuard.ts`: HOLD/skip/no-op, cron-runkeys en
identieke inhoud horen niet in memory / global_memory / rag_memories.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

GEHEUGEN_MAG_PER_DAG = 120

_NOOP = re.compile(
    r"^(hold\s+score=|no(?:thing)?\s*(?:new|change|op)\b|skip(?:ped|ping)?\b|no[- ]change\b)",
    re.I,
)
_HOLD_JSON = re.compile(r'"action"\s*:\s*"hold"', re.I)
_RUN_KEY = re.compile(r"^agent_run:", re.I)
_CYCLE_KEY = re.compile(r":(cycle):", re.I)
_TS_STAART = re.compile(r":\d{10,13}$")
_UUID_STAART = re.compile(
    r":[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.I,
)

GEHEUGEN_TABELLEN = frozenset({"memory", "global_memory", "rag_memories"})


def inhoud_hash(tekst: str) -> str:
    return hashlib.sha256((tekst or "").strip().encode("utf-8")).hexdigest()[:16]


def is_noop(tekst: Optional[str]) -> bool:
    t = (tekst or "").strip()
    if not t:
        return True
    if _NOOP.search(t):
        return True
    if _HOLD_JSON.search(t) and re.search(r"\bhold\b", t, re.I):
        return True
    return False


def is_run_log(key: Optional[str]) -> bool:
    k = key or ""
    return bool(_RUN_KEY.search(k) or _CYCLE_KEY.search(k))


def stabiele_sleutel(key: Optional[str]) -> str:
    k = (key or "").strip()
    if not k:
        return ""
    if _RUN_KEY.match(k):
        k = _TS_STAART.sub("", k)
        return ":".join(k.split(":")[:3])
    k = _TS_STAART.sub("", k)
    return _UUID_STAART.sub("", k)


def sleutel_met_hash(key: Optional[str], hash_: str) -> str:
    basis = stabiele_sleutel(key)
    if not basis:
        return f"mem:{hash_}" if hash_ else ""
    if basis.endswith(f":{hash_}"):
        return basis
    return f"{basis}:{hash_}"


def mag_schrijven(
    *,
    key: Optional[str] = None,
    content: Optional[str] = None,
    hash_: Optional[str] = None,
    bestaande_hash: Optional[str] = None,
    vandaag_al: int = 0,
    cap: int = GEHEUGEN_MAG_PER_DAG,
) -> str:
    tekst = (content or "").strip()
    if not tekst:
        return "leeg"
    if is_run_log(key):
        return "run_log"
    if is_noop(tekst):
        return "noop"
    h = hash_ or inhoud_hash(tekst)
    if bestaande_hash and bestaande_hash == h:
        return "duplicate"
    if vandaag_al >= cap:
        return "cap"
    return "ok"


def _tekst(tabel: str, data: dict) -> str:
    if tabel == "global_memory":
        return str(data.get("value") or "")
    return str(data.get("content") or "")


def _sleutel(data: dict) -> str:
    return str(data.get("key") or "")


def _agent(tabel: str, data: dict) -> str:
    if tabel == "memory":
        return str(data.get("agent") or "global")
    meta = data.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            meta = {}
    if isinstance(meta, dict) and meta.get("agentId"):
        return str(meta["agentId"])
    if tabel == "rag_memories":
        return "rag"
    return "global"


def _meta(data: dict) -> dict:
    meta = data.get("metadata") or {}
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            meta = {}
    return dict(meta) if isinstance(meta, dict) else {}


def herschrijf(tabel: str, data: dict) -> tuple[str, Optional[dict]]:
    """Zonder database: weiger ruis, zet een stabiele sleutel + inhoudshash."""
    tekst = _tekst(tabel, data)
    key = _sleutel(data)
    reden = mag_schrijven(key=key, content=tekst)
    if reden != "ok":
        return reden, None
    h = inhoud_hash(tekst)
    uit = dict(data)
    meta = _meta(data)
    meta["content_hash"] = h
    uit["metadata"] = meta
    if tabel != "rag_memories":
        uit["key"] = sleutel_met_hash(key, h) if key else f"mem:{h}"
    return "ok", uit


def _vandaag_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00Z")


def _tel_vandaag(sb: Any, tabel: str, agent: str) -> int:
    vandaag = _vandaag_iso()
    q = sb.table(tabel).select("id", count="exact").gte("created_at", vandaag).limit(1)
    if tabel == "memory":
        q = q.eq("agent", agent)
    result = q.execute()
    n = getattr(result, "count", None)
    if isinstance(n, int):
        return n
    data = getattr(result, "data", None) or []
    return len(data)


def _bestaat_sleutel(sb: Any, tabel: str, key: str) -> bool:
    if not key or tabel == "rag_memories":
        return False
    kolom = "key"
    result = sb.table(tabel).select("id").eq(kolom, key).limit(1).execute()
    return bool(getattr(result, "data", None))


def _bestaat_rag_hash(sb: Any, hash_: str) -> bool:
    try:
        result = (
            sb.table("rag_memories")
            .select("id")
            .contains("metadata", {"content_hash": hash_})
            .limit(1)
            .execute()
        )
        return bool(getattr(result, "data", None))
    except Exception:
        return False


def filter_rij(sb: Any, tabel: str, data: dict) -> tuple[str, Optional[dict]]:
    """Bron van waarheid op de VPS. Cron, HOLD en duplicaten komen hier niet voorbij."""
    if tabel not in GEHEUGEN_TABELLEN:
        return "ok", data
    reden, uit = herschrijf(tabel, data)
    if reden != "ok" or uit is None:
        return reden, None
    try:
        if tabel == "rag_memories":
            h = (_meta(uit).get("content_hash") or "")
            if h and _bestaat_rag_hash(sb, h):
                return "duplicate", None
        else:
            if _bestaat_sleutel(sb, tabel, str(uit.get("key") or "")):
                return "duplicate", None
        agent = _agent(tabel, uit)
        if _tel_vandaag(sb, tabel, agent) >= GEHEUGEN_MAG_PER_DAG:
            return "cap", None
    except Exception:
        # Tellen mislukt: weiger geen echte les. noop/run_log is al afgevangen.
        pass
    return "ok", uit


def filter_batch(sb: Any, tabel: str, rijen: list[dict]) -> tuple[list[dict], dict[str, int]]:
    """Zelfde hek, één cap-telling voor de hele batch."""
    gehouden: list[dict] = []
    skipped: dict[str, int] = {}
    for rij in rijen:
        reden, uit = herschrijf(tabel, rij)
        if reden != "ok" or uit is None:
            skipped[reden] = skipped.get(reden, 0) + 1
            continue
        gehouden.append(uit)
    if not gehouden:
        return [], skipped
    try:
        # Cap geldt per agent; we tellen eenmaal en kappen de rest af.
        per_agent: dict[str, int] = {}
        nog: list[dict] = []
        for rij in gehouden:
            agent = _agent(tabel, rij)
            if agent not in per_agent:
                per_agent[agent] = _tel_vandaag(sb, tabel, agent)
            if per_agent[agent] >= GEHEUGEN_MAG_PER_DAG:
                skipped["cap"] = skipped.get("cap", 0) + 1
                continue
            if tabel != "rag_memories" and _bestaat_sleutel(sb, tabel, str(rij.get("key") or "")):
                skipped["duplicate"] = skipped.get("duplicate", 0) + 1
                continue
            if tabel == "rag_memories":
                h = str(_meta(rij).get("content_hash") or "")
                if h and _bestaat_rag_hash(sb, h):
                    skipped["duplicate"] = skipped.get("duplicate", 0) + 1
                    continue
            nog.append(rij)
            per_agent[agent] = per_agent.get(agent, 0) + 1
        return nog, skipped
    except Exception:
        return gehouden, skipped
