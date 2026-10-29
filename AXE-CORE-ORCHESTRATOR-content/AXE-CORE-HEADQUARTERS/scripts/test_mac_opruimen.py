"""mac_opruimen op een nagebouwde home: wat terugkomt gaat weg, wat van Luka is blijft."""
from __future__ import annotations

import os
import sys
import time

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mac_opruimen as mo


def vul(pad, n=200_000):
    os.makedirs(os.path.dirname(pad), exist_ok=True)
    with open(pad, "wb") as fh:
        fh.write(b"x" * n)


@pytest.fixture
def mac(tmp_path, monkeypatch):
    home, hq = tmp_path / "home", tmp_path / "hq"
    monkeypatch.setattr(mo, "HOME", str(home))
    monkeypatch.setattr(mo, "HQ", str(hq))
    monkeypatch.setattr(mo, "STAAT", str(home / ".axe" / "opruimen.json"))
    monkeypatch.setattr(mo, "UIT", str(home / ".axe" / "opruimen-uit"))
    monkeypatch.setattr(mo, "draait", lambda *s: False)
    monkeypatch.setattr(mo, "gereedschap", lambda naam: None)
    monkeypatch.setattr(mo, "schijf", lambda pad_=None: {"pct": 80.0, "vrij_gb": 40.0})
    for p in ("Library/Developer/Xcode/DerivedData/AXE-abc/Build/x.o", ".npm/_cacache/content/aa",
              "Library/Caches/pip/http/bb"):
        vul(home / p)
    t = hq / "src-tauri" / "target"
    vul(t / "release" / "incremental" / "axe-1" / "q.bin")
    vul(t / "release" / "deps" / "libtokio.rlib")
    vul(t / "release" / "bundle" / "dmg" / "AXE CORE_1.0.0_aarch64.dmg")
    vul(t / "debug" / "deps" / "liboud.rlib")
    oud = time.time() - 5 * 86400
    for d in (t / "debug", t / "debug" / "deps"):
        os.utime(d, (oud, oud))
    # Van Luka: nooit aanraken.
    for p in (".Trash/foto.jpg", "Downloads/contract.pdf", ".axe/werk/axe-companion/half.ts", ".ollama/models/blob"):
        vul(home / p)
    vul(home / "Library" / "Logs" / "axe-autosync.log", mo.LOG_MAX + 1_000_000)
    return home, hq


def test_ruimt_wat_terugkomt_en_laat_staan_wat_van_luka_is(mac):
    home, hq = mac
    t = hq / "src-tauri" / "target"
    uit = mo.ruim_op(nu=1_000_000.0)
    assert uit and uit["vrij"] > 0
    assert (home / "Library/Developer/Xcode/DerivedData").is_dir()
    assert not list((home / "Library/Developer/Xcode/DerivedData").iterdir())
    assert not (home / ".npm/_cacache").exists()
    assert not (t / "release" / "incremental").exists() and not (t / "debug").exists()
    assert not list((t / "release" / "bundle" / "dmg").iterdir())
    # De release-deps blijven: anders wordt elke volgende build een volledige compile.
    assert (t / "release" / "deps" / "libtokio.rlib").exists()
    for p in (".Trash/foto.jpg", "Downloads/contract.pdf", ".axe/werk/axe-companion/half.ts", ".ollama/models/blob"):
        assert (home / p).exists(), p
    assert os.path.getsize(home / "Library/Logs/axe-autosync.log") == mo.LOG_HOUD
    namen = dict(uit["groot"])
    assert namen["Downloads"] > 0 and namen["Agent work checkouts"] > 0


def test_een_debug_build_van_vandaag_blijft(mac):
    _, hq = mac
    debug = hq / "src-tauri" / "target" / "debug"
    os.utime(debug, None)
    uit = mo.ruim_op(nu=1_000_000.0)
    assert debug.exists()
    assert {s["naam"]: s.get("overgeslagen") for s in uit["gedaan"]}["Rust debug build (3 days unused)"] == "recently used"


def test_niets_weg_terwijl_er_gebouwd_wordt(mac, monkeypatch):
    home, hq = mac
    monkeypatch.setattr(mo, "draait", lambda *s: "rust" in s)
    mo.ruim_op(nu=1_000_000.0)
    assert (hq / "src-tauri/target/release/incremental/axe-1/q.bin").exists()
    assert not (home / ".npm/_cacache").exists()  # npm draaide niet


def test_eens_per_dag_en_vaker_als_de_schijf_vol_is(mac, monkeypatch):
    assert mo.ruim_op(nu=1_000_000.0)
    assert mo.ruim_op(nu=1_000_000.0 + 3600) is None
    assert mo.ruim_op(nu=1_000_000.0 + 25 * 3600)
    monkeypatch.setattr(mo, "schijf", lambda pad_=None: {"pct": 91.0, "vrij_gb": 9.0})
    assert mo.ruim_op(nu=1_000_000.0 + 25 * 3600 + 3 * 3600 + 1)


def test_boven_93_procent_gaat_ook_de_hele_target_weg(mac, monkeypatch):
    _, hq = mac
    monkeypatch.setattr(mo, "schijf", lambda pad_=None: {"pct": 95.0, "vrij_gb": 3.0})
    uit = mo.ruim_op(nu=1_000_000.0)
    assert not (hq / "src-tauri" / "target").exists()
    assert any(s["naam"].startswith("Whole Rust target") for s in uit["gedaan"])


def test_droog_en_uit_veranderen_niets(mac):
    home, hq = mac
    uit = mo.ruim_op(droog=True, forceer=True, nu=1_000_000.0)
    assert uit["droog"] and uit["vrij"] > 0
    assert (home / ".npm/_cacache").exists() and (hq / "src-tauri/target/debug").exists()
    assert not os.path.exists(mo.STAAT)
    os.makedirs(os.path.dirname(mo.UIT), exist_ok=True)
    open(mo.UIT, "w").close()
    assert mo.ruim_op(forceer=True, nu=1_000_000.0) is None
    assert (home / ".npm/_cacache").exists()


def test_de_melding_noemt_wat_vrijkwam_en_wat_luka_zelf_moet_kiezen(mac, monkeypatch):
    gezien = []

    class Antwoord:
        def read(self):
            return b""

    def urlopen(req, timeout=0):
        gezien.append(req.data.decode())
        return Antwoord()

    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE", "sleutel")
    monkeypatch.setattr(mo, "grootte", lambda p, timeout=300: 2_000_000_000 if p.endswith("Downloads") else
                        (300_000_000 if os.path.exists(p) else 0))
    monkeypatch.setattr(mo, "grootste", lambda: [("~/Movies", 48_000_000_000), ("~/Library/Mail", 9_000_000_000)])
    mo.ruim_op(nu=1_000_000.0)
    assert gezien and "cleanup: disk 80.0% -> 80.0%" in gezien[0] and "Downloads 2.0 GB" in gezien[0]
    assert "Biggest folders: ~/Movies 48.0 GB, ~/Library/Mail 9.0 GB" in gezien[0]


def test_grootste_toont_library_in_delen_en_kort_de_paden_in(mac):
    home, _ = mac
    # Groter dan de log van 21 MB die de fixture al in ~/Library/Logs zet.
    for p, n in (("Movies/film.mov", 40_000_000), ("Library/Mail/m.emlx", 2_000_000), ("klein/x", 1000)):
        os.makedirs(os.path.dirname(home / p), exist_ok=True)
        with open(home / p, "wb") as fh:
            fh.write(b"x" * n)
    namen = [m for m, _ in mo.grootste(n=3)]
    assert namen[0] == "~/Movies" and "~/Library/Mail" in namen and "~/Library" not in namen
