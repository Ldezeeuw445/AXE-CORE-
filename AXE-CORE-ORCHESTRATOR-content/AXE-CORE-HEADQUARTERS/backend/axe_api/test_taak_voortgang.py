"""Live voortgang in het managergesprek (19 nov 2026)."""
import taak_voortgang as tv

TAAK = {"id": "t1", "title": "Fix de login", "status": "running", "result": None, "error": None,
        "metadata": {"chat_manager": "axemanager"}}


class Q:
    def __init__(self, db, naam):
        self.db, self.naam, self.f, self.n, self.rij = db, naam, [], 1000, None

    def select(self, *_): return self
    def order(self, *_a, **_k): return self
    def limit(self, n): self.n = n; return self
    def gt(self, k, v): self.f.append(lambda r: r.get(k) > v); return self
    def in_(self, k, v): self.f.append(lambda r: r.get(k) in v); return self
    def insert(self, rij): self.rij = rij; return self

    def execute(self):
        if self.rij is not None:
            self.db.geschreven.append(self.rij)
            return type("R", (), {"data": [self.rij]})()
        bron = self.db.events if self.naam == "core_task_events" else self.db.taken
        return type("R", (), {"data": [r for r in bron if all(f(r) for f in self.f)][: self.n]})()


class DB:
    def __init__(self, events, taken):
        self.events, self.taken, self.geschreven = events, taken, []

    def table(self, naam): return Q(self, naam)


def ev(seq, soort, msg="", data=None, task="t1"):
    return {"sequence": seq, "task_id": task, "event_type": soort, "message": msg, "data": data or {}}


def test_een_status_taal():
    assert tv.status("done") == "completed" and tv.status("error") == "failed"
    assert tv.status("queued") == "planning" and tv.status("verifying") == "verifying"


def test_stappen_in_mensentaal():
    assert tv._stap("Step 3: $ npx vitest run") == "Tests draaien."
    assert tv._stap("Step 1: $ ls -R") == "Bestanden lezen."
    assert tv._stap("developer workspace ready.") is None


def test_chat_taak_komt_in_het_gesprek_andere_niet():
    andere = {**TAAK, "id": "t2", "metadata": {}}
    db = DB([ev(10, "task.claimed", data={"attempt": 1}), ev(11, "task.deferred", task="t1"),
             ev(12, "axe.progress", "Step 1: $ cat a.py"), ev(13, "task.claimed", task="t2"),
             ev(14, "task.verifying"), ev(15, "approval.requested", "git push naar branch")],
            [TAAK, andere])
    cursor = tv.ronde(db, 9, tv.Verteller(klok=lambda: 0.0), set())
    assert cursor == 15
    teksten = [r["body"] for r in db.geschreven]
    assert teksten == [
        "Ik ben begonnen aan “Fix de login”.",
        "Bestanden lezen.",
        "Ik controleer of het echt werkt.",
        "Ik wacht op je ok: git push naar branch. Zeg “ok” of “nee” hier.",
    ]
    assert all(r["from_agent"] == "axemanager" and r["to_agent"] == "luka" and r["kind"] == "report"
               for r in db.geschreven)
    # Tussenstappen staan op gelezen; wachten op jou telt als nieuw.
    assert "read_at" in db.geschreven[1] and "read_at" not in db.geschreven[3]


def test_tussenstappen_worden_gedoseerd_eindstand_altijd():
    nu = [0.0]
    v = tv.Verteller(klok=lambda: nu[0])
    assert v.mag("t1", "Bestanden lezen.", True)
    assert not v.mag("t1", "Tests draaien.", True)        # te snel na de vorige
    nu[0] = 50
    assert v.mag("t1", "Tests draaien.", True)
    assert v.mag("t1", "Klaar met “x”.", False)            # eindstand nooit tegengehouden
    assert not v.mag("t1", "Klaar met “x”.", False)        # wel nooit twee keer hetzelfde


def test_klaar_en_mislukt():
    klaar = tv.regel(ev(1, "task.completed"), {**TAAK, "result": {"summary": "PR #12 staat klaar"}})
    assert klaar == ("Klaar met “Fix de login”. PR #12 staat klaar", True, False)
    mis = tv.regel(ev(2, "task.failed"), {**TAAK, "error": {"message": "tests rood"}})
    assert mis == ("“Fix de login” lukte niet: tests rood", True, False)
    assert tv.regel(ev(3, "task.claimed", data={"attempt": 2}), TAAK) is None
