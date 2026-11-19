"""Live voortgang in het managergesprek (BOUWLIJST "Eerst", punt 2 -- 19 nov 2026).

Luka geeft een manager in de chat een opdracht, die wordt een taak op de
achtergrond, en Luka praat gewoon door. Tot nu toe hoorde hij pas iets als de
app de taak zelf volgde -- en dan in de AXE-hoofdchat, niet bij die manager.
De taak schreef intussen wel events (core_task_events): begonnen, stap 3,
controleren, wacht op ok, klaar. Die kwamen het gesprek nooit in.

Nu: een taak die uit een managergesprek komt draagt `metadata.chat_manager`
(de app zet dat in stuurAxeJobs.ts). Deze lus leest elke paar seconden de
nieuwe events en zet ze als korte regel in DAT gesprek, van die manager aan
Luka. Op de VPS, dus ook als de app dicht is, en op elk apparaat gelijk.

Geen spam: tussenstappen hooguit één per TUSSENPOOS per taak en maximaal
MAX_STAPPEN per taak; begin, controleren, wacht-op-jou, klaar en mislukt
komen altijd. Tussenstappen staan meteen op gelezen (geen badge); alleen
"wacht op jou", klaar en mislukt tellen als nieuw.

Eén statustaal, overal dezelfde: planning / running / waiting_approval /
verifying / completed / failed (zie `STATUS`).
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Callable

log = logging.getLogger("axe.taak_voortgang")

LUKA = "luka"
CHAT_SLEUTEL = "chat_manager"
TUSSENPOOS = 45.0      # seconden tussen twee tussenstappen van één taak
MAX_STAPPEN = 6        # tussenstappen per taak, daarna alleen nog de eindstand
ELKE = 4.0             # seconden tussen twee rondes

# De ene statustaal (audit 19 nov: "geen done naast completed").
STATUS = ("planning", "running", "waiting_approval", "verifying", "completed", "failed")
_GELIJK = {
    "done": "completed", "success": "completed", "succeeded": "completed", "finished": "completed",
    "error": "failed", "errored": "failed", "cancelled": "failed", "canceled": "failed",
    "pending": "planning", "queued": "planning", "claimed": "running", "in_progress": "running",
    "awaiting_approval": "waiting_approval", "needs_approval": "waiting_approval", "blocked": "waiting_approval",
}


def status(ruw: Any) -> str:
    """Elke status die ergens in AXE voorkomt, in de ene taal hierboven."""
    s = str(ruw or "").strip().lower()
    return s if s in STATUS else _GELIJK.get(s, "running")


EVENTS = (
    "task.claimed", "axe.progress", "task.verifying", "approval.requested",
    "task.retrying", "task.completed", "task.failed", "task.cancelled",
)


def _kort(s: Any, n: int = 160) -> str:
    t = " ".join(str(s or "").split())
    return t if len(t) <= n else t[: n - 1] + "…"


def _stap(bericht: str) -> str | None:
    """Een ruwe stapregel van de agent-lus als iets wat een mens wil lezen."""
    b = _kort(bericht, 200)
    if not b:
        return None
    b = re.sub(r"^Step \d+:\s*", "", b)
    m = re.match(r"^\$\s*(.+)$", b)
    if m:
        cmd = m.group(1)
        if re.search(r"\b(pytest|vitest|npm (run )?test|tsc|jest)\b", cmd):
            return "Tests draaien."
        if re.match(r"(cat|ls|head|tail|grep|rg|find|sed -n)\b", cmd):
            return "Bestanden lezen."
        if re.match(r"git (diff|status|log)\b", cmd):
            return "Wijzigingen bekijken."
        if re.match(r"git (commit|push)\b", cmd):
            return "Werk vastleggen in git."
        return f"Bezig: {_kort(cmd, 80)}"
    if b.lower().startswith("writing "):
        return f"Schrijven: {_kort(b[8:].rsplit('/', 1)[-1], 80)}"
    if "workspace ready" in b.lower() or b.lower().startswith("axe started"):
        return None  # het begin zegt task.claimed al
    return _kort(b, 140)


def _uitkomst(taak: dict[str, Any]) -> str:
    r = taak.get("result")
    if isinstance(r, dict):
        for k in ("summary", "samenvatting", "text", "answer", "message"):
            if r.get(k):
                return _kort(r[k], 400)
    elif r:
        return _kort(r, 400)
    return ""


def _fout(taak: dict[str, Any], event: dict[str, Any]) -> str:
    e = taak.get("error")
    if isinstance(e, dict):
        e = e.get("message") or e.get("code")
    return _kort(e or event.get("message") or "onbekende fout", 200)


def regel(event: dict[str, Any], taak: dict[str, Any]) -> tuple[str, bool, bool] | None:
    """(tekst, telt_als_nieuw, is_tussenstap) of None als het niets zegt."""
    soort = str(event.get("event_type") or "")
    titel = _kort(taak.get("title"), 70) or "je opdracht"
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    if soort == "task.claimed":
        if int(data.get("attempt") or 1) > 1:
            return None
        return f"Ik ben begonnen aan “{titel}”.", False, False
    if soort == "axe.progress":
        s = _stap(str(event.get("message") or ""))
        return (s, False, True) if s else None
    if soort == "task.verifying":
        return "Ik controleer of het echt werkt.", False, False
    if soort == "approval.requested":
        wat = _kort(event.get("message"), 160)
        return (f"Ik wacht op je ok{': ' + wat if wat else ''}. Zeg “ok” of “nee” hier.", True, False)
    if soort == "task.retrying":
        return "Dat ging mis; ik probeer het opnieuw.", False, False
    if soort == "task.completed":
        uit = _uitkomst(taak)
        return (f"Klaar met “{titel}”.{(' ' + uit) if uit else ''}", True, False)
    if soort in ("task.failed", "task.cancelled"):
        if soort == "task.cancelled":
            return f"“{titel}” is gestopt.", True, False
        return f"“{titel}” lukte niet: {_fout(taak, event)}", True, False
    return None


class Verteller:
    """Houdt per taak bij wat er al gezegd is (in het geheugen van dit proces)."""

    def __init__(self, klok: Callable[[], float] = time.monotonic):
        self.klok = klok
        self.laatste_stap: dict[str, float] = {}
        self.stappen: dict[str, int] = {}
        self.laatst_gezegd: dict[str, str] = {}

    def mag(self, task_id: str, tekst: str, tussenstap: bool) -> bool:
        if self.laatst_gezegd.get(task_id) == tekst:
            return False
        if tussenstap:
            nu = self.klok()
            if self.stappen.get(task_id, 0) >= MAX_STAPPEN:
                return False
            if nu - self.laatste_stap.get(task_id, -1e9) < TUSSENPOOS:
                return False
            self.laatste_stap[task_id] = nu
            self.stappen[task_id] = self.stappen.get(task_id, 0) + 1
        self.laatst_gezegd[task_id] = tekst
        return True


def chat_manager(taak: dict[str, Any]) -> str | None:
    meta = taak.get("metadata") if isinstance(taak.get("metadata"), dict) else {}
    m = str(meta.get(CHAT_SLEUTEL) or "").strip()
    return m or None


def ronde(db: Any, cursor: int, verteller: Verteller, niet_chat: set[str]) -> int:
    """Eén ronde. Geeft de nieuwe cursor (hoogste gelezen sequence) terug."""
    rijen = (db.table("core_task_events").select("sequence,task_id,event_type,actor_type,message,data")
             .gt("sequence", cursor).in_("event_type", list(EVENTS))
             .order("sequence").limit(200).execute().data or [])
    if not rijen:
        return cursor
    nieuw = max(int(r.get("sequence") or cursor) for r in rijen)
    systeem_verslagen(db, rijen)
    ids = sorted({str(r.get("task_id")) for r in rijen if r.get("task_id") and str(r.get("task_id")) not in niet_chat})
    taken: dict[str, dict[str, Any]] = {}
    if ids:
        for t in (db.table("core_tasks").select("id,title,status,result,error,metadata")
                  .in_("id", ids).execute().data or []):
            if chat_manager(t):
                taken[str(t.get("id"))] = t
            else:
                niet_chat.add(str(t.get("id")))
    for r in rijen:
        taak = taken.get(str(r.get("task_id")))
        if not taak:
            continue
        uit = regel(r, taak)
        if not uit:
            continue
        tekst, belangrijk, tussenstap = uit
        if not verteller.mag(str(taak["id"]), tekst, tussenstap):
            continue
        rij: dict[str, Any] = {"from_agent": chat_manager(taak), "to_agent": LUKA, "kind": "report", "body": tekst}
        if not belangrijk:
            rij["read_at"] = datetime.now(timezone.utc).isoformat()
        try:
            db.table("core_manager_messages").insert(rij).execute()
        except Exception as exc:  # noqa: BLE001 -- een chatregel mag de worker nooit breken
            log.warning("[voortgang] kon niet schrijven: %s", exc)
    if len(niet_chat) > 5000:
        niet_chat.clear()
    return nieuw


def systeem_verslagen(db: Any, rijen: list[dict[str, Any]]) -> int:
    """Taakverslag (punt 4) voor taken die de database zelf op mislukt zette.

    Een taak waarvan de worker wegviel (herstart, crash) en die geen poging
    meer over heeft, zet claim_next_core_task op 'failed' met actor_type
    'system'. De worker ziet dat nooit, dus schreef niemand een verslag --
    bijna de helft van alle mislukte taken. Deze lus ziet het event wel.
    """
    ids = sorted({str(r.get("task_id")) for r in rijen
                  if r.get("event_type") == "task.failed" and r.get("actor_type") == "system" and r.get("task_id")})
    if not ids:
        return 0
    import taak_verslag
    berichten = {str(r.get("task_id")): r.get("message") for r in rijen if r.get("event_type") == "task.failed"}
    n = 0
    try:
        taken = (db.table("core_tasks").select("id,title,status,result,error,metadata,assignee,payload")
                 .in_("id", ids).execute().data or [])
    except Exception as exc:  # noqa: BLE001
        log.warning("[voortgang] systeemverslag: taken niet gelezen: %s", exc)
        return 0
    for t in taken:
        fout = t.get("error") or {"code": "worker_lost", "message": berichten.get(str(t.get("id"))) or "worker viel weg"}
        if taak_verslag.schrijf(db, t, "failed", t.get("result") if isinstance(t.get("result"), dict) else None, fout):
            n += 1
    return n


def begin_cursor(db: Any) -> int:
    """Begin bij nu: oude events niet alsnog in het gesprek gooien."""
    rij = (db.table("core_task_events").select("sequence").order("sequence", desc=True).limit(1).execute().data or [])
    return int(rij[0]["sequence"]) if rij else 0


async def run_voortgang(db_factory: Callable[[], Any], elke: float = ELKE) -> None:
    """De lus in het task-worker-proces (één proces = geen dubbele regels)."""
    verteller, niet_chat = Verteller(), set()
    cursor: int | None = None
    db: Any = None
    while True:
        try:
            if db is None:
                db = db_factory()
            if cursor is None:
                cursor = await asyncio.to_thread(begin_cursor, db)
            cursor = await asyncio.to_thread(ronde, db, cursor, verteller, niet_chat)
        except Exception as exc:  # noqa: BLE001 -- volgende ronde opnieuw, met een verse client
            log.warning("[voortgang] ronde mislukt: %s", exc)
            db = None
        await asyncio.sleep(elke)
