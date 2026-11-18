"""Per-client scope-cap: Claude van Luka blijft ingelogd, zonder admin/send."""
from northsea_mcp.policy import SCOPES
from northsea_mcp.scope_cap import DRAFTS_ONLY, cap_voor, is_claude_client, scopes_na_cap
from northsea_mcp.store import Store
from conftest import USER, PUBLIC

ALLE = tuple(SCOPES)
ADMIN_SEND = ("northsea.admin", "northsea.communications.send", "northsea.read", "northsea.communications.draft")


def test_claude_heuristiek():
    assert is_claude_client({"client_name": "Claude.ai", "redirect_uris": ["https://claude.ai/oauth/callback"]})
    assert is_claude_client({"client_id": "https://claude.ai/.well-known/oauth", "redirect_uris": []})
    assert not is_claude_client({"client_name": "ChatGPT", "redirect_uris": ["https://chatgpt.com/connector_platform_oauth_redirect"]})


def test_luka_claude_is_drafts_only_zonder_metadata():
    client = {"client_name": "Claude", "redirect_uris": ["https://claude.ai/api/callback"], "metadata": {}}
    cap = cap_voor(client, USER)
    assert cap is not None
    assert "northsea.communications.draft" in cap
    assert "northsea.admin" not in cap
    assert "northsea.communications.send" not in cap
    uit = scopes_na_cap(ADMIN_SEND, client, USER)
    assert "northsea.admin" not in uit and "northsea.communications.send" not in uit
    assert "northsea.communications.draft" in uit


def test_chatgpt_van_luka_blijft_onaangeraakt():
    client = {"client_name": "ChatGPT", "redirect_uris": ["https://chatgpt.com/cb"], "metadata": {}}
    assert cap_voor(client, USER) is None
    assert scopes_na_cap(ALLE, client, USER) == ALLE


def test_expliciete_cap_wint_van_heuristiek():
    client = {
        "client_name": "Claude",
        "redirect_uris": ["https://claude.ai/cb"],
        "metadata": {"allowed_scopes": ["northsea.read"]},
    }
    assert scopes_na_cap(ALLE, client, USER) == ("northsea.read",)


def test_bestaande_token_wordt_niet_ingetrokken(tmp_path):
    store = Store(str(tmp_path / "state.db"))
    store.save_client("claude-1", "Claude.ai", ["https://claude.ai/cb"], metadata={"registered_via": "dcr"})
    token = store.issue(kind="access", client_id="claude-1", subject=USER, scopes=list(ADMIN_SEND),
                        resource=f"{PUBLIC}/mcp", ttl_s=600)
    rec = store.lookup(token, "access")
    assert rec is not None
    assert rec.client_id == "claude-1"
    assert "northsea.admin" not in rec.scopes
    assert "northsea.communications.send" not in rec.scopes
    assert "northsea.communications.draft" in rec.scopes
    # Rij staat er nog; revoke zou revoked=1 zetten.
    row = store._db.execute("select revoked, scopes from tokens where client_id=?", ("claude-1",)).fetchone()
    assert row[0] == 0
    assert "northsea.admin" in row[1]


def test_set_allowed_scopes_snijdt_zonder_revoke(tmp_path):
    store = Store(str(tmp_path / "state.db"))
    store.save_client("c1", "Other", ["https://example.com/cb"])
    token = store.issue(kind="access", client_id="c1", subject=USER, scopes=list(ALLE),
                        resource=f"{PUBLIC}/mcp", ttl_s=600)
    assert "northsea.admin" in store.lookup(token, "access").scopes
    assert store.set_allowed_scopes("c1", DRAFTS_ONLY)
    rec = store.lookup(token, "access")
    assert "northsea.admin" not in rec.scopes
    assert store._db.execute("select revoked from tokens where client_id=?", ("c1",)).fetchone()[0] == 0
