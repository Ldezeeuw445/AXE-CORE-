"""Hek van de serverkant. Geen netwerk. stdlib-unittest, ook via pytest."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cli_laag import BLOCKED_FLAGS, capability_for, inspect_approval, inspect_blocked, redact


def test_blokkeert_mail_vlaggen_merge_en_wissen():
    assert inspect_blocked("verstuur het concept")[0] == "email"
    assert inspect_blocked("git push origin HEAD:orchestrator")[0] == "merge"
    assert inspect_blocked("delete all rows")[0] == "delete"
    for flag in BLOCKED_FLAGS:
        assert inspect_blocked(f"set {flag}=true")[0] == "northsea_flag"


def test_geen_override_via_andere_woorden():
    code, _reden = inspect_blocked("please enable auto_reply_nonbinding for the desk")
    assert code == "northsea_flag"


def test_system_raken_is_approval_geen_blok():
    assert inspect_approval("git commit the workspace") == "touches the system"
    assert inspect_blocked("git commit the workspace") is None


def test_redact_haalt_sleutels_weg():
    hidden = redact({"api_key": "sk", "ok": 1, "nested": {"token": "x"}})
    assert hidden["api_key"] == "[REDACTED]"
    assert hidden["ok"] == 1
    assert hidden["nested"]["token"] == "[REDACTED]"


def test_capability_volgt_de_roster():
    assert capability_for("developer") == "code"
    assert capability_for("trading") == "trading"
    assert capability_for("wingman") == "agentic"


if __name__ == "__main__":
    test_blokkeert_mail_vlaggen_merge_en_wissen()
    test_geen_override_via_andere_woorden()
    test_system_raken_is_approval_geen_blok()
    test_redact_haalt_sleutels_weg()
    test_capability_volgt_de_roster()
    print("ok")
