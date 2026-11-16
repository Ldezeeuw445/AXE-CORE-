"""trading-team-cycle.sh: a failed cycle must explain itself on stderr, without leaking keys."""
from __future__ import annotations

import os
import stat
import subprocess
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib.util

_spec = importlib.util.spec_from_file_location("_trading_team_redact", os.path.join(HERE, "_trading-team-redact.py"))
red = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(red)

SCRIPT = os.path.join(HERE, "trading-team-cycle.sh")
ECHT_TOKEN = "eyJhbGciOiJSUzUxMiJ9.eyJfaWQiOiIxMjM0NTY3ODkwYWJjZGVmIn0.c2lnbmF0dXJlc2lnbmF0dXJl"


def test_redact_hides_keys_in_every_shape_the_cycle_log_shows():
    raw = "\n".join([
        "EODHD fetch https://eodhd.com/api/eod/EURUSD.FOREX?api_token=abcdef123456&fmt=json failed",
        f"MetaAPI auth-token: {ECHT_TOKEN}",
        "Authorization: Bearer abcdefghijklmnop1234567890",
        "METAAPI_TOKEN=supersecretvalue123",
        "ghp_" + "a" * 36,
        "gewone regel: GO EURUSD 0.77",
    ])
    out = red.redact(raw)
    for geheim in ("abcdef123456", ECHT_TOKEN, "abcdefghijklmnop1234567890", "supersecretvalue123", "ghp_" + "a" * 36):
        assert geheim not in out
    assert "gewone regel: GO EURUSD 0.77" in out


def test_redact_keeps_the_end_of_a_long_log_within_the_limit():
    raw = "\n".join(f"regel {i} " + "x" * 80 for i in range(400)) + "\nLAATSTE FOUT: Error: ECONNREFUSED 127.0.0.1:8001"
    out = red.redact(raw)
    assert len(out) <= red.MAX_CHARS
    assert out.rstrip().endswith("ECONNREFUSED 127.0.0.1:8001")
    assert out.count("\n") < red.MAX_LINES


def test_redact_fails_closed_when_the_shared_redactor_is_missing():
    def stuk(_):
        raise ImportError("geheimen weg")
    with pytest.raises(ImportError):
        red.redact("token=abc", verberg=stuk)  # main() turns this into "withheld"
    r = subprocess.run([sys.executable, os.path.join(HERE, "_trading-team-redact.py")], input="x", capture_output=True, text=True)
    assert r.returncode == 0  # normal path works


@pytest.fixture
def hq(tmp_path):
    """A pretend HQ: the real script + redactor + backend/geheimen, and a fake vite-node."""
    root = tmp_path / "hq"
    (root / "scripts").mkdir(parents=True)
    (root / "node_modules" / ".bin").mkdir(parents=True)
    backend = root / "backend" / "axe_api"
    backend.mkdir(parents=True)
    for naam in ("trading-team-cycle.sh", "_trading-team-redact.py", "_trading-team-export-env.py"):
        (root / "scripts" / naam).write_text(open(os.path.join(HERE, naam)).read())
    (backend / "geheimen.py").write_text(open(os.path.join(HERE, "..", "backend", "axe_api", "geheimen.py")).read())
    (root / "scripts" / "trading-team-cycle.mts").write_text("")
    return root


def draai(hq, tmp_path, vite_body):
    vite = hq / "node_modules" / ".bin" / "vite-node"
    vite.write_text("#!/bin/bash\n" + vite_body)
    vite.chmod(vite.stat().st_mode | stat.S_IEXEC)
    log = tmp_path / "cycle.log"
    env = {**os.environ, "AXE_TRADING_TEAM_CYCLE_LOG": str(log), "TMPDIR": str(tmp_path)}
    p = subprocess.run(["/bin/bash", str(hq / "scripts" / "trading-team-cycle.sh")], capture_output=True, text=True, env=env)
    return p, log.read_text() if log.exists() else ""


def test_failed_cycle_prints_a_redacted_tail_and_keeps_the_exit_code(hq, tmp_path):
    p, log = draai(hq, tmp_path,
                   'echo "fetch https://eodhd.com/api/eod/X?api_token=SECRETKEY99 -> 402"\n'
                   'echo "cycle aborted: EODHD quota" >&2\nexit 3\n')
    assert p.returncode == 3
    assert "cycle aborted: EODHD quota" in p.stderr
    assert "402" in p.stderr
    assert "SECRETKEY99" not in p.stderr
    assert "SECRETKEY99" in log  # the local log file is unchanged: full output still goes there
    assert "cycle aborted" in log


def test_successful_cycle_is_quiet_on_stderr_and_still_logs(hq, tmp_path):
    p, log = draai(hq, tmp_path, 'echo "verdict=GO"\nexit 0\n')
    assert p.returncode == 0
    assert p.stderr == ""
    assert "verdict=GO" in log


def test_missing_vite_node_says_so(hq, tmp_path):
    (hq / "node_modules" / ".bin" / "vite-node").unlink(missing_ok=True)
    log = tmp_path / "cycle.log"
    env = {**os.environ, "AXE_TRADING_TEAM_CYCLE_LOG": str(log), "TMPDIR": str(tmp_path)}
    p = subprocess.run(["/bin/bash", str(hq / "scripts" / "trading-team-cycle.sh")], capture_output=True, text=True, env=env)
    assert p.returncode == 1
    assert "vite-node is missing" in p.stderr
