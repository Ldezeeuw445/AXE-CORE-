#!/usr/bin/env python3
"""Hoeveel van de bouwlijst is echt klaar (Luka, 19 nov 2026).

"Dan kunnen we nooit iets als klaar zetten terwijl het half af is." Daarom
drie staten, en alleen de eerste telt als klaar:

  - [x]  klaar     live én in het echt bewezen (gemeten, of Luka zag het werken)
  - [~]  gebouwd   code + tests staan, maar nog niet live of nog niet bewezen
  - [ ]  open      nog niet gebouwd

Het script telt de vinkjes in BOUWLIJST.md en schrijft de stand bovenaan,
tussen <!-- stand:begin --> en <!-- stand:end -->. Met --check verandert het
niets en faalt het als die stand niet meer klopt (zoals de lint-poort).

    python3 scripts/bouwlijst_stand.py           # bijwerken
    python3 scripts/bouwlijst_stand.py --check   # alleen controleren
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

PAD = Path(__file__).resolve().parent.parent / "BOUWLIJST.md"
BEGIN, EIND = "<!-- stand:begin -->", "<!-- stand:end -->"
VINK = re.compile(r"^\s*- \[( |x|~)\]")
KOP = re.compile(r"^## (.+)$")


def tel(regels: list[str]) -> tuple[dict[str, int], list[tuple[str, dict[str, int]]]]:
    totaal = {"x": 0, "~": 0, " ": 0}
    secties: list[tuple[str, dict[str, int]]] = []
    for r in regels:
        k = KOP.match(r)
        if k:
            secties.append((k.group(1).strip(), {"x": 0, "~": 0, " ": 0}))
            continue
        v = VINK.match(r)
        if v:
            totaal[v.group(1)] += 1
            if secties:
                secties[-1][1][v.group(1)] += 1
    return totaal, [(n, t) for n, t in secties if sum(t.values())]


def pct(deel: int, geheel: int) -> int:
    return round(100 * deel / geheel) if geheel else 0


def balk(p: int, breed: int = 20) -> str:
    vol = round(breed * p / 100)
    return "█" * vol + "░" * (breed - vol)


def blok(tekst: str) -> str:
    regels = tekst.splitlines()
    # Tel zonder het oude standblok zelf.
    if BEGIN in tekst and EIND in tekst:
        a, b = tekst.index(BEGIN), tekst.index(EIND) + len(EIND)
        regels = (tekst[:a] + tekst[b:]).splitlines()
    totaal, secties = tel(regels)
    n = sum(totaal.values())
    klaar, gebouwd = totaal["x"], totaal["~"]
    p = pct(klaar, n)
    uit = [
        BEGIN,
        f"**Stand: {p}% klaar** `{balk(p)}` -- {klaar} klaar, {gebouwd} gebouwd maar nog niet bewezen, "
        f"{totaal[' ']} open (van {n}).",
        "",
        "Klaar = live én in het echt bewezen (gemeten, of Luka zag het werken), met datum en bewijs erbij. "
        "Code die er staat met groene tests is `[~]` gebouwd, niet klaar. "
        "Geteld door `python3 scripts/bouwlijst_stand.py`; zet nooit zelf een getal.",
        "",
        "| Deel | Klaar | Gebouwd | Open |",
        "|---|---|---|---|",
    ]
    for naam, t in secties:
        s = sum(t.values())
        uit.append(f"| {naam} | {t['x']} ({pct(t['x'], s)}%) | {t['~']} | {t[' ']} |")
    uit.append(EIND)
    return "\n".join(uit)


def met_stand(tekst: str) -> str:
    nieuw = blok(tekst)
    if BEGIN in tekst and EIND in tekst:
        a, b = tekst.index(BEGIN), tekst.index(EIND) + len(EIND)
        return tekst[:a] + nieuw + tekst[b:]
    # Eerste keer: direct onder de titel.
    kop, _, rest = tekst.partition("\n")
    return f"{kop}\n\n{nieuw}\n{rest}"


def main(argv: list[str]) -> int:
    tekst = PAD.read_text(encoding="utf-8")
    nieuw = met_stand(tekst)
    if "--check" in argv:
        if nieuw != tekst:
            print("BOUWLIJST-stand klopt niet meer: draai python3 scripts/bouwlijst_stand.py")
            return 1
        print("BOUWLIJST-stand klopt.")
        return 0
    if nieuw != tekst:
        PAD.write_text(nieuw, encoding="utf-8")
    print(blok(nieuw).splitlines()[1])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
