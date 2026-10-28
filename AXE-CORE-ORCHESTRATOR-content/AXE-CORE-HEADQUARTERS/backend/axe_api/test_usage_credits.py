"""Aggregatie van Usage & Credits: stoelen, vensters, app-budgetten, spreiding."""
from datetime import datetime, timezone
from pathlib import Path

import usage_credits as uc


NU = datetime(2026, 10, 28, 12, 0, tzinfo=timezone.utc)  # woensdag 14:00 Amsterdam


def taak(**kw):
    basis = {
        "id": "t",
        "title": "Build next step: AXE Core",
        "status": "completed",
        "source_app": "axe_core",
        "payload": {},
        "metadata": {},
        "result": {},
        "created_at": "2026-10-28T10:00:00+00:00",
    }
    basis.update(kw)
    return basis


def stoel(seat_id, **kw):
    rij = {
        "id": f"mac-mini:{seat_id}",
        "seat_id": seat_id,
        "provider": seat_id.rstrip("234"),
        "machine": "mac-mini-van-luka-5",
        "logged_in": True,
        "rate_limited": False,
        "last_seen_at": "2026-10-28T11:50:00+00:00",
    }
    rij.update(kw)
    return rij


class TestNormalisatie:
    def test_stoel_uit_machine_id_en_alias(self):
        assert uc.normaliseer_stoel("mac-mini:claude2") == "claude2"
        assert uc.normaliseer_stoel("claude-tweede") == "claude2"
        assert uc.normaliseer_stoel("qwen-coder") == "ollama"
        assert uc.normaliseer_stoel("twins") == "xai2"
        assert uc.normaliseer_stoel("axe-core") is None

    def test_app_uit_repo_titel_en_source(self):
        assert uc.herken_app("trading-os-app") == "trading-os"
        assert uc.herken_app("Build next step: Trading OS") == "trading-os"
        assert uc.herken_app("AXE-COMPANION-OS-") == "axe-companion"
        assert uc.herken_app("axon-memory") == "axon-memory"
        assert uc.herken_app("code-agent") == "axe-developer"
        assert uc.herken_app("axe_core") == "axe-core"

    def test_taak_leest_engine_uit_payload_niet_assignee(self):
        t = taak(assignee="axe-core", payload={"engine": "claude3"})
        assert uc.taak_stoel(t) == "claude3"
        assert uc.taak_app(t) == "axe-core"


class TestAggregatie:
    def test_sessies_vandaag_en_deze_week_per_stoel(self):
        taken = [
            taak(payload={"engine": "claude2"}, created_at="2026-10-28T08:00:00+00:00"),
            taak(payload={"engine": "claude2"}, created_at="2026-10-28T09:00:00+00:00"),
            taak(payload={"engine": "claude3"}, created_at="2026-10-27T10:00:00+00:00"),
            taak(payload={"engine": "claude2"}, created_at="2026-10-20T10:00:00+00:00"),  # vorige week
            taak(payload={"engine": "claude4"}, status="pending", created_at="2026-10-28T11:00:00+00:00"),
        ]
        uit = uc.aggregeer(taken, [], nu=NU)
        per = {s["id"]: s for s in uit["seats"]}
        assert per["claude2"]["sessions_today"] == 2
        assert per["claude2"]["sessions_week"] == 2
        assert per["claude3"]["sessions_today"] == 0
        assert per["claude3"]["sessions_week"] == 1
        assert per["claude4"]["sessions_today"] == 0

    def test_vijf_uursvenster_uit_eerste_run_en_rate_limit(self):
        taken = [taak(payload={"engine": "claude2"}, created_at="2026-10-28T09:00:00+00:00")]
        uit = uc.aggregeer(taken, [], nu=NU)
        per = {s["id"]: s for s in uit["seats"]}
        assert per["claude2"]["window_free_at"] == "2026-10-28T14:00:00+00:00"
        assert per["claude2"]["window_open"] is False

        limited = [stoel("claude3", rate_limited=True, rate_limit_until="2026-10-28T16:30:00+00:00")]
        uit2 = uc.aggregeer([], limited, nu=NU)
        c3 = next(s for s in uit2["seats"] if s["id"] == "claude3")
        assert c3["window_free_at"] == "2026-10-28T16:30:00+00:00"
        assert c3["rate_limited"] is True

        vrij = uc.aggregeer([], [stoel("claude4")], nu=NU)
        c4 = next(s for s in vrij["seats"] if s["id"] == "claude4")
        assert c4["window_open"] is True
        assert c4["window_free_at"] is None

    def test_laatste_fout_en_limiet_zonder_geheimen(self):
        taken = [taak(
            payload={"engine": "codex"},
            status="failed",
            error={"message": "usage limit. token sk-ant-GEHEIMTOKEN1234567890ABCD"},
            created_at="2026-10-28T11:00:00+00:00",
        )]
        stoelen = [stoel("codex", last_limit_message="You've hit your usage limit. try again at 5:00 PM.")]
        uit = uc.aggregeer(taken, stoelen, nu=NU)
        c = next(s for s in uit["seats"] if s["id"] == "codex")
        assert "usage limit" in (c["last_failure"] or "")
        assert "GEHEIM" not in str(uit)
        assert "sk-ant-" not in str(uit)
        assert c["last_limit"] and "usage limit" in c["last_limit"]

    def test_app_budget_under_met_over(self):
        taken = (
            [taak(title="Build next step: AXE Core", payload={"engine": "claude2"})] * 3
            + [taak(title="Companion login flow", payload={"engine": "claude3"})]
            + [taak(
                title="Build next step: Trading OS",
                payload={"engine": "cursor"},
                metadata={"bewijs": {"repo": "trading-os-app"}},
            )] * 4
        )
        uit = uc.aggregeer(taken, [], nu=NU)
        apps = {a["id"]: a for a in uit["apps"]}
        assert apps["axe-core"]["sessions_today"] == 3 and apps["axe-core"]["stand"] == "met"
        assert apps["axe-companion"]["stand"] == "under"
        assert apps["trading-os"]["stand"] == "over"
        assert apps["axon-memory"]["stand"] == "under"
        assert uit["apps_met"] == 1

    def test_spreiding_gelijk_en_scheef(self):
        gelijk = []
        for sid in ("claude2", "claude3", "claude4", "codex", "codex2", "cursor", "cursor2"):
            gelijk.append(taak(payload={"engine": sid}))
        uit = uc.aggregeer(gelijk, [], nu=NU)
        assert uit["spread"]["even"] is True
        assert uit["spread"]["delta"] == 0
        assert uit["spread"]["paid_today"] == 7

        scheef = [taak(payload={"engine": "claude2"})] * 5
        uit2 = uc.aggregeer(scheef, [], nu=NU)
        assert uit2["spread"]["even"] is False
        assert uit2["spread"]["delta"] == 5
        assert "claude2 has 5" in uit2["spread"]["note"]

    def test_vps_en_grok_twins_staan_in_de_catalogus(self):
        uit = uc.aggregeer([], [], nu=NU)
        ids = [s["id"] for s in uit["seats"]]
        assert ids == [
            "claude2", "claude3", "claude4",
            "codex", "codex2",
            "cursor", "cursor2",
            "xai", "xai2",
            "openhands", "ollama",
        ]
        xai2 = next(s for s in uit["seats"] if s["id"] == "xai2")
        assert xai2["seen"] is False
        assert "twins" in (xai2["label"] or "").lower()
        ollama = next(s for s in uit["seats"] if s["id"] == "ollama")
        assert ollama["kind"] == "free-vps"

    def test_config_is_leesbaar_voor_de_load_balancer(self):
        cfg = uc.config_voor_balancer()
        assert cfg["timezone"] == "Europe/Amsterdam"
        assert "claude2" in cfg["spread_seat_ids"]
        apps = {a["id"]: a for a in cfg["apps"]}
        assert apps["axe-core"]["sessions_min"] == 3
        assert apps["axe-companion"]["sessions_max"] == 3
        assert apps["trading-os"]["sessions_min"] == 2
        assert apps["axon-memory"]["sessions_max"] == 2
        assert apps["axe-developer"]["sessions_min"] == 1
        stoel = next(s for s in cfg["seats"] if s["id"] == "claude2")
        assert stoel["window_hours"] == 5 and stoel["sessions_max"] == 3

    def test_tabelrijen_overschrijven_alleen_de_cap(self):
        rijen = [{"id": "axe-core", "kind": "app", "sessions_min": 4, "sessions_max": 5}]
        cfg = uc.catalogus_uit(rijen)
        app = next(a for a in cfg["apps"] if a["id"] == "axe-core")
        assert app["sessions_min"] == 4 and app["label"] == "AXE Core"

    def test_heartbeat_ingelogd_wint_van_stale_null_rij(self):
        rijen = [
            stoel("cursor2", machine="imac", logged_in=False, last_seen_at="2026-10-28T09:00:00+00:00"),
            stoel("cursor2", machine="mac-mini-van-luka-5", logged_in=True,
                  email="seen@example.com", last_seen_at="2026-10-28T11:55:00+00:00"),
        ]
        uit = uc.aggregeer([], rijen, nu=NU)
        c2 = next(s for s in uit["seats"] if s["id"] == "cursor2")
        assert c2["logged_in"] is True
        assert c2["email"] == "seen@example.com"
        assert "example.com" in str(uit)  # account-identiteit mag
        assert "CURSOR2_API_KEY=" not in str(uit)


class TestApiKoppeling:
    def test_beide_routes_hangen_achter_auth_in_main(self):
        tekst = Path(__file__).with_name("main.py").read_text(encoding="utf-8")
        assert '@app.get("/usage-credits", dependencies=[AUTH])' in tekst
        assert '@app.get("/usage-credits/config", dependencies=[AUTH])' in tekst
        assert "import usage_credits" in tekst
        # Bestaande stoelen-route blijft; dit is ernaast, niet in plaats van.
        assert '@app.get("/coding-seats", dependencies=[AUTH])' in tekst
