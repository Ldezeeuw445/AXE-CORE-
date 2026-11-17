"""deploy.sh stap 7: crontab roept de wrapper aan, nooit een geheime tekst."""
from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path

DIR = Path(__file__).resolve().parent
HELPER = DIR / "install_cron_wrapper.sh"
DEPLOY = DIR / "deploy.sh"

SECRET = "TEST-ONLY-CRON-SECRET-NIET-IN-CRONTAB"
OLD_TICK = (
    '* * * * * curl -fsS -m 55 -X POST -H '
    f'"X-Cron-Secret: {SECRET}" '
    'https://api.axecompanion.com/cron/tick >/dev/null 2>&1'
)
UNRELATED = "5 4 * * * /usr/local/bin/iets-anders"


def _schrijf_uitvoerbaar(pad: Path, inhoud: str) -> None:
    pad.write_text(inhoud)
    pad.chmod(pad.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _omgeving(tmp: Path, *, wrapper=True, executable=True, env_file=True, env_inhoud=f"CRON_SECRET={SECRET}\n"):
    wrapper_pad = tmp / "sbin" / "axe-core-cron-tick"
    env_pad = tmp / "cron.env"
    cron_file = tmp / "crontab"
    bin_dir = tmp / "bin"
    (tmp / "sbin").mkdir()
    bin_dir.mkdir()
    if wrapper:
        _schrijf_uitvoerbaar(wrapper_pad, "#!/bin/bash\nexit 0\n")
        if not executable:
            wrapper_pad.chmod(stat.S_IRUSR | stat.S_IWUSR)
    if env_file:
        env_pad.write_text(env_inhoud)
    _schrijf_uitvoerbaar(
        bin_dir / "crontab",
        "#!/bin/bash\n"
        'set -euo pipefail\n'
        f'CRON_FILE="{cron_file}"\n'
        'if [ "${1:-}" = "-l" ]; then\n'
        '  if [ -f "$CRON_FILE" ]; then cat "$CRON_FILE"; exit 0; fi\n'
        '  exit 1\n'
        'fi\n'
        'if [ "${1:-}" = "-" ]; then\n'
        # Eerst stdin volledig lezen, daarna atomaire vervanging. `cat > file`
        # zou het crontab-bestand leeghalen terwijl `crontab -l` nog leest.
        '  tmp=$(mktemp)\n'
        '  cat > "$tmp"\n'
        '  mv "$tmp" "$CRON_FILE"\n'
        '  exit 0\n'
        'fi\n'
        'exit 1\n',
    )
    env = os.environ.copy()
    env["PATH"] = f"{bin_dir}:{env.get('PATH', '')}"
    env["AXE_CRON_WRAPPER"] = str(wrapper_pad)
    env["AXE_CRON_ENV"] = str(env_pad)
    return env, wrapper_pad, env_pad, cron_file


def _run(env: dict, cwd=None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(HELPER)],
        env=env,
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
    )


def test_helper_zet_wrapperregel_en_blijft_idempotent(tmp_path):
    env, wrapper_pad, _, cron_file = _omgeving(tmp_path)
    eerste = _run(env)
    assert eerste.returncode == 0, eerste.stderr
    regels = cron_file.read_text().splitlines()
    assert regels == [f"* * * * * {wrapper_pad}"]
    assert SECRET not in cron_file.read_text()
    assert "X-Cron-Secret" not in cron_file.read_text()
    assert SECRET not in eerste.stdout and SECRET not in eerste.stderr
    tweede = _run(env)
    assert tweede.returncode == 0, tweede.stderr
    assert cron_file.read_text().splitlines() == regels


def test_helper_vervangt_oude_curlregel_en_houdt_andere_regels(tmp_path):
    env, wrapper_pad, _, cron_file = _omgeving(tmp_path)
    cron_file.write_text(f"{UNRELATED}\n{OLD_TICK}\n* * * * * {wrapper_pad}\n")
    r = _run(env)
    assert r.returncode == 0, r.stderr
    regels = cron_file.read_text().splitlines()
    assert UNRELATED in regels
    assert f"* * * * * {wrapper_pad}" in regels
    assert regels.count(f"* * * * * {wrapper_pad}") == 1
    assert not any("/cron/tick" in l for l in regels)
    assert SECRET not in cron_file.read_text()
    assert "X-Cron-Secret" not in cron_file.read_text()
    assert SECRET not in r.stdout and SECRET not in r.stderr


def test_helper_waarschuwt_zonder_wrapper_en_laat_crontab_met_rust(tmp_path):
    env, wrapper_pad, _, cron_file = _omgeving(tmp_path, wrapper=False)
    cron_file.write_text(f"{OLD_TICK}\n")
    r = _run(env)
    assert r.returncode == 0, r.stderr
    assert cron_file.read_text() == f"{OLD_TICK}\n"
    assert "Cannot install" in r.stdout
    assert str(wrapper_pad) in r.stdout
    assert "plaintext" in r.stdout
    assert "CRON_SECRET from .env" in r.stdout
    assert SECRET not in r.stdout and SECRET not in r.stderr


def test_helper_waarschuwt_zonder_cron_env_en_valt_niet_terug_op_env(tmp_path):
    env, _, env_pad, cron_file = _omgeving(tmp_path, env_file=False)
    # .env met CRON_SECRET mag niet als fallback dienen.
    (tmp_path / ".env").write_text(f"CRON_SECRET={SECRET}\n")
    r = _run(env, cwd=tmp_path)
    assert r.returncode == 0, r.stderr
    assert not cron_file.exists()
    assert "Cannot install" in r.stdout
    assert str(env_pad) in r.stdout
    assert "plaintext" in r.stdout
    assert SECRET not in r.stdout and SECRET not in r.stderr


def test_helper_waarschuwt_bij_lege_cron_env_of_niet_uitvoerbare_wrapper(tmp_path):
    env, _, _, cron_file = _omgeving(tmp_path, env_inhoud="")
    r = _run(env)
    assert r.returncode == 0
    assert not cron_file.exists()
    assert "Missing or empty" in r.stdout

    niet_x = tmp_path / "niet-x"
    niet_x.mkdir()
    env2, _, _, cron_file2 = _omgeving(niet_x, executable=False)
    r2 = _run(env2)
    assert r2.returncode == 0
    assert not cron_file2.exists()
    assert "Missing or not executable" in r2.stdout


def test_deploy_sh_roept_de_helper_aan_en_zet_geen_geheim_in_crontab():
    tekst = DEPLOY.read_text()
    assert 'bash "$INSTALL_DIR/install_cron_wrapper.sh"' in tekst
    assert "CRON_SECRET_VAL" not in tekst
    assert "X-Cron-Secret:" not in tekst
    assert "scheduler is OFF" not in tekst
    # deploy.sh zelf mag het woord CRON_SECRET in uitleg gebruiken, maar
    # niet uit .env lezen om de crontab te vullen.
    assert "grep -E '^CRON_SECRET='" not in tekst
    assert "grep -E '^CRON_KEY='" not in tekst
