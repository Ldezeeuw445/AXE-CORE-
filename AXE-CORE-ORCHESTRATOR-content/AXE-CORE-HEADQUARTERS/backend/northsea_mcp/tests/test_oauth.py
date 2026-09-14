"""OAuth 2.1: registratie, PKCE, login op het AXE-account met allowlist, rotatie en intrekking."""
from __future__ import annotations

import base64
import hashlib
import re
import secrets
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from conftest import PUBLIC, USER
from northsea_mcp.oauth import NorthSeaTokenVerifier, pkce_ok, redirect_allowed
from northsea_mcp.server import create_app

REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect"
PASSWORD = "correct horse battery staple"


def supabase_auth(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/auth/v1/token"):
        body = request.read().decode()
        if '"luka@example.com"' in body and PASSWORD in body:
            return httpx.Response(200, json={"access_token": "x", "user": {"id": USER}})
        if '"other@example.com"' in body:
            return httpx.Response(200, json={"access_token": "x", "user": {"id": "not-on-allowlist"}})
        return httpx.Response(400, json={"error": "invalid_grant"})
    return httpx.Response(404)


@pytest.fixture
def oauth_app(settings, repo, research, crew, store, auditor):
    http = httpx.AsyncClient(transport=httpx.MockTransport(supabase_auth))
    return create_app(settings, repo=repo, research=research, crew=crew, store=store, auditor=auditor, http=http)


def client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=PUBLIC, follow_redirects=False)


def pkce():
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


async def register(h) -> str:
    r = await h.post("/oauth/register", json={"client_name": "ChatGPT", "redirect_uris": [REDIRECT], "token_endpoint_auth_method": "none"})
    assert r.status_code == 201, r.text
    return r.json()["client_id"]


async def authorize(h, client_id, challenge, *, email="luka@example.com", password=PASSWORD, scopes=None, state="st-123"):
    q = {"response_type": "code", "client_id": client_id, "redirect_uri": REDIRECT, "code_challenge": challenge,
         "code_challenge_method": "S256", "state": state, "scope": " ".join(scopes or ["northsea.read", "northsea.deal.read", "northsea.identity"]),
         "resource": f"{PUBLIC}/mcp"}
    page = await h.get("/oauth/authorize", params=q)
    assert page.status_code == 200 and "Sign in and allow" in page.text
    assert "frame-ancestors 'none'" in page.headers["content-security-policy"]
    rid = re.search(r'name="request_id" value="([^"]+)"', page.text).group(1)
    form = {"request_id": rid, "email": email, "password": password, "decision": "allow",
            "scope": ["northsea.read", "northsea.deal.read", "northsea.identity"]}
    return page, await h.post("/oauth/authorize", data=form)


async def test_full_authorization_code_flow_with_pkce_and_rotation(oauth_app, store):
    verifier, challenge = pkce()
    async with client(oauth_app) as h:
        cid = await register(h)
        page, r = await authorize(h, cid, challenge)
        # hoog-risico-scope staat NIET standaard aangevinkt
        assert re.search(r'value="northsea.identity" id="s_northsea.identity">', page.text)
        assert r.status_code == 302
        loc = urlparse(r.headers["location"])
        q = parse_qs(loc.query)
        assert loc.netloc == "chatgpt.com" and q["state"] == ["st-123"] and q["iss"] == [PUBLIC]
        code = q["code"][0]

        bad = await h.post("/oauth/token", data={"grant_type": "authorization_code", "code": code, "client_id": cid,
                                                  "redirect_uri": REDIRECT, "code_verifier": "x" * 50})
        assert bad.status_code == 400 and bad.json()["error"] == "invalid_grant"

        # de code is na één poging (ook een foute) verbruikt
        again = await h.post("/oauth/token", data={"grant_type": "authorization_code", "code": code, "client_id": cid,
                                                    "redirect_uri": REDIRECT, "code_verifier": verifier})
        assert again.status_code == 400

        _, r2 = await authorize(h, cid, challenge)
        code2 = parse_qs(urlparse(r2.headers["location"]).query)["code"][0]
        tok = await h.post("/oauth/token", data={"grant_type": "authorization_code", "code": code2, "client_id": cid,
                                                  "redirect_uri": REDIRECT, "code_verifier": verifier, "resource": f"{PUBLIC}/mcp"})
        assert tok.status_code == 200 and tok.headers["cache-control"] == "no-store"
        t = tok.json()
        assert t["token_type"] == "Bearer" and set(t["scope"].split()) == {"northsea.read", "northsea.deal.read", "northsea.identity"}

        verified = await NorthSeaTokenVerifier(store).verify_token(t["access_token"])
        assert verified and verified.subject == USER and verified.resource == f"{PUBLIC}/mcp"

        rot = await h.post("/oauth/token", data={"grant_type": "refresh_token", "refresh_token": t["refresh_token"], "client_id": cid})
        assert rot.status_code == 200
        new = rot.json()
        # hergebruik van het oude refresh-token trekt de hele familie in
        reuse = await h.post("/oauth/token", data={"grant_type": "refresh_token", "refresh_token": t["refresh_token"], "client_id": cid})
        assert reuse.status_code == 400
        assert await NorthSeaTokenVerifier(store).verify_token(new["access_token"]) is None


async def test_wrong_password_and_non_allowlisted_user_get_no_code(oauth_app):
    _, challenge = pkce()
    async with client(oauth_app) as h:
        cid = await register(h)
        _, r = await authorize(h, cid, challenge, password="wrong")
        assert r.status_code == 401 and "Sign-in failed" in r.text
        _, r2 = await authorize(h, cid, challenge, email="other@example.com")
        assert r2.status_code == 401 and "code=" not in r2.headers.get("location", "")


async def test_login_attempts_are_rate_limited(oauth_app):
    _, challenge = pkce()
    async with client(oauth_app) as h:
        cid = await register(h)
        codes = []
        for _ in range(9):
            _, r = await authorize(h, cid, challenge, password="wrong")
            codes.append(r.status_code)
    assert codes[-1] == 429


async def test_redirect_mismatch_and_missing_pkce_are_refused(oauth_app):
    async with client(oauth_app) as h:
        cid = await register(h)
        r = await h.get("/oauth/authorize", params={"response_type": "code", "client_id": cid, "redirect_uri": "https://evil.example/cb",
                                                   "code_challenge": "a" * 43, "code_challenge_method": "S256"})
        assert r.status_code == 400
        r2 = await h.get("/oauth/authorize", params={"response_type": "code", "client_id": cid, "redirect_uri": REDIRECT,
                                                    "code_challenge": "a" * 43, "code_challenge_method": "plain", "state": "s"})
        assert r2.status_code == 302 and "invalid_request" in r2.headers["location"]


async def test_deny_returns_access_denied(oauth_app):
    _, challenge = pkce()
    async with client(oauth_app) as h:
        cid = await register(h)
        page = await h.get("/oauth/authorize", params={"response_type": "code", "client_id": cid, "redirect_uri": REDIRECT,
                                                      "code_challenge": challenge, "code_challenge_method": "S256", "state": "s1"})
        rid = re.search(r'name="request_id" value="([^"]+)"', page.text).group(1)
        r = await h.post("/oauth/authorize", data={"request_id": rid, "decision": "deny"})
    assert r.status_code == 302 and "error=access_denied" in r.headers["location"] and "state=s1" in r.headers["location"]


async def test_registration_rejects_confidential_and_non_https_clients(oauth_app):
    async with client(oauth_app) as h:
        a = await h.post("/oauth/register", json={"redirect_uris": ["http://evil.example/cb"]})
        b = await h.post("/oauth/register", json={"redirect_uris": [REDIRECT], "token_endpoint_auth_method": "client_secret_basic"})
    assert a.status_code == 400 and b.status_code == 400


async def test_revocation(oauth_app, store):
    token = store.issue(kind="access", client_id="c", subject=USER, scopes=["northsea.read"], resource=f"{PUBLIC}/mcp", ttl_s=600)
    async with client(oauth_app) as h:
        r = await h.post("/oauth/revoke", data={"token": token})
    assert r.status_code == 200
    assert await NorthSeaTokenVerifier(store).verify_token(token) is None


def test_pkce_and_redirect_helpers():
    v, c = pkce()
    assert pkce_ok(v, c) and not pkce_ok(v + "x", c) and not pkce_ok("short", c)
    assert redirect_allowed(REDIRECT) and redirect_allowed("http://127.0.0.1:8765/cb")
    assert not redirect_allowed("http://example.com/cb") and not redirect_allowed("https://x.example/cb#frag")
