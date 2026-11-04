"""Router: tierkaart, stoelkeuze, API-fallback, tegoed-melding, beleid."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import provider_router as pr
from beslis_beleid import ACTIE_ASK, ACTIE_AUTO, beslis_goedkeuring


class _Q:
    def __init__(self, db, tabel):
        self.db, self.tabel, self.actie, self.data, self.filters = db, tabel, "select", None, []

    def select(self, *_a, **_k):
        self.actie = "select"
        return self

    def insert(self, rij):
        self.actie, self.data = "insert", rij
        return self

    def update(self, rij):
        self.actie, self.data = "update", rij
        return self

    def eq(self, k, v):
        self.filters.append((k, v))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        rijen = self.db.tabellen.setdefault(self.tabel, [])
        if self.actie == "insert":
            rijen.append(dict(self.data))
            return type("R", (), {"data": [dict(self.data)]})()
        if self.actie == "update":
            uit = []
            for r in rijen:
                if all(str(r.get(k)) == str(v) for k, v in self.filters):
                    r.update(self.data)
                    uit.append(dict(r))
            return type("R", (), {"data": uit})()
        uit = list(rijen)
        for k, v in self.filters:
            uit = [r for r in uit if str(r.get(k)) == str(v)]
        return type("R", (), {"data": uit})()


class NepDB:
    def __init__(self, **tabellen):
        self.tabellen = {k: list(v) for k, v in tabellen.items()}

    def table(self, naam):
        return _Q(self, naam)


def stoel(seat_id, **kw):
    rij = {
        "id": f"mac-mini:{seat_id}",
        "seat_id": seat_id,
        "provider": seat_id.rstrip("234"),
        "machine": "mac-mini-van-luka-5",
        "logged_in": True,
        "rate_limited": False,
        "current_task": None,
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
        "runs_7d": 0,
    }
    rij.update(kw)
    return rij


def test_kaart_dekt_roster_crews_en_northsea():
    from agent_workspace import AGENT_WORKSPACES
    from pathlib import Path
    import re
    roster = (Path(__file__).resolve().parents[2] / "src/domain/agents/roster.ts").read_text()
    ids = set(re.findall(r"^\s*id: '([a-z]+)',", roster.split("export const AXE_AGENTS", 1)[1], re.M))
    kaart = pr.laad_kaart()
    assert ids <= set(kaart["agents"]), ids - set(kaart["agents"])
    assert set(AGENT_WORKSPACES) <= set(kaart["agents"])
    for crew in ("axe_core", "wags", "dollar_bill", "intel", "sentinel", "forge", "pulse", "atlas", "nova"):
        assert crew in kaart["crews"], crew
    for agent in ("deal_manager", "buyer_hunter", "sourcing_supervisor", "approval_coordinator"):
        assert agent in kaart["northsea"], agent


def test_kies_stoel_spreidt_op_resterend_en_slaat_limiet_over():
    rijen = [
        stoel("claude2", rate_limited=True, rate_limit_until="2099-01-01T00:00:00+00:00"),
        stoel("claude3", runs_7d=40, remaining_week=10),
        stoel("claude4", runs_7d=2, remaining_week=90),
        stoel("codex", remaining_week=50),
    ]
    gekozen = pr.kies_stoel(rijen, familie="claude")
    assert gekozen["seat_id"] == "claude4"
    # Geen Claude vrij → Codex.
    alleen_codex = [rijen[0], rijen[3]]
    assert pr.kies_stoel(alleen_codex, familie="claude")["seat_id"] == "codex"


def test_kies_stoel_codex_op_nul_wint_van_volle_claude():
    rijen = [
        stoel("claude2", used_week=69, runs_7d=56),
        stoel("codex", used_week=0, runs_7d=0),
        stoel("codex2", used_week=0, runs_7d=0, email="tweede@x.nl"),
    ]
    gekozen = pr.kies_stoel(rijen, familie="claude")
    assert gekozen["seat_id"] in ("codex", "codex2")


def test_kies_stoel_slaat_xai_over_want_geen_cli():
    rijen = [stoel("xai", provider="xai", machine="vps")]
    assert pr.kies_stoel(rijen, familie="claude") is None


def test_bezette_of_oude_stoel_telt_niet():
    rijen = [
        stoel("claude2", current_task="ci"),
        stoel("claude3", logged_in=False),
        stoel("claude4", last_seen_at="2020-01-01T00:00:00+00:00"),
    ]
    assert pr.kies_stoel(rijen, familie="claude") is None


def test_tier3_en_gratis_gebruiken_geen_stoel():
    assert pr.mag_stoel("cron") is False
    assert pr.mag_stoel("finance") is False
    assert pr.mag_stoel("developer") is True
    assert pr.mag_stoel("developer", alleen_gratis=True) is False
    assert pr.api_namen("developer", alleen_gratis=True) == ["groq", "cerebras", "ollama"]
    assert "openai" not in pr.api_namen("developer")
    assert "openrouter" in pr.api_namen("developer")
    assert pr.api_namen("northseamgr")[-1] == "ollama"
    assert "openrouter" in pr.api_namen("northseamgr")


def test_tegoed_melding_eenmaal_per_provider_per_dag():
    db = NepDB(core_notifications=[])
    assert pr.meld_tegoed_eenmaal(db, "openai", "You have no credits remaining") is True
    assert pr.meld_tegoed_eenmaal(db, "openai", "You have no credits remaining") is False
    assert len(db.tabellen["core_notifications"]) == 1
    tekst = db.tabellen["core_notifications"][0]["message"]
    assert tekst.startswith("[tegoed] openai")
    assert "koopt niets" in tekst
    # Groq is gratis: geen top-up-melding.
    assert pr.meld_tegoed_eenmaal(db, "groq", "Rate limit reached") is False


def test_call_model_valt_door_naar_stoel(monkeypatch):
    import agent_loop

    monkeypatch.setattr(agent_loop, "_AFKOELING", {})
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("CEREBRAS_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.delenv("GROK_API_KEY", raising=False)

    async def ollama(_c):
        raise RuntimeError("ollama down")

    monkeypatch.setattr(agent_loop, "_call_ollama_begrensd", ollama)
    monkeypatch.setattr(agent_loop, "lees_stoelen", lambda _db=None: [stoel("claude3", remaining_week=80)])

    gezien = {}

    def runner(device, tool, args, **_k):
        gezien.update(device=device, tool=tool, args=args)
        return {"ok": True, "output": "Seat took over the cycle."}

    monkeypatch.setattr(agent_loop, "_stoel_runner", runner)
    monkeypatch.setattr(agent_loop, "_stoel_db", lambda: object())

    token = agent_loop._HUIDIGE_AGENT_WS.set({"agent": "developer", "role": "Code manager"})
    try:
        uit = asyncio.run(agent_loop._call_model([{"role": "user", "parts": [{"text": "fix ci"}]}], None))
    finally:
        agent_loop._HUIDIGE_AGENT_WS.reset(token)

    assert uit["parts"][0]["text"] == "Seat took over the cycle."
    assert gezien["tool"] == "claude_code.run"
    assert gezien["args"]["seat"] == "claude3"


def test_call_model_wacht_op_capaciteit_in_plaats_van_rood(monkeypatch):
    import agent_loop

    monkeypatch.setattr(agent_loop, "_AFKOELING", {})
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("CEREBRAS_API_KEY", raising=False)
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.delenv("GROK_API_KEY", raising=False)

    async def ollama(_c):
        raise RuntimeError("openai 429: You have no credits remaining")

    monkeypatch.setattr(agent_loop, "_call_ollama_begrensd", ollama)
    monkeypatch.setattr(pr, "lees_stoelen", lambda _db=None: [])
    monkeypatch.setattr(agent_loop, "_stoel_db", lambda: NepDB(core_notifications=[]))

    token = agent_loop._HUIDIGE_AGENT_WS.set({"agent": "northsea", "role": "desk"})
    try:
        try:
            asyncio.run(agent_loop._call_model([{"role": "user", "parts": [{"text": "hi"}]}], None))
            raise AssertionError("had moeten wachten")
        except pr.WaitingForCapacity as wacht:
            assert wacht.retry_after_s >= 15
            assert "every provider failed" in str(wacht)
    finally:
        agent_loop._HUIDIGE_AGENT_WS.reset(token)


def test_computer_worker_kent_stoel_env():
    from pathlib import Path
    tekst = (Path(__file__).resolve().parents[2] / "infra/computer-worker/worker.mjs").read_text()
    assert "SEAT_ENV" in tekst
    assert "~/.claude-tweede" in tekst or ".claude-tweede" in tekst
    assert "seatChildEnv" in tekst
    assert "ANTHROPIC_API_KEY" in tekst
    assert "CURSOR2_API_KEY" in tekst
    assert "gpt-5-codex" in tekst
    stoelen = (Path(__file__).resolve().parents[2] / "infra/computer-worker/codingSeats.mjs").read_text()
    assert "cursor2" in stoelen and "isRealLimitMessage" in stoelen
    assert "CURSOR2_API_KEY" in stoelen


def test_codex_leeg_en_astra_krijgen_geen_model(monkeypatch):
    """Geen -m by default: ChatGPT-accounts weigeren gpt-5-codex. Astra evenmin."""
    monkeypatch.delenv("AXE_CODEX_MODEL", raising=False)
    assert pr.codex_cli_model("gpt-6-astra") == ""
    assert pr.codex_cli_model("") == ""
    assert pr.codex_cli_model("gpt-5-codex") == ""
    assert pr.stoel_model("codex", 1, "gpt-6-astra") == ""
    assert pr.stoel_model("codex", 1, "") == ""
    assert pr.stoel_model("codex", 1, "o3") == "o3"


def test_codex_model_via_env(monkeypatch):
    monkeypatch.setenv("AXE_CODEX_MODEL", "o3")
    assert pr.codex_cli_model("") == "o3"
    monkeypatch.setenv("AXE_CODEX_MODEL", "gpt-6-astra")
    assert pr.codex_cli_model("") == ""
    monkeypatch.setenv("AXE_CODEX_MODEL", "gpt-5-codex")
    assert pr.codex_cli_model("") == ""


def test_roep_stoel_laat_model_weg_als_leeg(monkeypatch):
    monkeypatch.delenv("AXE_CODEX_MODEL", raising=False)
    gezien = []

    def runner(device, tool, args, **kw):
        gezien.append((device, tool, args))
        return {"status": "ok"}

    pr.roep_stoel({"seat_id": "codex", "machine": "mac-mini"}, "bouw", runner=runner)
    assert gezien[0][1] == "codex.run"
    assert "model" not in gezien[0][2]


def test_computer_worker_codex_fallback_zonder_hard_model():
    from pathlib import Path
    tekst = (Path(__file__).resolve().parents[2] / "infra/computer-worker/worker.mjs").read_text()
    assert "runCodexWithFallback" in tekst
    assert "AXE_CODEX_MODEL" in tekst
    assert "isCodexModelNotFound" in tekst
    assert "/opt/homebrew/bin/claude" in tekst
    assert "retry without -m" in tekst
    assert "Codex model_not_found" in tekst
    assert "gpt-5-codex" in tekst


def test_xai_stoel_uit_de_sleutel(monkeypatch):
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.delenv("GROK_API_KEY", raising=False)
    uit = pr.xai_stoel()
    assert uit["seat_id"] == "xai" and uit["logged_in"] is False
    monkeypatch.setenv("XAI_API_KEY", "xai-test")
    assert pr.xai_stoel()["logged_in"] is True


def test_beleid_hard_limits_blijven_vragen():
    ask = lambda **k: beslis_goedkeuring(k).actie
    assert ask(title="Send a new intro email to Acme", kind="leave_plan") == ACTIE_ASK
    assert ask(title="Flip auto_send_qualification", kind="leave_plan") == ACTIE_ASK
    assert ask(title="Place a live order on XAUUSD", kind="leave_plan") == ACTIE_ASK
    assert ask(title="Wire money to the seller", kind="leave_plan") == ACTIE_ASK
    assert ask(title="Yes needed: DEAL-009 — Copper", kind="northsea_notice") == ACTIE_ASK
    assert ask(title="Market data check (trading)", kind="leave_plan") == ACTIE_AUTO


NU_KETEN = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)


def _aanwezig(*ids: str) -> dict[str, bool]:
    return {pid: pid in ids for pid, *_ in pr.KETEN}


class TestClassificatie:
    def setup_method(self):
        pr.reset_router_staat()

    def test_limiet_tegoed_transient_taakfout(self):
        assert pr.classificeer_fout("HTTP 429 too many requests", 429) == "limiet"
        assert pr.classificeer_fout("quota exceeded") == "limiet"
        assert pr.classificeer_fout("You have no credits remaining") == "tegoed"
        assert pr.classificeer_fout("prepayment credits are depleted", 402) == "tegoed"
        assert pr.classificeer_fout("gateway timeout", 504) == "transient"
        assert pr.classificeer_fout("timed out connecting") == "transient"
        assert pr.classificeer_fout("pytest failed: 3 tests rood") == "taakfout"
        assert pr.classificeer_fout("Project checks are not verified") == "taakfout"
        assert pr.classificeer_fout("invalid input for this task") == "taakfout"


class TestCircuitEnCooldown:
    def setup_method(self):
        pr.reset_router_staat()

    def test_drie_fouten_in_tien_min_sluiten_vijftien_min(self):
        from datetime import timedelta
        t0 = NU_KETEN
        for i in range(3):
            pr.registreer_fout("groq", "transient", nu=t0 + timedelta(minutes=i))
        assert pr.circuit_dicht("groq", nu=t0 + timedelta(minutes=2)) is True
        assert pr.circuit_dicht("groq", nu=t0 + timedelta(minutes=2, seconds=pr.CIRCUIT_DICHT_S + 1)) is False

    def test_limiet_zet_cooldown_tegoed_blijft_dicht_tot_reset(self):
        from datetime import timedelta
        tot = NU_KETEN + timedelta(hours=5)
        pr.registreer_fout("openai", "limiet", nu=NU_KETEN, wacht_tot=tot)
        assert pr.provider_skip_reden("openai", nu=NU_KETEN) == "limiet"
        assert pr.provider_skip_reden("openai", nu=tot + timedelta(seconds=1)) is None
        pr.registreer_fout("anthropic", "tegoed", nu=NU_KETEN)
        assert pr.provider_skip_reden("anthropic", nu=NU_KETEN) == "tegoed"
        assert pr.provider_skip_reden("anthropic", nu=NU_KETEN + timedelta(days=2)) == "tegoed"
        pr.reset_tegoed("anthropic")
        assert pr.provider_skip_reden("anthropic", nu=NU_KETEN) is None

    def test_taakfout_opent_geen_circuit(self):
        from datetime import timedelta
        for i in range(5):
            pr.registreer_fout("claude2", "taakfout", nu=NU_KETEN + timedelta(minutes=i))
        assert pr.circuit_dicht("claude2", nu=NU_KETEN + timedelta(minutes=4)) is False


class TestKetenVolgorde:
    def setup_method(self):
        pr.reset_router_staat()

    def test_code_zet_stoelen_voor_apis_en_ollama_laatst(self):
        rijen = [
            stoel("claude2"), stoel("claude3"), stoel("codex"), stoel("cursor"),
        ]
        uit = pr.route(
            {"capability": "code", "assignee": "developer", "title": "Fix CI"},
            stoelen=rijen, nu=NU_KETEN,
            aanwezig=_aanwezig("claude2", "claude3", "codex", "cursor", "xai", "openai", "groq", "ollama"),
        )
        ids = [k["id"] for k in uit["kandidaten"]]
        assert ids[-1] == "ollama"
        stoel_i = min(ids.index(s) for s in ("claude2", "claude3", "codex", "cursor") if s in ids)
        api_i = ids.index("openai") if "openai" in ids else ids.index("groq")
        assert stoel_i < api_i
        assert "perplexity" not in ids

    def test_klein_zet_groq_voor_stoelen(self):
        rijen = [stoel("claude2")]
        uit = pr.route(
            {"capability": "cron", "title": "health check"},
            stoelen=rijen, nu=NU_KETEN,
            aanwezig=_aanwezig("claude2", "groq", "ollama"),
        )
        ids = [k["id"] for k in uit["kandidaten"]]
        assert ids.index("groq") < ids.index("claude2")
        assert ids[-1] == "ollama"

    def test_research_houdt_perplexity_klein_niet(self):
        research = pr.route(
            {"capability": "research", "title": "Look up copper buyers"},
            nu=NU_KETEN, aanwezig=_aanwezig("perplexity", "groq", "ollama"),
        )
        assert "perplexity" in [k["id"] for k in research["kandidaten"]]
        klein = pr.route(
            {"capability": "cron"},
            nu=NU_KETEN, aanwezig=_aanwezig("perplexity", "groq", "ollama"),
        )
        assert "perplexity" not in [k["id"] for k in klein["kandidaten"]]

    def test_spreidt_op_credits_en_slaat_venster_over(self):
        import usage_credits as uc
        taken = [
            {
                "id": "a", "title": "Build next step: AXE Core", "status": "completed",
                "payload": {"engine": "claude2"}, "created_at": "2026-11-04T08:00:00+00:00",
            }
        ] * 4
        credits = uc.aggregeer(taken, [], nu=NU_KETEN)
        rijen = [stoel("claude2"), stoel("claude3", remaining_week=90)]
        uit = pr.route(
            {"capability": "code", "title": "Build next step: AXE Core", "assignee": "developer"},
            stoelen=rijen, credits=credits, nu=NU_KETEN,
            aanwezig=_aanwezig("claude2", "claude3", "ollama"),
        )
        ids = [k["id"] for k in uit["kandidaten"]]
        # claude2 zit in een 5-uursvenster (eerste run 08:00, nu 12:00).
        assert "claude2" not in ids
        assert any(o["id"] == "claude2" and "venster" in (o.get("reden") or "") for o in uit["overgeslagen"])
        assert ids[0] == "claude3"

    def test_stale_hartslag_en_circuit_worden_overgeslagen(self):
        from datetime import timedelta
        pr.registreer_fout("codex", "transient", nu=NU_KETEN)
        pr.registreer_fout("codex", "transient", nu=NU_KETEN + timedelta(minutes=1))
        pr.registreer_fout("codex", "transient", nu=NU_KETEN + timedelta(minutes=2))
        rijen = [
            stoel("codex"),
            stoel("claude2", last_seen_at="2020-01-01T00:00:00+00:00"),
            stoel("claude3"),
        ]
        uit = pr.route(
            {"capability": "code", "assignee": "developer"},
            stoelen=rijen, nu=NU_KETEN + timedelta(minutes=2),
            aanwezig=_aanwezig("codex", "claude2", "claude3", "ollama"),
        )
        ids = [k["id"] for k in uit["kandidaten"]]
        assert "codex" not in ids
        assert "claude2" not in ids
        assert "claude3" in ids


class TestLoopKeten:
    def setup_method(self):
        pr.reset_router_staat()

    def _db(self):
        return NepDB(core_tasks=[{"id": "t-keten"}], core_task_attempts=[], core_notifications=[])

    def test_429_en_tegoed_lopen_door_timeout_retry_dan_volgende(self):
        db = self._db()
        gezien = []

        def probeer(k):
            gezien.append(k["id"])
            if k["id"] == "claude2":
                raise RuntimeError("429 rate limit quota exceeded")
            if k["id"] == "claude3":
                raise RuntimeError("You have no credits remaining")
            if k["id"] == "codex":
                raise TimeoutError("timed out")
            return {"text": "ok via " + k["id"]}

        rijen = [stoel("claude2"), stoel("claude3"), stoel("codex"), stoel("cursor")]
        uit = pr.loop_keten(
            {"id": "t-keten", "capability": "code", "assignee": "developer"},
            probeer, stoelen=rijen, nu=NU_KETEN, db=db, slaap=lambda _s: None,
            aanwezig=_aanwezig("claude2", "claude3", "codex", "cursor", "ollama"),
        )
        assert uit["ok"] is True
        assert uit["provider_used"] == "cursor"
        assert uit["draaide_op"] == "draaide op: cursor"
        assert gezien.count("codex") == 2  # transient: 1 retry
        assert db.tabellen["core_tasks"][0]["provider_used"] == "cursor"
        assert any(r.get("fout_klasse") == "limiet" for r in db.tabellen["core_task_attempts"])
        assert any(r.get("fout_klasse") == "tegoed" for r in db.tabellen["core_task_attempts"])
        assert any(str(n.get("message") or "").startswith("[tegoed]") for n in db.tabellen["core_notifications"])

    def test_taakfout_schuift_niet_door(self):
        gezien = []

        def probeer(k):
            gezien.append(k["id"])
            raise RuntimeError("pytest failed: tests rood")

        rijen = [stoel("claude2"), stoel("claude3")]
        try:
            pr.loop_keten(
                {"id": "t-keten", "capability": "code"},
                probeer, stoelen=rijen, nu=NU_KETEN, slaap=lambda _s: None,
                aanwezig=_aanwezig("claude2", "claude3", "ollama"),
            )
            raise AssertionError("had TaakFout moeten zijn")
        except pr.TaakFout:
            pass
        assert gezien == ["claude2"]

    def test_alles_op_deferred_niet_failed(self):
        def probeer(k):
            raise RuntimeError("429 quota exceeded")

        rijen = [stoel("claude2")]
        try:
            pr.loop_keten(
                {"id": "t-keten", "capability": "code"},
                probeer, stoelen=rijen, nu=NU_KETEN, slaap=lambda _s: None,
                aanwezig=_aanwezig("claude2", "ollama"),
            )
            raise AssertionError("had moeten deferren")
        except pr.WaitingForCapacity as wacht:
            assert wacht.deferred is True
            assert wacht.status == "deferred"
            assert wacht.retry_after_s >= 15

    def test_migratie_dicht_voor_anon_niet_toepassen(self):
        from pathlib import Path
        sql = (
            Path(__file__).resolve().parents[2]
            / "supabase/migrations/20261104120000_core_task_attempts.sql"
        ).read_text(encoding="utf-8")
        assert "core_task_attempts" in sql
        assert "provider_used" in sql
        assert "public.core_owner()" in sql
        assert "revoke all on table public.core_task_attempts from anon" in sql.lower() or "from anon" in sql
        assert "NIET toepassen op live" in sql
        assert "to anon;" not in sql.lower()
        assert "grant select, insert, update, delete on table public.core_task_attempts to service_role" in sql
        assert "VITE_" not in sql
