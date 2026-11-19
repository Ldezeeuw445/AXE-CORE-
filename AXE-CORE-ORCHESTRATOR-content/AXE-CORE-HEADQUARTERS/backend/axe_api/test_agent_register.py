"""Eén agent-register: core_agents = wat de lus draait (19 nov 2026, punt 5)."""
import agent_register as ar
from agent_workspace import AGENT_WORKSPACES


class Q:
    def __init__(self, db, naam):
        self.db, self.naam, self.f, self.actie, self.waarde = db, naam, [], "select", None

    def select(self, *_): return self
    def eq(self, k, v): self.f.append((k, v)); return self
    def upsert(self, rijen, on_conflict=None): self.actie, self.waarde = "upsert", rijen; return self
    def update(self, w): self.actie, self.waarde = "update", w; return self
    def delete(self): self.actie = "delete"; return self

    def execute(self):
        tabel = self.db.tabellen.setdefault(self.naam, [])
        raak = [r for r in tabel if all(r.get(k) == v for k, v in self.f)]
        if self.actie == "upsert":
            for nieuw in self.waarde:
                oud = next((r for r in tabel if r["name"] == nieuw["name"]), None)
                oud.update(nieuw) if oud else tabel.append(dict(nieuw))
        elif self.actie == "update":
            for r in raak:
                r.update(self.waarde)
        elif self.actie == "delete":
            self.db.tabellen[self.naam] = [r for r in tabel if r not in raak]
        return type("R", (), {"data": raak})()


class DB:
    def __init__(self, **tabellen): self.tabellen = tabellen
    def table(self, naam): return Q(self, naam)


OUD = [
    {"name": "axe_core", "status": "active", "metadata": {}, "model_name": "anthropic/claude-3.5-sonnet"},
    {"name": "poc34142-agent", "status": "active", "metadata": {}},
    {"name": "eve", "status": "active", "metadata": {"icon": "x"}},
]


def test_register_is_precies_wat_de_lus_laadt():
    r = {x["name"]: x for x in ar.rijen()}
    assert set(r) == set(AGENT_WORKSPACES)
    assert "northseamgr" in r and "axemanager" in r
    assert r["northseamgr"]["toolset"] == list(AGENT_WORKSPACES["northseamgr"]["tools"])
    assert "northsea_read" in r["northseamgr"]["toolset"]
    assert r["axe"]["memory_namespace"] == "global" and r["developer"]["memory_namespace"] == "axe_code"
    assert r["axemanager"]["model_name"] and r["axemanager"]["status"] == "active"


def test_sync_testrij_weg_oude_rijen_retired_managers_erin():
    db = DB(core_agents=[dict(x) for x in OUD], core_capabilities=[{"preferred_agent": "axe_intel"}])
    uit = ar.sync(db)
    namen = {r["name"]: r for r in db.tabellen["core_agents"]}
    assert "poc34142-agent" not in namen and uit["weg"] == ["poc34142-agent"]
    assert namen["axe_core"]["status"] == "retired"
    assert namen["axe_core"]["metadata"]["vervangen_door"] == "axe"
    assert namen["eve"]["metadata"] == {"icon": "x", "vervangen_door": None, "retired_door": "agent_register"}
    assert namen["northseamgr"]["status"] == "active"
    assert db.tabellen["core_capabilities"][0]["preferred_agent"] == "intel"
    # Daarna is er geen drift meer, en een tweede sync verandert niets.
    assert ar.verschillen(db.tabellen["core_agents"], ar.rijen()) == []
    ar.sync(db)
    assert len(db.tabellen["core_agents"]) == len(AGENT_WORKSPACES) + 2


def test_drift_wordt_gezien():
    db = DB(core_agents=[dict(x) for x in OUD], core_capabilities=[])
    ar.sync(db)
    rij = next(r for r in db.tabellen["core_agents"] if r["name"] == "tradingos")
    rij["toolset"] = ["run_shell"]
    db.tabellen["core_agents"].append({"name": "spook", "status": "active"})
    d = ar.verschillen(db.tabellen["core_agents"], ar.rijen())
    assert any(x.startswith("tradingos.toolset") for x in d)
    assert any(x.startswith("spook:") for x in d)


def test_lees_geeft_actieve_rijen_in_rooster_volgorde_en_valt_terug():
    db = DB(core_agents=[dict(x) for x in OUD], core_capabilities=[])
    ar.sync(db)
    uit = ar.lees(db)
    assert uit["bron"] == "core_agents" and uit["drift"] == []
    assert [r["name"] for r in uit["agents"]] == list(AGENT_WORKSPACES)

    class Kapot:
        def table(self, _): raise RuntimeError("down")
    terug = ar.lees(Kapot())
    assert terug["bron"] == "lus (terugval)" and len(terug["agents"]) == len(AGENT_WORKSPACES)
