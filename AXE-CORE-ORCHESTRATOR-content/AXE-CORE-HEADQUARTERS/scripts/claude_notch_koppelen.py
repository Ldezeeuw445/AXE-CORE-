#!/usr/bin/env python3
"""Koppel (of ontkoppel) Claude Code aan de AXE-notch (18 nov 2026).

  python3 scripts/claude_notch_koppelen.py            # laat zien wat er verandert, schrijft niets
  python3 scripts/claude_notch_koppelen.py --ja       # kopieert de hook en schrijft ~/.claude/settings.json
  python3 scripts/claude_notch_koppelen.py --los --ja # haalt precies die regels weer weg

Regels (uit de Pulsar-opzet, en Luka's eigen regel):
- ~/.claude/settings.json nooit aanpassen zonder te laten zien wat erbij komt;
  eerst een gedateerde kopie ernaast.
- De hook staat EERST op zijn plek voordat settings.json ernaar verwijst; anders
  stopt Claude Code bij elke prompt. Lukt het kopiëren niet: niets schrijven.
- Heeft settings.json een vorm die we niet verwachten: niet aanraken, zeggen.
- Ontkoppelen haalt alleen onze eigen regels weg.
"""
from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path

HIER = Path(__file__).resolve().parent
BRON = HIER / "claude-notch-hook.py"
DOEL = Path.home() / ".axe" / "hooks" / "claude-notch-hook.py"
SETTINGS = Path.home() / ".claude" / "settings.json"
GEBEURTENISSEN = ("UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Notification", "Stop", "SessionEnd")
MERK = "claude-notch-hook.py"


def onze_regel() -> dict:
    return {"type": "command", "command": f'/usr/bin/python3 "{DOEL}"', "timeout": 5}


def is_onze(h: dict) -> bool:
    return isinstance(h, dict) and MERK in str(h.get("command", ""))


def koppel(cfg: dict) -> dict:
    hooks = cfg.setdefault("hooks", {})
    if not isinstance(hooks, dict):
        raise ValueError("'hooks' in settings.json is geen object")
    for ev in GEBEURTENISSEN:
        lijst = hooks.setdefault(ev, [])
        if not isinstance(lijst, list):
            raise ValueError(f"hooks.{ev} is geen lijst")
        if any(is_onze(h) for blok in lijst if isinstance(blok, dict) for h in blok.get("hooks", [])):
            continue
        blok = {"hooks": [onze_regel()]}
        if ev in ("PreToolUse", "PostToolUse", "PostToolUseFailure"):
            blok["matcher"] = "*"
        lijst.append(blok)
    return cfg


def ontkoppel(cfg: dict) -> dict:
    hooks = cfg.get("hooks")
    if not isinstance(hooks, dict):
        return cfg
    for ev in list(hooks):
        lijst = hooks[ev]
        if not isinstance(lijst, list):
            continue
        nieuw = []
        for blok in lijst:
            if isinstance(blok, dict) and isinstance(blok.get("hooks"), list):
                blok = {**blok, "hooks": [h for h in blok["hooks"] if not is_onze(h)]}
                if not blok["hooks"]:
                    continue
            nieuw.append(blok)
        if nieuw:
            hooks[ev] = nieuw
        else:
            del hooks[ev]
    if not hooks:
        cfg.pop("hooks", None)
    return cfg


def main(argv: list[str]) -> int:
    ja, los = "--ja" in argv, "--los" in argv
    try:
        oud = json.loads(SETTINGS.read_text()) if SETTINGS.exists() else {}
        if not isinstance(oud, dict):
            raise ValueError("settings.json is geen object")
        nieuw = (ontkoppel if los else koppel)(json.loads(json.dumps(oud)))
    except (OSError, ValueError) as e:
        print(f"Ik raak {SETTINGS} niet aan: {e}")
        return 1
    if nieuw == oud:
        print("Er verandert niets: " + ("niet gekoppeld." if los else "al gekoppeld."))
        return 0
    print(f"{'Ontkoppelen' if los else 'Koppelen'}: dit wordt {SETTINGS} ->\n")
    print(json.dumps(nieuw.get("hooks", {}), indent=2, ensure_ascii=False))
    if not ja:
        print("\nNiets geschreven. Akkoord? Draai opnieuw met --ja.")
        return 0
    if not los:
        try:
            DOEL.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(BRON, DOEL)
        except OSError as e:
            print(f"Kon de hook niet neerzetten ({e}); settings.json is NIET aangepast.")
            return 1
    if SETTINGS.exists():
        kopie = SETTINGS.with_name(f"settings.json.voor-axe-notch-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(SETTINGS, kopie)
        print(f"\nKopie: {kopie}")
    SETTINGS.parent.mkdir(parents=True, exist_ok=True)
    tmp = SETTINGS.with_suffix(".tmp")
    tmp.write_text(json.dumps(nieuw, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(SETTINGS)
    print("Klaar. Nieuwe Claude Code-sessies verschijnen nu in de AXE-notch.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
