"""Verbruik per sleutel (Luka, 23 nov 2026).

"Keys per app: alle sleutels, met verbruik dat AXE zelf kan lezen." Tot nu toe
wist AXE alleen dát een sleutel er stond en of hij een uur geleden afkoelde.
Elke modelaanroep telt nu mee in core_key_usage: per dag en per NAAM van de
env-variabele (nooit de waarde). Aanroepen, gelukt, mislukt, limiet (429/402)
en tokens.

De aanroepers hebben vaak alleen de waarde in handen; `naam_van` zoekt de
env-naam die die waarde draagt. Tellen kost niets op het pad van de aanroep:
het gaat in een buffer die elke minuut in één keer naar de database gaat,
via de functie axe_tel_sleutel (optellen, dus meerdere processen tegelijk is
goed). Faalt de database, dan is alleen die minuut tellen weg -- nooit de
aanroep zelf.
"""
from __future__ import annotations

import hashlib
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Mapping, Optional

FLUSH_S = 60.0
_NAAM_SUFFIX = ("_KEY", "_TOKEN", "_SECRET")

_slot = threading.Lock()
_buffer: dict[tuple[str, str], dict[str, int]] = {}
_naam_cache: dict[str, Optional[str]] = {}
_flusher: Optional[threading.Thread] = None
_schrijver: Optional[Callable[[list[dict[str, Any]]], None]] = None


def _vinger(waarde: str) -> str:
    return hashlib.sha256(waarde.encode("utf-8")).hexdigest()[:24]


def naam_van(waarde: Optional[str], env: Optional[Mapping[str, str]] = None) -> Optional[str]:
    """De env-naam die deze sleutel draagt, of None. Een naam erin geeft hem terug."""
    if not waarde:
        return None
    bron = os.environ if env is None else env
    if waarde in bron and waarde.isupper():
        return waarde
    vinger = _vinger(waarde)
    if env is None and vinger in _naam_cache:
        return _naam_cache[vinger]
    gevonden = None
    for naam, w in bron.items():
        if w == waarde and naam.endswith(_NAAM_SUFFIX):
            gevonden = naam
            break
    if env is None:
        _naam_cache[vinger] = gevonden
    return gevonden


def soort(status: Optional[int]) -> str:
    if status == 200:
        return "ok"
    if status in (402, 429):
        return "limiet"
    return "mislukt"


def tel(sleutel: Optional[str], status: Optional[int], tokens: int = 0, nu: Optional[datetime] = None) -> Optional[str]:
    """Tel één aanroep. `sleutel` mag een waarde of een env-naam zijn. Geeft de naam terug."""
    naam = naam_van(sleutel)
    if not naam:
        return None
    dag = (nu or datetime.now(timezone.utc)).date().isoformat()
    s = soort(status)
    with _slot:
        rij = _buffer.setdefault((dag, naam), {"calls": 0, "ok": 0, "mislukt": 0, "limiet": 0, "tokens": 0, "status": 0})
        rij["calls"] += 1
        rij[s] += 1
        rij["tokens"] += max(0, int(tokens or 0))
        rij["status"] = int(status or 0)
    _start_flusher()
    return naam


def leeg_buffer() -> list[dict[str, Any]]:
    """Pak de buffer als RPC-argumenten en maak hem leeg."""
    with _slot:
        rijen = [
            {"p_dag": dag, "p_sleutel": naam, "p_calls": r["calls"], "p_ok": r["ok"], "p_mislukt": r["mislukt"],
             "p_limiet": r["limiet"], "p_tokens": r["tokens"], "p_status": r["status"] or None}
            for (dag, naam), r in _buffer.items()
        ]
        _buffer.clear()
    return rijen


def _standaard_schrijver(rijen: list[dict[str, Any]]) -> None:
    url, srk = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and srk):
        return
    from supabase import create_client

    db = create_client(url, srk)
    for r in rijen:
        db.rpc("axe_tel_sleutel", r).execute()


def flush() -> int:
    rijen = leeg_buffer()
    if not rijen:
        return 0
    try:
        (_schrijver or _standaard_schrijver)(rijen)
    except Exception:  # noqa: BLE001 -- tellen mag nooit iets breken
        return 0
    return len(rijen)


def _lus() -> None:
    while True:
        time.sleep(FLUSH_S)
        flush()


def _start_flusher() -> None:
    global _flusher
    if _flusher is not None or os.environ.get("AXE_SLEUTEL_TELLER_UIT"):
        return
    with _slot:
        if _flusher is None:
            _flusher = threading.Thread(target=_lus, name="sleutel-teller", daemon=True)
            _flusher.start()


def samenvatting(rijen: list[dict[str, Any]], nu: Optional[datetime] = None) -> dict[str, dict[str, Any]]:
    """Per sleutel: vandaag, gisteren en 7 dagen. Puur, voor /keys/overview."""
    nu = nu or datetime.now(timezone.utc)
    vandaag = nu.date()
    gisteren = vandaag - timedelta(days=1)
    uit: dict[str, dict[str, Any]] = {}
    for r in rijen:
        naam = str(r.get("sleutel") or "")
        if not naam:
            continue
        try:
            dag = datetime.fromisoformat(str(r.get("dag"))[:10]).date()
        except ValueError:
            continue
        u = uit.setdefault(naam, {"calls_today": 0, "ok_today": 0, "failed_today": 0, "limited_today": 0,
                                  "tokens_today": 0, "calls_yesterday": 0, "calls_7d": 0, "last_status": None,
                                  "last_at": None})
        calls = int(r.get("calls") or 0)
        if (vandaag - dag).days < 7:
            u["calls_7d"] += calls
        if dag == vandaag:
            u["calls_today"] += calls
            u["ok_today"] += int(r.get("ok") or 0)
            u["failed_today"] += int(r.get("mislukt") or 0)
            u["limited_today"] += int(r.get("limiet") or 0)
            u["tokens_today"] += int(r.get("tokens") or 0)
        elif dag == gisteren:
            u["calls_yesterday"] += calls
        at = r.get("laatste_at")
        if at and (u["last_at"] is None or str(at) > str(u["last_at"])):
            u["last_at"] = str(at)
            u["last_status"] = r.get("laatste_status")
    return uit


def lees(db: Any, nu: Optional[datetime] = None) -> dict[str, dict[str, Any]]:
    nu = nu or datetime.now(timezone.utc)
    sinds = (nu.date() - timedelta(days=7)).isoformat()
    rijen = db.table("core_key_usage").select("*").gte("dag", sinds).limit(2000).execute().data or []
    return samenvatting(rijen, nu)
