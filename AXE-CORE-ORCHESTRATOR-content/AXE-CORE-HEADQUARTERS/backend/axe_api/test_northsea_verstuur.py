"""northsea_verstuur: het enige schrijfpad van de desk. Geen netwerk: httpx is nagebootst."""
import asyncio
import json

import pytest

import northsea_verstuur as v


@pytest.fixture(autouse=True)
def _schoon(monkeypatch, tmp_path):
    """Geen echte sleutels, geen echt sleutelbestand."""
    leeg = tmp_path / "sleutels.env"
    leeg.write_text("")
    monkeypatch.setattr(v, "SLEUTEL_BESTAND", str(leeg))
    for naam in (v.URL_NAAM, v.SLEUTEL_NAAM):
        monkeypatch.delenv(naam, raising=False)
    yield


def test_zonder_instellingen_zegt_hij_welke_naam_ontbreekt():
    kan, reden = v.gereed()
    assert kan is False
    # Niet "niet ingesteld" maar WELKE: anders ga je de verkeerde zoeken.
    assert v.URL_NAAM in reden and v.SLEUTEL_NAAM in reden


def test_leest_de_sleutel_uit_het_bestand_van_de_hub(monkeypatch, tmp_path):
    bestand = tmp_path / "sleutels.env"
    bestand.write_text(f'{v.URL_NAAM}=https://voorbeeld/functions/v1/send\n{v.SLEUTEL_NAAM}="geheim"\n')
    monkeypatch.setattr(v, "SLEUTEL_BESTAND", str(bestand))
    assert v.gereed()[0] is True
    assert v.instelling(v.URL_NAAM).endswith("/send")


def test_weigert_te_vragen_als_de_mac_niet_kan(monkeypatch):
    with pytest.raises(v.VerstuurNietKlaar):
        asyncio.run(v.verstuur("abc", "luka"))


class _Antwoord:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body
        self.text = json.dumps(body)

    def json(self):
        return self._body


def _stub(monkeypatch, status, body, gezien=None):
    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, json=None):
            if gezien is not None:
                gezien.update({"url": url, "headers": headers, "json": json})
            return _Antwoord(status, body)
    monkeypatch.setattr(v.httpx, "AsyncClient", _Client)


def test_stuurt_draft_id_en_aanvrager_mee(monkeypatch):
    monkeypatch.setenv(v.URL_NAAM, "https://voorbeeld/functions/v1/send")
    monkeypatch.setenv(v.SLEUTEL_NAAM, "geheim")
    gezien = {}
    _stub(monkeypatch, 200, {"ok": True, "resend_email_id": "re_1"}, gezien)
    status, body = asyncio.run(v.verstuur("draft-7", "luka"))
    assert status == 200 and body["resend_email_id"] == "re_1"
    assert gezien["json"] == {"draft_id": "draft-7", "requested_by": "luka"}
    assert gezien["headers"]["authorization"] == "Bearer geheim"


@pytest.mark.parametrize("fout", [
    "human_approval_provenance_missing",
    "contact_policy_blocked",
    "draft_not_approved",
])
def test_weigering_gaat_letterlijk_terug(monkeypatch, fout):
    """Drie weigeringen, drie verschillende handelingen. Samenvatten wist dat verschil."""
    monkeypatch.setenv(v.URL_NAAM, "https://voorbeeld/functions/v1/send")
    monkeypatch.setenv(v.SLEUTEL_NAAM, "geheim")
    _stub(monkeypatch, 409, {"ok": False, "error": fout})
    status, body = asyncio.run(v.verstuur("draft-7", "luka"))
    assert status == 409
    assert body["error"] == fout


def test_geen_json_wordt_niet_stilletjes_een_succes(monkeypatch):
    monkeypatch.setenv(v.URL_NAAM, "https://voorbeeld/functions/v1/send")
    monkeypatch.setenv(v.SLEUTEL_NAAM, "geheim")

    class _Rommel:
        status_code = 502
        text = "<html>gateway</html>"
        def json(self): raise ValueError("geen json")

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, *a, **k): return _Rommel()

    monkeypatch.setattr(v.httpx, "AsyncClient", _Client)
    status, body = asyncio.run(v.verstuur("draft-7", "luka"))
    assert status == 502 and body["ok"] is False and body["error"] == "geen_json_antwoord"
