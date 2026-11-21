"""AXE beslist zoals Luka: in-plan gaat door, harde grenzen vragen.

Canon: de vijf masterspecs plus docs/programma. Luka (of de NorthSea Desk
Manager) alleen bij:

  * een NIEUWE mail naar een bedrijf buiten het plan
  * geld / betalingen
  * NorthSea dealverzet (go/no-go op een deal)
  * live trading orders
  * NorthSea auto_send_* vlaggen

Al het andere binnen het plan: AXE beslist, schrijft wat en waarom in
decision_reason. Routines (market data, orchestrator health, idea scan) en
DAX-werk in /dax/artifacts plus alleen-lezen inspectie horen daarbij.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Any

ACTIE_AUTO = "auto"
ACTIE_ASK = "ask"

DEAL_CODE_RE = re.compile(r"DEAL-\d+", re.I)
AUTO_SEND_RE = re.compile(
    r"\bauto_send_(?:qualification|followups)\b|\bauto_reply_nonbinding\b", re.I,
)
MAIL_RE = re.compile(
    r"\b(send|email|mail|imessage|whatsapp|verstuur|stuur een|"
    r"outbound[-_ ]?message|smtplib|sendmail|mailgun|sendgrid|resend)\b",
    re.I,
)
GELD_RE = re.compile(
    r"\b(spend|betaal|betalen|payment|invoice|wire money|transfer money|"
    r"live order|market order|place (an? )?order|plaats (een )?order)\b",
    re.I,
)
DEAL_VERZET_RE = re.compile(
    r"\b(move (the |a )?deal|verplaats (de |een )?deal|deal naar|"
    r"close (the |a )?deal|sluit (de |een )?deal|change deal|"
    r"update deal (stage|status)|deal stage|go/no-go|yes needed)\b",
    re.I,
)
NORTHSEA_TOEGESTAAN = re.compile(r"\bqualif|\bfollow[- ]?up|\bfollowup|\bnon[- ]?binding", re.I)
NORTHSEA_NIET = re.compile(
    r"\b(introduc|identity disclos|buyer identity|seller identity|"
    r"counterparty identity|bank account|banking|swift|iban|commission|"
    r"imfpa|ncnnda|ncnda|binding|contract execution|we accept|"
    r"accept (price|offer)|sign(ature)?|whatsapp|imessage)\b",
    re.I,
)
ROUTINE_RE = re.compile(
    r"market data check|orchestrator health(?: check)?|idea scan",
    re.I,
)
INSPECTIE_RE = re.compile(
    r"^\s*(apt list(?: --installed)?|apt-cache (?:policy|show)|dpkg -l|"
    r"dpkg-query\b|uname(?: -\w+)?|whoami|id(?: -\w+)?|df(?: -\w+)*|"
    r"free(?: -\w+)?|cat /etc/os-release|hostnamectl|systemd-detect-virt|"
    r"which \S+|command -v \S+|type \S+|ps aux|uptime|cat /proc/version|"
    # 15 nov: Luka moest elke keer "systemctl status northsea-desk-manager"
    # goedkeuren. Kijken naar een dienst of zijn logs verandert niets; starten,
    # stoppen en herstarten blijven gevraagd (SCHADELIJK_RE). Geen ; | & $ ` in
    # de argumenten, zodat er niets mee kan liften.
    r"systemctl (?:status|is-active|is-enabled|is-failed|show|list-units|list-timers|list-unit-files)"
    r"(?: [\w@.:+=/,-]+)*|"
    r"journalctl(?: [\w@.:+=/,-]+| '[\w :.+-]+'| \"[\w :.+-]+\")*)"
    r"(?:\s*(?:2>&1|2>/dev/null|>/dev/null|&>/dev/null))*\s*$",
    re.I,
)
ARTIFACTS_RE = re.compile(r"/dax/artifacts(?:/|\s|$)", re.I)
SCHADELIJK_RE = re.compile(
    r"\b(apt-get install|apt install|systemctl (?:restart|start|stop|enable|disable)|"
    r"git push|git commit|ssh |scp |sendmail|smtplib|auto_send_|"
    r"useradd|usermod|passwd|ufw|iptables)\b",
    re.I,
)
ORDER_RE = re.compile(
    r"place_order|placeorder|brokerplaceorder|/trading/order|mt-client-api|"
    r"agiliumtrade|order_type_buy|order_type_sell|position_modify|"
    r"position_close|order_modify|order_cancel|executedemotrade|"
    r"metaapimarketorder|metaapipendingorder",
    re.I,
)

AUTO_DOOR_AXE = "axe"


class Besluit:
    __slots__ = ("actie", "reden", "wat", "waarom")

    def __init__(self, actie: str, reden: str, wat: str, waarom: str):
        self.actie = actie
        self.reden = reden
        self.wat = wat
        self.waarom = waarom

    def als_dict(self) -> dict[str, str]:
        return {"actie": self.actie, "reden": self.reden, "wat": self.wat, "waarom": self.waarom}


def _tekst_van(rij: dict[str, Any], extra: str = "") -> str:
    meta = rij.get("metadata") if isinstance(rij.get("metadata"), dict) else {}
    delen = [
        rij.get("title"), rij.get("detail"), rij.get("goal"),
        extra, meta.get("command"), meta.get("reason"),
        rij.get("kind"),
    ]
    return "\n".join(str(x) for x in delen if x)


def northsea_send_binnen_plan(tekst: str) -> bool:
    if not NORTHSEA_TOEGESTAAN.search(tekst or ""):
        return False
    rest = NORTHSEA_TOEGESTAAN.sub(" ", tekst or "")
    return not NORTHSEA_NIET.search(rest)


def deal_sleutel(rij: dict[str, Any]) -> str | None:
    meta = rij.get("metadata") if isinstance(rij.get("metadata"), dict) else {}
    for kandidaat in (meta.get("deal_id"), meta.get("deal_code"), rij.get("title"), rij.get("detail")):
        if not kandidaat:
            continue
        s = str(kandidaat)
        m = DEAL_CODE_RE.search(s)
        if m:
            return m.group(0).upper()
        if meta.get("deal_id") and kandidaat == meta.get("deal_id"):
            return str(kandidaat)
    return str(meta["deal_id"]) if meta.get("deal_id") else None


def is_routine_in_plan(tekst: str) -> bool:
    return bool(ROUTINE_RE.search(tekst or ""))


# Een bestand bekijken (15 nov: Luka keurde "sed -n '1,200p' …sql" goed). Alleen
# lezen: geen > of >>, geen pipe, geen ; & $ ` in de argumenten, geen sed -i.
LEES_RE = re.compile(
    r"^\s*(?:cat|head|tail|wc|ls|stat|file|grep(?: -[A-Za-z]+)*|"
    r"sed -n (?:'[0-9,$p ]+'|\"[0-9,$p ]+\"|[0-9,$p]+))"
    r"(?: -[A-Za-z0-9]+(?: [0-9]+)?)*"
    r"(?: (?:'[^'`$;&|<>]*'|\"[^\"`$;&|<>]*\"|[\w@.:+=/,*-]+))*"
    r"(?:\s*(?:2>&1|2>/dev/null))*\s*$",
)

# Een DAX-bot die zijn EIGEN werktak bijwerkt (15 nov: Luka keurde elke
# "git add . && git commit … && git push origin dax/…" los goed). Alleen git,
# alleen gekoppeld met &&, push alleen naar dax/<naam>, nooit --force en nooit
# naar main/master/orchestrator. Mergen blijft een PR die Luka ziet.
_DAX_GIT_STAP = re.compile(
    r"^git (?:status|diff(?: [\w./-]+)*|fetch(?: origin)?|checkout(?: -b)? dax/[\w.-]+|"
    r"pull origin (?:main|master|orchestrator|dax/[\w.-]+)|add (?:\.|-A|[\w./ -]+)|"
    r"commit -m (?:'[^'`$]*'|\"[^\"`$]*\")|push(?: -u)? origin dax/[\w.-]+)$"
)


def is_dax_git_werktak(command: str) -> bool:
    cmd = " ".join((command or "").split())
    if not cmd or re.search(r"--force|\s-f(\s|$)|--mirror|--delete|:refs|;|\|\||\||`|\$\(", cmd):
        return False
    stappen = [x.strip() for x in cmd.split("&&")]
    if not any(x.startswith("git push") for x in stappen):
        return False
    return all(_DAX_GIT_STAP.match(x) for x in stappen)


# 21 nov: de managers liepen sinds 20 nov 22:04 vast op puur kijken --
# `docker ps`, `docker logs`, `find /opt ... 2>/dev/null` -- en Luka kreeg er
# acht ok-vragen voor. Kijken naar containers en bestanden verandert niets.
# `docker inspect` alleen met een --format zonder Env/Config: anders gaan de
# sleutels van een container naar een gratis extern model.
_ARG = r"(?: (?:'[^'`$;&|<>]*'|\"[^\"`$;&|<>]*\"|[\w@.:+=/,*~-]+(?:'[^'`$;&|<>]*'|\"[^\"`$;&|<>]*\")?))"
DOCKER_LEES_RE = re.compile(
    r"^docker (?:ps|images|compose ps|stats --no-stream|logs|top|port|version|info|system (?:info|df)|(?:network|volume|image|container) ls)" + _ARG + r"*$"
    r"|^docker inspect (?:-f|--format)[ =]'(?:(?!env|config|secret|password|token)[^'`$])*'" + _ARG + r"+$",
    re.I,
)
# find zonder iets dat schrijft of uitvoert.
FIND_RE = re.compile(r"^find" + _ARG + r"+$")
FIND_DOET_IETS = re.compile(r"\s-(?:delete|exec|execdir|ok|okdir|fprint\w*|fls)\b", re.I)
# Een staart van filters die alleen lezen: `| grep x | head -20`.
FILTER_RE = re.compile(r"^(?:grep(?: -[A-Za-z]+)*|egrep|head|tail|wc|sort|uniq|cut)" + _ARG + r"*$")
_OMLEIDING_RE = re.compile(r"\s*(?:2>&1|2>/dev/null|>/dev/null|&>/dev/null)")


def _losse_inspectie(cmd: str) -> bool:
    if LEES_RE.match(cmd) and not re.search(r"\bsed\b.*\s-i\b|>", cmd):
        return True
    if INSPECTIE_RE.match(cmd):
        return True
    kaal = _OMLEIDING_RE.sub("", cmd).strip()
    if DOCKER_LEES_RE.match(kaal):
        return True
    return bool(FIND_RE.match(kaal) and not FIND_DOET_IETS.search(kaal))


def is_inspectie(command: str) -> bool:
    cmd = " ".join((command or "").split())
    if _losse_inspectie(cmd):
        return True
    # Eén pijplijn: een leescommando, dan alleen leesfilters. Quotes met een |
    # erin vallen al af doordat _ARG geen | in een quote toelaat.
    delen = [d.strip() for d in cmd.split("|")]
    if len(delen) < 2 or any(not d for d in delen):
        return False
    return _losse_inspectie(delen[0]) and all(FILTER_RE.match(_OMLEIDING_RE.sub("", d).strip()) for d in delen[1:])


def schrijft_eigen_artifacts(command: str) -> bool:
    cmd = command or ""
    if not ARTIFACTS_RE.search(cmd):
        return False
    if SCHADELIJK_RE.search(cmd) or MAIL_RE.search(cmd) or ORDER_RE.search(cmd):
        return False
    return True


# 17 nov: een manager vroeg 53x in 24 uur "Vaste jobs falen achter elkaar"
# (MetaAPI moest opgewaardeerd). Elke vraag keurde AXE zelf goed als
# "in-plan", de taak liep leeg en Luka zag nooit wat hij moest doen. Een
# managervraag die een betaling, tegoed of login van Luka noemt, kan AXE niet
# zelf oplossen; die blijft bij Luka.
LUKA_ZELF_RE = re.compile(
    r"\b(?:top[- ]?up|add (?:credits?|funds)|credits?|tegoed|opwaarder|billing|payment|betal|"
    r"log ?in|logged out|inlog|subscription|abonnement)\b|\bluka must\b|hier ben jij voor nodig",
    re.I,
)


def harde_grens(tekst: str, app: str | None = None) -> str | None:
    bron = tekst or ""
    if AUTO_SEND_RE.search(bron):
        return "hard-limit: NorthSea auto_send_* flags"
    if ORDER_RE.search(bron) or GELD_RE.search(bron):
        return "hard-limit: money or live trading order"
    if MAIL_RE.search(bron):
        if app == "northsea" and northsea_send_binnen_plan(bron):
            return None
        return "hard-limit: new email outside the plan"
    if DEAL_VERZET_RE.search(bron) or (app == "northsea" and DEAL_CODE_RE.search(bron) and "yes needed" in bron.lower()):
        return "hard-limit: NorthSea deal go/no-go"
    return None


def shell_auto_reden(command: str, *, dax: bool = False) -> str | None:
    """Waarom dit commando onbewaakt mag, of None als het beleid het niet vrijtekent."""
    cmd = command or ""
    if harde_grens(cmd):
        return None
    if schrijft_eigen_artifacts(cmd) or (
        (dax or "/dax/" in cmd) and ARTIFACTS_RE.search(cmd) and not SCHADELIJK_RE.search(cmd)
        and re.search(r"(\btee\b|\bcat\b|\bmkdir\b|\btouch\b|\bprintf\b|\becho\b|>)", cmd, re.I)
    ):
        return "in-plan: write under the agent's own /dax/artifacts"
    if is_inspectie(cmd):
        return "in-plan: read-only inspection"
    if is_dax_git_werktak(cmd):
        return "in-plan: DAX pushes its own dax/* work branch (merge stays with Luka)"
    return None


def beslis_goedkeuring(
    rij: dict[str, Any],
    *,
    command: str | None = None,
    app: str | None = None,
    dax: bool = False,
) -> Besluit:
    """Eén besluit voor een pending core_approvals-rij of een voorgenomen actie."""
    meta = rij.get("metadata") if isinstance(rij.get("metadata"), dict) else {}
    cmd = command or (str(meta.get("command") or "") if meta else "")
    kind = str(rij.get("kind") or "")
    app = app or str(meta.get("app") or rij.get("source_app") or "") or None
    tekst = _tekst_van(rij, cmd)

    if kind == "northsea_notice" or (kind != "shell_command" and DEAL_CODE_RE.search(tekst) and "yes needed" in tekst.lower()):
        return Besluit(
            ACTIE_ASK,
            "hard-limit: NorthSea deal go/no-go",
            f"Dit is: een dealbeslissing ({(rij.get('title') or 'deze deal')[:80]}).",
            "Waarom: een deal verzetten of ja/nee op een deal is van Luka of de NorthSea Desk Manager.",
        )

    if kind == "manager_ask" and LUKA_ZELF_RE.search(tekst):
        return Besluit(
            ACTIE_ASK, "needs Luka: payment, credits or login",
            f"Dit is: {(rij.get('title') or 'een vraag van een manager')[:80]}.",
            "Waarom: de manager keek zelf; dit vraagt een betaling, tegoed of login van Luka.",
        )

    grens = harde_grens(tekst, app)
    if grens:
        return Besluit(
            ACTIE_ASK, grens,
            f"Dit is: {(rij.get('title') or 'deze actie')[:80]}.",
            f"Waarom: {grens}. AXE mag dit niet alleen.",
        )

    if cmd:
        auto = shell_auto_reden(cmd, dax=dax or "/dax/" in cmd)
        if auto:
            return Besluit(
                ACTIE_AUTO, auto,
                f"Dit is: {cmd[:80]}.",
                f"Waarom: {auto}.",
            )

    if is_routine_in_plan(tekst):
        reden = "in-plan: routine work (market data / health check / idea scan)"
        return Besluit(
            ACTIE_AUTO, reden,
            f"Dit is: {(rij.get('title') or 'routine')[:80]}.",
            f"Waarom: {reden}.",
        )

    if kind == "shell_command" and cmd:
        # Onbekend commando: liever vragen dan stilletjes systeemwerk doen.
        # Behalve als het beleid het al vrijtekende hierboven.
        return Besluit(
            ACTIE_ASK,
            str(meta.get("reason") or "touches the system"),
            f"Dit is: een shell-commando ({cmd[:80]}).",
            f"Waarom: {meta.get('reason') or 'dit raakt de machine buiten het staande plan'}.",
        )

    reden = "in-plan: AXE decides and proceeds"
    return Besluit(
        ACTIE_AUTO, reden,
        f"Dit is: {(rij.get('title') or 'deze actie')[:80]}.",
        "Waarom: dit blijft binnen het staande plan.",
    )


def _nu() -> str:
    return datetime.now(timezone.utc).isoformat()


def _update_approval(db: Any, rij_id: str, status: str, reden: str) -> None:
    velden = {
        "status": status,
        "decided_by": AUTO_DOOR_AXE,
        "decided_at": _nu(),
        "decision_reason": reden,
    }
    try:
        db.table("core_approvals").update(velden).eq("id", rij_id).eq("status", "pending").execute()
    except Exception:
        if status != "superseded":
            raise
        # Tot de migratie `superseded` in de check zet: zelfde betekenis, geannuleerd.
        velden["status"] = "cancelled"
        velden["decision_reason"] = f"{reden} (superseded)"
        db.table("core_approvals").update(velden).eq("id", rij_id).eq("status", "pending").execute()


def _unstick_taak(db: Any, taak_id: str, *, queued: bool) -> None:
    if not taak_id:
        return
    try:
        if queued:
            db.table("core_tasks").update({
                "status": "queued",
                "next_attempt_at": _nu(),
            }).eq("id", taak_id).eq("status", "waiting_approval").execute()
        else:
            db.table("core_tasks").update({
                "status": "cancelled",
                "cancelled_at": _nu(),
            }).eq("id", taak_id).eq("status", "waiting_approval").execute()
        taak = (db.table("core_tasks").select("id,metadata,status").eq("id", taak_id).limit(1).execute().data or [None])[0]
        if not taak:
            return
        meta = dict(taak.get("metadata") or {})
        if meta.get("goedkeuring") == "nodig":
            meta["goedkeuring"] = "ja" if queued else "afgewezen"
            meta["uiStatus"] = "todo" if queued else "blocked"
            velden: dict[str, Any] = {"metadata": meta}
            if not queued:
                velden["status"] = "cancelled"
            db.table("core_tasks").update(velden).eq("id", taak_id).execute()
    except Exception:
        pass


def bestaande_deal_vraag(db: Any, deal_code: str | None = None, deal_id: str | None = None) -> dict[str, Any] | None:
    """Eén open northsea_notice per deal, of None."""
    if not deal_code and not deal_id:
        return None
    try:
        rijen = (
            db.table("core_approvals").select("*")
            .eq("status", "pending").eq("kind", "northsea_notice")
            .order("created_at").limit(80).execute().data
        ) or []
    except Exception:
        return None
    for r in rijen:
        sleutel = deal_sleutel(r)
        if deal_id and str((r.get("metadata") or {}).get("deal_id") or "") == str(deal_id):
            return r
        if deal_code and sleutel and sleutel.upper() == str(deal_code).upper():
            return r
        if deal_code and str(r.get("title") or "").upper().find(str(deal_code).upper()) >= 0:
            return r
    return None


def pas_beleid_toe_op_pending(db: Any) -> dict[str, int]:
    """Los in-plan pending rijen op en ontdubbel dealvragen. Geen send, geen deal-ja."""
    auto = superseded = 0
    try:
        rijen = (
            db.table("core_approvals").select("*")
            .eq("status", "pending").order("created_at").limit(200).execute().data
        ) or []
    except Exception:
        return {"auto": 0, "superseded": 0}
    gezien_deals: dict[str, str] = {}
    for r in rijen:
        rid = str(r.get("id") or "")
        if not rid:
            continue
        kind = str(r.get("kind") or "")
        if kind == "northsea_notice":
            sleutel = deal_sleutel(r) or str(r.get("title") or "").strip().lower()
            if sleutel in gezien_deals:
                try:
                    _update_approval(db, rid, "superseded", "duplicate deal ask; one open ask per deal")
                    _unstick_taak(db, str(r.get("task_id") or ""), queued=False)
                    superseded += 1
                except Exception:
                    pass
                continue
            if sleutel:
                gezien_deals[sleutel] = rid
            continue
        dax = "/dax/" in _tekst_van(r)
        besluit = beslis_goedkeuring(r, dax=dax)
        if besluit.actie != ACTIE_AUTO:
            continue
        try:
            _update_approval(db, rid, "approved", besluit.reden)
            _unstick_taak(db, str(r.get("task_id") or ""), queued=True)
            auto += 1
        except Exception:
            pass
    return {"auto": auto, "superseded": superseded}


def workspace_is_dax(cwd: str | None) -> bool:
    if not cwd:
        return False
    pad = os.path.realpath(cwd)
    return pad.startswith("/dax/") or "/dax/workspace" in pad or "/dax/artifacts" in pad
