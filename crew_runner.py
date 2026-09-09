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

log = logging.getLogger("axe_core_api.crew_runner")
CREW_VENV_PY = os.environ.get("CREW_VENV_PY", "/opt/axe-crew-venv/bin/python3")
RUNNER = os.path.join(os.path.dirname(__file__), "run_crew.py")
CREW_TIMEOUT = int(os.environ.get("CREW_TIMEOUT", "600"))


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
        "specialists": specialists or [],
    })

    payload_file = result_file = None
    try:
        payload_file = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        payload_file.write(payload); payload_file.close()
        result_file = tempfile.NamedTemporaryFile("r", suffix=".json", delete=False)
        result_file.close()

        proc = subprocess.run(
            [CREW_VENV_PY, RUNNER, payload_file.name, result_file.name],
            capture_output=True, text=True, timeout=CREW_TIMEOUT,
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
