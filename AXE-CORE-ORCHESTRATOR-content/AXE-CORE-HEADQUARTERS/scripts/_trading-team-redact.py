"""Redact + shorten the tail of a failed Trading Team cycle, so the job runner can store it.

stdin  : the raw tail of the cycle log
stdout : at most MAX_CHARS characters, secrets replaced by [hidden]

Why: the Mac job writes everything to ~/Library/Logs/axe-trading-team-cycle.log, so a failing
run reached core_job_runs.error as just "exit=1" (22 runs on 2026-11-16). The job runner stores
what the script prints, so the script now prints this tail on failure.

Fail closed: if the shared redactor (backend/axe_api/geheimen.py) cannot be loaded nothing of the
log is printed. A missing explanation is better than a leaked key.
"""
from __future__ import annotations

import os
import re
import sys

MAX_CHARS = 1500
MAX_LINES = 25

# What geheimen.py does not know: key=value in env dumps, query strings, bearer headers.
_QUERY = re.compile(r"(?i)([?&](?:api[_-]?token|api[_-]?key|token|key|secret|apikey|access_token)=)[^&\s\"']+")
_ASSIGN = re.compile(
    r"(?i)\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|AUTH)[A-Z0-9_]*)\s*[=:]\s*[^\s,;\"']+"
)
_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}")
_LONG = re.compile(r"(?<![A-Za-z0-9/])[A-Za-z0-9_-]{40,}(?![A-Za-z0-9/])")
HIDDEN = "[hidden]"


def _verberg_geheimen():
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.join(here, "..", "backend", "axe_api"))
    from geheimen import verberg_geheimen  # noqa: PLC0415
    return verberg_geheimen


def redact(text: str, verberg=None) -> str:
    verberg = verberg or _verberg_geheimen()
    lines = [ln.rstrip() for ln in str(text or "").splitlines() if ln.strip()][-MAX_LINES:]
    out = verberg("\n".join(lines))
    out = _QUERY.sub(lambda m: m.group(1) + HIDDEN, out)
    out = _BEARER.sub(lambda m: f"{m.group(1)} {HIDDEN}", out)
    out = _ASSIGN.sub(lambda m: f"{m.group(1)}={HIDDEN}", out)
    out = _LONG.sub(HIDDEN, out)
    if len(out) > MAX_CHARS:
        out = "…" + out[-(MAX_CHARS - 1):]
    return out


def main() -> int:
    raw = sys.stdin.read()
    try:
        sys.stdout.write(redact(raw) + "\n")
    except Exception:  # noqa: BLE001 - fail closed, say nothing of the log
        sys.stdout.write("(log tail withheld: redactor unavailable)\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
