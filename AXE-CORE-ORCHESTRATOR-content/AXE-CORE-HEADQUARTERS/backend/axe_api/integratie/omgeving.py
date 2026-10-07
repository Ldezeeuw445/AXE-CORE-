"""Gedeelde opzet voor de integratietests: echte Postgres via PostgREST.

Geen nep-repo: dezelfde migraties als productie, dezelfde RPC's
(claim_next_core_task, claim_next_core_mission, acquire_dax_slot, ...), en
dezelfde Python-klassen als de VPS draait. Alleen het taalmodel is een script,
omdat een test niet van een betaalde API mag afhangen.

Opzetten: bash integratie/start_testdb.sh (print de exports).
"""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Any

HIER = Path(__file__).resolve().parent
API = HIER.parent
APP = API.parents[1]
INFRA_DAX = APP / "infra" / "dax"

PGRST_URL = os.environ.get("AXE_INTEGRATIE_PGRST", "")
PGRST_KEY = os.environ.get("AXE_INTEGRATIE_KEY", "")
PSQL = os.environ.get("AXE_INTEGRATIE_PSQL", "")   # bv. "psql -h /var/lib/axe-pg -p 5433 -U postgres -d axe_test"


def beschikbaar() -> bool:
    return bool(PGRST_URL and PGRST_KEY and PSQL)


def db_factory():
    from postgrest import SyncPostgrestClient

    def maak():
        return SyncPostgrestClient(PGRST_URL, headers={"Authorization": f"Bearer {PGRST_KEY}", "apikey": PGRST_KEY},
                                   timeout=15)
    return maak


def sql(query: str) -> str:
    uit = subprocess.run(PSQL.split() + ["-v", "ON_ERROR_STOP=1", "-At", "-c", query],
                         capture_output=True, text=True, timeout=60)
    if uit.returncode != 0:
        raise RuntimeError(uit.stderr)
    return uit.stdout.strip()


def leeg() -> None:
    sql("truncate core_mission_events, core_dax_slots, core_task_events, core_approvals, core_task_steps restart identity cascade;"
        " delete from core_tasks; delete from core_missions;"
        " update core_dax_computers set status='provisioned', stats='{}', last_error=null;")


def docker_extra() -> str:
    """Mounts waarmee het kale test-image de host-userland gebruikt (geen registry hier)."""
    return (f"-v /usr:/usr:ro -v /etc:/etc:ro -v /opt/pw-browsers:/opt/pw-browsers:ro "
            f"-v {INFRA_DAX}/dax-init.sh:/dax-init:ro -v {INFRA_DAX}/dax-browser.py:/dax-bin/dax-browser:ro")


# ── Het script dat het taalmodel speelt ──────────────────────────────────────

def _slug(tekst: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", tekst.lower()).strip("-")


def script_model():
    """Een deterministisch 'model' dat echte tools aanroept via de echte lus.

    Beurt 1: run_shell (het werk). Beurt 2: finish met een bewijscommando.
    Mijlpaal 'slow ...' slaapt lang (crashtest). Mijlpaal 'deploy ...' vraagt
    eerst iets wat goedkeuring nodig heeft.
    """
    async def model(contents: list[dict[str, Any]], _sleutel: Any) -> dict[str, Any]:
        verzoek = contents[0]["parts"][0]["text"]
        beurt = sum(1 for c in contents if c.get("role") == "model")
        gevonden = re.search(r"^Milestone \d+/\d+: (.+)$", verzoek, re.M)
        slug = _slug(gevonden.group(1) if gevonden else "werk")
        if beurt == 0:
            if slug.startswith("slow"):
                cmd = f"sleep {os.environ.get('AXE_TEST_SLOW', '25')} && echo done-{slug} > {slug}.txt"
            elif slug.startswith("deploy"):
                cmd = "touch APPROVED_STEP_RAN && git commit --allow-empty -m deploy || true"
            else:
                cmd = f"echo done-{slug} > {slug}.txt && echo ${{DAX_ID:-vps}} >> {slug}.txt && sleep {os.environ.get('AXE_TEST_STEP', '1')}"
            return {"parts": [{"functionCall": {"name": "run_shell", "args": {"command": cmd}}}]}
        bewijs = "test -f APPROVED_STEP_RAN && echo OK" if slug.startswith("deploy") else f"grep -q done-{slug} {slug}.txt && echo OK"
        return {"parts": [{"functionCall": {"name": "finish", "args": {
            "summary": f"Did {slug} on ${{DAX_ID}}.\nMILESTONE: done",
            "verify_command": bewijs, "expect_in_output": "OK",
        }}}]}
    return model
