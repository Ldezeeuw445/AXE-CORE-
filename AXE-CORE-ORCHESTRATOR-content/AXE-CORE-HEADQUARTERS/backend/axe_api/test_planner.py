"""De planner: wat hij uit een antwoord haalt, en wanneer hij een abonnement met rust laat."""
from datetime import datetime, timezone

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


class TestPlannerPass:
    def test_niets_gevraagd_en_niets_stuk_schrijft_nul_taken(self):
        assert p.planner_pass([], []) == []
        assert p.planner_pass(
            [{"id": "l1", "title": "Buy milk", "status": "queued", "requested_by": "luka"}],
            [{"name": "Ochtendrapport", "last_status": "ok"}],
        ) == []

    def test_een_gefaalde_cron_geeft_precies_een_eigen_taak(self):
        uit = p.planner_pass([], [{
            "id": "axe_core:digest",
            "naam": "Nightly digest",
            "last_status": "fail",
            "soort": "cron",
        }])
        assert len(uit) == 1
        assert uit[0]["oorsprong"] == "storing"
        assert uit[0]["bron_id"] == "axe_core:digest"
        assert uit[0]["titel"].startswith("Fix:")
        assert "Nightly digest" in uit[0]["doel"]

    def test_verzonnen_pending_gaat_dicht_luka_blijft(self):
        ids = p.ids_verzonnen_te_sluiten([
            {"id": "a", "status": "pending", "requested_by": "planner", "capability": "planner",
             "metadata": {"planner": True}},
            {"id": "b", "status": "pending", "requested_by": "luka", "capability": "task_manage"},
            {"id": "c", "status": "pending", "requested_by": "planner",
             "metadata": {"oorsprong": "storing"}},
            {"id": "d", "status": "completed", "requested_by": "planner", "metadata": {"planner": True}},
        ])
        assert ids == ["a"]


class TestRonde:
    """Een ronde schrijft alleen echte storingen of een vervolg, nooit een verzinsel."""

    def _sb(self, ingevoegd):
        class Q:
            def __init__(self, tabel): self.tabel, self.rij, self.upd = tabel, None, None
            def select(self, *a, **k): return self
            def eq(self, *a, **k): return self
            def in_(self, *a, **k): return self
            def order(self, *a, **k): return self
            def limit(self, *a, **k): return self
            def insert(self, rij):
                self.rij = {**rij, "id": f"t{len(ingevoegd)}"}; ingevoegd.append((self.tabel, self.rij)); return self
            def update(self, velden): self.upd = velden; return self
            def execute(self):
                class R: pass
                r = R()
                r.data = [self.rij] if self.rij else []
                return r

        class SB:
            def table(self, naam): return Q(naam)
        return SB

    def test_ronde_zonder_storing_en_zonder_vraag_maakt_niets(self, tmp_path, monkeypatch):
        monkeypatch.setattr(p, "STAAT_PAD", str(tmp_path / "planner.json"))
        ingevoegd = []
        vragen = []
        pl = p.Planner(lambda: self._sb(ingevoegd)(), lambda *a, **k: {"status": "ok", "result": "[]"}, lambda: {})
        monkeypatch.setattr(pl, "_vraag", lambda *a, **k: vragen.append(a) or ("[]", ""))
        monkeypatch.setattr(pl, "_luka_werk", lambda: [])
        monkeypatch.setattr(pl, "_echte_storingen", lambda: [])
        monkeypatch.setattr(pl, "_open_echte_bronnen", lambda: set())
        monkeypatch.setattr(pl, "_sluit_verzonnen_eenmaal", lambda staat: 0)
        monkeypatch.setattr(pl, "_open_taken", lambda agent: [])
        verslag = pl.ronde()
        assert verslag["aantal"] == 0
        assert [r for t, r in ingevoegd if t == "core_tasks"] == []
        assert vragen == []

    def test_ronde_met_een_gefaalde_cron_maakt_precies_een_taak(self, tmp_path, monkeypatch):
        monkeypatch.setattr(p, "STAAT_PAD", str(tmp_path / "planner.json"))
        ingevoegd = []
        pl = p.Planner(lambda: self._sb(ingevoegd)(), lambda *a, **k: {"status": "ok"}, lambda: {})
        monkeypatch.setattr(pl, "_vraag", lambda *a, **k: (_ for _ in ()).throw(AssertionError("niet verzinnen")))
        monkeypatch.setattr(pl, "_luka_werk", lambda: [])
        monkeypatch.setattr(pl, "_echte_storingen", lambda: [{
            "id": "axe_core:digest", "naam": "Nightly digest", "last_status": "fail", "soort": "cron",
        }])
        monkeypatch.setattr(pl, "_open_echte_bronnen", lambda: set())
        monkeypatch.setattr(pl, "_sluit_verzonnen_eenmaal", lambda staat: 0)
        monkeypatch.setattr(pl, "_open_taken", lambda agent: [])
        verslag = pl.ronde()
        taken = [r for t, r in ingevoegd if t == "core_tasks"]
        assert verslag["aantal"] == 1
        assert len(taken) == 1
        assert taken[0]["metadata"]["oorsprong"] == "storing"
        assert taken[0]["requested_by"] == "planner"
        assert taken[0]["title"].startswith("Fix:")


class TestSchrijfRepo:
    def test_open_taken_leest_alle_velden_die_de_uitvoerder_nodig_heeft(self):
        gekozen = []

        class Q:
            def select(self, velden): gekozen.append(velden); return self
            def eq(self, *a): return self
            def in_(self, *a): return self
            def order(self, *a, **k): return self
            def limit(self, *a): return self
            def execute(self):
                return type("R", (), {"data": []})()

        class SB:
            def table(self, naam):
                assert naam == "core_tasks"
                return Q()

        pln = p.Planner(lambda: SB(), lambda *a: {}, lambda: {})
        assert pln._open_taken("code-agent") == []
        for veld in ("goal", "assignee", "payload", "execution_mode"):
            assert veld in gekozen[0]

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


class TestGoedkeuringBinnenPlan:
    def test_taak_binnen_plan_vraagt_niet_versturen_wel(self):
        assert p.goedkeuring_voor_taak("Fix AXE Core build", "repair the stamp") == "niet_nodig"
        assert p.goedkeuring_voor_taak("Keep the NorthSea desk running") == "niet_nodig"
        assert p.goedkeuring_voor_taak("Analyse EURUSD on demo") == "niet_nodig"
        assert not p.verlaat_app_plan("Send the qualification email to the seller", "northsea")
        assert p.goedkeuring_voor_taak("Send the qualification email to the seller", app="northsea") == "niet_nodig"
        assert not p.verlaat_app_plan("Send a non-binding reply to the buyer", "northsea")
        assert p.verlaat_app_plan("Send the offer to the buyer", "northsea")
        assert p.goedkeuring_voor_taak("Send the offer to the buyer", app="northsea") == "nodig"
        assert p.verlaat_app_plan("Send the offer to the buyer")
        assert p.goedkeuring_voor_taak("Send the offer to the buyer") == "nodig"
        assert p.goedkeuring_voor_taak("Market data check (trading)") == "niet_nodig"
        assert p.goedkeuring_voor_taak("Orchestrator health check") == "niet_nodig"
        assert p.goedkeuring_voor_taak("Idea scan: run dax") == "niet_nodig"


class TestPlannenOpSleutels:
    def test_een_lege_lijst_is_een_antwoord_en_geen_reden_om_terug_te_vallen(self):
        assert p.is_planantwoord("[]")
        assert p.is_planantwoord('Hier: [{"titel": "t"}]')
        assert not p.is_planantwoord(None)
        assert not p.is_planantwoord("sorry, geen idee")
        assert not p.is_planantwoord("[kapot")

    def test_rondes_zonder_werk_roepen_geen_model(self, tmp_path, monkeypatch):
        monkeypatch.setattr(p, "STAAT_PAD", str(tmp_path / "planner.json"))
        pl = p.Planner(lambda: None, lambda *a, **k: {"status": "ok"}, lambda: {})
        monkeypatch.setattr(pl, "_vraag", lambda *a, **k: (_ for _ in ()).throw(AssertionError("niet verzinnen")))
        monkeypatch.setattr(pl, "_luka_werk", lambda: [])
        monkeypatch.setattr(pl, "_echte_storingen", lambda: [])
        monkeypatch.setattr(pl, "_open_echte_bronnen", lambda: set())
        monkeypatch.setattr(pl, "_sluit_verzonnen_eenmaal", lambda staat: 0)
        monkeypatch.setattr(pl, "_open_taken", lambda agent: [])
        monkeypatch.setattr(pl, "_maak_taak", lambda *a, **k: (_ for _ in ()).throw(AssertionError("geen taak")))
        verslag = pl.ronde()
        assert verslag["aantal"] == 0


# ── 11 oktober: nooit meer een verslag zonder repo, nooit een kapot account als taak ──

ALLES_INGELOGD = {m: {"aanwezig": True, "ingelogd": True, "label": m, "login": f"{m} login"}
                  for m in p.ABONNEMENTEN}
MOTOREN_11OKT = {"axe-core": "claude", "code-agent": "sleutels", "axe-algo": "sleutels", "maps-agent": "sleutels"}
NU = datetime(2026, 10, 11, 12, 0)


class TestAccountfout:
    def test_herkent_login_en_factuur_maar_niet_een_gewone_fout(self):
        assert p.account_fout("Failed to authenticate: OAuth session expired and could not be refreshed") == "login verlopen"
        assert p.account_fout("ActionRequiredError: You have an unpaid invoice").startswith("betaling")
        assert p.account_fout("OAuth authentication is currently not allowed for this organization") == "door de organisatie geblokkeerd"
        assert p.account_fout("TypeError: x is undefined") is None
        assert p.account_fout(None) is None

    def test_astra_is_model_fout_geen_account(self):
        tekst = "The 'gpt-6-astra' model requires a newer version of the Codex CLI"
        assert p.account_fout(tekst) is None
        assert p.model_fout(tekst) == "model not supported on this CLI"
        assert p.wissel_motor(tekst)

    def test_chatgpt_account_dat_het_model_weigert_is_model_fout(self):
        tekst = ('ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":'
                 '"The \'gpt-5-codex\' model is not supported when using Codex with a ChatGPT account.",'
                 '"code":"model_not_found"}}')
        assert p.account_fout(tekst) is None
        assert p.model_fout(tekst) == "model not supported on this CLI"


class TestKiesMotor:
    def test_een_al_geprobeerde_stoel_wordt_overgeslagen(self):
        engines = {m: {"aanwezig": True, "ingelogd": True} for m in p.ABONNEMENTEN}
        motor, _ = p.kies_motor({}, "code-agent", "cursor", {}, engines, datetime(2026, 10, 28, 9, 0, tzinfo=timezone.utc),
                                uitsluiten={"cursor"})
        assert motor not in (None, "cursor")

    def test_sleutels_voert_nooit_uit_maar_een_vrij_abonnement_wel(self):
        motor, afgevallen = p.kies_motor({}, "code-agent", "sleutels", MOTOREN_11OKT, ALLES_INGELOGD, NU)
        assert motor in p.ABONNEMENTEN and motor != "claude"  # claude hoort bij AXE Core
        assert "sleutels" in afgevallen

    def test_eerst_hetzelfde_merk_bij_een_kapot_account(self):
        staat = {"account_kapot": {"claude": {"reden": "login verlopen", "tot": "2026-10-11T18:00:00"}}}
        motor, afgevallen = p.kies_motor(staat, "axe-core", "claude", MOTOREN_11OKT, ALLES_INGELOGD, NU)
        assert motor == "claude2" and afgevallen == {"claude": "login verlopen"}

    def test_kapot_account_krijgt_na_de_rust_weer_een_kans(self):
        staat = {"account_kapot": {"claude": {"reden": "login verlopen", "tot": "2026-10-11T11:00:00"}}}
        assert p.kies_motor(staat, "axe-core", "claude", MOTOREN_11OKT, ALLES_INGELOGD, NU)[0] == "claude"

    def test_axe_algo_valt_nooit_terug_op_een_abonnement(self):
        motor, afgevallen = p.kies_motor({}, "axe-algo", "sleutels", MOTOREN_11OKT, ALLES_INGELOGD, NU)
        assert motor is None and list(afgevallen) == ["sleutels"]

    def test_niet_ingelogd_en_een_abonnement_van_een_ander_vallen_af(self):
        engines = {**ALLES_INGELOGD, "cursor": {"aanwezig": True, "ingelogd": False}}
        motoren = {"axe-core": "claude", "code-agent": "cursor", "axe-algo": "codex", "maps-agent": "claude2"}
        motor, afgevallen = p.kies_motor({}, "code-agent", "cursor", motoren, engines, NU)
        assert afgevallen["cursor"] == "niet ingelogd"
        assert motor not in ("claude", "codex", "claude2")


class TestGeenVervolgOpAccountOfBouwlus:
    def test_gefaalde_bouwtaak_en_accountfout_geven_geen_continue(self):
        uit = p.planner_pass([
            {"id": "b", "title": "Build next step: AXE Companion", "status": "failed", "requested_by": "luka",
             "metadata": {"oorsprong_bouw": "ja"}},
            {"id": "c", "title": "Check deals", "status": "failed", "requested_by": "luka",
             "error": {"message": "Failed to authenticate: OAuth session expired"}},
            {"id": "d", "title": "DEAL-002", "status": "blocked", "requested_by": "luka"},
            {"id": "e", "title": "DEAL-002", "status": "blocked", "requested_by": "luka"},
        ], [])
        assert [v["titel"] for v in uit] == ["Continue: DEAL-002"]


class TestVoerUitEerlijk:
    def _pl(self, monkeypatch, run):
        sb_rijen = []

        class Q:
            def __init__(s, t): s.t = t
            def __getattr__(s, naam): return lambda *a, **k: s
            def update(s, v): sb_rijen.append((s.t, "update", v)); return s
            def insert(s, v): sb_rijen.append((s.t, "insert", v)); return s
            def execute(s):
                class R: data = [{"id": "x"}]
                return R()

        class SB:
            def table(s, t): return Q(t)
        pl = p.Planner(lambda: SB(), run, lambda: {})
        monkeypatch.setattr(pl, "_werkrepo", lambda gevraagd, streng=False: "axe-core")
        return pl, sb_rijen

    def test_accountfout_springt_door_naar_het_volgende_account_en_meldt_een_keer(self, monkeypatch):
        gedraaid = []

        def run(repo, prompt, modus, t, motor):
            gedraaid.append(motor)
            if motor == "claude":
                return {"status": "error", "error": "Failed to authenticate: OAuth session expired and could not be refreshed"}
            return {"status": "ok", "result": "Echt verslag"}
        pl, rijen = self._pl(monkeypatch, run)
        staat = {}
        taak = {"id": "t1", "title": "Fix: X", "goal": "kijk", "metadata": {"agent": "axe-core", "motor": "claude", "risico": "lezen"}}
        uit = pl._voer_uit(staat, taak, MOTOREN_11OKT, ALLES_INGELOGD)
        assert uit["ok"] and gedraaid == ["claude", "claude2"]
        assert staat["account_kapot"]["claude"]["reden"] == "login verlopen"
        assert len(pl._meld_accounts(staat, ALLES_INGELOGD)) == 1
        assert pl._meld_accounts(staat, ALLES_INGELOGD) == []  # niet elke ronde opnieuw

    def test_zonder_bruikbare_motor_geblokkeerd_zonder_run(self, monkeypatch):
        pl, rijen = self._pl(monkeypatch, lambda *a: (_ for _ in ()).throw(AssertionError("geen run")))
        taak = {"id": "t2", "title": "Kijk", "goal": "g", "metadata": {"agent": "axe-algo", "motor": "sleutels", "risico": "lezen"}}
        uit = pl._voer_uit({}, taak, MOTOREN_11OKT, ALLES_INGELOGD)
        assert "sleutels" in uit["geblokkeerd"]
        assert any(t == "core_tasks" and v.get("metadata", {}).get("uiStatus") == "blocked" for t, _, v in rijen)

    def test_schrijftaak_zonder_diff_heet_geen_wijziging(self, monkeypatch):
        pl, rijen = self._pl(monkeypatch, lambda *a, **k: {"status": "ok", "result": "Ik heb alles gebouwd!"})
        monkeypatch.setattr(pl, "_bewijs", lambda repo: {"repo": repo, "leesbaar": True, "veranderd": False, "diffstat": ""})
        taak = {"id": "t3", "title": "Build", "goal": "g", "payload": {"repo": "axe-core"},
                "metadata": {"agent": "code-agent", "motor": "cursor", "risico": "schrijven"}}
        pl._voer_uit({}, taak, MOTOREN_11OKT, ALLES_INGELOGD)
        klaar = [v for t, s, v in rijen if t == "core_tasks" and v.get("status") == "completed"][0]
        assert klaar["metadata"]["geen_wijziging"] is True
        assert klaar["result"]["output"].startswith("[No changes in the repo")


class TestHandoffAndereManager:
    """axe-trading-core blijft van `trading`. Trading OS bouwt de Mac mini-lus zelf."""

    def test_herkent_repo_en_titel(self):
        assert p.is_bouw_next_step({"title": "Build next step: Trading OS", "metadata": {}})
        assert p.is_bouw_next_step({"title": "Iets anders", "metadata": {"oorsprong_bouw": "ja"}})
        assert not p.is_bouw_next_step({"title": "Read the Trading OS README", "metadata": {}})
        assert p.andere_manager_voor("trading-os") is None
        assert p.andere_manager_voor("trading-os-app") is None
        assert p.andere_manager_voor("axe-trading-core") == "trading"
        assert p.andere_manager_voor(None, "Build next step: Trading OS") is None
        assert p.andere_manager_voor(None, "Build next step: axe-trading-core") == "trading"
        assert p.andere_manager_voor("axe-core", "Build next step: AXE Core") is None
        assert p.REPO_ALIAS["trading-os-app"] == "trading-os"

    def test_bouw_trading_os_draait_op_een_cli_stoel_met_de_bouwljist_taak(self, monkeypatch):
        """Niet Grok Bot, niet AXE CORE: Luka's CLI, eerste open item uit BOUWLIJST.md."""
        gedraaid = []

        def run(repo, prompt, modus, t, motor, **kw):
            gedraaid.append((repo, prompt, motor, modus))
            return {"status": "ok", "result": "T1: chart drawings, tests green"}

        pl, rijen = TestVoerUitEerlijk()._pl(monkeypatch, run)
        monkeypatch.setattr(pl, "_werkrepo", lambda *a, **k: "trading-os")
        monkeypatch.setattr(pl, "_canon", lambda repo: {"actie": "geen"})
        monkeypatch.setattr(pl, "_ververs", lambda repo: {
            "actie": "gemerged", "basis": "origin/snapshot-2026-10-17", "achter": 2,
        })
        monkeypatch.setattr(pl, "_bouwljist", lambda repo: {
            "ok": True,
            "regels": "Never deploy. Never apply migrations. Never place live orders. Never touch main.",
            "volgende": {"id": "T1", "titel": "persist chart drawings per user", "done": False},
        })
        monkeypatch.setattr(pl, "_bewijs", lambda repo: {
            "repo": repo, "leesbaar": True, "veranderd": False, "diffstat": "",
        })
        taak = {
            "id": "t-tos",
            "title": "Build next step: Trading OS",
            "goal": "old programme text that must not replace BOUWLIJST",
            "payload": {"repo": "trading-os"},
            "metadata": {"agent": "code-agent", "motor": "cursor", "risico": "schrijven",
                         "oorsprong_bouw": "ja"},
        }
        uit = pl._voer_uit({}, taak, MOTOREN_11OKT, ALLES_INGELOGD)
        assert uit.get("ok") and not uit.get("handoff")
        assert gedraaid and gedraaid[0][0] == "trading-os"
        assert gedraaid[0][2] in p.ABONNEMENTEN and gedraaid[0][2] != "xai"
        tekst = gedraaid[0][1]
        assert "T1" in tekst and "persist chart drawings per user" in tekst
        assert "trading-os-app" in tekst and "snapshot-2026-10-17" in tekst
        assert "Never deploy" in tekst and "Never apply migrations" in tekst
        assert "Never place live orders" in tekst
        assert "old programme text" in tekst  # original goal stays, BOUWLIJST wins the task
        klaar = [v for t, s, v in rijen if t == "core_tasks" and v.get("status") == "completed"]
        assert klaar and klaar[0]["metadata"]["bewijs"]["bouwljist"]["id"] == "T1"
        assert klaar[0]["metadata"]["bewijs"]["bouwljist"]["basis"] == "snapshot-2026-10-17"
        assert not any(v.get("assignee") == "trading" for t, s, v in rijen if s == "insert")

    def test_bouw_trading_os_zonder_open_bouwljist_verzint_geen_werk(self, monkeypatch):
        gedraaid = []
        pl, rijen = TestVoerUitEerlijk()._pl(
            monkeypatch, lambda *a, **k: gedraaid.append(a) or {"status": "ok", "result": "nee"},
        )
        monkeypatch.setattr(pl, "_werkrepo", lambda *a, **k: "trading-os")
        monkeypatch.setattr(pl, "_canon", lambda repo: {"actie": "geen"})
        monkeypatch.setattr(pl, "_ververs", lambda repo: {"actie": "geen", "achter": 0})
        monkeypatch.setattr(pl, "_bouwljist", lambda repo: {
            "ok": False, "reden": "no open tasks in docs/BOUWLIJST.md", "volgende": None,
        })
        taak = {
            "id": "t-tos-leeg",
            "title": "Build next step: Trading OS",
            "goal": "Keep building",
            "payload": {"repo": "trading-os"},
            "metadata": {"agent": "code-agent", "motor": "cursor", "risico": "schrijven",
                         "oorsprong_bouw": "ja"},
        }
        uit = pl._voer_uit({}, taak, MOTOREN_11OKT, ALLES_INGELOGD)
        assert uit.get("ok") and uit.get("overgeslagen") and "BOUWLIJST" in uit["overgeslagen"]
        assert not gedraaid
        klaar = [v for t, s, v in rijen if t == "core_tasks" and v.get("status") == "completed"]
        assert klaar and "Skipped:" in klaar[0]["result"]["output"] and "BOUWLIJST" in klaar[0]["result"]["output"]

    def test_bouw_axe_trading_core_via_titel(self, monkeypatch):
        pl, rijen = TestVoerUitEerlijk()._pl(
            monkeypatch, lambda *a, **k: (_ for _ in ()).throw(AssertionError("geen run"))
        )
        monkeypatch.setattr(pl, "_werkrepo", lambda *a, **k: (_ for _ in ()).throw(AssertionError("niet in axe-core")))
        taak = {
            "id": "t-atc",
            "title": "Build next step: axe-trading-core",
            "goal": "Finish the next item",
            "payload": {},
            "metadata": {"agent": "code-agent", "risico": "schrijven", "oorsprong_bouw": "ja"},
        }
        uit = pl._voer_uit({}, taak)
        assert uit["handoff"] == "trading"

    def test_axe_core_bouw_blijft_in_axe_core(self, monkeypatch):
        gedraaid = []

        def run(*a, **k):
            gedraaid.append(a)
            return {"status": "ok", "result": "gebouwd"}

        pl, rijen = TestVoerUitEerlijk()._pl(monkeypatch, run)
        taak = {
            "id": "t-core",
            "title": "Build next step: AXE Core",
            "goal": "g",
            "payload": {"repo": "axe-core"},
            "metadata": {"agent": "code-agent", "motor": "cursor", "risico": "schrijven", "oorsprong_bouw": "ja"},
        }
        monkeypatch.setattr(pl, "_bewijs", lambda repo: {"repo": repo, "leesbaar": True, "veranderd": False, "diffstat": ""})
        uit = pl._voer_uit({}, taak, MOTOREN_11OKT, ALLES_INGELOGD)
        assert uit.get("ok") and gedraaid
        assert not any(v.get("assignee") == "trading" for t, s, v in rijen if s == "insert")


def test_een_bouwrun_krijgt_tijd_en_zijn_controles():
    """15 okt: 'Claude Code 4 liep langer dan 300s'; 16 okt: tests bleven op een
    toestemmingsvraag hangen. Een schrijvende run krijgt BOUW_RUN_S en checks=True,
    een lees-/planrun blijft op 300 s zonder extra rechten."""
    import planner as p
    aanroepen = []

    def run(repo, prompt, modus, timeout, motor, **kw):
        aanroepen.append((modus, timeout, kw.get("checks", False)))
        return {"status": "ok", "result": "klaar"}

    pl = p.Planner(lambda: None, run, lambda: {})
    staat = {}
    pl._vraag(staat, "claude", "bouw", "proef", "acceptEdits")
    pl._vraag(staat, "claude", "lees", "proef", "plan")
    assert aanroepen[0] == ("acceptEdits", p.BOUW_RUN_S, True)
    assert aanroepen[1] == ("plan", p.PLANNER_RUN_S, False)
    assert p.BOUW_RUN_S > p.PLANNER_RUN_S


class TestCheckIn:
    """Een Claude-stoel die een dag stil was krijgt één korte run; een loginfout wordt meteen gemeld."""

    NU = datetime(2026, 10, 20, 12, 0)

    def test_alleen_claude_stoelen_zonder_recente_run(self):
        staat = {"warm": {"claude": {"at": "2026-10-20T09:00:00", "ok": True},
                          "claude2": {"at": "2026-10-18T09:00:00", "ok": True},
                          "claude3": {"at": "2026-10-20T11:00:00", "ok": False}}}
        assert p.warm_nodig(staat, self.NU) == ["claude2", "claude3", "claude4"]

    def test_een_echte_run_telt_als_check_in(self):
        staat = {"warm": {m: {"at": "2026-10-20T11:59:00", "ok": True} for m in ("claude", "claude2", "claude3", "claude4")}}
        assert p.warm_nodig(staat, self.NU) == []

    def test_check_in_schrijft_warm_en_meldt_een_kapotte_login(self):
        antwoorden = {"claude": {"status": "ok"}, "claude2": {"status": "error", "error": "Not logged in · Please run /login"},
                      "claude3": {"status": "skip", "reden": "bezig"}}
        engines = {"claude": {"aanwezig": True, "ingelogd": True}, "claude2": {"aanwezig": True, "ingelogd": True},
                   "claude3": {"aanwezig": True, "ingelogd": True}, "claude4": {"aanwezig": False}}
        staat = {"account_kapot": {"claude": {"reden": "login verlopen", "tot": "2099-01-01T00:00:00"}}}
        pl = p.Planner(lambda: None, lambda *a, **k: {}, lambda: {}, houd_warm=lambda m: antwoorden[m])
        verslag = pl._houd_warm(staat, self.NU, engines)
        assert verslag == {"claude": "ok", "claude2": "fout", "claude3": "overgeslagen: bezig",
                           "claude4": "overgeslagen: niet geïnstalleerd"}
        assert staat["warm"]["claude"]["ok"] is True and "claude" not in staat["account_kapot"]
        assert staat["warm"]["claude2"]["ok"] is False and "claude2" in staat["account_kapot"]
        # Bezig of niet geïnstalleerd: geen rij, dus volgende ronde opnieuw.
        assert "claude3" not in staat["warm"] and "claude4" not in staat["warm"]

    def test_zonder_houd_warm_geen_check_in(self):
        pl = p.Planner(lambda: None, lambda *a, **k: {}, lambda: {})
        assert pl._houd_warm({}, self.NU, {"claude": {"aanwezig": True}}) == {}


class TestBouwBeurtTelt:
    """Meetlat van core_bouw_aanvullen: een gearchiveerde retry is geen beurt."""

    def test_verse_mislukking_telt_gearchiveerde_retry_niet(self):
        vers = {"status": "failed",
                "metadata": {"oorsprong_bouw": "ja"}}
        retry = {"status": "cancelled",
                 "metadata": {"oorsprong_bouw": "ja", "retry_of": "04afc4dd", "archived": True}}
        queued = {"status": "queued",
                  "metadata": {"oorsprong_bouw": "ja", "retry_of": "04afc4dd"}}
        assert p.bouw_beurt_telt(vers) is True
        assert p.bouw_beurt_telt(retry) is False
        assert p.bouw_beurt_telt(queued) is False

    def test_migratie_filtert_status_en_archived(self):
        from pathlib import Path
        map_ = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
        laatste = None
        for pad in sorted(map_.glob("*.sql")):
            tekst = pad.read_text(encoding="utf-8")
            if "function core_bouw_aanvullen" in tekst:
                laatste = tekst
        assert laatste, "geen core_bouw_aanvullen-migratie"
        assert "coalesce(t.metadata->>'archived', '') <> 'true'" in laatste
        assert "t.status in ('pending', 'running', 'completed', 'failed')" in laatste
