"""
crew_runner.py — wraps the isolated CrewAI runner for the axe_api service.

Branch A: LangGraph → axe_api /crew/run → crew_runner → run_crew.py
→ selected CrewAI specialists on Ollama → result back via temp file (stdout
stays clean).
"""
from __future__ import annotations
import os
import json
import logging
import subprocess
import tempfile

from typing import Optional

from pydantic import BaseModel

from zuinig import Bezet, lagere_prioriteit, slot

log = logging.getLogger("axe_core_api.crew_runner")
CREW_VENV_PY = os.environ.get("CREW_VENV_PY", "/opt/axe-crew-venv/bin/python3")
RUNNER = os.path.join(os.path.dirname(__file__), "run_crew.py")
# 300 en niet 600: de app wacht hooguit 90 s op een crew. Wat daarna nog
# tien minuten doorliep hield alleen een slot bezet (zie zuinig.py).
CREW_TIMEOUT = int(os.environ.get("CREW_TIMEOUT", "300"))
CREW_MAX = int(os.environ.get("CREW_MAX", "2"))
# Negen specialisten bestaan er (run_crew_kickoff kent ze); meer ids dan dat
# is altijd een fout van de aanroeper, geen grotere crew.
MAX_SPECIALISTS = 9


class CrewRunRequest(BaseModel):
    """Body van POST /crew/run.

    `specialists` ontbrak hier. Pydantic gooit onbekende velden stil weg, dus
    de Research Crew vroeg om axe_core + dollar_bill + intel en kreeg altijd
    alleen de master-orchestrator: run_crew() zag nooit een lijst. Staat nu in
    dit bestand en niet in main.py, zodat een test het kan importeren zonder
    Supabase en een hele omgeving.
    """
    task: str
    context: Optional[str] = None
    conversation: Optional[list] = None
    specialists: Optional[list[str]] = None


def normalize_specialists(raw) -> list[str]:
    """Maak van wat een aanroeper stuurt een schone lijst ids.

    Alleen tekst, kleine letters, geen dubbelen, volgorde behouden. Welke ids
    bestaan beslist run_crew_kickoff; die valt terug op axe_core als er geen
    enkele herkend wordt, en meldt in het resultaat welke lijst hij kreeg.
    """
    if not isinstance(raw, (list, tuple)):
        return []
    uit: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        sleutel = item.strip().lower()
        if sleutel and sleutel not in uit:
            uit.append(sleutel)
        if len(uit) >= MAX_SPECIALISTS:
            break
    return uit


def run_crew(task: str, context: str | None = None, conversation: list | None = None, specialists: list | None = None) -> dict:
    if not os.path.exists(CREW_VENV_PY):
        return {
            "status": "error",
            "error": f"Crew venv not found at {CREW_VENV_PY}. Deploy the crew before using /crew/run.",
        }
    if not task or not str(task).strip():
        return {"status": "error", "error": "task is required"}

    payload = json.dumps({
        "task": str(task),
        "context": context,
        "conversation": conversation or [],
        "specialists": normalize_specialists(specialists),
    })

    payload_file = result_file = None
    try:
        payload_file = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        payload_file.write(payload); payload_file.close()
        result_file = tempfile.NamedTemporaryFile("r", suffix=".json", delete=False)
        result_file.close()

        with slot("crew", CREW_MAX, wacht_s=10, sleutel=str(task)):
            proc = subprocess.run(
                [CREW_VENV_PY, RUNNER, payload_file.name, result_file.name],
                capture_output=True, text=True, timeout=CREW_TIMEOUT,
                preexec_fn=lagere_prioriteit,
            )

        out = ""
        try:
            with open(result_file.name, "r") as f:
                out = f.read().strip()
        except Exception:
            out = ""

        if out:
            try:
                return json.loads(out)
            except json.JSONDecodeError:
                return {"status": "error", "error": f"Bad crew output: {out[:500]}"}
        return {"status": "error", "error": f"No result from crew. stderr: {proc.stderr[:500]}"}
    except Bezet as e:
        return {"status": "error", "error": f"Crew niet gestart: {e}"}
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": f"Crew run timed out after {CREW_TIMEOUT}s"}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "error": f"{type(e).__name__}: {e}"}
    finally:
        for p in (payload_file, result_file):
            if p is not None:
                try:
                    os.unlink(p.name)
                except Exception:
                    pass
