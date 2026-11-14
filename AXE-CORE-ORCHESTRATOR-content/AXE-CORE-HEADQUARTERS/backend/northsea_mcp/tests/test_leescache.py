"""Incrementele cursor, snapshot-TTL, health zonder verse scan, backoff (10 nov)."""
from __future__ import annotations

import asyncio
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from northsea_mcp.leescache import (
    APPEND_CURSOR,
    BACKOFF_MAX_S,
    LeesBackoff,
    TabelVoorraad,
    cursor_kolom,
    hoogste_cursor,
    pgrst_code,
    postgrest_ts,
    supabase_overbelast,
    voeg_samen,
)
from northsea_mcp.readlayer import CACHE_S, GELIJKTIJDIG, InspectService, snapshot_ttl_s
from northsea_mcp.readtools import ReadTools
from northsea_mcp.repository import SNAPSHOT_SELECT, RepositoryError, SupabaseRepository
from northsea_mcp.service import Caller

LEZER = Caller(principal="t", client_id="t", scopes=frozenset({"northsea.read"}))


def test_voeg_samen_overschrijft_op_id():
    cache = {"a": {"id": "a", "n": 1, "updated_at": "2026-01-01T00:00:00Z"}}
    voeg_samen(cache, [
        {"id": "a", "n": 2, "updated_at": "2026-02-01T00:00:00Z"},
        {"id": "b", "n": 3, "updated_at": "2026-03-01T00:00:00Z"},
    ])
    assert cache["a"]["n"] == 2 and cache["b"]["n"] == 3
    assert hoogste_cursor(cache.values(), "updated_at") == "2026-03-01T00:00:00Z"


def test_cursor_kolom_append_only_zonder_updated_at():
    assert cursor_kolom("deal_events", SNAPSHOT_SELECT["deal_events"]) == "created_at"
    assert cursor_kolom("northsea_audit_events", SNAPSHOT_SELECT["northsea_audit_events"]) == "occurred_at"
    assert cursor_kolom("inbound_email_attachments", SNAPSHOT_SELECT["inbound_email_attachments"]) == "created_at"
    assert cursor_kolom("opportunities", "*") == "updated_at"
    assert APPEND_CURSOR["northsea_audit_events"] == "occurred_at"
    # communications heeft GEEN updated_at (gemeten 14 nov): cursor op created_at,
    # plus periodiek volledig herladen voor delivery_status (VOLLEDIG_HERLADEN_NA_S).
    assert cursor_kolom("communications", SNAPSHOT_SELECT["communications"]) == "created_at"
    assert cursor_kolom("communications", "id,created_at,occurred_at") == "created_at"


def test_postgrest_ts_zet_offset_om_naar_z():
    assert postgrest_ts("2026-11-10T12:00:00+00:00") == "2026-11-10T12:00:00Z"


def test_supabase_overbelast_herkent_521_en_pgrst002():
    assert supabase_overbelast(521) and supabase_overbelast(503, '{"code":"PGRST002"}')
    assert supabase_overbelast(500) and not supabase_overbelast(400)
    assert pgrst_code('{"code":"PGRST002","message":"schema"}') == "PGRST002"
    assert pgrst_code("nope") is None


def test_backoff_exponentieel_tot_tien_minuten():
    nu = [0.0]
    b = LeesBackoff(start_s=8, max_s=BACKOFF_MAX_S, klok=lambda: nu[0])
    assert not b.actief()
    assert b.faal() == 8 and b.actief()
    nu[0] = 8.1
    assert not b.actief()
    assert b.faal() == 16
    for _ in range(8):
        b.faal()
    assert b.faal() == BACKOFF_MAX_S
    b.herstel()
    assert not b.actief() and b.faal() == 8


def test_snapshot_ttl_zit_tussen_vijf_en_vijftien_minuten():
    assert CACHE_S == 600
    assert snapshot_ttl_s({}) == 600
    assert snapshot_ttl_s({"NORTHSEA_SNAPSHOT_TTL_S": "120"}) == 300
    assert snapshot_ttl_s({"NORTHSEA_SNAPSHOT_TTL_S": "9999"}) == 900
    assert snapshot_ttl_s({"NORTHSEA_SNAPSHOT_TTL_S": "nope"}) == 600


def _repo(gedrag, monkeypatch, tmp_path=None):
    clients = []

    def maak(self):
        transport = httpx.MockTransport(lambda req: gedrag(req))
        c = httpx.AsyncClient(transport=transport)
        clients.append(c)
        return c

    monkeypatch.setattr(SupabaseRepository, "_maak_client", maak)
    r = SupabaseRepository("https://db.example", "k", cache_dir=tmp_path)
    return r, clients


def _qs(req):
    return {k: v[0] for k, v in parse_qs(urlparse(str(req.url)).query).items()}


def test_fetch_all_tweede_keer_alleen_delta(monkeypatch):
    rijen = [
        {"id": "1", "updated_at": "2026-01-01T00:00:00+00:00", "n": 1},
        {"id": "2", "updated_at": "2026-02-01T00:00:00+00:00", "n": 2},
    ]
    gezien = []

    def gedrag(req):
        q = _qs(req)
        gezien.append(q)
        sinds = q.get("updated_at", "")
        uit = rijen
        if sinds.startswith("gte."):
            grens = sinds[4:]
            uit = [x for x in rijen if x["updated_at"].replace("+00:00", "Z") >= grens.replace("Z", "Z")]
        return httpx.Response(200, json=uit)

    async def run():
        r, _ = _repo(gedrag, monkeypatch)
        eerste, af = await r.fetch_all("opportunities")
        assert af is False and {x["id"] for x in eerste} == {"1", "2"}
        rijen.append({"id": "2", "updated_at": "2026-03-01T00:00:00+00:00", "n": 20})
        rijen.append({"id": "3", "updated_at": "2026-04-01T00:00:00+00:00", "n": 3})
        tweede, af2 = await r.fetch_all("opportunities")
        await r.aclose()
        return tweede, af2

    tweede, af2 = asyncio.run(run())
    assert af2 is False
    by_id = {x["id"]: x for x in tweede}
    assert by_id["2"]["n"] == 20 and by_id["3"]["n"] == 3 and "1" in by_id
    assert "updated_at" not in gezien[0]
    assert gezien[1]["updated_at"].startswith("gte.")
    assert gezien[0]["order"] == "updated_at.asc,id.asc"


def test_fetch_all_houdt_5000_plafond_bij_eerste_lading(monkeypatch):
    def gedrag(req):
        q = _qs(req)
        lim = int(q.get("limit", "200"))
        off = int(q.get("offset", "0"))
        # Altijd een volle pagina: de eerste lading moet afkappen.
        page = [{"id": str(off + i), "updated_at": f"2026-01-01T00:00:{i:02d}Z"} for i in range(lim)]
        return httpx.Response(200, json=page)

    async def run():
        r, _ = _repo(gedrag, monkeypatch)
        rows, af = await r.fetch_all("opportunities", max_rows=400)
        await r.aclose()
        return rows, af

    rows, af = asyncio.run(run())
    assert af is True and len(rows) == 400


def test_fetch_all_koppelt_aanroeper_niet_aan_de_cache(monkeypatch):
    """dry_run van de engine mag de voorraad niet 'klaar' zetten."""

    def gedrag(req):
        return httpx.Response(200, json=[{"id": "1", "updated_at": "2026-01-01T00:00:00Z", "n": 1}])

    async def run():
        r, _ = _repo(gedrag, monkeypatch)
        eerste, _ = await r.fetch_all("opportunities")
        eerste[0]["n"] = 999
        eerste[0]["engine_version"] = "ns-engine-1.1"
        tweede, _ = await r.fetch_all("opportunities")
        await r.aclose()
        return tweede

    tweede = asyncio.run(run())
    assert tweede[0]["n"] == 1 and "engine_version" not in tweede[0]


def test_fetch_all_communications_cursor_op_created_at_en_periodiek_vol(monkeypatch):
    import northsea_mcp.leescache as lc
    gezien = []

    def gedrag(req):
        q = _qs(req)
        gezien.append(q)
        return httpx.Response(200, json=[{"id": "c1", "created_at": "2026-11-13T08:00:00Z"}])

    klok = [1000.0]
    monkeypatch.setattr(lc.time, "monotonic", lambda: klok[0])

    async def run():
        r, _ = _repo(gedrag, monkeypatch)
        await r.fetch_all("communications")
        await r.fetch_all("communications")
        klok[0] += 31 * 60
        await r.fetch_all("communications")
        await r.aclose()

    asyncio.run(run())
    assert gezien[0]["order"] == "created_at.asc,id.asc" and "updated_at" not in gezien[0]["select"].split(",")
    assert gezien[1]["created_at"].startswith("gte.2026-11-13T08:00:00")
    assert "created_at" not in gezien[2]  # na 30 minuten weer een volle lading


def test_tabelvoorraad_op_schijf_overleeft_herstart(tmp_path):
    v = TabelVoorraad(tmp_path)
    v.merge("opportunities", [{"id": "1", "updated_at": "2026-01-01T00:00:00Z"}], "updated_at",
            truncated=False, vol=True)
    w = TabelVoorraad(tmp_path)
    assert w.heeft_volle_lading("opportunities")
    assert w.cursor("opportunities") == "2026-01-01T00:00:00Z"
    assert w.rijen("opportunities")[0]["id"] == "1"


def test_snapshot_ttl_hergebruikt_zonder_fetch(monkeypatch):
    nu = [100.0]
    monkeypatch.setattr("northsea_mcp.readlayer.time.monotonic", lambda: nu[0])

    class Repo:
        n = 0

        async def fetch_all(self, naam, max_rows=5000):
            Repo.n += 1
            return [], False

    async def run():
        i = InspectService(Repo(), cache_s=600)
        await i.snapshot()
        eerste = Repo.n
        await i.snapshot()
        zelfde = Repo.n
        nu[0] = 100.0 + 600 + 1
        await i.snapshot()
        return eerste, zelfde, Repo.n

    eerste, zelfde, na = asyncio.run(run())
    assert eerste > 20 and zelfde == eerste and na == eerste * 2


async def test_system_health_doet_geen_verse_snapshot():
    class Repo:
        calls: list = []

        async def ping(self):
            Repo.calls.append("ping")
            return True

        async def fetch_all(self, naam, max_rows=5000):
            Repo.calls.append(naam)
            return [{"id": "p", "auto_investigate_blockers": True}] if naam == "deal_automation_policy" else [], False

    Repo.calls = []
    inspect = InspectService(Repo())
    rt = ReadTools(inspect)
    data = await rt.system_health(LEZER)
    assert Repo.calls == ["ping"]
    assert data["database"]["reachable"] is True and data["database"]["snapshot_cached"] is False
    assert data["mcp_version"]
    await inspect.snapshot()
    n = len(Repo.calls)
    data2 = await rt.system_health(LEZER)
    assert Repo.calls[n:] == ["ping"]
    assert data2["database"]["snapshot_cached"] is True
    assert data2["research"]["governed_research_gate"]["policy_auto_investigate_blockers"] is True


def test_backoff_na_503_slaat_volgende_scan_over(monkeypatch):
    hits = []

    def gedrag(req):
        hits.append(str(req.url))
        return httpx.Response(503, json={"code": "PGRST002", "message": "Could not query the database for the schema cache"})

    async def run():
        r, _ = _repo(gedrag, monkeypatch)
        with pytest.raises(RepositoryError, match="PGRST002"):
            await r.fetch_all("opportunities")
        n = len(hits)
        with pytest.raises(RepositoryError, match="backing off"):
            await r.fetch_all("opportunities")
        # ping mag wél prikken: zo merken we herstel.
        with pytest.raises(RepositoryError, match="PGRST002"):
            await r.ping()
        await r.aclose()
        return n

    n = asyncio.run(run())
    assert n == 1
    assert len(hits) == 2  # één fetch, één ping; geen tweede fetch_all


def test_backoff_na_521(monkeypatch):
    def gedrag(req):
        return httpx.Response(521, text="error code: 521")

    async def run():
        r, _ = _repo(gedrag, monkeypatch)
        with pytest.raises(RepositoryError, match=r"\(521\)"):
            await r._get("opportunities", {"select": "id"})
        with pytest.raises(RepositoryError, match="backing off"):
            await r._get("opportunities", {"select": "id"})
        await r.aclose()

    asyncio.run(run())


def test_engine_vuurt_hooguit_vier_tabellen_tegelijk():
    from northsea_mcp.engine import EngineService

    class Repo:
        bezig = piek = 0

        async def fetch_all(self, naam, max_rows=5000):
            Repo.bezig += 1
            Repo.piek = max(Repo.piek, Repo.bezig)
            await asyncio.sleep(0.001)
            Repo.bezig -= 1
            return [], False

    asyncio.run(EngineService(Repo())._load())
    assert GELIJKTIJDIG == 4 and Repo.piek == 4



def test_tabellen_zonder_updated_at_lezen_op_created_at():
    """14 nov: communications (select met een niet-bestaande updated_at) en
    deal_evidence (filter op updated_at) gaven 400 -> engine 502, 63x op rij."""
    for t in ("communications", "deal_evidence", "match_assessments", "verification_checks"):
        assert cursor_kolom(t, SNAPSHOT_SELECT[t]) == "created_at", t
    assert "updated_at" not in SNAPSHOT_SELECT["communications"].split(",")
