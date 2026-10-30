"""android_bijwerken met een nep-adb en een nep-bouw: wanneer hij bouwt, en dat hij nooit verwijdert."""
from __future__ import annotations

import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import android_bijwerken as ab

ADB_OK = "List of devices attached\nRZGL61L9P8R\tdevice\n\n"


@pytest.fixture
def mac(tmp_path, monkeypatch):
    home = tmp_path / "home"
    sdk = home / "Library" / "Android" / "sdk"
    (sdk / "platform-tools").mkdir(parents=True)
    (sdk / "platform-tools" / "adb").write_text("")
    repo = home / "axe-core-android"
    (repo / ".git").mkdir(parents=True)
    monkeypatch.setattr(ab, "HOME", str(home))
    monkeypatch.setattr(ab, "STAAT", str(home / ".axe" / "android.json"))
    monkeypatch.setattr(ab, "UIT", str(home / ".axe" / "android-uit"))
    monkeypatch.setattr(ab, "REPO", str(repo))
    monkeypatch.setattr(ab, "sdk", lambda: str(sdk))
    monkeypatch.setattr(ab, "java_home", lambda: "/jdk")
    monkeypatch.setattr(ab, "stil_s", lambda: 900)
    monkeypatch.setattr(ab, "machine", lambda: "Mac-mini-van-Luka-5")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    aanroepen: list[tuple[list[str], dict]] = []
    stand = {"adb": ADB_OK, "bouw_rc": 0, "bouw_uit": "✓ done"}

    def nep(args, **kw):
        aanroepen.append((list(args), kw))
        if args[-1] == "devices":
            return subprocess.CompletedProcess(args, 0, stand["adb"], "")
        if args[:2] == ["git", "-C"] and "rev-parse" in args:
            return subprocess.CompletedProcess(args, 0, "abc1234\n", "")
        if "build-web.sh" in args:
            return subprocess.CompletedProcess(args, stand["bouw_rc"], stand["bouw_uit"], "")
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr(ab, "draai", nep)
    return aanroepen, stand


def test_adb_devices_lezen():
    klaar, geweigerd = ab.toestellen("List of devices attached\nAAA\tdevice\nBBB\tunauthorized\nCCC\toffline\n")
    assert klaar == ["AAA"] and geweigerd == ["BBB"]


def test_besluit():
    assert ab.besluit({}, "abc", 0, 900, False) == (True, "")
    assert not ab.besluit({"geinstalleerd": "abc"}, "abc", 0, 900, True)[0]
    assert not ab.besluit({"mislukt": "abc"}, "abc", 0, 900, True)[0]
    assert ab.besluit({}, "abc", 0, 10, False) == (False, "Luka is using this Mac")
    assert ab.besluit({}, "abc", 0, 10, True) == (True, "")
    assert not ab.besluit({"geinstalleerd": "oud", "laatst": 100}, "abc", 100 + 3600, 900, False)[0]
    assert ab.besluit({"geinstalleerd": "oud", "laatst": 100}, "abc", 100 + 7 * 3600, 900, False)[0]


def test_bouwt_installeert_en_start_zonder_ooit_te_verwijderen(mac):
    aanroepen, _ = mac
    assert ab.werk_bij(nu=1000.0, forceren=False) == "updated"
    bouw = next(kw for a, kw in aanroepen if "build-web.sh" in a)
    assert bouw["env"]["ANDROID_SERIAL"] == "RZGL61L9P8R" and bouw["env"]["AXE_HQ"] == ab.HQ
    assert any("monkey" in a for a, _ in aanroepen)
    assert not any("uninstall" in " ".join(a) for a, _ in aanroepen)
    staat = ab.lees_staat()
    assert staat["geinstalleerd"] == "abc1234" and staat["mislukt"] is None
    # Volgende ronde, zelfde commit: niets.
    assert ab.werk_bij(nu=2000.0, forceren=False) == "phone already has this commit"


def test_een_mislukte_bouw_wordt_niet_elke_5_minuten_herhaald(mac):
    _, stand = mac
    stand["bouw_rc"], stand["bouw_uit"] = 1, "adb: failed to install app-debug.apk: Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]"
    assert ab.werk_bij(nu=1000.0, forceren=False) == "build failed"
    assert ab.lees_staat()["mislukt"] == "abc1234"
    assert ab.werk_bij(nu=1300.0, forceren=False) == "this commit already failed here"
    assert "NOT removed" in ab.oorzaak(stand["bouw_uit"])


def test_zonder_telefoon_of_zonder_toestemming(mac, capsys):
    _, stand = mac
    stand["adb"] = "List of devices attached\n\n"
    assert ab.werk_bij(nu=1000.0, forceren=False) == "no phone"
    stand["adb"] = "List of devices attached\nRZGL61L9P8R\tunauthorized\n"
    assert ab.werk_bij(nu=1000.0, forceren=False) == "phone not authorized"
    assert "Tap Allow on the phone" in capsys.readouterr().out


def test_uit_en_zonder_android_studio(mac, monkeypatch):
    os.makedirs(os.path.dirname(ab.UIT), exist_ok=True)
    open(ab.UIT, "w").close()
    assert ab.werk_bij(nu=1000.0, forceren=False) == "off"
    os.remove(ab.UIT)
    monkeypatch.setattr(ab, "java_home", lambda: None)
    assert ab.werk_bij(nu=1000.0, forceren=False) == "no Android Studio"
    assert ab.lees_staat()["mislukt"] == "abc1234"


def test_wacht_terwijl_luka_werkt(mac, monkeypatch):
    aanroepen, _ = mac
    monkeypatch.setattr(ab, "stil_s", lambda: 20)
    assert ab.werk_bij(nu=1000.0, forceren=False) == "Luka is using this Mac"
    assert not any("build-web.sh" in a for a, _ in aanroepen)
