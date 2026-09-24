"""Hek van de serverkant. Geen netwerk. stdlib-unittest, ook via pytest."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cli_laag import (
    BLOCKED_FLAGS,
    capability_for,
    hash_token,
    heartbeat_online,
    inspect_approval,
    inspect_blocked,
    new_node_token,
    pair_expired,
    redact,
    slug_device,
    token_matches,
)


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


def test_node_pairing_hash_en_slug():
    assert slug_device("Mac Mini") == "mac-mini"
    assert slug_device("  ") == "node"
    token = new_node_token("mac-mini")
    assert token.startswith("axe-node_mac-mini_")
    hashed = hash_token(token)
    assert hashed != token
    assert token_matches(token, hashed)
    assert not token_matches("wrong", hashed)
    assert pair_expired("2000-01-01T00:00:00Z")
    assert not pair_expired("2099-01-01T00:00:00Z")
    from datetime import datetime, timezone
    assert heartbeat_online(datetime.now(timezone.utc).isoformat())
    assert heartbeat_online("2000-01-01T00:00:00Z") is False
    assert heartbeat_online(None) is False


if __name__ == "__main__":
    test_blokkeert_mail_vlaggen_merge_en_wissen()
    test_geen_override_via_andere_woorden()
    test_system_raken_is_approval_geen_blok()
    test_redact_haalt_sleutels_weg()
    test_capability_volgt_de_roster()
    test_node_pairing_hash_en_slug()
    print("ok")
