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

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        rijen = self.db.tabellen.setdefault(self.tabel, [])
        if self.actie == "insert":
            rijen.append(dict(self.data))
            return type("R", (), {"data": [dict(self.data)]})()
        return type("R", (), {"data": list(rijen)})()


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
