"""Een vastgelopen verbindingspool mag de desk niet urenlang blind maken.

8 nov: elke snapshot liep precies de HTTP-timeout vast, zonder één antwoord,
en de mailwachter faalde elke minuut. Lezen probeert nu één keer opnieuw op
een verse pool; schrijven niet (geen dubbele insert).
"""
import asyncio

import httpx
import pytest

from northsea_mcp import repository as repo_mod
from northsea_mcp.repository import RepositoryError, SupabaseRepository


def _repo(monkeypatch, gedrag):
    """Een repository die zijn eigen clients maakt, maar met nep-transport."""
    clients = []

    def maak(self):
        n = len(clients)
        transport = httpx.MockTransport(lambda req: gedrag(n, req))
        c = httpx.AsyncClient(transport=transport)
        clients.append(c)
        return c

    monkeypatch.setattr(SupabaseRepository, "_maak_client", maak)
    return SupabaseRepository("https://db.example", "k"), clients


def test_vastgelopen_pool_wordt_vervangen_en_lezen_lukt(monkeypatch):
    def gedrag(n, req):
        if n == 0:
            raise httpx.PoolTimeout("pool vol")
        return httpx.Response(200, json=[{"id": "1"}])

    async def run():
        r, clients = _repo(monkeypatch, gedrag)
        rows = await r._get("opportunities", {})
        assert rows == [{"id": "1"}]
        assert len(clients) == 2 and r._client is clients[1]
        await r.aclose()
    asyncio.run(run())


def test_blijft_het_hangen_dan_een_nette_fout(monkeypatch):
    def gedrag(n, req):
        raise httpx.ReadTimeout("hangt")

    async def run():
        r, clients = _repo(monkeypatch, gedrag)
        with pytest.raises(RepositoryError, match="ReadTimeout"):
            await r._get("opportunities", {})
        assert len(clients) == 2  # één verse poging, niet eindeloos
        await r.aclose()
    asyncio.run(run())


def test_schrijven_probeert_niet_opnieuw(monkeypatch):
    def gedrag(n, req):
        raise httpx.ReadTimeout("hangt")

    async def run():
        r, clients = _repo(monkeypatch, gedrag)
        with pytest.raises(RepositoryError):
            await r._write("POST", "deal_tasks", None, {"x": 1})
        assert len(clients) == 1
        await r.aclose()
    asyncio.run(run())


def test_meegegeven_client_wordt_nooit_vervangen():
    async def run():
        c = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: (_ for _ in ()).throw(httpx.PoolTimeout("vol"))))
        r = SupabaseRepository("https://db.example", "k", client=c)
        with pytest.raises(RepositoryError):
            await r._get("opportunities", {})
        assert r._client is c
        await c.aclose()
    asyncio.run(run())


def test_snapshot_logt_welke_tabel_faalde(caplog):
    from northsea_mcp.readlayer import InspectService

    class Repo:
        async def fetch_all(self, naam):
            if naam == "deal_events":
                raise RepositoryError("database unreachable (PoolTimeout)")
            return [], False

    async def run():
        return await InspectService(Repo()).snapshot()
    with caplog.at_level("WARNING"):
        snap = asyncio.run(run())
    assert snap.errors == {"deal_events": "database unreachable (PoolTimeout)"}
    assert "deal_events" in caplog.text


_ = repo_mod  # module bewust geïmporteerd: monkeypatch werkt op de klasse
