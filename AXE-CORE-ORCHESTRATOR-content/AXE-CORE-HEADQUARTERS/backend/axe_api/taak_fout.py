"""Eén regel waarom een taak faalde, plus wat Luka eraan kan doen.

Zelfde bedoeling als src/domain/taken/taakFout.ts: rails, /agents/activity
en failures_report.py mogen geen ruwe worker-codes meer tonen.
"""
from __future__ import annotations

import re
from typing import Any

Actie = str  # retry | open | reconnect


def _tekst(error: Any) -> str:
    if not error:
        return ""
    if isinstance(error, str):
        return error
    if isinstance(error, dict):
        for k in ("message", "output", "detail", "code"):
            v = error.get(k)
            if isinstance(v, str) and v.strip():
                return v
    return str(error)


def taak_fout(error: Any, titel: str = "") -> dict[str, str]:
    raw = _tekst(error)
    laag = f"{raw} {titel}".lower()

    if re.search(r"no handler for northsea", laag):
        return {
            "regel": "NorthSea desk had no worker. Retry routes it to the crew on :8040 (drafts only).",
            "actie": "retry",
        }
    if "no handler" in laag:
        return {
            "regel": "AXE had no worker for this job. Retry sends it to the agent loop.",
            "actie": "retry",
        }
    if "gpt-6-astra" in laag or "requires a newer version" in laag:
        return {
            "regel": "Codex asked for gpt-6-astra; this CLI is too old. Retry uses gpt-5-codex.",
            "actie": "retry",
        }
    if re.search(r"unpaid invoice|payment required|insufficient (credits|balance)|billing", laag):
        return {
            "regel": "This seat needs billing or credits before it can run.",
            "actie": "reconnect",
        }
    if re.search(
        r"oauth|not logged in|please (log|sign) in|login required|"
        r"authentication (failed|required)|invalid_grant",
        laag,
    ):
        return {
            "regel": "This account is logged out. Reconnect it in Settings → Seats.",
            "actie": "reconnect",
        }
    if re.search(r"rate limit|quota exceeded|too many requests|\b429\b|usage limit", laag):
        return {
            "regel": "This seat hit its usage limit. Retry after it cools, or reconnect another seat.",
            "actie": "retry",
        }
    if "token not set" in laag or "127.0.0.1:8040" in laag or "crew service" in laag:
        return {
            "regel": "NorthSea crew on this Mac is unreachable. Reconnect the desk token.",
            "actie": "reconnect",
        }
    if "orchestrator health" in laag:
        return {
            "regel": "Orchestrator health check found a real compile or test failure. Open the report.",
            "actie": "open",
        }
    regel = re.sub(r"\s+", " ", raw).strip()
    if regel:
        return {"regel": regel[:220], "actie": "retry"}
    return {
        "regel": f"Failed: {titel}" if titel else "This task failed without a stored reason.",
        "actie": "open",
    }
