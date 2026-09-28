"""De planner: wat hij uit een antwoord haalt, en wanneer hij een abonnement met rust laat."""
from datetime import datetime

import planner as p


class TestVoorstellen:
    def test_haalt_de_array_uit_praat_en_codeblokken(self):
        tekst = 'Hier is mijn plan:\n```json\n[{"titel": "Tests draaien", "doel": "vitest in axe-core", "risico": "lezen"}]\n```\nSucces!'
        uit = p.lees_voorstellen(tekst)
        assert uit[0]["titel"] == "Tests draaien" and uit[0]["risico"] == "lezen"

    def test_normaliseert_en_begrenst(self):
        tekst = '[' + ','.join(['{"title": "t%d", "goal": "g", "risk": "write", "priority": "urgent"}' % i for i in range(6)]) + ']'
        uit = p.lees_voorstellen(tekst)
        assert len(uit) == p.MAX_VOORSTELLEN
        assert uit[0]["risico"] == "schrijven" and uit[0]["prioriteit"] == "medium"

    def test_zonder_titel_of_doel_telt_niet_en_onzin_is_leeg(self):
        assert p.lees_voorstellen('[{"titel": "alleen titel"}]') == []
        assert p.lees_voorstellen("geen json") == []
        assert p.lees_voorstellen("[kapot") == []


class TestAbonnementenMetRust:
    nu = datetime(2026, 9, 14, 1, 0)

    def test_leest_de_tijd_uit_de_codex_limiet(self):
        tot = p.limiet_tot("ERROR: You've hit your usage limit ... or try again at 3:40 AM.", self.nu)
        assert tot == datetime(2026, 9, 14, 3, 40)

    def test_een_tijd_die_al_voorbij_is_is_morgen(self):
        tot = p.limiet_tot("usage limit, try again at 10:36 PM", datetime(2026, 9, 14, 23, 0))
        assert tot == datetime(2026, 9, 15, 22, 36)

    def test_geen_limiet_is_geen_koeling(self):
        assert p.limiet_tot("Incorrect API key provided", self.nu) is None

    def test_dagbudget_telt_per_abonnement_en_sleutels_hebben_er_geen(self):
        staat = {}
        for _ in range(p.DAGBUDGET):
            p.tel_gebruik(staat, "codex", "2026-09-14")
        assert p.budget_over(staat, "codex", "2026-09-14") == 0
        assert p.budget_over(staat, "claude", "2026-09-14") == p.DAGBUDGET
        assert p.budget_over(staat, "codex", "2026-09-15") == p.DAGBUDGET
        assert p.budget_over(staat, "sleutels", "2026-09-14") > 1000

    def test_koeling(self):
        staat = {"koeling": {"codex": datetime(2026, 9, 14, 3, 40).isoformat()}}
        assert p.koelt(staat, "codex", self.nu) is True
        assert p.koelt(staat, "codex", datetime(2026, 9, 14, 4, 0)) is False
        assert p.koelt(staat, "claude", self.nu) is False


class TestRonde:
    """Een ronde met nep-Supabase en nep-motor: wat wordt er weggeschreven en uitgevoerd."""

    def test_schrijftaak_wacht_leestaak_wordt_gedaan_en_status_nooit_queued(self, tmp_path, monkeypatch):
        monkeypatch.setattr(p, "STAAT_PAD", str(tmp_path / "planner.json"))
        ingevoegd, updates = [], []

        class Q:
            def __init__(self, tabel): self.tabel, self.rij, self.upd = tabel, None, None
            def select(self, *a, **k): return self
            def eq(self, *a, **k): return self
            def in_(self, *a, **k): return self
            def order(self, *a, **k): return self
            def limit(self, *a, **k): return self
            def insert(self, rij):
                self.rij = {**rij, "id": f"t{len(ingevoegd)}"}; ingevoegd.append((self.tabel, self.rij)); return self
            def update(self, velden): self.upd = velden; updates.append((self.tabel, velden)); return self
            def execute(self):
                class R: pass
                r = R()
                r.data = [self.rij] if self.rij else ([{"id": "x"}] if self.upd else [])
                return r

        class SB:
            def table(self, naam): return Q(naam)

        antwoorden = iter([
            '[{"titel": "Lees de logs", "doel": "kijk", "risico": "lezen"}, {"titel": "Fix bug", "doel": "pas aan", "risico": "schrijven"}]',
            "verslag: alles rustig",
        ] + ['[]'] * 10)
        runs = []

        def run_agent(repo, prompt, modus, timeout, motor):
            runs.append((repo, modus, motor))
            return {"status": "ok", "result": next(antwoorden)}

        monkeypatch.setattr("agent_runner.repo_status", lambda: {"axe-core": {"runnable": True}})
        pl = p.Planner(lambda: SB(), run_agent, lambda: {})
        pl._git = lambda: ""
        verslag = pl.ronde({"axe-core": "claude", "code-agent": "claude2", "axe-algo": "codex"})

        taken = [r for t, r in ingevoegd if t == "core_tasks"]
        assert all(t["status"] == "pending" for t in taken)
        assert {t["metadata"]["goedkeuring"] for t in taken} == {"niet_nodig", "nodig"}
        assert all(m == "plan" for _, m, _ in runs), "zonder goedkeuring nooit schrijven"
        assert any(t == "memory" for t, _ in ingevoegd), "de uitkomst van een leestaak gaat naar het geheugen"
        assert verslag["agents"]["axe-core"]["uitgevoerd"]["ok"] is True


class TestSchrijfRepo:
    def test_schrijftaak_valt_niet_terug_op_een_andere_repo(self, monkeypatch):
        monkeypatch.setattr("agent_runner.repo_status", lambda: {
            "axe-core": {"runnable": True}, "axon-memory": {"runnable": False}})
        pl = p.Planner(lambda: None, lambda *a: {}, lambda: {})
        assert pl._werkrepo("axon-memory", streng=True) is None
        assert pl._werkrepo("axon-memory") == "axe-core", "lezen mag wel elders"
        assert pl._werkrepo("axe-core", streng=True) == "axe-core"


class TestRepoEnApp:
    def test_repo_uit_de_titel_en_de_app_kolom(self):
        assert p.repo_uit_tekst("Privacy-link op homepage van axon-memory toevoegen") == "axon-memory"
        assert p.app_voor_repo("axon-memory") == "axon_memory"
        assert p.repo_uit_tekst("Testen voor UI-wijzigingen in axe-core uitbreiden") == "axe-core"

    def test_onbekend_of_twee_namen_is_geen_repo(self):
        assert p.repo_uit_tekst("Beveiligingslekken in cloudflare-migration-2 dichten") == "axe-companion"
        assert p.repo_uit_tekst("Landingspagina van Northsea Commodity") == "axe-core"
        assert p.app_voor_repo("axe-core", "maps-agent") == "northsea"
        assert p.app_voor_repo("axe-core", "code-agent", "Deal-kaart voor Northsea op de 3D-tab") == "northsea"
        assert p.repo_uit_tekst("Iets in een repo die niet bestaat") is None
        assert p.repo_uit_tekst("axe-core en axe-companion gelijktrekken") is None
        assert p.app_voor_repo(None) == "axe_core"

    def test_schrijftaak_zonder_repo_wordt_nooit_in_axe_core_uitgevoerd(self, monkeypatch):
        pln = p.Planner(lambda: None, lambda *a, **k: {"status": "ok"}, lambda: {})
        monkeypatch.setattr(pln, "_werkrepo", lambda *a, **k: "axe-core")
        monkeypatch.setattr(pln, "_claim", lambda _id: (_ for _ in ()).throw(AssertionError("mag niet claimen")))
        taak = {"id": "t1", "title": "Beveiligingslekken in een onbekende repo dichten", "goal": "dicht ze",
                "payload": {"repo": None}, "metadata": {"agent": "code-agent", "motor": "claude2", "risico": "schrijven"}}
        assert "noemt geen" in pln._voer_uit({}, taak)["overgeslagen"]


class TestPlannenOpSleutels:
    """Bedenken hoort op sleutels, uitvoeren op het abonnement van de agent.

    Gemeten 14 september: 29 abonnement-runs op een dag, claude op 10/10. Het
    bedenken is de goedkoopste van de drie runs per ronde en juist die ging op
    het abonnement dat Luka zelf nodig heeft.
    """

    def _planner(self, monkeypatch, gevraagd):
        pl = p.Planner(lambda: None, lambda *a, **k: {"status": "ok", "result": ""}, lambda: {})
        monkeypatch.setattr(pl, "_context", lambda agent: "context")
        monkeypatch.setattr(pl, "_open_taken", lambda agent: [])
        monkeypatch.setattr(pl, "_werkrepo", lambda r: "axe-core")
        monkeypatch.setattr(pl, "_maak_taak", lambda agent, motor, v: gevraagd.setdefault("taakmotoren", []).append(motor))
        monkeypatch.setattr(p, "lees_staat", lambda: {})
        monkeypatch.setattr(p, "schrijf_staat", lambda s: None)

        def nep_vraag(staat, motor, prompt, repo, modus="plan"):
            gevraagd.setdefault("plan", []).append(motor)
            return "[]", ""
        monkeypatch.setattr(pl, "_vraag", nep_vraag)
        return pl

    def test_het_bedenken_gaat_naar_de_sleutels(self, monkeypatch):
        gevraagd = {}
        monkeypatch.setattr(p, "PLAN_MOTOR", "sleutels")
        self._planner(monkeypatch, gevraagd).ronde()
        assert set(gevraagd["plan"]) == {"sleutels"}
        assert len(gevraagd["plan"]) == len(p.AGENTS)

    def test_op_agent_gezet_is_het_oude_gedrag(self, monkeypatch):
        gevraagd = {}
        monkeypatch.setattr(p, "PLAN_MOTOR", "agent")
        self._planner(monkeypatch, gevraagd).ronde({"axe-core": "claude2", "code-agent": "cursor",
                                                    "axe-algo": "claude", "maps-agent": "claude3"})
        assert set(gevraagd["plan"]) == {"claude2", "cursor", "claude", "claude3"}

    def test_de_taak_houdt_de_motor_van_de_agent(self, monkeypatch):
        # Anders leest _voer_uit "sleutels" uit de taak en slaat hij elke
        # schrijftaak over met "schrijven vraagt een CLI-motor".
        gevraagd = {}
        monkeypatch.setattr(p, "PLAN_MOTOR", "sleutels")
        pl = self._planner(monkeypatch, gevraagd)
        monkeypatch.setattr(p, "lees_voorstellen", lambda t: [{"titel": "t", "doel": "d", "risico": "lezen"}])
        pl.ronde({"axe-core": "claude2", "code-agent": "cursor", "axe-algo": "claude", "maps-agent": "claude3"})
        assert "sleutels" not in gevraagd["taakmotoren"]
        assert set(gevraagd["taakmotoren"]) == {"claude2", "cursor", "claude", "claude3"}

    def test_valt_terug_op_het_abonnement_als_de_sleutelroute_niets_geeft(self, monkeypatch):
        # De sleutelroute loopt over de VPS-proxy. Ligt die eruit, dan moet de
        # planner blijven werken -- anders ruil je kosten in voor een storing.
        gevraagd = {}
        monkeypatch.setattr(p, "PLAN_MOTOR", "sleutels")
        pl = self._planner(monkeypatch, gevraagd)

        def stukke_sleutels(staat, motor, prompt, repo, modus="plan"):
            gevraagd.setdefault("plan", []).append(motor)
            if motor == "sleutels":
                return None, "sleutels: proxy 502"
            return '[{"titel": "t", "doel": "d", "risico": "lezen"}]', ""
        monkeypatch.setattr(pl, "_vraag", stukke_sleutels)
        verslag = pl.ronde({"axe-core": "claude2", "code-agent": "cursor",
                            "axe-algo": "claude", "maps-agent": "claude3"})
        assert gevraagd["plan"][:2] == ["sleutels", "claude2"], "eerst sleutels, dan het abonnement"
        assert verslag["agents"]["axe-core"]["plan_terugval"]["naar"] == "claude2"

    def test_een_lege_lijst_is_een_antwoord_en_geen_reden_om_terug_te_vallen(self):
        assert p.is_planantwoord("[]")
        assert p.is_planantwoord('Hier: [{"titel": "t"}]')
        assert not p.is_planantwoord(None)
        assert not p.is_planantwoord("sorry, geen idee")
        assert not p.is_planantwoord("[kapot")
