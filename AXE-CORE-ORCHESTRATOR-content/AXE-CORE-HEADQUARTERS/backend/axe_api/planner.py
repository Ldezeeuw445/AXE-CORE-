"""
planner.py — de drie hoofdagents bedenken zelf wat er moet gebeuren.

## Waarom dit bestaat

Geheugen, RAG en de leerlus maken een agent slimmer als je iets vraagt. Ze laten
hem niet uit zichzelf beginnen. De takenkernel (core_tasks) bestond al en werd
nauwelijks gebruikt: op 14 september stond er één agent-taak die sinds 10
september op goedkeuring wachtte. Wat ontbrak was iets dat taken bedenkt.

## Wat hij doet, per ronde (standaard elke 3 uur)

Per hoofdagent (AXE Core, Code Agent, AXE Algo):
1. context verzamelen: recente herinneringen, de git-stand van de repo's (Code
   Agent) of de trading-lessen (AXE Algo), en zijn eigen open taken;
2. zijn eigen abonnement (of de sleutels) vragen om hooguit drie taken, als JSON;
3. die als core_tasks wegschrijven;
4. hooguit één LEES-taak meteen uitvoeren, alleen-lezen, en de uitkomst in het
   geheugen zetten, zodat de leerlus hem meeneemt.

SCHRIJF-taken voert hij nooit zelf uit. Die staan als voorstel in Taken tot
Luka ze goedkeurt; daarna draait de Code Agent ze met acceptEdits in de repo en
laat hij de wijzigingen ongecommit staan.

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
ABONNEMENTEN = ("claude", "claude2", "claude3", "codex", "cursor")

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
            return (self.sb().table("core_tasks").select("id,title,status,metadata,created_at")
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
            "payload": {"repo": repo},
            "metadata": {
                "planner": True, "agent": agent, "motor": motor, "risico": v["risico"],
                "goedkeuring": "niet_nodig" if v["risico"] == "lezen" else "nodig",
                "uiStatus": "todo", "app": app_voor_repo(repo, agent, f"{v['titel']} {v['doel']}"),
            },
        }
        try:
            return self.sb().table("core_tasks").insert(row).execute().data[0]
        except Exception as e:  # noqa: BLE001
            log.warning("planner: taak wegschrijven faalde: %s", e)
            return None

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

    # ronde -----------------------------------------------------------------
    def ronde(self, motoren: Optional[dict] = None) -> dict:
        if self.bezig:
            return {"overgeslagen": "er loopt al een ronde"}
        self.bezig = True
        staat = lees_staat()
        motoren = {**STANDAARD_MOTOREN, **(motoren or staat.get("motoren") or {})}
        verslag: dict[str, Any] = {"begon": datetime.now(timezone.utc).isoformat(), "agents": {}}
        try:
            for agent in AGENTS:
                motor = motoren.get(agent, STANDAARD_MOTOREN[agent])
                a: dict[str, Any] = {"motor": motor}
                open_rijen = self._open_taken(agent)
                repo = self._werkrepo(None)
                if not repo:
                    a["fout"] = "geen bruikbare repo om vanuit te plannen"
                    verslag["agents"][agent] = a
                    continue
                tekst, fout = self._vraag(staat, motor,
                                          planprompt(agent, self._context(agent), [r["title"] for r in open_rijen]),
                                          repo)
                voorstellen = lees_voorstellen(tekst or "")
                a["voorstellen"] = [v["titel"] for v in voorstellen]
                if fout:
                    a["fout"] = fout
                gemaakt = [t for t in (self._maak_taak(agent, motor, v) for v in voorstellen) if t]
                # Hooguit één leestaak per agent per ronde meteen doen.
                lees = next((t for t in gemaakt + open_rijen
                             if (t.get("metadata") or {}).get("goedkeuring") == "niet_nodig"
                             and t.get("status", "pending") == "pending"), None)
                if lees:
                    a["uitgevoerd"] = self._voer_uit(staat, lees)
                # En hooguit één goedgekeurde schrijftaak.
                goed = next((t for t in open_rijen
                             if (t.get("metadata") or {}).get("goedkeuring") == "ja" and t.get("status") == "pending"), None)
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
