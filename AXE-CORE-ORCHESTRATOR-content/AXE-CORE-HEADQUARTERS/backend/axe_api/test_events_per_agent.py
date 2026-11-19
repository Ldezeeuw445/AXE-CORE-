"""Eén query voor de events van alle agents (19 nov 2026)."""
import agent_activiteit as aa


class Q:
    def __init__(self, db, rijen):
        self.db, self.rijen, self.filters, self.n = db, rijen, [], 1000

    def select(self, *_): return self
    def order(self, *_a, **_k): return self
    def limit(self, n): self.n = n; return self
    def in_(self, k, v): self.filters.append(lambda r: r.get(k) in v); return self
    def eq(self, k, v): self.filters.append(lambda r: r.get(k) == v); return self

    def execute(self):
        self.db.queries += 1
        rijen = [r for r in self.rijen if all(f(r) for f in self.filters)]
        return type("R", (), {"data": rijen[: self.n]})()


class DB:
    def __init__(self, rijen): self.rijen, self.queries = rijen, 0
    def table(self, _): return Q(self, self.rijen)


def test_een_query_voor_actieve_agents_en_stille_lang_onthouden():
    aa._STIL_CACHE.clear()
    rijen = [{"agent": "axe", "created_at": f"2026-11-19T10:0{i}:00Z"} for i in range(9, -1, -1)]
    rijen += [{"agent": "northsea", "created_at": "2026-11-19T09:00:00Z"}]
    db = DB(rijen)
    act = aa.Activiteit(lambda: db)
    uit = act.events_per_agent(["axe", "northsea", "stil"], 3)
    assert len(uit["axe"]) == 3 and uit["axe"][0]["created_at"].startswith("2026-11-19T10:09")
    assert len(uit["northsea"]) == 1 and uit["stil"] == []
    assert db.queries == 2  # één gezamenlijke + één voor de stille
    db.queries = 0
    act.events_per_agent(["axe", "northsea", "stil"], 3)
    assert db.queries == 1  # stille agent komt uit de cache
