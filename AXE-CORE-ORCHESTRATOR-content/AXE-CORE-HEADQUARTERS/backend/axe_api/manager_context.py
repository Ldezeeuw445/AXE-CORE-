"""Eén managercontext (BOUWLIJST "Eerst", punt 1 -- audit 19 nov 2026).

Een manager "snapt" niet omdat hij een model heeft, maar omdat hij bij elk
bericht een compacte, actuele wereld krijgt: wat er van hem openstaat, wat er
op Luka wacht, wat hij net zelf deed, wat al mislukte, wat hij mag -- plus de
lessen en het gedeelde log. Dit was verspreid (gedeeld_log, axe_overzicht,
grok_managers); hier staat het op één plek, voor de agent-lus én de
managerchat in de app (GET /managers/{agent}/context).

Puur waar het kan (`bouw_context`), I/O alleen in `lees_context`. Compact:
geen ruwe JSON, hooguit ~2500 tekens.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

# Eén manager, meerdere namen in de database (19 nov gemeten in core_tasks.assignee
# en core_manager_messages.from_agent). Tot er één register is (punt 5), hoort
# elke naam in zijn groep thuis.
GROEPEN: dict[str, tuple[str, ...]] = {
    "axe": ("axe", "axemanager", "axe-core", "axe_core"),
    "northsea": ("northsea", "northseamgr"),
    "companion": ("companion", "companionmgr", "axe_companion"),
    "trading": ("trading", "tradingos", "axe_trader"),
    "projects": ("projects", "projectsmgr"),
    "axon": ("axon", "memory", "memory_agent"),
    "developer": ("developer", "code-agent", "code_agent", "axe_developer"),
}

OPEN = ("pending", "queued", "running", "planning", "waiting_approval", "verifying", "in_progress", "claimed")
MISLUKT = ("failed", "error")

REGELS = (
    "Zelf doen (niet vragen): lezen, uitzoeken, plannen, taken starten, code in een eigen branch met tests, "
    "NorthSea-vervolgmails binnen de vaste regel, opruimen van je eigen dubbele voorstellen.\n"
    "Eerst Luka's ja: deploy naar productie, database-migratie, geld/orders/abonnementen, mail buiten de "
    "vaste regel, iets verwijderen, inloggen/betalen. Vraag het in je eigen gesprek, één keer, met waarom."
)


def groep_van(naam: str | None) -> tuple[str, tuple[str, ...]]:
    """De vaste naam van een manager en al zijn namen in de database."""
    n = str(naam or "").strip().lower()
    for kern, namen in GROEPEN.items():
        if n == kern or n in namen:
            return kern, namen
    return n, (n,) if n else ()


def _kort(s: Any, n: int = 110) -> str:
    t = " ".join(str(s or "").split())
    return t if len(t) <= n else t[: n - 1] + "…"


def _leeftijd(iso: Any, nu: datetime) -> str:
    try:
        t = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return ""
    s = max(0, int((nu - t).total_seconds()))
    if s < 3600:
        return f"{s // 60} min"
    if s < 86400:
        return f"{s // 3600} u"
    return f"{s // 86400} d"


def _fout(e: Any) -> str:
    if isinstance(e, dict):
        return _kort(e.get("message") or e.get("code") or "", 90)
    return _kort(e, 90)


def bouw_context(
    manager: str,
    taken: list[dict[str, Any]],
    mislukt: list[dict[str, Any]],
    eigen: list[dict[str, Any]],
    wacht: list[dict[str, Any]],
    nu: datetime | None = None,
    verslagen: list[dict[str, Any]] | None = None,
    lessen: list[dict[str, Any]] | None = None,
) -> str:
    """De context als korte tekst. Lege onderdelen vallen weg."""
    nu = nu or datetime.now(timezone.utc)
    delen: list[str] = [f"Jouw wereld nu ({manager or 'AXE'}):"]
    if taken:
        regels = [f"- {_kort(t.get('title'), 90)} · {t.get('status')} · {_leeftijd(t.get('created_at'), nu)}" for t in taken[:6]]
        meer = f"\n  (+{len(taken) - 6} meer)" if len(taken) > 6 else ""
        delen.append("Jouw open taken:\n" + "\n".join(regels) + meer)
    else:
        delen.append("Jouw open taken: geen.")
    if wacht:
        delen.append(f"Wacht op Luka ({len(wacht)}):\n" + "\n".join(f"- {_kort(w.get('title'), 90)}" for w in wacht[:3]))
    if mislukt:
        delen.append("Al geprobeerd en mislukt (niet blind herhalen):\n" + "\n".join(
            f"- {_kort(t.get('title'), 70)}: {_fout(t.get('error'))}" for t in mislukt[:4]))
    if lessen:
        # Audit 22 nov: niet dezelfde fout twee keer. Luka's lessen eerst (wet),
        # dan de ervaring uit je eigen taken (taak_verslag.ervaring).
        delen.append("Lessen (Luka's regels gaan voor; volg ze):\n" + "\n".join(
            f"- {'Luka' if l.get('to_agent') == 'lessen' else 'ervaring'}: "
            f"{_kort(' '.join(str(l.get('body') or '').replace('#', '').split()), 200)}" for l in lessen[:6]))
    if verslagen:
        # Punt 4 (19 nov): wat zijn vorige taken opleverden, zodat hij niet
        # opnieuw begint of blind herhaalt (taak_verslag.py).
        delen.append("Je laatste taakverslagen:\n" + "\n".join(
            f"- {_leeftijd(v.get('created_at'), nu)} geleden: {_kort(str(v.get('body') or '').removeprefix('Taakverslag '), 220)}"
            for v in verslagen[:4]))
    if eigen:
        delen.append("Wat je zelf laatst zei/deed:\n" + "\n".join(
            f"- {_leeftijd(m.get('created_at'), nu)} geleden: {_kort(m.get('body'), 120)}" for m in eigen[:5]))
    delen.append(REGELS)
    tekst = "\n\n".join(delen)
    return tekst[:2500]


def bronnen(taken: list, mislukt: list, eigen: list, wacht: list, verslagen: list,
            lessen: list | None = None) -> dict[str, int]:
    """Welke herinneringen dit antwoord stuurden (zichtbaar in de chat)."""
    return {k: len(v) for k, v in (("open_taken", taken[:6]), ("mislukt", mislukt[:4]),
                                     ("eigen_berichten", eigen[:5]), ("wacht_op_luka", wacht[:3]),
                                     ("taakverslagen", verslagen[:4]), ("lessen", (lessen or [])[:6])) if v}


def lees_context(db: Any, agent: str | None, nu: datetime | None = None) -> str:
    """Haal alles op en bouw de context. Elke leesfout = dat stuk valt weg."""
    return lees_context_met_bronnen(db, agent, nu)[0]


def lees_context_met_bronnen(db: Any, agent: str | None,
                             nu: datetime | None = None) -> tuple[str, dict[str, int]]:
    kern, namen = groep_van(agent)
    if not namen:
        return "", {}
    nu = nu or datetime.now(timezone.utc)

    def lees(fn):
        try:
            return fn() or []
        except Exception:  # noqa: BLE001 -- context is hulp, nooit een blokkade
            return []

    taken = lees(lambda: db.table("core_tasks").select("title,status,created_at").in_("assignee", list(namen))
                 .in_("status", list(OPEN)).order("created_at", desc=True).limit(12).execute().data)
    sinds = (nu.replace(microsecond=0) - timedelta(hours=48)).isoformat()
    mislukt = lees(lambda: db.table("core_tasks").select("title,error,created_at").in_("assignee", list(namen))
                   .in_("status", list(MISLUKT)).gte("created_at", sinds).order("created_at", desc=True)
                   .limit(6).execute().data)
    eigen = lees(lambda: db.table("core_manager_messages").select("body,created_at,to_agent")
                 .in_("from_agent", list(namen)).not_.in_("to_agent", ["log", "lessen"])
                 .order("created_at", desc=True).limit(5).execute().data)
    wacht = lees(lambda: db.table("core_approvals").select("title,created_at").eq("status", "pending")
                 .order("created_at", desc=True).limit(3).execute().data)
    verslagen = lees(lambda: db.table("core_manager_messages").select("body,created_at")
                     .eq("to_agent", "log").in_("from_agent", list(namen)).like("body", "Taakverslag%")
                     .order("created_at", desc=True).limit(4).execute().data)
    luka = lees(lambda: db.table("core_manager_messages").select("body,created_at,to_agent")
                .eq("to_agent", "lessen").order("created_at", desc=True).limit(3).execute().data)
    ervaring = lees(lambda: db.table("core_manager_messages").select("body,created_at,to_agent")
                    .eq("to_agent", "ervaring").in_("from_agent", list(namen))
                    .order("created_at", desc=True).limit(3).execute().data)
    lessen = (luka or [])[:3] + (ervaring or [])[:3]
    return (bouw_context(kern, taken, mislukt, eigen, wacht, nu, verslagen, lessen),
            bronnen(taken, mislukt, eigen, wacht, verslagen, lessen))
