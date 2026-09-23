"""
zuinig.py — hoeveel zware runs er tegelijk op deze VPS mogen draaien.

Gemeten 14 september: 33 CrewAI-runs tegelijk (elk ~185 MB) plus twee
TradingAgents-backtests (~360 MB) op een doos van 7,8 GB. Geen enkele run
maakte iets af, en eerder die ochtend was de machine herstart. De API draait
met 12 uvicorn-workers en elke worker startte zonder te kijken wat de andere
elf al hadden lopen.

Een teller in het geheugen van één worker ziet de andere elf niet. Daarom
bestandsvergrendelingen (flock): elke worker ziet dezelfde bestanden, en een
slot komt vanzelf vrij als het proces dat hem hield sterft -- ook bij kill -9
of een herstart, dus er kan nooit een slot "blijven hangen".

Twee regels:
  - hooguit `max_tegelijk` runs van één soort;
  - dezelfde opdracht (zelfde tekst) nooit twee keer tegelijk. De app vroeg
    XAUUSD vijf keer aan terwijl de eerste nog liep.

Wie geen slot krijgt, hoort dat meteen (Bezet) in plaats van in de rij te
wachten: een wachtende HTTP-aanvraag houdt ook een worker vast, en de app
valt bij een weigering al terug op zijn eigen desk.
"""
from __future__ import annotations

import contextlib
import fcntl
import hashlib
import os
import time

SLOT_DIR = os.environ.get("AXE_SLOT_DIR", "/tmp/axe-slots")


class Bezet(Exception):
    """Er is nu geen plek voor deze run."""


def _pak(pad: str):
    f = open(pad, "w")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return f
    except BlockingIOError:
        f.close()
        return None


@contextlib.contextmanager
def slot(soort: str, max_tegelijk: int, wacht_s: float = 0, sleutel: str | None = None):
    os.makedirs(SLOT_DIR, exist_ok=True)
    gehouden = []
    try:
        if sleutel:
            h = hashlib.sha1(sleutel.encode("utf-8", "replace")).hexdigest()[:16]
            f = _pak(os.path.join(SLOT_DIR, f"{soort}-taak-{h}.lock"))
            if f is None:
                raise Bezet(f"deze {soort}-run loopt al")
            gehouden.append(f)
        eind = time.monotonic() + wacht_s
        while True:
            for i in range(max_tegelijk):
                f = _pak(os.path.join(SLOT_DIR, f"{soort}-{i}.lock"))
                if f is not None:
                    gehouden.append(f)
                    break
            else:
                if time.monotonic() >= eind:
                    raise Bezet(f"{max_tegelijk} {soort}-run(s) bezig; later opnieuw")
                time.sleep(1)
                continue
            break
        yield
    finally:
        for f in gehouden:
            f.close()


def lagere_prioriteit() -> None:
    """preexec_fn voor subprocessen: de API en sshd gaan voor."""
    try:
        os.nice(10)
    except OSError:
        pass
