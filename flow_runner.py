"""
flow_runner.py — wraps the isolated CrewAI Flow runner for the axe_api service.

axe_api /flow/run -> flow_runner -> run_flow.py (isolated venv, same one
crew_runner.py uses) -> Flow.from_declaration() -> declarative flow.json
-> result back via temp file (stdout stays clean, same pattern as crew_runner.py).

Also persists every trading_intelligence cycle to Supabase
(trading_intel_research_cycles = the Research Database layer — everything,
replayable, including failed/needs_monitoring cycles) and promotes
high-confidence findings into the shared axe_knowledge_documents +
intel_correlations tables so AXE Companion and Trading OS can read them too.
"""
from __future__ import annotations
import httpx
import os
import json
import logging
import subprocess
import tempfile
from datetime import datetime, timezone

log = logging.getLogger("axe_core_api.flow_runner")
CREW_VENV_PY = os.environ.get("CREW_VENV_PY", "/opt/axe-crew-venv/bin/python3")
RUNNER = os.path.join(os.path.dirname(__file__), "run_flow.py")
FLOW_TIMEOUT = int(os.environ.get("FLOW_TIMEOUT", "1800"))

# The single owner of this self-hosted system — see README/LOCAL_DEV.md for
# why this is a single-tenant deployment. All shared, user_id-scoped tables
# (intel_correlations, axe_knowledge_documents, trading_intel_research_cycles)
# are written under this identity so AXE Companion / Trading OS (same
# Supabase project, same auth.users row) see the same data.
OWNER_USER_ID = os.environ.get("AXE_OWNER_USER_ID", "acff7a12-1111-481d-a7a9-cc07583b8069")

# Registry of known declarative flows this VPS can run — path is absolute so
# the caller only ever names the flow, never a filesystem path.
FLOWS = {
    "trading_intelligence": "/opt/axe-trading-intelligence-crew/src/axecore_trading_intelligence/flow.json",
}


def _supabase():
    """Lazy import + client so a missing/broken supabase-py never breaks the
    core flow-run path — persistence failures are logged, not raised."""
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE"]
    return create_client(url, key)


def _persist_research_cycle(flow_name: str, inputs: dict, result: dict) -> None:
    if flow_name != "trading_intelligence":
        return  # only this flow has a known Research Database mapping so far
    try:
        sb = _supabase()
        state = result.get("state") if isinstance(result.get("state"), dict) else {}
        ok = result.get("status") == "ok"
        confidence_gate = state.get("confidence_gate_decision")
        high_confidence = confidence_gate == "high_confidence_findings"

        row = {
            "user_id": OWNER_USER_ID,
            "asset": inputs.get("asset", ""),
            "topic": inputs.get("topic"),
            "depth": inputs.get("depth"),
            "status": "error" if not ok else ("high_confidence" if high_confidence else "needs_monitoring"),
            "execution_plan": state.get("execution_plan") if isinstance(state.get("execution_plan"), dict) else {},
            "research_report": state.get("research_report") or (result.get("result") if ok else None),
            "hypotheses": state.get("hypotheses") if isinstance(state.get("hypotheses"), (list, dict)) else [],
            "evidence_registry": state.get("evidence_registry") if isinstance(state.get("evidence_registry"), (list, dict)) else [],
            "debate_record": state.get("debate_record"),
            "backtest_results": state.get("backtest_results"),
            "confidence_gate_decision": confidence_gate,
            "raw_state": state,
            "error": result.get("error"),
        }
        inserted = sb.table("trading_intel_research_cycles").insert(row).execute()
        cycle_id = inserted.data[0]["id"] if inserted.data else None
        log.info(f"[flow_runner] persisted research cycle {cycle_id} for {inputs.get('asset')}")

        if not ok or not high_confidence:
            return  # only promote genuinely validated findings below

        # Promote to the shared AXE CORE Knowledge Base (axe_knowledge_documents)
        # so chat/RAG across the ecosystem can retrieve it.
        report_text = state.get("research_report") or ""
        if report_text:
            asset = inputs.get("asset", "unknown")
            slug = f"trading-intel-{asset.lower()}-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
            try:
                sb.table("axe_knowledge_documents").insert({
                    "user_id": OWNER_USER_ID,
                    "slug": slug,
                    "title": f"{asset} — {inputs.get('topic') or 'research cycle'} ({datetime.now(timezone.utc).date().isoformat()})",
                    "category": "trading_intel",
                    "content": report_text[:20000],
                    "source_type": "crewai_flow",
                    "tags": ["trading", asset.lower(), "validated"],
                }).execute()
            except Exception as e:  # noqa: BLE001
                log.warning(f"[flow_runner] axe_knowledge_documents insert failed: {e}")

        # Promote correlation findings specifically into intel_correlations —
        # the table AXE Companion / Trading OS already read from.
        try:
            sb.table("intel_correlations").insert({
                "user_id": OWNER_USER_ID,
                "title": f"{inputs.get('asset', '')} correlation findings",
                "summary": (report_text[:2000] if report_text else "See linked research cycle."),
                "confidence": "high",
                "signal": confidence_gate,
                "feeds_used": ["crewai_trading_intelligence"],
                "symbols": [inputs.get("asset", "")] if inputs.get("asset") else [],
                "data_points": {"cycle_id": cycle_id},
                "raw_context": None,
            }).execute()
        except Exception as e:  # noqa: BLE001
            log.warning(f"[flow_runner] intel_correlations insert failed: {e}")

    except Exception as e:  # noqa: BLE001 — persistence must never break the caller's response
        log.error(f"[flow_runner] persist_research_cycle failed: {e}")


def _ollama_alive(base: str, timeout: float = 6.0) -> bool:
    """True when an Ollama instance answers /api/tags at `base`."""
    if not base:
        return False
    try:
        with httpx.Client(timeout=timeout) as c:
            return c.get(base.rstrip("/") + "/api/tags").status_code == 200
    except Exception:
        return False


def _resolve_ollama_host() -> str:
    """Preferred trading-crew host, falling back to the shared one when down.

    Probed per run rather than cached: the preferred host is a Spot VM that
    can disappear between two research cycles.
    """
    preferred = os.environ.get("TRADING_CREW_OLLAMA_HOST", "").strip()
    shared = os.environ.get("OLLAMA_HOST", "http://localhost:11434").strip()

    if preferred and _ollama_alive(preferred):
        return preferred
    if preferred:
        logging.getLogger(__name__).warning(
            "trading-crew Ollama %s unreachable - falling back to %s", preferred, shared
        )
    return shared


def run_flow(flow_name: str, inputs: dict) -> dict:
    flow_path = FLOWS.get(flow_name)
    if not flow_path:
        return {"status": "error", "error": f"Unknown flow '{flow_name}'. Known: {list(FLOWS)}"}
    if not os.path.exists(flow_path):
        return {"status": "error", "error": f"Flow declaration not found at {flow_path}"}
    if not os.path.exists(CREW_VENV_PY):
        return {"status": "error", "error": f"Crew venv not found at {CREW_VENV_PY}."}

    inputs_file = result_file = None
    result: dict = {"status": "error", "error": "not run"}
    try:
        inputs_file = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        inputs_file.write(json.dumps(inputs or {})); inputs_file.close()
        result_file = tempfile.NamedTemporaryFile("r", suffix=".json", delete=False)
        result_file.close()

        # Trading crew prefers its own dedicated Ollama host (GCP: more RAM and
        # headroom) but falls back to the shared one (Hetzner) when that box is
        # unreachable. The GCP VM runs on Spot provisioning and is preempted
        # and left stopped without warning — without this fallback every
        # preemption silently broke the entire research flow until someone
        # noticed and repointed the env var by hand.
        env = {
            **os.environ,
            "OLLAMA_HOST": _resolve_ollama_host(),
            "GEMINI_API_KEY": os.environ.get("TRADING_CREW_GEMINI_API_KEY", ""),
        }
        proc = subprocess.run(
            [CREW_VENV_PY, RUNNER, flow_path, inputs_file.name, result_file.name],
            capture_output=True, text=True, timeout=FLOW_TIMEOUT, env=env,
        )

        out = ""
        try:
            with open(result_file.name, "r") as f:
                out = f.read().strip()
        except Exception:
            out = ""

        if out:
            try:
                result = json.loads(out)
            except json.JSONDecodeError:
                result = {"status": "error", "error": f"Bad flow output: {out[:500]}"}
        else:
            result = {"status": "error", "error": f"No result from flow. stderr: {proc.stderr[:800]}"}
    except subprocess.TimeoutExpired:
        result = {"status": "error", "error": f"Flow run timed out after {FLOW_TIMEOUT}s"}
    except Exception as e:  # noqa: BLE001
        result = {"status": "error", "error": f"{type(e).__name__}: {e}"}
    finally:
        for p in (inputs_file, result_file):
            if p is not None:
                try:
                    os.unlink(p.name)
                except Exception:
                    pass

    _persist_research_cycle(flow_name, inputs or {}, result)
    return result
