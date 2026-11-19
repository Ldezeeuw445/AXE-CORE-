"""De stand bovenaan de bouwlijst: alleen [x] telt als klaar."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import bouwlijst_stand as bs  # noqa: E402

LIJST = """# AXE CORE — bouwlijst

## Eerst
- [x] live en bewezen
- [~] gebouwd, niet live
- [ ] open
- [ ] ook open

## Later
- [x] klaar
"""


def test_alleen_x_telt_als_klaar():
    uit = bs.met_stand(LIJST)
    assert "**Stand: 40% klaar**" in uit
    assert "2 klaar, 1 gebouwd maar nog niet bewezen, 2 open (van 5)" in uit
    assert "| Eerst | 1 (25%) | 1 | 2 |" in uit and "| Later | 1 (100%) | 0 | 0 |" in uit


def test_opnieuw_draaien_verandert_niets_en_telt_het_blok_niet_mee():
    een = bs.met_stand(LIJST)
    assert bs.met_stand(een) == een
    assert een.count(bs.BEGIN) == 1


def test_vinkje_omzetten_verandert_de_stand():
    een = bs.met_stand(LIJST)
    twee = bs.met_stand(een.replace("- [~] gebouwd", "- [x] gebouwd"))
    assert "**Stand: 60% klaar**" in twee
