"""
planner.py — alleen doorgaan met wat Luka vroeg, of een echte storing.

## Waarom dit bestaat

De cron "Planner: agents plannen hun werk" (elke 3 uur) liet vier agents tot
drie taken verzinnen. Dat werd een stapel die niemand had gevraagd. De cron
blijft; hij verzint geen projecten meer.

## Wat hij mag, per ronde

1. Een taak die Luka zelf vroeg (requested_by luka, of een gesproken verzoek)
   voortzetten als er een echte volgende stap is (vastgelopen, wacht op akkoord).
2. Eén bestaande storing oppakken: een cron met last_status die niet ok is, een
   NorthSea-item dat al op zijn akkoord wacht, of een check die faalde.

Anders schrijft hij niets. Geen nieuwe ideeën, geen mail, geen auto_send.

Taken binnen het staande plan voert hij zelf uit. Northsea-mails die dat
plan al toestaat horen daarbij. Alleen een send die het plan niet toestaat,
geld, of een dealverzet wacht op Luka; daarna draait de Code Agent ze
met acceptEdits in de repo en laat hij de wijzigingen ongecommit staan.

## Drie dingen die hier met opzet zo zijn

- **Status 'pending', nooit 'queued'.** claim_next_core_task pakt ELKE queued
  taak, ongeacht capability, en de worker op de VPS heeft geen handler voor
  'planner' -- hij zou ze als no_handler laten falen. De planner claimt zijn
  eigen taken met een voorwaardelijke update op capability='planner'.
- **Eigen goedkeuring in metadata**, niet via core_approvals: die zet een
  goedgekeurde taak terug op 'queued', en dan pakt de VPS hem alsnog.
- **Een dagbudget per abonnement**, en een abonnement dat zijn limiet noemt
  wordt overgeslagen tot de tijd die de CLI zelf geeft. Op 13 september maakte
  één lus Codex twee keer op; dat mag een planner nooit doen.

Draait alleen met AXE_PLANNER=1. Dezelfde main.py draait op de VPS, en daar
staan de abonnementen niet.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

log = logging.getLogger("axe_core_api.planner")

AGENTS = ("axe-core", "code-agent", "axe-algo", "maps-agent")
AGENT_LABEL = {"axe-core": "AXE Core", "code-agent": "Code Agent", "axe-algo": "AXE Algo",
               "maps-agent": "Northsea Desk"}
# De namespace in de tabel `memory` waar de uitkomsten van deze agent landen.
GEHEUGEN_AGENT = {"axe-core": "global", "code-agent": "axe_code", "axe-algo": "axe_research",
                  "maps-agent": "global"}
STANDAARD_MOTOREN = {"axe-core": "claude", "code-agent": "cursor", "axe-algo": "codex",
                     "maps-agent": "sleutels"}
ABONNEMENTEN = ("claude", "claude2", "claude3", "claude4", "codex", "codex2", "codex3", "cursor")

STAAT_PAD = os.path.expanduser(os.environ.get("AXE_PLANNER_STAAT", "~/.axe/planner.json"))
INTERVAL_S = int(os.environ.get("AXE_PLANNER_INTERVAL_S", str(3 * 3600)))
DAGBUDGET = int(os.environ.get("AXE_PLANNER_DAGBUDGET", "10"))
MAX_VOORSTELLEN = 3
MAX_POGINGEN = 2
PLANNER_RUN_S = 300
# De sleutel-route: de proxy op de VPS vult zijn eigen server-sleutel aan.
PROXY_URL = os.environ.get("AXE_PLANNER_PROXY", "https://api.axecompanion.com/proxy/ai")
SLEUTEL_MODEL = {"provider": "groq", "model": "openai/gpt-oss-120b", "format": "openai",
                 "baseUrl": "https://api.groq.com/openai/v1"}

# ── Bedenken gaat over sleutels, uitvoeren over het abonnement ───────────────
#
# Gemeten 14 september: 29 abonnement-runs op één dag, waarvan claude er 10 deed
# en daarmee zijn dagbudget opmaakte. Per agent per ronde zijn er tot drie runs:
# het bedenken van taken, een leestaak en een goedgekeurde schrijftaak. De
# eerste is de goedkoopste van de drie -- een kort verzoek om drie regels JSON --
# en juist die ging op een abonnement dat Luka zelf nodig heeft voor chatten en
# coderen.
#
# Dus: bedenken op sleutels (groq via de VPS-proxy), uitvoeren op het abonnement
# van de agent. Dat scheelt tot vier runs per ronde, oftewel tot 32 per dag.
#
# De TAAK houdt de motor van de agent, niet deze: _voer_uit leest die uit de
# taak, en een schrijftaak wordt overgeslagen als daar geen CLI-motor staat.
#
# Op "agent" zetten geeft het oude gedrag terug, zonder deze code aan te raken.
PLAN_MOTOR = os.environ.get("AXE_PLANNER_PLAN_MOTOR", "sleutels")


def is_planantwoord(tekst: Optional[str]) -> bool:
    """Gaf de motor een antwoord in de gevraagde vorm, ook als dat leeg is?

    "[]" betekent "niets te doen" en is een geldig antwoord. Terugvallen op het
    abonnement hoort alleen als de sleutelroute faalde (geen tekst) of iets
    anders dan een JSON-array gaf. Anders kostte elke rustige ronde alsnog
    een abonnement-run -- precies wat het plannen op sleutels moest voorkomen.
    """
    blok = re.search(r"\[[\s\S]*\]", tekst or "")
    if not blok:
        return False
    try:
        return isinstance(json.loads(blok.group(0)), list)
    except json.JSONDecodeError:
        return False


def plan_motor_voor(motor: str) -> str:
    """Welke motor het BEDENKEN doet voor een agent die op `motor` draait."""
    return motor if PLAN_MOTOR == "agent" else PLAN_MOTOR
LUKA_TEKST_ID = "acff7a12-1111-481d-a7a9-cc07583b8069-axe-core"


def _proxy_headers() -> dict:
    """De Bearer voor /proxy/ai, die sinds 14 september achter AUTH staat.

    De planner draait in hetzelfde proces als main.py, dus AXE_API_KEY staat
    er al. AXE_PLANNER_PROXY_KEY bestaat voor een planner die een ándere box
    aanroept dan de zijne (AXE_PLANNER_PROXY), met een andere sleutel. Zonder
    sleutel geen lege header: dan zegt de proxy eerlijk 401/403.
    """
    sleutel = os.environ.get("AXE_PLANNER_PROXY_KEY") or os.environ.get("AXE_API_KEY") or ""
    return {"Authorization": f"Bearer {sleutel}"} if sleutel else {}


def planner_aan() -> bool:
    return os.environ.get("AXE_PLANNER", "").strip() == "1"


# ── Pure onderdelen (getest in test_planner.py) ──────────────────────────────

# Welke app-kolom in Taken bij welke repo hoort (domain/apps.ts in de app).
REPO_APP = {"axe-core": "axe_core", "axe-companion": "axe_companion",
            "trading-os": "trading_os", "axon-memory": "axon_memory"}
# Namen die een model voor een repo aanziet. cloudflare-migration-2 is de
# branch van AXE Companion, geen repo -- de Code Agent noemde hem zo.
#
# Northsea Commodity is geen eigen app en geen eigen repo: de hele desk wordt
# een dashboard op de 3D Maps-tab van AXE CORE (Luka, 14 september). Werk
# ervoor gaat dus naar axe-core, en de taak staat in de kolom Northsea.
REPO_ALIAS = {"cloudflare-migration-2": "axe-companion", "companion": "axe-companion",
              "northsea-commodity": "axe-core", "northsea": "axe-core", "trading os": "trading-os"}


def repo_uit_tekst(tekst: str) -> Optional[str]:
    """De repo die een voorstel bij naam noemt, als het er precies één is.

    Gemeten 14 september: alle drie de voorstellen van de Code Agent hadden
    "repo": null, terwijl de titel "axon-memory" of "cloudflare-migration-2"
    zei. Zonder repo viel een goedgekeurde schrijftaak terug op axe-core en
    zou daar een privacy-link voor Axon schrijven. Twee of nul namen: None.
    """
    plat = re.sub(r"[^a-z0-9]", "", (tekst or "").lower())
    genoemd = {n for n in REPO_APP if n.replace("-", "") in plat}
    genoemd |= {doel for alias, doel in REPO_ALIAS.items() if re.sub(r"[^a-z0-9]", "", alias) in plat}
    return next(iter(genoemd)) if len(genoemd) == 1 else None


def app_voor_repo(repo: Optional[str], agent: str = "", tekst: str = "") -> str:
    if agent == "maps-agent" or "northsea" in (tekst or "").lower():
        return "northsea"
    return REPO_APP.get(repo or "", "axe_core")


def lees_voorstellen(tekst: str) -> list[dict]:
    """De taken uit een antwoord, ook als het model er praat omheen zet.

    Pakt het eerste JSON-array (ook binnen ```json-blokken). Houdt alleen
    voorstellen met titel en doel, kapt ze af, en normaliseert risico en
    prioriteit. Nooit meer dan MAX_VOORSTELLEN.
    """
    if not tekst:
        return []
    blok = re.search(r"\[[\s\S]*\]", tekst)
    if not blok:
        return []
    try:
        ruw = json.loads(blok.group(0))
    except json.JSONDecodeError:
        return []
    uit = []
    for v in ruw if isinstance(ruw, list) else []:
        if not isinstance(v, dict):
            continue
        titel = str(v.get("titel") or v.get("title") or "").strip()
        doel = str(v.get("doel") or v.get("goal") or "").strip()
        if not titel or not doel:
            continue
        risico = str(v.get("risico") or v.get("risk") or "lezen").strip().lower()
        risico = "schrijven" if risico in ("schrijven", "write", "patch", "edit") else "lezen"
        prio = str(v.get("prioriteit") or v.get("priority") or "medium").strip().lower()
        prio = prio if prio in ("low", "medium", "high") else "medium"
        uit.append({
            "titel": titel[:120],
            "doel": doel[:1200],
            "waarom": str(v.get("waarom") or v.get("why") or "").strip()[:400],
            "risico": risico,
            "prioriteit": prio,
            "repo": str(v.get("repo") or "").strip()[:60] or None,
        })
        if len(uit) >= MAX_VOORSTELLEN:
            break
    return uit


def limiet_tot(melding: str, nu: datetime) -> Optional[datetime]:
    """'try again at 3:40 AM' → het eerstvolgende moment met die kloktijd (lokaal).

    None als de melding geen limiet is. Een limiet zonder tijd koelt een uur.
    """
    if not re.search(r"usage limit|rate limit|quota exceeded|too many requests", melding or "", re.I):
        return None
    m = re.search(r"try again at\s+(\d{1,2}):(\d{2})\s*([AP]M)?", melding, re.I)
    if not m:
        return nu + timedelta(hours=1)
    uur, minuut = int(m.group(1)), int(m.group(2))
    ampm = (m.group(3) or "").upper()
    if ampm == "PM" and uur != 12:
        uur += 12
    if ampm == "AM" and uur == 12:
        uur = 0
    kandidaat = nu.replace(hour=uur % 24, minute=minuut, second=0, microsecond=0)
    if kandidaat <= nu:
        kandidaat += timedelta(days=1)
    return kandidaat


def budget_over(staat: dict, motor: str, vandaag: str) -> int:
    """Hoeveel runs dit abonnement vandaag nog van de planner mag."""
    if motor not in ABONNEMENTEN:
        return 10 ** 6  # sleutels: geen abonnementslimiet om te bewaken
    gebruikt = staat.get("gebruik", {}).get(vandaag, {}).get(motor, 0)
    return max(0, DAGBUDGET - gebruikt)


def tel_gebruik(staat: dict, motor: str, vandaag: str) -> dict:
    dag = staat.setdefault("gebruik", {}).setdefault(vandaag, {})
    dag[motor] = dag.get(motor, 0) + 1
    # Alleen de laatste week bewaren.
    for oud in sorted(staat["gebruik"])[:-7]:
        staat["gebruik"].pop(oud, None)
    return staat


def koelt(staat: dict, motor: str, nu: datetime) -> bool:
    tot = staat.get("koeling", {}).get(motor)
    if not tot:
        return False
    try:
        return datetime.fromisoformat(tot) > nu
    except ValueError:
        return False


def planprompt(agent: str, context: str, open_taken: list[str]) -> str:
    """Niet meer gebruikt om te verzinnen. Blijft staan zodat oude tests de vorm kennen."""
    rol = {
        "axe-core": "de hoofdassistent van Luka: overzicht, geheugen, afspraken, wat er blijft liggen",
        "code-agent": "de Code Agent: de repo's van AXE (bugs, tests, opruimen, kleine verbeteringen)",
        "axe-algo": "AXE Algo, de trading-desk op demo-accounts: onderzoek, lessen, strategie-controles",
        "maps-agent": ("de Northsea Desk: Northsea Commodity Partners -- sourcing, koper-leverancier matching, "
                       "verificatie en deal-coördinatie. Er is geen aparte app: de hele desk wordt gebouwd als "
                       "dashboard op de 3D Maps-tab in AXE CORE (repo axe-core, route /maps-3d). Plan wat er "
                       "nodig is om die desk daar te bouwen en te laten draaien"),
    }[agent]
    open_regels = "\n".join(f"- {t}" for t in open_taken[:12]) or "- (geen)"
    return (
        f"Je bent {rol}. Je plant zelf je werk voor de komende uren, zonder dat Luka iets vraagt.\n\n"
        f"CONTEXT\n{context[:6000]}\n\n"
        f"AL OPEN (niet opnieuw voorstellen)\n{open_regels}\n\n"
        "Stel hooguit 3 taken voor die nu echt waarde hebben. Liever 1 goede dan 3 vage.\n"
        "Een LEES-taak verandert niets: onderzoeken, controleren, samenvatten. Die mag je zelf doen.\n"
        "Een SCHRIJF-taak verandert bestanden of instellingen: die legt Luka eerst goed.\n"
        "Nooit: handelen met echt geld, pushen, iets verwijderen, sleutels aanraken.\n\n"
        "Antwoord ALLEEN met een JSON-array, zonder uitleg eromheen:\n"
        '[{"titel": "...", "doel": "wat er precies moet gebeuren", "waarom": "...", '
        '"risico": "lezen" | "schrijven", "prioriteit": "low" | "medium" | "high", "repo": "naam of null"}]'
    )


# ── Wat hij nog mag schrijven (geen verzinsels) ──────────────────────────────

LUKA_BRONNEN = ("luka",)
LUKA_ROUTES = ("user", "axe_tier_router", "axe-core")
ECHTE_OORSPRONG = ("vervolg", "storing")
VOLGENDE_STAP = ("blocked", "failed", "waiting_approval", "retrying")
OK_STATUS = ("ok", "success", "succeeded")


def is_luka_vraag(rij: dict) -> bool:
    meta = rij.get("metadata") or {}
    gevraagd = str(rij.get("requested_by") or meta.get("requested_by") or "").strip().lower()
    routed = str(meta.get("routedBy") or meta.get("conversation_source") or "").strip()
    return gevraagd in LUKA_BRONNEN or routed in LUKA_ROUTES


def is_verzonnen_planner(rij: dict) -> bool:
    """De stapel die niemand vroeg: requested_by planner, geen vervolg/storing."""
    meta = rij.get("metadata") or {}
    if meta.get("oorsprong") in ECHTE_OORSPRONG:
        return False
    if is_luka_vraag(rij):
        return False
    gevraagd = str(rij.get("requested_by") or "").strip().lower()
    return gevraagd == "planner" or bool(meta.get("planner")) or rij.get("capability") == "planner"


def heeft_echte_volgende_stap(rij: dict) -> bool:
    if not is_luka_vraag(rij):
        return False
    return str(rij.get("status") or "").strip().lower() in VOLGENDE_STAP


def is_echte_storing(rij: dict) -> bool:
    status = str(rij.get("last_status") or rij.get("status") or "").strip().lower()
    return bool(status) and status not in OK_STATUS


# Versturen, geld of een deal verlaten het plan. Northsea-mails die dat plan
# al toestaat (kwalificatie, follow-up, niet-bindend) horen erin.
_VERSTUURT = re.compile(r"\b(send|email|mail|imessage|whatsapp|verstuur|stuur een)\b|auto_send|auto_reply", re.I)
_GELD = re.compile(r"\b(spend|betaal|betalen|payment|invoice|live order|market order|place (an? )?order|plaats (een )?order|wire money|transfer money)\b", re.I)
_DEAL = re.compile(r"\b(move (the |a )?deal|verplaats (de |een )?deal|deal naar|close (the |a )?deal|sluit (de |een )?deal|change deal|update deal (stage|status)|deal stage)\b", re.I)
_NORTHSEA_TOEGESTAAN = re.compile(r"\bqualif|\bfollow[- ]?up|\bfollowup|\bnon[- ]?binding", re.I)
_NORTHSEA_NIET = re.compile(
    r"\b(introduc|identity disclos|buyer identity|seller identity|counterparty identity|"
    r"bank account|banking|swift|iban|commission|imfpa|ncnnda|ncnda|binding|"
    r"contract execution|we accept|accept (price|offer)|sign(ature)?|whatsapp|imessage)\b",
    re.I,
)


def northsea_send_binnen_plan(tekst: str) -> bool:
    bron = tekst or ""
    if not _NORTHSEA_TOEGESTAAN.search(bron):
        return False
    rest = _NORTHSEA_TOEGESTAAN.sub(" ", bron)
    return _NORTHSEA_NIET.search(rest) is None


def verlaat_app_plan(tekst: str, app: str | None = None) -> bool:
    """True als de actie het staande plan verlaat. Northsea-send die het plan
    al toestaat telt niet."""
    bron = tekst or ""
    if _VERSTUURT.search(bron):
        if app == "northsea" and northsea_send_binnen_plan(bron):
            return False
        return True
    return bool(_GELD.search(bron) or _DEAL.search(bron))


def goedkeuring_voor_taak(titel: str, doel: str = "", app: str | None = None) -> str:
    return "nodig" if verlaat_app_plan(f"{titel} {doel}", app) else "niet_nodig"


def planner_pass(gevraagd: list[dict], kapot: list[dict]) -> list[dict]:
    """Wat deze ronde mag landen. Leeg als er niets te vervolgen is en niets stuk is."""
    uit: list[dict] = []
    gezien: set[str] = set()
    for t in gevraagd:
        if not heeft_echte_volgende_stap(t):
            continue
        sleutel = f"vervolg:{t.get('id') or t.get('title')}"
        if sleutel in gezien:
            continue
        gezien.add(sleutel)
        titel = str(t.get("title") or "asked work").strip()
        uit.append({
            "titel": f"Continue: {titel}"[:120],
            "doel": f"Continue the work Luka asked for: {titel}"[:1200],
            "waarom": "continuation of a spoken or requested task",
            "risico": "lezen",
            "prioriteit": "high",
            "repo": None,
            "oorsprong": "vervolg",
            "bron_id": t.get("id"),
            "agent": (t.get("metadata") or {}).get("agent") or t.get("assignee") or "axe-core",
        })
    for p in kapot:
        if not is_echte_storing(p):
            continue
        bron = str(p.get("id") or p.get("job_key") or p.get("naam") or p.get("name") or "")
        sleutel = f"storing:{bron}"
        if sleutel in gezien:
            continue
        gezien.add(sleutel)
        naam = str(p.get("naam") or p.get("name") or bron or "failed check").strip()
        status = str(p.get("last_status") or p.get("status") or "fail")
        uit.append({
            "titel": f"Fix: {naam}"[:120],
            "doel": f"Real failure: {naam} last_status={status}"[:1200],
            "waarom": "existing cron, approval or check is not ok",
            "risico": "lezen",
            "prioriteit": "high",
            "repo": None,
            "oorsprong": "storing",
            "bron_id": bron,
            "agent": p.get("agent") or "axe-core",
            "soort": p.get("soort") or "cron",
        })
    return uit


def ids_verzonnen_te_sluiten(rijen: list[dict]) -> list[str]:
    """Pending verzinsels, één keer dicht. Luka's eigen taken blijven."""
    uit = []
    for r in rijen:
        if not is_verzonnen_planner(r):
            continue
        if str(r.get("status") or "") != "pending":
            continue
        if (r.get("metadata") or {}).get("goedkeuring") == "ja":
            continue
        if r.get("id"):
            uit.append(str(r["id"]))
    return uit


# ── Staat op schijf ──────────────────────────────────────────────────────────

def lees_staat() -> dict:
    try:
        with open(STAAT_PAD, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def schrijf_staat(staat: dict) -> None:
    os.makedirs(os.path.dirname(STAAT_PAD), exist_ok=True)
    tmp = STAAT_PAD + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(staat, f, ensure_ascii=False, indent=1)
    os.replace(tmp, STAAT_PAD)


# ── De ronde ─────────────────────────────────────────────────────────────────

class Planner:
    """Eén ronde plannen en uitvoeren. sb: supabase-client-fabriek; run_agent uit agent_runner."""

    def __init__(self, sb: Callable[[], Any], run_agent: Callable[..., dict], repos: Callable[[], dict]):
        self.sb = sb
        self.run_agent = run_agent
        self.repos = repos
        self.bezig = False

    # context ---------------------------------------------------------------
    def _herinneringen(self, agent: str, n: int = 25) -> str:
        try:
            rijen = (self.sb().table("memory").select("agent,kind,content,created_at")
                     .in_("agent", list({GEHEUGEN_AGENT[agent], "global"}))
                     .order("created_at", desc=True).limit(n).execute().data) or []
        except Exception as e:  # noqa: BLE001
            log.warning("planner: geheugen lezen faalde: %s", e)
            return ""
        regels = [f"- [{r.get('kind')}] {str(r.get('content') or '')[:220]}" for r in rijen]
        # Ook het doorzoekbare geheugen (rag_memories): daar schrijven de chat en
        # de code-runs op een abonnement hun uitkomst. Zonder dit plande de
        # planner naast wat je vandaag in de chat besprak in plaats van erop.
        try:
            rag = (self.sb().table("rag_memories").select("category,content,created_at")
                   .in_("category", ["agent", "user"])
                   .order("created_at", desc=True).limit(15).execute().data) or []
            regels += [f"- [{r.get('category')}] {str(r.get('content') or '')[:220]}" for r in rag]
        except Exception as e:  # noqa: BLE001
            log.warning("planner: rag_memories lezen faalde: %s", e)
        return "\n".join(regels)

    def _git(self) -> str:
        regels = []
        for naam, pad in sorted(self.repos().items()):
            try:
                st = subprocess.run(["git", "-C", pad, "status", "--short", "--branch"],
                                    capture_output=True, text=True, timeout=15).stdout.strip().splitlines()
                lg = subprocess.run(["git", "-C", pad, "log", "-5", "--format=%h %ar %s"],
                                    capture_output=True, text=True, timeout=15).stdout.strip()
            except Exception as e:  # noqa: BLE001
                regels.append(f"## {naam}: git niet leesbaar ({e})")
                continue
            regels.append(f"## {naam} ({pad})\n{st[0] if st else ''}  · {max(0, len(st) - 1)} gewijzigde bestanden\n{lg}")
        return "\n".join(regels)

    def _context(self, agent: str) -> str:
        delen = [f"Nu: {datetime.now().strftime('%A %d %B %Y %H:%M')}"]
        if agent == "code-agent":
            delen.append("REPO'S\n" + self._git())
        delen.append("RECENT GEHEUGEN\n" + self._herinneringen(agent))
        return "\n\n".join(delen)

    def _open_taken(self, agent: str) -> list[dict]:
        try:
            return (self.sb().table("core_tasks").select(
                        "id,title,goal,status,assignee,requested_by,capability,execution_mode,"
                        "payload,metadata,created_at,updated_at")
                    .eq("capability", "planner").eq("assignee", agent)
                    .in_("status", ["pending", "running"])
                    .order("created_at", desc=True).limit(20).execute().data) or []
        except Exception as e:  # noqa: BLE001
            log.warning("planner: open taken lezen faalde: %s", e)
            return []

    # motoren ---------------------------------------------------------------
    def _werkrepo(self, voorkeur: Optional[str], streng: bool = False) -> Optional[str]:
        """De repo om in te werken.

        streng (schrijftaken): noemt de taak een repo, dan DIE of niets. Gemeten
        14 september: de Code Agent stelde "Privacy-link in axon-memory" voor,
        en axon-memory staat op main. Terugvallen op axe-core zou na goedkeuring
        in de verkeerde repo schrijven.
        """
        from agent_runner import repo_status
        status = repo_status()
        if voorkeur and status.get(voorkeur, {}).get("runnable"):
            return voorkeur
        if streng and voorkeur:
            return None
        bruikbaar = sorted(n for n, s in status.items() if s.get("runnable"))
        return "axe-core" if "axe-core" in bruikbaar else (bruikbaar[0] if bruikbaar else None)

    def _sleutels(self, prompt: str) -> tuple[Optional[str], str]:
        import httpx
        try:
            r = httpx.post(PROXY_URL, headers=_proxy_headers(),
                           json={**SLEUTEL_MODEL, "key": "",
                                 "messages": [{"role": "user", "content": prompt}]}, timeout=60)
            if r.status_code != 200:
                return None, f"sleutels: proxy {r.status_code} {r.text[:200]}"
            return str(r.json().get("text") or ""), ""
        except Exception as e:  # noqa: BLE001
            return None, f"sleutels: {e}"

    def _vraag(self, staat: dict, motor: str, prompt: str, repo: str, modus: str = "plan") -> tuple[Optional[str], str]:
        """Eén sessie. Geeft (tekst, fout). Houdt budget en koeling bij.

        Cursor leest sinds 14 september in `--mode ask` (zie agent_runner), dus
        die plant en leest nu ook zelf.
        """
        nu = datetime.now()
        vandaag = nu.strftime("%Y-%m-%d")
        if motor == "sleutels":
            return self._sleutels(prompt)
        if koelt(staat, motor, nu):
            return None, f"{motor} koelt tot {staat['koeling'][motor]}"
        if budget_over(staat, motor, vandaag) <= 0:
            return None, f"{motor}: dagbudget van {DAGBUDGET} runs op"
        # Jouw werk gaat voor. Is deze motor nu bezig (een run uit de Code Editor
        # of de chat), dan begint de planner er niet aan: de volgende ronde komt
        # vanzelf. En hooguit vijf minuten, zodat een run van jou die er tóch
        # tussen komt nooit lang op de planner wacht (agent_runner: één sessie
        # per motor tegelijk).
        try:
            from agent_runner import _motor_slot
            if _motor_slot(motor).locked():
                return None, f"{motor} is bezig met ander werk; volgende ronde"
        except ImportError:
            pass
        tel_gebruik(staat, motor, vandaag)
        uit = self.run_agent(repo, prompt, modus, PLANNER_RUN_S, motor)
        if uit.get("status") == "ok":
            return str(uit.get("result") or ""), ""
        fout = str(uit.get("error") or uit.get("result") or "onbekende fout")
        tot = limiet_tot(fout, nu)
        if tot:
            staat.setdefault("koeling", {})[motor] = tot.isoformat()
        return None, fout[-400:]

    # schrijven -------------------------------------------------------------
    def _maak_taak(self, agent: str, motor: str, v: dict) -> Optional[dict]:
        repo = v.get("repo")
        repo = REPO_ALIAS.get(repo or "", repo) or repo_uit_tekst(f"{v['titel']} {v['doel']}")
        oorsprong = v.get("oorsprong") if v.get("oorsprong") in ECHTE_OORSPRONG else None
        if not oorsprong:
            return None
        app = app_voor_repo(repo, agent, f"{v['titel']} {v['doel']}")
        row = {
            "title": v["titel"],
            "goal": v["doel"],
            "description": v.get("waarom") or None,
            "status": "pending",
            "priority": v["prioriteit"],
            "assignee": agent,
            "capability": "planner",
            "execution_mode": "read" if v["risico"] == "lezen" else "patch",
            "source_app": "axe_core",
            "requested_by": "planner",
            "payload": {"repo": repo, "bron_id": v.get("bron_id")},
            "metadata": {
                "planner": True, "agent": agent, "motor": motor, "risico": v["risico"],
                "goedkeuring": goedkeuring_voor_taak(v["titel"], v.get("doel") or "", app),
                "uiStatus": "todo", "app": app,
                "oorsprong": oorsprong, "bron_id": v.get("bron_id"),
            },
        }
        try:
            gemaakt = self.sb().table("core_tasks").insert(row).execute().data[0]
        except Exception as e:  # noqa: BLE001
            log.warning("planner: taak wegschrijven faalde: %s", e)
            return None
        if gemaakt and row["metadata"].get("goedkeuring") == "nodig":
            try:
                from goedkeuring_melding import vraag_luka
                vraag_luka(
                    self.sb(), gemaakt["id"],
                    titel=v["titel"],
                    detail=v.get("doel") or v.get("waarom") or "",
                    kind="leave_plan",
                    requested_by="planner",
                )
            except Exception as e:  # noqa: BLE001
                log.warning("planner: goedkeuring-rij schrijven faalde: %s", e)
        return gemaakt

    def _claim(self, taak_id: str) -> bool:
        rijen = (self.sb().table("core_tasks")
                 .update({"status": "running", "worker_id": "planner-mac",
                          "started_at": datetime.now(timezone.utc).isoformat()})
                 .eq("id", taak_id).eq("status", "pending").eq("capability", "planner")
                 .execute().data)
        return bool(rijen)

    def _sluit(self, taak: dict, tekst: Optional[str], fout: str) -> None:
        meta = dict(taak.get("metadata") or {})
        meta["uiStatus"] = "done" if tekst else "blocked"
        meta["pogingen"] = int(meta.get("pogingen") or 0) + (0 if tekst else 1)
        # Niet eindeloos opnieuw: dat kost elke ronde budget voor niets.
        opgegeven = not tekst and meta["pogingen"] >= MAX_POGINGEN
        velden = {
            "status": "completed" if tekst else ("failed" if opgegeven else "pending"),
            "worker_id": None,
            "metadata": meta,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if tekst:
            velden["result"] = {"output": tekst[:8000]}
            velden["completed_at"] = datetime.now(timezone.utc).isoformat()
        else:
            velden["error"] = {"message": fout[:1000]}
        self.sb().table("core_tasks").update(velden).eq("id", taak["id"]).execute()
        if tekst:
            agent = meta.get("agent") or "axe-core"
            try:
                self.sb().table("memory").insert({
                    "agent": GEHEUGEN_AGENT.get(agent, "global"),
                    "user_id": LUKA_TEKST_ID,
                    "kind": "planner_uitkomst",
                    "key": f"planner:{taak['id']}",
                    "content": f"{taak.get('title')}\n\n{tekst[:4000]}",
                    "category": "planner",
                    "source": "planner",
                    "importance": 0.6,
                }).execute()
            except Exception as e:  # noqa: BLE001
                log.warning("planner: uitkomst naar geheugen faalde: %s", e)

    def _voer_uit(self, staat: dict, taak: dict) -> dict:
        meta = taak.get("metadata") or {}
        agent = meta.get("agent") or taak.get("assignee") or "axe-core"
        motor = meta.get("motor") or STANDAARD_MOTOREN[agent]
        schrijven = meta.get("risico") == "schrijven"
        if schrijven and agent not in ("code-agent", "maps-agent"):
            return {"taak": taak["id"], "overgeslagen": "alleen de Code Agent en de Northsea Desk voeren schrijftaken uit"}
        if schrijven and motor not in ABONNEMENTEN:
            return {"taak": taak["id"], "overgeslagen": "schrijven vraagt een CLI-motor"}
        gevraagd = (REPO_ALIAS.get((taak.get("payload") or {}).get("repo") or "")
                    or (taak.get("payload") or {}).get("repo")
                    or repo_uit_tekst(f"{taak.get('title') or ''} {taak.get('goal') or ''}"))
        if schrijven and not gevraagd:
            # Nooit raden waar geschreven wordt: zie repo_uit_tekst.
            return {"taak": taak["id"], "overgeslagen": "schrijftaak noemt geen (bekende) repo"}
        repo = self._werkrepo(gevraagd, streng=schrijven)
        if not repo:
            return {"taak": taak["id"], "overgeslagen":
                    f"repo {gevraagd} mag niet (beschermde branch of niet op de whitelist)" if gevraagd
                    else "geen bruikbare repo (alle op main/master of weg)"}
        if not self._claim(taak["id"]):
            return {"taak": taak["id"], "overgeslagen": "al opgepakt"}
        prompt = (
            f"Taak van de planner ({AGENT_LABEL[agent]}): {taak.get('title')}\n\n{taak.get('goal')}\n\n"
            + ("Je mag bestanden in deze repo aanpassen. Commit en push NIET; Luka bekijkt de diff.\n"
               if schrijven else "Alleen lezen: verander niets. Geef een beknopt, concreet verslag.\n")
            + "Zet je volledige verslag in je antwoord zelf. Schrijf geen plan- of verslagbestand.\n"
        )
        tekst, fout = self._vraag(staat, motor, prompt, repo, "acceptEdits" if schrijven else "plan")
        self._sluit(taak, tekst, fout)
        return {"taak": taak["id"], "ok": bool(tekst), "fout": fout or None}

    def _luka_werk(self) -> list[dict]:
        try:
            rijen = (self.sb().table("core_tasks")
                     .select("id,title,status,assignee,requested_by,capability,metadata")
                     .in_("status", list(VOLGENDE_STAP))
                     .order("updated_at", desc=True).limit(40).execute().data) or []
        except Exception as e:  # noqa: BLE001
            log.warning("planner: luka-werk lezen faalde: %s", e)
            return []
        return [r for r in rijen if is_luka_vraag(r)]

    def _echte_storingen(self) -> list[dict]:
        kapot: list[dict] = []
        try:
            crons = (self.sb().table("core_schedules")
                     .select("id,name,job_key,last_status,enabled,metadata")
                     .eq("enabled", True).limit(80).execute().data) or []
            for c in crons:
                if not is_echte_storing(c):
                    continue
                kapot.append({
                    "id": c.get("job_key") or c.get("id"),
                    "naam": c.get("name"),
                    "last_status": c.get("last_status"),
                    "soort": "cron",
                    "agent": "axe-core",
                })
        except Exception as e:  # noqa: BLE001
            log.warning("planner: crons lezen faalde: %s", e)
        try:
            wacht = (self.sb().table("core_tasks")
                     .select("id,title,status,assignee,metadata")
                     .eq("status", "waiting_approval").limit(40).execute().data) or []
            for t in wacht:
                meta = t.get("metadata") or {}
                app = str(meta.get("app") or "")
                if app != "northsea" and "northsea" not in str(t.get("title") or "").lower():
                    continue
                kapot.append({
                    "id": t.get("id"),
                    "naam": t.get("title") or "NorthSea approval",
                    "last_status": "waiting_approval",
                    "soort": "northsea",
                    "agent": meta.get("agent") or t.get("assignee") or "maps-agent",
                })
        except Exception as e:  # noqa: BLE001
            log.warning("planner: northsea-wacht lezen faalde: %s", e)
        return kapot

    def _open_echte_bronnen(self) -> set[str]:
        gezien: set[str] = set()
        try:
            rijen = (self.sb().table("core_tasks")
                     .select("id,status,metadata,payload")
                     .eq("capability", "planner")
                     .in_("status", ["pending", "running"])
                     .limit(80).execute().data) or []
        except Exception as e:  # noqa: BLE001
            log.warning("planner: open echte rijen lezen faalde: %s", e)
            return gezien
        for r in rijen:
            meta = r.get("metadata") or {}
            bron = meta.get("bron_id") or (r.get("payload") or {}).get("bron_id")
            if bron:
                gezien.add(str(bron))
        return gezien

    def _sluit_verzonnen_eenmaal(self, staat: dict) -> int:
        if staat.get("verzonnen_gesloten"):
            return 0
        try:
            rijen = (self.sb().table("core_tasks")
                     .select("id,status,requested_by,capability,metadata")
                     .eq("capability", "planner").eq("status", "pending")
                     .limit(500).execute().data) or []
        except Exception as e:  # noqa: BLE001
            log.warning("planner: verzonnen rijen lezen faalde: %s", e)
            return 0
        ids = ids_verzonnen_te_sluiten(rijen)
        nu = datetime.now(timezone.utc).isoformat()
        for tid in ids:
            try:
                rij = next((r for r in rijen if str(r.get("id")) == tid), {})
                meta = dict(rij.get("metadata") or {})
                meta["invented"] = True
                meta["uiStatus"] = "blocked"
                self.sb().table("core_tasks").update({
                    "status": "cancelled",
                    "cancelled_at": nu,
                    "updated_at": nu,
                    "metadata": meta,
                    "error": {"message": "invented by planner; not asked"},
                }).eq("id", tid).eq("status", "pending").eq("capability", "planner").execute()
            except Exception as e:  # noqa: BLE001
                log.warning("planner: verzonnen sluiten faalde voor %s: %s", tid, e)
        staat["verzonnen_gesloten"] = True
        return len(ids)

    # ronde -----------------------------------------------------------------
    def ronde(self, motoren: Optional[dict] = None) -> dict:
        if self.bezig:
            return {"overgeslagen": "er loopt al een ronde"}
        self.bezig = True
        staat = lees_staat()
        motoren = {**STANDAARD_MOTOREN, **(motoren or staat.get("motoren") or {})}
        verslag: dict[str, Any] = {"begon": datetime.now(timezone.utc).isoformat(), "agents": {}, "gemaakt": []}
        try:
            verslag["verzonnen_gesloten"] = self._sluit_verzonnen_eenmaal(staat)
            voorstellen = planner_pass(self._luka_werk(), self._echte_storingen())
            al_open = self._open_echte_bronnen()
            gemaakt: list[dict] = []
            for v in voorstellen:
                bron = str(v.get("bron_id") or "")
                if bron and bron in al_open:
                    continue
                agent = v.get("agent") if v.get("agent") in AGENTS else "axe-core"
                motor = motoren.get(agent, STANDAARD_MOTOREN[agent])
                taak = self._maak_taak(agent, motor, v)
                if taak:
                    gemaakt.append(taak)
                    if bron:
                        al_open.add(bron)
            verslag["gemaakt"] = [t.get("title") for t in gemaakt]
            verslag["aantal"] = len(gemaakt)
            # Geen model om taken te verzinnen. Binnen het plan mag hij door;
            # een actie die het plan verlaat alleen na ja.
            for agent in AGENTS:
                motor = motoren.get(agent, STANDAARD_MOTOREN[agent])
                a: dict[str, Any] = {"motor": motor, "voorstellen": []}
                goed = next((t for t in self._open_taken(agent)
                             if t.get("status") == "pending"
                             and (is_luka_vraag(t) or (t.get("metadata") or {}).get("oorsprong") in ECHTE_OORSPRONG)
                             and ((t.get("metadata") or {}).get("goedkeuring") == "ja"
                                  or (t.get("metadata") or {}).get("goedkeuring") == "niet_nodig")), None)
                if goed:
                    a["goedgekeurd_uitgevoerd"] = self._voer_uit(staat, goed)
                verslag["agents"][agent] = a
        finally:
            verslag["klaar"] = datetime.now(timezone.utc).isoformat()
            staat["laatste_ronde"] = verslag
            schrijf_staat(staat)
            self.bezig = False
        return verslag


async def lus(planner: Planner) -> None:
    """Elke INTERVAL_S een ronde, de eerste pas na tien minuten (niet bij elke herstart)."""
    await asyncio.sleep(600)
    while True:
        staat = lees_staat()
        if staat.get("aan", True):
            try:
                await asyncio.to_thread(planner.ronde)
            except Exception:  # noqa: BLE001
                log.exception("planner: ronde faalde")
        await asyncio.sleep(INTERVAL_S)
