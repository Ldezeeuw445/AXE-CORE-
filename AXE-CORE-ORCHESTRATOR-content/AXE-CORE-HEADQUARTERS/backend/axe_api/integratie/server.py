"""De server-kant zoals op de VPS: worker-slots + missielus, zonder app.

Een los OS-proces. De tests starten het, sluiten "de frontend" (er is er geen),
killen het met SIGKILL om een crash na te doen, en starten het opnieuw.
Alleen _call_model is vervangen door het script uit omgeving.py.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import agent_loop  # noqa: E402
import omgeving  # noqa: E402
import task_worker  # noqa: E402
from dax import DaxRegister, dax_aan  # noqa: E402
from mission_engine import MissieMotor, run_mission_engine  # noqa: E402
from missies import MissieRepository  # noqa: E402
from task_runtime import TaskRepository  # noqa: E402


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    agent_loop._call_model = omgeving.script_model()
    db = omgeving.db_factory()
    repo = TaskRepository(db)
    motor = MissieMotor(MissieRepository(db), repo, eigenaar=f"test-{os.getpid()}:missions")
    await asyncio.gather(
        task_worker.run_slots(
            repo,
            {"agentic": task_worker.agentic_handler, "task_manage": task_worker.task_manage_handler},
            lease_seconds=int(os.environ.get("TASK_LEASE_SECONDS", "90")),
            dax=DaxRegister(db) if dax_aan() else None,
        ),
        run_mission_engine(motor),
    )


if __name__ == "__main__":
    asyncio.run(main())
