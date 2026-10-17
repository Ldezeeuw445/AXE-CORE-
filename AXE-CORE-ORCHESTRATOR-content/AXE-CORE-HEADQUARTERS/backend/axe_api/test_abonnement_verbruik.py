"""Verbruik per abonnement: vertalen wat de aanbieder zegt, nooit een token naar buiten."""
import abonnement_verbruik as v


CLAUDE_BODY = {
    "five_hour": {"utilization": 36.0, "resets_at": "2026-10-11T23:49:59+00:00"},
    "seven_day": {"utilization": 5.0, "resets_at": "2026-10-12T01:59:59+00:00"},
    "seven_day_opus": None,
    "extra_usage": {"is_enabled": False},
}
CODEX_BODY = {"plan_type": "plus", "rate_limit": {
    "limit_reached": False,
    "primary_window": {"used_percent": 0, "reset_at": 1791763555},
    "secondary_window": {"used_percent": 2, "reset_at": 1792296643}}}


def test_claude_sessie_en_week():
    uit = v.vertaal_claude(CLAUDE_BODY)
    assert uit["sessie"] == {"procent": 36.0, "reset": "2026-10-11T23:49:59+00:00"}
    assert uit["week"]["procent"] == 5.0 and "week_opus" not in uit


def test_codex_vensters_en_epoch_naar_iso():
    uit = v.vertaal_codex(CODEX_BODY)
    assert uit["plan"] == "plus" and uit["sessie"]["procent"] == 0 and uit["week"]["procent"] == 2
    assert uit["week"]["reset"].startswith("2026-")


def test_fouten_naar_status():
    assert v.status_uit_fout(403, '{"message":"OAuth authentication is currently not allowed for this organization."}')[0] == "blocked"
    assert v.status_uit_fout(401, "OAuth access token has expired")[0] == "expired"
    assert v.status_uit_fout(401, "token_expired")[0] == "expired"
    assert v.status_uit_fout(500, "boom")[0] == "error"


def test_sleutelhanger_naam_per_configmap():
    assert v.claude_sleutelhanger_naam(None) == "Claude Code-credentials"
    assert v.claude_sleutelhanger_naam("/Users/luka/.claude-vierde") == "Claude Code-credentials-901d2b84"


def test_cursor_about():
    uit = v.lees_cursor_about("Subscription Tier   Free\nUser Email          a@b.nl\n")
    assert uit == {"plan": "Free", "account": "a@b.nl"}


def test_token_gaat_alleen_als_header_mee_en_niet_in_het_antwoord(monkeypatch):
    monkeypatch.setattr(v, "_claude_oauth", lambda m: {"accessToken": "GEHEIM-TOKEN", "subscriptionType": "pro",
                                                       "expiresAt": 9_999_999_999_999})
    gezien = {}

    def get(url, headers):
        gezien.update(headers)
        return 200, CLAUDE_BODY
    uit = v._claude({"extra_env": {}}, get=get)
    assert gezien["Authorization"] == "Bearer GEHEIM-TOKEN"
    assert "GEHEIM" not in str(uit) and uit["status"] == "ok" and uit["plan"] == "pro"


def test_verlopen_token_wordt_niet_zelf_ververst(monkeypatch):
    monkeypatch.setattr(v, "_claude_oauth", lambda m: {"accessToken": "x", "expiresAt": 1000})
    uit = v._claude({"extra_env": {}}, get=lambda *a: (_ for _ in ()).throw(AssertionError("geen call")))
    assert uit["status"] == "expired"


def test_planner_ervaring_wint_van_een_groene_check(monkeypatch):
    v._cache.clear()
    monkeypatch.setattr(v, "_planner_staat", lambda: {"account_kapot": {"cursor": {"reden": "betaling nodig"}}})
    monkeypatch.setattr(v, "_cursor", lambda b: {"status": "ok", "plan": "Free"})
    rijen = v.verbruik({"cursor": {"login": "cursor-agent login"}}, {"cursor": {"label": "Cursor · a@b.nl", "account": "a@b.nl"}},
                       lambda m: "/bin/cursor-agent", vers=True)
    assert rijen[0]["status"] == "blocked" and "Payment" in rijen[0]["reden"]
