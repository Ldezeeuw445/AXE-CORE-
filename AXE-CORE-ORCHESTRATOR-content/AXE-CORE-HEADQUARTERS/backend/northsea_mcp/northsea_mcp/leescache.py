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

# Tabellen die NA aanmaak nog veranderen maar geen updated_at hebben: de cursor
# op created_at ziet die wijziging niet (communications.delivery_status bij een
# bounce). Die laden we daarom ook periodiek helemaal opnieuw.
# 16 nov: reply_drafts en deal_tasks hebben wel updated_at, maar een afwijzing
# buiten de MCP om (een UPDATE zonder updated_at) bleef zo dagen "pending" in
# de lijst voor Luka. Ook die twee elk half uur vol; het zijn kleine tabellen.
VOLLEDIG_HERLADEN_NA_S: dict[str, int] = {"communications": 30 * 60, "reply_drafts": 30 * 60, "deal_tasks": 30 * 60}

TOEGESTANE_CURSOR = frozenset({"updated_at", "created_at", "occurred_at", "id"})

# Per snapshot-tabel, gemeten 15 nov in kbimnuepbecbyezedvih. Zonder deze kaart
# koos fetch_all updated_at voor select=* (deal_evidence, verification_checks,
# match_assessments) en communications na de review-fix van #312 — PostgREST
# 400, engine/operations 502. Volgorde: updated_at, anders created_at, anders
# occurred_at. Runtime-fallback in repository.py vangt een verkeerde kaart op.
CURSOR_KOLOM: dict[str, str] = {
    "opportunities": "updated_at",
    "buyer_requirements": "updated_at",
    "supplier_offers": "updated_at",
    "companies": "updated_at",
    "contacts": "updated_at",
    "communications": "created_at",
    "email_intelligence": "updated_at",
    "northsea_followups": "updated_at",
    "northsea_audit_events": "occurred_at",
    "call_intelligence": "updated_at",
    "reply_drafts": "updated_at",
    "deal_tasks": "updated_at",
    "action_queue": "updated_at",
    "deal_events": "created_at",
    "deal_evidence": "created_at",
    "deal_documents": "updated_at",
    "inbound_email_attachments": "created_at",
    "verification_checks": "created_at",
    "match_assessments": "created_at",
    "sourcing_campaigns": "updated_at",
    "sourcing_candidates": "updated_at",
    "deal_automation_policy": "updated_at",
    "commissions": "updated_at",
}

# Alias: tabellen zonder updated_at. Tests en commentaar gebruiken deze naam.
APPEND_CURSOR: dict[str, str] = {t: k for t, k in CURSOR_KOLOM.items() if k != "updated_at"}


async def haal_tabellen(repo: Any, namen: list[str], *, return_exceptions: bool = True) -> list[Any]:
    """Hooguit GELIJKTIJDIG tegelijk. 8 nov: gather zonder rem maakte 30+ calls."""
    rem = asyncio.Semaphore(GELIJKTIJDIG)

    async def een(naam: str):
        async with rem:
            return await repo.fetch_all(naam)
    return await asyncio.gather(*(een(n) for n in namen), return_exceptions=return_exceptions)


def cursor_kolom(table: str, select: str = "") -> str:
    """updated_at als hij bestaat, anders created_at, anders occurred_at.

    De kaart is de bron. select is alleen voor tabellen die we nog niet kennen:
    PostgREST mag filteren op een kolom buiten de projectie, maar de cursor
    wordt uit de rijen gelezen, dus een ontbrekende kolom in de select gaf
    een lege cursor en weer een volle scan (#312). Een kolom die in de select
    staat maar niet in de tabel geeft 400 — daarom de kaart, niet de select.
    """
    if table in CURSOR_KOLOM:
        return CURSOR_KOLOM[table]
    kolommen = {p.strip() for p in select.split(",") if p.strip()} if select and select != "*" else set()
    for kandidaat in ("updated_at", "created_at", "occurred_at"):
        if kandidaat in kolommen:
            return kandidaat
    return "updated_at"


def cursor_kandidaten(eerste: str) -> list[str]:
    """Eerst de kaart, bij 400 één keer created_at, daarna id (geen timestamp)."""
    if eerste not in TOEGESTANE_CURSOR:
        eerste = "updated_at"
    if eerste == "id":
        return ["id"]
    out: list[str] = []
    for k in (eerste, "created_at", "id"):
        if k not in out:
            out.append(k)
    return out


def select_zonder_kolom(select: str, kolom: str) -> str:
    """Haal een onbestaande kolom uit de projectie; `*` blijft `*`."""
    if not select or select == "*" or kolom not in TOEGESTANE_CURSOR:
        return select
    delen = [p for p in select.split(",") if p.strip() != kolom]
    return ",".join(delen) if delen else "id"


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
    for code in ("PGRST002", "PGRST204", "42703"):
        if code in (body or ""):
            return code
    return None


def onbekende_kolom(status: int, body: str = "") -> bool:
    """PostgREST 400: de gevraagde kolom zit niet in het schema (PGRST204 / 42703)."""
    if status != 400:
        return False
    return pgrst_code(body) in {"PGRST204", "42703"}


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

    Schijf is goedkoop en overleeft een herstart, zodat deploy 1.5.2 niet meteen
    weer 23 volle scans doet. Alleen onder NORTHSEA_TABLE_CACHE_DIR (op de VPS
    /opt/northsea-mcp/state — ProtectSystem weigert /var/tmp). De gekozen
    cursor-kolom gaat mee: anders probeert een herstart opnieuw updated_at
    op tabellen waar die 400 gaf.
    """

    def __init__(self, pad: str | Path | None = None):
        self._pad = Path(pad) if pad else None
        self._rijen: dict[str, dict[str, dict]] = {}
        self._cursor: dict[str, str] = {}
        self._truncated: dict[str, bool] = {}
        self._kolom: dict[str, str] = {}
        self._vol: set[str] = set()
        self._vol_op: dict[str, float] = {}
        self._disk_gelezen: set[str] = set()
        if self._pad:
            try:
                self._pad.mkdir(parents=True, exist_ok=True)
            except OSError:
                self._pad = None

    def heeft_volle_lading(self, table: str) -> bool:
        self._uit_disk(table)
        if table not in self._vol:
            return False
        maxleeftijd = VOLLEDIG_HERLADEN_NA_S.get(table)
        # Na een herstart (lading van schijf, zonder tijd) of te oud: opnieuw vol.
        if maxleeftijd and time.monotonic() - self._vol_op.get(table, float("-inf")) > maxleeftijd:
            return False
        return True

    def cursor(self, table: str) -> str:
        self._uit_disk(table)
        return self._cursor.get(table, "")

    def truncated(self, table: str) -> bool:
        self._uit_disk(table)
        return bool(self._truncated.get(table))

    def kolom(self, table: str) -> str:
        self._uit_disk(table)
        k = self._kolom.get(table, "")
        return k if k in TOEGESTANE_CURSOR else ""

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
        if kolom in TOEGESTANE_CURSOR:
            self._kolom[table] = kolom
        boven = hoogste_cursor(bak.values(), kolom)
        if boven:
            self._cursor[table] = boven
        if vol:
            self._vol.add(table)
            self._vol_op[table] = time.monotonic()
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
        gekozen = data.get("kolom")
        if isinstance(gekozen, str) and gekozen in TOEGESTANE_CURSOR:
            self._kolom[table] = gekozen
        self._truncated[table] = bool(data.get("truncated"))
        self._vol.add(table)

    def _naar_disk(self, table: str) -> None:
        pad = self._bestand(table)
        if pad is None:
            return
        tmp = pad.with_suffix(".json.tmp")
        payload = {
            "cursor": self._cursor.get(table, ""),
            "kolom": self._kolom.get(table, ""),
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
