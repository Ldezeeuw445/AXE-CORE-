"""OAuth 2.1 voor de NorthSea MCP: de autorisatieserver die ChatGPT verwacht.

## Waarom zelf, en waarom zo klein

De MCP Python SDK (2.x) is alleen resource server: hij controleert tokens, hij
geeft ze niet uit. ChatGPT verbindt met OAuth (Client ID Metadata Documents
aanbevolen, Dynamic Client Registration ondersteund). Een externe IdP inrichten
zou een tweede accountsysteem naast AXE betekenen. Dus: een minimale, strikte
autorisatieserver op dezelfde origin, met als LOGIN het bestaande AXE-account
(Supabase Auth van AXE Companion) en een allowlist van gebruikers-ids.

## Wat wel en niet ondersteund wordt (bewust)

- Alleen `authorization_code` met PKCE S256, en `refresh_token` met rotatie.
  Geen implicit, geen password grant, geen `plain` PKCE.
- Publieke clients (`token_endpoint_auth_method=none`). Het geheim zit in PKCE en
  in de login van Luka, niet in een client secret dat in een app zit.
- Clients: dynamisch geregistreerd (RFC 7591) of een https-URL als client_id
  (CIMD): dan wordt dat metadata-document opgehaald en moet het naar zichzelf
  verwijzen.
- Tokens zijn opaak (willekeurig), alleen als hash bewaard (store.py), gebonden
  aan deze resource (RFC 8707).

## De loginpagina

Engels (UI), geen JavaScript, strikte CSP, geen framing. Een mislukte login zegt
niet OF het account bestaat. Pogingen per IP begrensd.
"""
from __future__ import annotations

import base64
import hashlib
import html
import ipaddress
import json
import secrets
import socket
import threading
import time
from dataclasses import dataclass
from urllib.parse import urlencode, urlparse

import httpx
from mcp.server.auth.provider import AccessToken, TokenVerifier
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from .config import Settings
from .policy import DEFAULT_SCOPES, SCOPES
from .store import Store

HOOG_RISICO = ("northsea.communications.send", "northsea.admin", "northsea.identity")
LOGIN_WINDOW_S, LOGIN_MAX = 600, 8
REGISTER_WINDOW_S, REGISTER_MAX = 3600, 20
PENDING_TTL_S = 600


def _no_store(resp: Response) -> Response:
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["Pragma"] = "no-cache"
    return resp


def _oauth_error(error: str, description: str, status: int = 400) -> Response:
    return _no_store(JSONResponse({"error": error, "error_description": description}, status_code=status))


def client_ip(request: Request) -> str:
    # nginx zet X-Real-IP; direct verkeer (tests) valt terug op de socket.
    return (request.headers.get("x-real-ip") or (request.client.host if request.client else "") or "unknown")[:64]


def pkce_ok(verifier: str, challenge: str) -> bool:
    if not (43 <= len(verifier) <= 128):
        return False
    digest = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return secrets.compare_digest(digest, challenge)


def redirect_allowed(uri: str) -> bool:
    try:
        p = urlparse(uri)
    except ValueError:
        return False
    if p.fragment:
        return False
    if p.scheme == "https" and p.hostname:
        return True
    # Loopback voor lokale clients (RFC 8252); nooit een ander http-adres.
    return p.scheme == "http" and p.hostname in ("127.0.0.1", "localhost", "::1")


def _public_https(url: str) -> bool:
    """Voor CIMD: alleen publieke https-hosts ophalen (geen SSRF naar de box zelf)."""
    p = urlparse(url)
    if p.scheme != "https" or not p.hostname or p.port not in (None, 443):
        return False
    try:
        for info in socket.getaddrinfo(p.hostname, 443):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
    except (socket.gaierror, ValueError):
        return False
    return True


@dataclass
class Pending:
    client_id: str
    client_name: str
    redirect_uri: str
    state: str | None
    code_challenge: str
    scopes: list[str]
    resource: str
    created: float


class NorthSeaTokenVerifier(TokenVerifier):
    def __init__(self, store: Store):
        self.store = store

    async def verify_token(self, token: str) -> AccessToken | None:
        rec = self.store.lookup(token, ("access", "service"))
        if not rec:
            return None
        return AccessToken(token=token, client_id=rec.client_id, scopes=list(rec.scopes), expires_at=rec.expires_at,
                           resource=rec.resource, subject=rec.subject)


class OAuthServer:
    def __init__(self, settings: Settings, store: Store, http: httpx.AsyncClient | None = None):
        self.s = settings
        self.store = store
        self.http = http or httpx.AsyncClient(timeout=10)
        self._pending: dict[str, Pending] = {}
        self._lock = threading.Lock()

    # ── Metadata ──────────────────────────────────────────────────────────────
    def as_metadata(self) -> dict:
        i = self.s.issuer
        return {
            "issuer": i,
            "authorization_endpoint": f"{i}/oauth/authorize",
            "token_endpoint": f"{i}/oauth/token",
            "registration_endpoint": f"{i}/oauth/register",
            "revocation_endpoint": f"{i}/oauth/revoke",
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code", "refresh_token"],
            "code_challenge_methods_supported": ["S256"],
            "token_endpoint_auth_methods_supported": ["none"],
            "revocation_endpoint_auth_methods_supported": ["none"],
            "scopes_supported": list(SCOPES),
            "client_id_metadata_document_supported": True,
            "service_documentation": f"{i}/",
        }

    def resource_metadata(self) -> dict:
        return {
            "resource": self.s.resource_url,
            "authorization_servers": [self.s.issuer],
            "scopes_supported": list(SCOPES),
            "bearer_methods_supported": ["header"],
            "resource_name": "NorthSea Commodity Partners MCP",
        }

    async def well_known_as(self, request: Request) -> Response:
        return JSONResponse(self.as_metadata(), headers={"Cache-Control": "public, max-age=300"})

    async def well_known_resource(self, request: Request) -> Response:
        return JSONResponse(self.resource_metadata(), headers={"Cache-Control": "public, max-age=300"})

    # ── Registratie (RFC 7591) ────────────────────────────────────────────────
    async def register(self, request: Request) -> Response:
        ok, _, _ = self.store.hit(f"register:{client_ip(request)}", REGISTER_WINDOW_S, REGISTER_MAX)
        if not ok:
            return _oauth_error("slow_down", "Too many registrations from this address.", 429)
        try:
            body = await request.json()
        except (ValueError, json.JSONDecodeError):
            return _oauth_error("invalid_client_metadata", "Body must be JSON.")
        if not isinstance(body, dict):
            return _oauth_error("invalid_client_metadata", "Body must be a JSON object.")
        uris = body.get("redirect_uris")
        if not isinstance(uris, list) or not uris or len(uris) > 10 or not all(isinstance(u, str) and redirect_allowed(u) for u in uris):
            return _oauth_error("invalid_redirect_uri", "redirect_uris must be 1-10 https (or loopback http) URLs without fragments.")
        methode = body.get("token_endpoint_auth_method", "none")
        if methode != "none":
            return _oauth_error("invalid_client_metadata", "Only public clients (token_endpoint_auth_method=none) with PKCE are supported.")
        for g in body.get("grant_types") or ["authorization_code"]:
            if g not in ("authorization_code", "refresh_token"):
                return _oauth_error("invalid_client_metadata", f"Unsupported grant type {g}.")
        naam = str(body.get("client_name") or "Unnamed MCP client")[:100]
        client_id = f"nsc_{secrets.token_urlsafe(18)}"
        self.store.save_client(client_id, naam, uris, "none", None, {"registered_via": "dcr", "ip": client_ip(request)})
        return _no_store(JSONResponse({
            "client_id": client_id, "client_id_issued_at": int(time.time()), "client_name": naam,
            "redirect_uris": uris, "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
            "token_endpoint_auth_method": "none", "scope": " ".join(SCOPES),
        }, status_code=201))

    async def _client(self, client_id: str) -> dict | None:
        bestaand = self.store.get_client(client_id)
        if bestaand:
            return bestaand
        if not client_id.startswith("https://") or not _public_https(client_id):
            return None
        try:
            r = await self.http.get(client_id, headers={"Accept": "application/json"}, follow_redirects=False)
        except httpx.HTTPError:
            return None
        if r.status_code != 200 or len(r.content) > 64_000:
            return None
        try:
            doc = r.json()
        except ValueError:
            return None
        uris = doc.get("redirect_uris") if isinstance(doc, dict) else None
        if doc.get("client_id") != client_id or not isinstance(uris, list) or not all(isinstance(u, str) and redirect_allowed(u) for u in uris):
            return None
        naam = str(doc.get("client_name") or urlparse(client_id).hostname)[:100]
        self.store.save_client(client_id, naam, uris, "none", None, {"registered_via": "cimd"})
        return self.store.get_client(client_id)

    # ── Autoriseren ──────────────────────────────────────────────────────────
    def _scopes_from(self, raw: str | None) -> list[str]:
        gevraagd = [s for s in (raw or "").split() if s in SCOPES]
        return gevraagd or list(DEFAULT_SCOPES)

    async def authorize_get(self, request: Request) -> Response:
        q = request.query_params
        client = await self._client(q.get("client_id", ""))
        if not client:
            return self._page("Unknown client", "<p>This application is not registered with NorthSea.</p>", status=400)
        redirect_uri = q.get("redirect_uri", "")
        if redirect_uri not in client["redirect_uris"]:
            return self._page("Invalid redirect", "<p>The redirect address does not match this application.</p>", status=400)
        state = q.get("state")

        def terug(error: str, desc: str) -> Response:
            params = {"error": error, "error_description": desc, "iss": self.s.issuer}
            if state:
                params["state"] = state
            return RedirectResponse(f"{redirect_uri}{'&' if '?' in redirect_uri else '?'}{urlencode(params)}", status_code=302)

        if q.get("response_type") != "code":
            return terug("unsupported_response_type", "Only response_type=code is supported.")
        challenge = q.get("code_challenge", "")
        if q.get("code_challenge_method") != "S256" or not (43 <= len(challenge) <= 128):
            return terug("invalid_request", "PKCE with code_challenge_method=S256 is required.")
        resource = q.get("resource") or self.s.resource_url
        if resource.rstrip("/") not in (self.s.resource_url, self.s.issuer):
            return terug("invalid_target", "Unknown resource.")
        pid = secrets.token_urlsafe(24)
        with self._lock:
            self._opruimen()
            self._pending[pid] = Pending(client["client_id"], client.get("client_name") or client["client_id"], redirect_uri,
                                         state, challenge, self._scopes_from(q.get("scope")), self.s.resource_url, time.time())
        return self._consent(pid, self._pending[pid])

    def _opruimen(self) -> None:
        grens = time.time() - PENDING_TTL_S
        for k in [k for k, v in self._pending.items() if v.created < grens]:
            self._pending.pop(k, None)

    async def authorize_post(self, request: Request) -> Response:
        form = await request.form()
        pid = str(form.get("request_id") or "")
        with self._lock:
            self._opruimen()
            p = self._pending.get(pid)
        if not p:
            return self._page("Request expired", "<p>This sign-in request expired. Start the connection again from your application.</p>", status=400)

        def terug(params: dict) -> Response:
            params = {**params, "iss": self.s.issuer}
            if p.state:
                params["state"] = p.state
            with self._lock:
                self._pending.pop(pid, None)
            return RedirectResponse(f"{p.redirect_uri}{'&' if '?' in p.redirect_uri else '?'}{urlencode(params)}", status_code=302)

        if form.get("decision") == "deny":
            return terug({"error": "access_denied", "error_description": "The user denied access."})
        ok, _, _ = self.store.hit(f"login:{client_ip(request)}", LOGIN_WINDOW_S, LOGIN_MAX)
        if not ok:
            return self._consent(pid, p, error="Too many sign-in attempts. Wait ten minutes and try again.", status=429)
        email = str(form.get("email") or "").strip()[:254]
        wachtwoord = str(form.get("password") or "")[:512]
        gekozen = [s for s in form.getlist("scope") if s in p.scopes and s in SCOPES]
        if not gekozen:
            return self._consent(pid, p, error="Select at least one permission.")
        subject = await self._login(email, wachtwoord)
        if not subject:
            return self._consent(pid, p, error="Sign-in failed. Check your AXE account email and password.", status=401)
        code = secrets.token_urlsafe(32)
        self.store.save_code(code, client_id=p.client_id, redirect_uri=p.redirect_uri, code_challenge=p.code_challenge,
                             scopes=gekozen, resource=p.resource, subject=subject, ttl_s=self.s.auth_code_ttl_s)
        return terug({"code": code})

    async def _login(self, email: str, wachtwoord: str) -> str | None:
        """Supabase Auth van AXE Companion; alleen ids op de allowlist komen erin."""
        if not email or not wachtwoord:
            return None
        try:
            r = await self.http.post(f"{self.s.axe_url}/auth/v1/token", params={"grant_type": "password"},
                                     headers={"apikey": self.s.axe_key, "Content-Type": "application/json"},
                                     json={"email": email, "password": wachtwoord})
        except httpx.HTTPError:
            return None
        if r.status_code != 200:
            return None
        uid = ((r.json() or {}).get("user") or {}).get("id")
        return uid if isinstance(uid, str) and uid in self.s.allowed_user_ids else None

    # ── Token ─────────────────────────────────────────────────────────────────
    async def token(self, request: Request) -> Response:
        form = await request.form()
        grant = form.get("grant_type")
        client_id = str(form.get("client_id") or "")
        client = await self._client(client_id) if client_id else None
        if not client:
            return _oauth_error("invalid_client", "Unknown client.", 401)
        if grant == "authorization_code":
            code = self.store.consume_code(str(form.get("code") or ""))
            if not code or code["client_id"] != client["client_id"]:
                return _oauth_error("invalid_grant", "The authorization code is invalid, expired or already used.")
            if str(form.get("redirect_uri") or "") != code["redirect_uri"]:
                return _oauth_error("invalid_grant", "redirect_uri does not match the authorization request.")
            if not pkce_ok(str(form.get("code_verifier") or ""), code["code_challenge"]):
                return _oauth_error("invalid_grant", "PKCE verification failed.")
            res = form.get("resource")
            if res and str(res).rstrip("/") not in (self.s.resource_url, self.s.issuer):
                return _oauth_error("invalid_target", "Unknown resource.")
            return self._issue(client["client_id"], code["subject"], code["scopes"], family=None)
        if grant == "refresh_token":
            rec = self.store.rotate_refresh(str(form.get("refresh_token") or ""))
            if not rec or rec.client_id != client["client_id"]:
                return _oauth_error("invalid_grant", "The refresh token is invalid, expired, revoked or already used.")
            scopes = list(rec.scopes)
            if form.get("scope"):
                smaller = [s for s in str(form["scope"]).split() if s in rec.scopes]
                if not smaller:
                    return _oauth_error("invalid_scope", "Requested scope exceeds the original grant.")
                scopes = smaller
            return self._issue(client["client_id"], rec.subject, scopes, family=rec.family)
        return _oauth_error("unsupported_grant_type", "Supported: authorization_code, refresh_token.")

    def _issue(self, client_id: str, subject: str, scopes: list[str], family: str | None) -> Response:
        family = family or secrets.token_hex(8)
        access = self.store.issue(kind="access", client_id=client_id, subject=subject, scopes=scopes,
                                  resource=self.s.resource_url, ttl_s=self.s.access_token_ttl_s, family=family)
        refresh = self.store.issue(kind="refresh", client_id=client_id, subject=subject, scopes=scopes,
                                   resource=self.s.resource_url, ttl_s=self.s.refresh_token_ttl_s, family=family)
        return _no_store(JSONResponse({"access_token": access, "token_type": "Bearer", "expires_in": self.s.access_token_ttl_s,
                                       "refresh_token": refresh, "scope": " ".join(scopes)}))

    async def revoke(self, request: Request) -> Response:
        form = await request.form()
        token = str(form.get("token") or "")
        if token:
            self.store.revoke(token)
        return _no_store(Response(status_code=200))  # RFC 7009: altijd 200

    # ── HTML ──────────────────────────────────────────────────────────────────
    def _page(self, title: str, inner: str, status: int = 200, redirect_uri: str | None = None) -> Response:
        doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} · NorthSea MCP</title><style>
:root{{color-scheme:light dark;--bg:#0b1017;--card:#121a24;--line:#243142;--text:#e6edf3;--muted:#8b98a7;--accent:#c08a4f;--danger:#f87171}}
@media (prefers-color-scheme: light){{:root{{--bg:#f3f5f6;--card:#fff;--line:#d9dde1;--text:#17202b;--muted:#5b6672;--accent:#8b5b2c;--danger:#b42318}}}}
body{{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:32px 16px}}
main{{max-width:520px;margin:0 auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}}
h1{{font-size:19px;margin:0 0 4px}} .brand{{letter-spacing:.14em;font-size:11px;color:var(--accent);font-weight:700}}
p.muted,small{{color:var(--muted)}} label{{display:block;margin:12px 0 4px;font-size:13px;color:var(--muted)}}
input[type=email],input[type=password]{{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:9px;border:1px solid var(--line);background:transparent;color:var(--text);font-size:15px}}
fieldset{{border:1px solid var(--line);border-radius:10px;margin:16px 0;padding:8px 14px}} legend{{font-size:13px;color:var(--muted);padding:0 6px}}
.scope{{display:flex;gap:10px;align-items:flex-start;margin:8px 0}} .scope code{{font-size:12px}} .risk{{color:var(--danger);font-size:12px}}
.row{{display:flex;gap:10px;margin-top:18px}} button{{flex:1;padding:11px;border-radius:9px;border:1px solid var(--line);background:transparent;color:var(--text);font-size:15px;cursor:pointer}}
button.primary{{background:var(--accent);border-color:var(--accent);color:#fff}} .err{{color:var(--danger);margin:10px 0}}
button:focus-visible,input:focus-visible{{outline:2px solid var(--accent);outline-offset:2px}}
</style></head><body><main><div class="brand">NORTHSEA COMMODITY PARTNERS</div>{inner}</main></body></html>"""
        resp = HTMLResponse(doc, status_code=status)
        # form-action geldt in Chromium ook voor de 302 ná het posten: zonder de (al tegen de
        # registratie gecontroleerde) redirect-origin blijft de login hangen en komt de code nooit aan.
        form_action = "'self'"
        if redirect_uri:
            u = urlparse(redirect_uri)
            if u.scheme in ("https", "http") and u.netloc:
                form_action += f" {u.scheme}://{u.netloc}"
        resp.headers["Content-Security-Policy"] = f"default-src 'none'; style-src 'unsafe-inline'; form-action {form_action}; frame-ancestors 'none'; base-uri 'none'"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        return _no_store(resp)

    def _consent(self, pid: str, p: Pending, error: str | None = None, status: int = 200) -> Response:
        host = urlparse(p.redirect_uri).hostname or p.redirect_uri
        rijen = []
        for s in p.scopes:
            risico = s in HOOG_RISICO
            rijen.append(
                f'<div class="scope"><input type="checkbox" name="scope" value="{html.escape(s)}" id="s_{html.escape(s)}"'
                f'{"" if risico else " checked"}><label for="s_{html.escape(s)}" style="margin:0;color:inherit">'
                f'<code>{html.escape(s)}</code><br><small>{html.escape(SCOPES[s])}</small>'
                f'{"<br><span class=risk>High impact — tick only if this app must do this.</span>" if risico else ""}</label></div>')
        inner = f"""<h1>Connect {html.escape(p.client_name)}</h1>
<p class="muted">This application wants access to the NorthSea MCP. After approval it will return you to <strong>{html.escape(host)}</strong>.</p>
{f'<p class="err" role="alert">{html.escape(error)}</p>' if error else ''}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="request_id" value="{html.escape(pid)}">
<fieldset><legend>Permissions</legend>{''.join(rijen)}</fieldset>
<label for="email">AXE account email</label><input id="email" name="email" type="email" autocomplete="username" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<p><small>Only authorised NorthSea operators can sign in. Nothing is sent without a human approval.</small></p>
<div class="row"><button type="submit" name="decision" value="deny" formnovalidate>Deny</button>
<button class="primary" type="submit" name="decision" value="allow">Sign in and allow</button></div>
</form>"""
        return self._page(f"Connect {p.client_name}", inner, status=status, redirect_uri=p.redirect_uri)
