"""AXE Core zelf praat met Luka: één overzicht in gewone taal.

Luka, 17 nov 2026: "de axe core chat in de managers tab is helemaal leeg, hij
heeft nog niks gezegd ... ik krijg alleen meldingen van de managers ... en nu
wachten er nog 44 ergens maar ik kan nergens duidelijk zien waar ik dat moet
goedkeuren".

Gemeten: de bovenste chat ("AXE Core", agent `axe`) kreeg nooit een bericht;
alleen de zes managers schreven, elk over hun eigen hoekje. Niemand zei: dit
wacht er in totaal op jou, en dáár vind je het.

Dit is dat ene bericht. Puur: geen netwerk, geen klok -- de pulse
(grok_managers.run_axemanager) haalt de getallen en beslist wanneer.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

AXE = "axe"
# Hooguit eens per zoveel uur een nieuw overzicht: vaker is weer ruis.
OVERZICHT_ELKE = timedelta(hours=3)
WAAR = "onder 'Wacht op jou' (de knop rechtsboven in de Managers-tab)"


@dataclass(frozen=True)
class Stand:
    axe_vragen: int
    northsea: int | None  # None = de desk was niet te lezen
    northsea_eerst: str = ""
    zelf_vandaag: int = 0
    managers_ok: bool = True


def tekst(s: Stand) -> str:
    regels: list[str] = []
    ns = s.northsea or 0
    totaal = s.axe_vragen + ns
    if totaal == 0 and s.northsea is not None:
        regels.append("Er wacht niets op jou. De managers handelen de rest zelf af.")
    else:
        delen = []
        if s.axe_vragen:
            delen.append(f"{s.axe_vragen} kun je meteen met ja of nee beantwoorden")
        if ns:
            delen.append(f"{ns} {'is' if ns == 1 else 'zijn'} van NorthSea (mails klaar om te versturen en "
                         "deal-besluiten); die keur je goed in de NorthSea-desk, met de tekst ervoor")
        kop = f"Er {'wacht' if totaal == 1 else 'wachten'} {totaal} {'ding' if totaal == 1 else 'dingen'} op jou"
        regels.append(f"{kop}: {', en '.join(delen)}. Alles staat {WAAR}.")
        if s.northsea_eerst:
            regels.append(f"Als eerste bij NorthSea: {s.northsea_eerst}.")
    if s.northsea is None:
        regels.append("De NorthSea-desk kon ik nu niet lezen; die telling ontbreekt dus.")
    if s.zelf_vandaag:
        regels.append(f"Vandaag hebben de managers {s.zelf_vandaag} "
                      f"{'vraag' if s.zelf_vandaag == 1 else 'vragen'} zelf afgehandeld, zonder jou.")
    regels.append("Alle managers draaien." if s.managers_ok else "Niet alle managers draaien; dat zoek ik zelf uit.")
    regels.append("Vraag me gerust iets: ik antwoord zelf, en wat bij een manager hoort zet ik door.")
    return "\n\n".join(regels)


def mag_nu(laatste: datetime | None, nu: datetime) -> bool:
    return laatste is None or nu - laatste >= OVERZICHT_ELKE


__all__ = ["AXE", "Stand", "tekst", "mag_nu", "OVERZICHT_ELKE"]
