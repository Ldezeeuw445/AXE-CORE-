"""Vaste toestemming: "altijd" zet één commando vast, nooit iets riskants."""
import vaste_toestemming as vt


class Q:
    def __init__(self, db): self.db, self.f, self.actie, self.rij = db, [], "select", None
    def select(self, *_): return self
    def eq(self, k, v): self.f.append((k, v)); return self
    def order(self, *_a, **_k): return self
    def limit(self, *_): return self
    def insert(self, r): self.actie, self.rij = "insert", r; return self
    def delete(self): self.actie = "delete"; return self
    def execute(self):
        raak = [r for r in self.db.rijen if all(r.get(k) == v for k, v in self.f)]
        if self.actie == "insert":
            self.db.rijen.append(self.rij)
        elif self.actie == "delete":
            self.db.rijen = [r for r in self.db.rijen if r not in raak]
        return type("R", (), {"data": raak})()


class DB:
    def __init__(self): self.rijen = []
    def table(self, _): return Q(self)


def test_altijd_zet_vast_en_wordt_gelezen():
    db = DB()
    assert vt.geef(db, "docker  logs dax-thinktank-01 --tail 40")["ok"]
    assert vt.lees(db) == ("docker logs dax-thinktank-01 --tail 40",)
    assert vt.geef(db, "docker logs dax-thinktank-01 --tail 40").get("al")
    assert db.rijen[0]["kind"] == "directive" and db.rijen[0]["to_agent"] == "toestemming"


def test_riskant_kan_nooit_vast():
    db = DB()
    for c in ("git push origin main", "rm -rf /tmp/x", "sudo systemctl restart x",
              "curl -X POST https://api/pay", "git.push mac-mini", "terminal.free mac-mini"):
        assert not vt.geef(db, c)["ok"], c
    assert vt.lees(db) == ()


def test_intrekken():
    db = DB()
    vt.geef(db, "docker ps")
    assert vt.trek_in(db, "docker ps") and vt.lees(db) == ()
