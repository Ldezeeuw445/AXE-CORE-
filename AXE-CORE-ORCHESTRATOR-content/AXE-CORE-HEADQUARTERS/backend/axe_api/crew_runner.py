"""
crew_runner.py — wraps the isolated CrewAI runner for the axe_api service.

Branch A of the architecture:
    LangGraph (frontend) → axe_api /crew/run → crew_runner → run_crew.py
    → CrewAI crew (9 specialist agents on Ollama) → result back to LangGraph.

The crew runs in its OWN venv (CREW_VENV_PY) so heavy CrewAI/LangChain deps
never touch the FastAPI/Supabase venv. If the venv isn't deployed yet, the
endpoint returns a clean error instead of crashing.
"""
from __future__ import annotations
import os
import json
import logging
import subprocess

log = logging.getLogger("axe_core_api.crew_runner")

CREW_VENV_PY = os.environ.get("CREW_VENV_PY", "/opt/axe-crew-venv/bin/python3")
RUNNER = os.path.join(os.path.dirname(__file__), "run_crew.py")
CREW_TIMEOUT = int(os.environ.get("CREW_TIMEOUT", "600"))


def run_crew(task: str, context: str | None = None, conversation: list | None = None) -> dict:
    """Execute the AXE CORE crew for a task. Returns a result dict."""
    if not os.path.exists(CREW_VENV_PY):
        return {
            "status": "error",
            "error": (
                f"Crew venv not found at {CREW_VENV_PY}. "
                "Deploy the crew (see ARCHITECTURE.md §6) before using /crew/run."
            ),
        }
    if not task or not str(task).strip():
        return {"status": "error", "error": "task is required"}

    payload = json.dumps({
        "task": str(task),
        "context": context,
        "conversation": conversation or [],
    })

    try:
        proc = subprocess.run(
            [CREW_VENV_PY, RUNNER],
            input=payload,
            capture_output=True,
            text=True,
            timeout=CREW_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": f"Crew run timed out after {CREW_TIMEOUT}s"}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "error": f"{type(e).__name__}: {e}"}

    out = (proc.stdout or "").strip()
    if not out:
        return {"status": "error", "error": f"No output from crew. stderr: {proc.stderr[:500]}"}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"status": "error", "error": f"Bad crew output: {out[:500]}"}
