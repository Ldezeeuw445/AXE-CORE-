# Authentication

The MCP is never anonymous. `/mcp` requires a bearer token; without one the server
answers `401` with `WWW-Authenticate: Bearer ... resource_metadata="https://mcp.northseacommodity.com/.well-known/oauth-protected-resource/mcp"`.

## Two token types

| Type | Who | How obtained | Lifetime |
|---|---|---|---|
| OAuth access + refresh | ChatGPT and other interactive clients | OAuth 2.1 authorization code + PKCE | access 1 h; refresh 30 d, rotated on every use |
| Service token | AXE CORE and other server clients | `python -m northsea_mcp.admin issue` on the box | default 90 days |

Tokens are opaque random strings (`nsat_`, `nsrt_`, `nsst_`). Only their SHA-256 hash
is stored. Every token is bound to the resource `https://mcp.northseacommodity.com/mcp`
and rejected elsewhere (`validate_token_resource`).

## OAuth 2.1 authorization server (same origin)

| Endpoint | Standard |
|---|---|
| `/.well-known/oauth-protected-resource/mcp` (+ root variant) | RFC 9728 |
| `/.well-known/oauth-authorization-server` (also `/.well-known/openid-configuration`) | RFC 8414 |
| `/oauth/register` | RFC 7591 dynamic client registration (public clients only) |
| `/oauth/authorize` | authorization code, PKCE **S256 only**, `resource` (RFC 8707) |
| `/oauth/token` | `authorization_code`, `refresh_token` (rotation, reuse revokes the family) |
| `/oauth/revoke` | RFC 7009 |

Client ID Metadata Documents are supported: an `https://` `client_id` is fetched
(public hosts only, 64 KB max, must name itself and list its redirect URIs).

### Login and consent

`/oauth/authorize` shows a consent page: the client name, the redirect host, and the
requested scopes. High-impact scopes (`northsea.communications.send`,
`northsea.admin`, `northsea.identity`) are unticked by default. The user signs in
with their **AXE account** (Supabase Auth of AXE Companion). Only user ids in
`NORTHSEA_MCP_ALLOWED_USER_IDS` receive a code. Wrong credentials and non-allowlisted
accounts get the same message. Sign-in attempts are limited per IP (8 per 10 min in
the app, plus nginx `limit_req` on `/oauth/`).

The password goes to Supabase Auth over TLS and is never stored or logged.

## Service tokens

```bash
sudo -u northsea-mcp env $(grep -v '^#' /opt/northsea-mcp/.env | xargs) \
  /opt/northsea-mcp/venv/bin/python -m northsea_mcp.admin issue --label axe-core \
  --scopes northsea.read,northsea.deal.read,northsea.research,northsea.communications.draft
```

The token prints once. Put it straight into the client's secret store. See
OPERATIONS.md for listing, rotation and revocation.
