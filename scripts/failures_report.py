#!/usr/bin/env python3
"""Doorgave naar de HQ-script. Draai vanaf de repo-root of vanuit HQ."""
from pathlib import Path
import runpy

runpy.run_path(
    str(Path(__file__).resolve().parents[1]
        / "AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/scripts/failures_report.py"),
    run_name="__main__",
)
