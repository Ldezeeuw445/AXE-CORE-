"""Incrementele leesvoorraad + backoff voor AXE Commodities.

10 nov 2026: de leeslaag op de IONOS-VPS vroeg elke tik de 23 snapshot-tabellen
volledig op via PostgREST (service_role, pagina's van 1000, zonder cursor).
system_health forceerde dat nóg eens met fresh=True, de mailwachter deed de
zeven inbound-tabellen elke minuut, en de engine startte dertien fetches
tegelijk. De Micro-database (kbimnuepbecbyezedvih) gaf 521/503/PGRST002 en
NorthSea kon niet meer versturen.

Deze module houdt per tabel een voorraad + cursor bij, zodat een tweede leesbeurt
alleen rijen na de cursor haalt, en stopt met hameren als Supabase 5xx teruggeeft.
"""
from __future__ import annotations

import asyncio
import copy
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Iterable, Mapping

log = logging.getLogger("northsea_mcp.leescache")

PAGINA = 200
MAX_RIJEN = 5000
GELIJKTIJDIG = 4  # 8 nov: 30+ PostgREST-calls tegelijk, pool van AXE Commodities liep vast
BACKOFF_START_S = 8.0
BACKOFF_MAX_S = 600.0  # 10 min: daarna is nóg een volle scan zinloos tot de pool herstelt
TABELNAAM = re.compile(r"^[a-z][a-z0-9_]{0,62}$")

# Tabellen zonder updated_at: alleen append, cursor op het tijdstip van invoegen.
# northsea_audit_events heeft occurred_at, geen created_at/updated_at (P0.4).
APPEND_CURSOR: dict[str, str] = {
    "deal_events": "created_at",
    "northsea_audit_events": "occurred_at",
    "inbound_email_attachments": "created_at",
}


async def haal_tabellen(repo: Any, namen: list[str], *, return_exceptions: bool = True) -> list[Any]:
    """Hooguit GELIJKTIJDIG tegelijk. 8 nov: gather zonder rem maakte 30+ calls."""
    rem = asyncio.Semaphore(GELIJKTIJDIG)

    async def een(naam: str):
        async with rem:
            return await repo.fetch_all(naam)
    return await asyncio.gather(*(een(n) for n in namen), return_exceptions=return_exceptions)


def cursor_kolom(table: str, select: str = "") -> str:
    """updated_at, behalve append-only of een select zonder die kolom.

    Filteren op een kolom die niet in de projectie zit werkt in PostgREST, maar
    de cursor wordt uit de teruggegeven rijen gelezen. Zonder updated_at in
    SNAPSHOT_SELECT bleef de cursor leeg en deed élke volgende leesbeurt een
    volle scan (communications, review op PR 312).
    """
    if table in APPEND_CURSOR:
        return APPEND_CURSOR[table]
    if select and select != "*" and "updated_at" not in select:
        if "created_at" in select:
            return "created_at"
        if "occurred_at" in select:
            return "occurred_at"
    return "updated_at"


def postgrest_ts(waarde: str) -> str:
    """+00:00 → Z: anders wordt '+' in de querystring een spatie en faalt de filter."""
    s = (waarde or "").strip().replace(" ", "T")
    if s.endswith("+00:00"):
        return s[:-6] + "Z"
    return s


def rij_cursor(row: Mapping[str, Any], kolom: str) -> str:
    v = row.get(kolom)
    return str(v) if v else ""


def hoogste_cursor(rijen: Iterable[Mapping[str, Any]], kolom: str) -> str:
    return max((rij_cursor(r, kolom) for r in rijen), default="")


def voeg_samen(voorraad: dict[str, dict], rijen: Iterable[Mapping[str, Any]]) -> dict[str, dict]:
    """Nieuwe rijen overschrijven op id; bestaande blijven. Geen deletes (desk is klein)."""
    for r in rijen:
        i = r.get("id")
        if i is None:
            continue
        voorraad[str(i)] = dict(r)
    return voorraad


def supabase_overbelast(status: int, body: str = "") -> bool:
    """5xx, Cloudflare 521, of PostgREST die de schema-cache niet kan lezen (PGRST002)."""
    if status == 521 or status >= 500:
        return True
    return "PGRST002" in (body or "")


def pgrst_code(body: str) -> str | None:
    """Alleen de stabiele code, nooit de body (daarin kan een query of rij staan)."""
    if "PGRST002" in (body or ""):
        return "PGRST002"
    return None


class LeesBackoff:
    """Na 5xx niet elke tik opnieuw: exponentieel, plafond 10 min.

    ping() mag wél blijven prikken (één limit=1); fetch_all/engine-tick niet.
    """

    def __init__(self, *, start_s: float = BACKOFF_START_S, max_s: float = BACKOFF_MAX_S,
                 klok=time.monotonic):
        self.start_s = start_s
        self.max_s = max_s
        self._klok = klok
        self._tot = 0.0
        self._fails = 0

    def actief(self) -> bool:
        return self._klok() < self._tot

    def rest_s(self) -> float:
        return max(0.0, self._tot - self._klok())

    def faal(self) -> float:
        self._fails += 1
        delay = min(self.max_s, self.start_s * (2 ** (self._fails - 1)))
        self._tot = self._klok() + delay
        return delay

    def herstel(self) -> None:
        self._fails = 0
        self._tot = 0.0


class TabelVoorraad:
    """Per-tabel rijen + cursor, in geheugen, en op schijf als de map schrijfbaar is.

    Schijf is goedkoop en overleeft een herstart, zodat deploy 1.5.1 niet meteen
    weer 23 volle scans doet. Alleen onder NORTHSEA_TABLE_CACHE_DIR (op de VPS
    /opt/northsea-mcp/state — ProtectSystem weigert /var/tmp).
    """

    def __init__(self, pad: str | Path | None = None):
        self._pad = Path(pad) if pad else None
        self._rijen: dict[str, dict[str, dict]] = {}
        self._cursor: dict[str, str] = {}
        self._truncated: dict[str, bool] = {}
        self._vol: set[str] = set()
        self._disk_gelezen: set[str] = set()
        if self._pad:
            try:
                self._pad.mkdir(parents=True, exist_ok=True)
            except OSError:
                self._pad = None

    def heeft_volle_lading(self, table: str) -> bool:
        self._uit_disk(table)
        return table in self._vol

    def cursor(self, table: str) -> str:
        self._uit_disk(table)
        return self._cursor.get(table, "")

    def truncated(self, table: str) -> bool:
        self._uit_disk(table)
        return bool(self._truncated.get(table))

    def rijen(self, table: str) -> list[dict]:
        self._uit_disk(table)
        # Kopie: engine.tick(dry_run=True) zet velden op de geretourneerde dicts
        # (o.a. action_queue.status). Zonder kopie slaat de volgende echte tick
        # die rijen over omdat de cache al "klaar" lijkt.
        return [copy.deepcopy(r) for r in self._rijen.get(table, {}).values()]

    def merge(self, table: str, rijen: list[dict], kolom: str, *, truncated: bool, vol: bool) -> None:
        self._uit_disk(table)
        bak = self._rijen.setdefault(table, {})
        voeg_samen(bak, rijen)
        boven = hoogste_cursor(bak.values(), kolom)
        if boven:
            self._cursor[table] = boven
        if vol:
            self._vol.add(table)
        if truncated:
            self._truncated[table] = True
        elif vol or table in self._vol:
            # Een incrementele pagina die niet vol zat: we hebben de rest ingehaald.
            if not truncated:
                self._truncated[table] = False
        self._naar_disk(table)

    def _bestand(self, table: str) -> Path | None:
        if not self._pad or not TABELNAAM.match(table):
            return None
        return self._pad / f"{table}.json"

    def _uit_disk(self, table: str) -> None:
        if table in self._disk_gelezen:
            return
        self._disk_gelezen.add(table)
        pad = self._bestand(table)
        if pad is None or not pad.is_file():
            return
        try:
            data = json.loads(pad.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, UnicodeError):
            return
        if not isinstance(data, dict):
            return
        rijen = data.get("rows")
        if not isinstance(rijen, list):
            return
        bak: dict[str, dict] = {}
        voeg_samen(bak, (r for r in rijen if isinstance(r, dict)))
        self._rijen[table] = bak
        cur = data.get("cursor")
        if isinstance(cur, str) and cur:
            self._cursor[table] = cur
        self._truncated[table] = bool(data.get("truncated"))
        self._vol.add(table)

    def _naar_disk(self, table: str) -> None:
        pad = self._bestand(table)
        if pad is None:
            return
        tmp = pad.with_suffix(".json.tmp")
        payload = {
            "cursor": self._cursor.get(table, ""),
            "truncated": bool(self._truncated.get(table)),
            "rows": list(self._rijen.get(table, {}).values()),
        }
        try:
            tmp.write_text(json.dumps(payload, default=str), encoding="utf-8")
            os.replace(tmp, pad)
        except OSError:
            log.warning("tabelcache %s niet schrijfbaar", table)
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass
