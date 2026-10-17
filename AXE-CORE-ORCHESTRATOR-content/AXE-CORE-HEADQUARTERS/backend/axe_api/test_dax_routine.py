"""DAX CI herstelt een python zonder pip in plaats van rood te gaan."""
from __future__ import annotations

import dax_routine as dr


def test_python_voor_ci_slaat_dode_venv_over(monkeypatch, tmp_path):
    dode = tmp_path / ".venv-ci" / "bin" / "python"
    dode.parent.mkdir(parents=True)
    dode.write_text("#!/bin/sh\nexit 1\n")
    systeem = tmp_path / "system-python"
    systeem.write_text("#!/bin/sh\nexit 0\n")

    seen = []

    def nep_pip(py):
        seen.append(py)
        return py == str(systeem)

    monkeypatch.setattr(dr, "sys", type("S", (), {"executable": str(dode)})())
    monkeypatch.setattr(dr, "_heeft_pip", nep_pip)
    monkeypatch.setattr(dr, "_systeem_python", lambda: str(systeem))
    monkeypatch.setattr(dr, "WORKSPACE", str(tmp_path))
    monkeypatch.setattr(dr, "_sh", lambda *a, **k: type("P", (), {"returncode": 1, "stderr": "No module named pip", "stdout": ""})())

    assert dr.python_voor_ci() == str(systeem)
    assert str(dode) in seen


def test_heeft_pip_leest_echte_returncode(monkeypatch):
    monkeypatch.setattr(dr, "_sh", lambda *a, **k: type("P", (), {"returncode": 0})())
    assert dr._heeft_pip("/usr/bin/python3") is True
    monkeypatch.setattr(dr, "_sh", lambda *a, **k: type("P", (), {"returncode": 1})())
    assert dr._heeft_pip("/dax/workspace/.venv-ci/bin/python") is False
