"""Wanneer mag een taak 'klaar' zeggen? (gemeten 22 nov, echte taak 9917ae23)

Een managertaak "voeg één test toe" eindigde als COMPLETED met als samenvatting
"ik kan de test niet toevoegen", bewezen met `ls -l` (verwacht: "total") -- een
bewijs dat altijd slaagt. Claude Code was gevraagd maar leverde niets op.
Drie regels, puur, getest:

  1. Zegt de samenvatting zelf dat het niet lukte, dan is het geen klaar maar
     geblokkeerd (MILESTONE: blocked -> task_worker zet de taak op blocked).
  2. Een leeg bewijs (`ls`, `ls -l`, `pwd`, `true`, `echo` zonder feit van elders)
     telt niet.
  3. Is er een coding-agent gevraagd en kwam er geen oplevering terug, dan is
     het werk niet gedaan.
"""
from __future__ import annotations

import re

_MISLUKT = re.compile(
    r"\b(kan|kon|konden|kunnen)\b[^.]{0,80}\bniet\b|\bniet\s+(aanwezig|gevonden|mogelijk|gelukt|lukken)\b|"
    # 25 nov live: "Ik kon in de workspace geen feedconfiguratie vinden OM een overzicht te maken"
    # heette klaar. Alleen met 'om': "ik kon geen fouten vinden" is juist een goed resultaat.
    r"\b(kan|kon|konden|kunnen)\b[^.]{0,80}\bgeen\b[^.]{0,80}\bvinden\s+om\b|"
    r"\blukt(e)?\s+(me\s+|mij\s+|ons\s+)?niet\b|\bzonder\s+(deze|die)\s+bestanden\b|"
    r"\b(cannot|can't|could not|couldn't|unable to|was not able|not possible|not found|failed to)\b",
    re.I,
)
_LEEG_BEWIJS = re.compile(r"^\s*(ls(\s+-[a-z]+)*|pwd|true|:|date|whoami|echo\s+(ok|done|klaar)?)\s*$", re.I)


def geeft_falen_toe(summary: str) -> bool:
    s = summary or ""
    return "MILESTONE:" not in s and bool(_MISLUKT.search(s))


def als_blokkade(summary: str) -> str:
    """Zo leest task_worker.blokkade_uit_rapport het als blocked, met de reden erbij."""
    return f"MILESTONE: blocked REASON: {' '.join((summary or '').split())[:600]}"


def leeg_bewijs(verify_command: str, expect: str) -> bool:
    c = (verify_command or "").strip()
    if _LEEG_BEWIJS.match(c):
        return True
    return not (expect or "").strip()


def coding_zonder_oplevering(coding_gevraagd: bool, oplevering: dict | None) -> bool:
    return coding_gevraagd and not isinstance(oplevering, dict)


WEIGER_LEEG = ("That proof proves nothing: `{cmd}` succeeds whatever happened. Prove the actual result "
               "(the file, the test run, the value) -- or, if it did not work, say so in the summary.")
WEIGER_CODING = ("You asked a coding agent to do the work, but no delivery (oplevering) came back -- the run "
                 "failed or was refused. The work is NOT done. Fix why the run failed, or finish with a summary "
                 "that says plainly it did not work and why.")
