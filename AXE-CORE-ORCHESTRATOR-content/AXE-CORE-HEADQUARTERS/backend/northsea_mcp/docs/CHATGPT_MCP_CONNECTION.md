# Connecting ChatGPT to the NorthSea MCP

ChatGPT connects to a **remote HTTPS** MCP endpoint. Localhost is not a valid path
for ChatGPT.

## 1. Remote MCP URL

```
https://mcp.northseacommodity.com/mcp
```

(Live once DEPLOYMENT.md steps 1–4 are done: DNS record, box secrets, install, health check.)

## 2. Auth type

**OAuth** (OAuth 2.1, authorization code + PKCE S256). ChatGPT discovers everything
from the server: dynamic client registration and Client ID Metadata Documents are both
supported. You sign in with your AXE account on the NorthSea consent page.

## 3. Scopes

Recommended for ChatGPT: `northsea.read`, `northsea.deal.read`, `northsea.research`,
`northsea.communications.draft`. Add `northsea.identity` only if ChatGPT should see
real company and contact names. Add `northsea.deal.write` for tasks. Keep
`northsea.communications.send` and `northsea.admin` unticked unless you explicitly
want ChatGPT to send approved emails or approve drafts.

## 4. Tools

`northsea_review_deal`, `northsea_get_next_actions`, `northsea_qualify_opportunity`,
`northsea_assess_match`, `northsea_process_reply`, `northsea_research_counterparty`,
`northsea_find_suppliers`, `northsea_find_buyers`, `northsea_investigate_blockers`,
`northsea_prepare_outreach`, `northsea_create_task`, `northsea_update_task`,
`northsea_approve_draft`, `northsea_send_approved_communication`.

## 5. Read-only tools

review_deal, get_next_actions, qualify_opportunity, assess_match, process_reply,
research_counterparty, find_suppliers, find_buyers, investigate_blockers (research
tools spend budget but write nothing), prepare_outreach without saving.

## 6. Tools that may write

prepare_outreach with `save_as_pending_draft=true` (pending draft), create_task,
update_task, approve_draft, send_approved_communication.

## 7. Tools that need approval

send_approved_communication (the draft must already be approved by a human, plus
`confirm=true`), approve_draft (is the human approval, admin scope). ChatGPT also asks
you to confirm write actions in the conversation; the server enforces its own rules
regardless.

## 8. Test commands

```bash
curl -s https://mcp.northseacommodity.com/health
curl -s https://mcp.northseacommodity.com/.well-known/oauth-protected-resource/mcp
curl -s https://mcp.northseacommodity.com/.well-known/oauth-authorization-server
curl -si -X POST https://mcp.northseacommodity.com/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -5
```

Expected: `{"status":"ok",...}`, resource metadata naming the issuer, AS metadata with
`code_challenge_methods_supported: ["S256"]`, and `HTTP/2 401` with a
`www-authenticate` header containing `resource_metadata=`.

With a service token (from OPERATIONS.md), using the official SDK:

```python
import asyncio, httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

async def main(token):
    http = httpx2.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=60)
    async with Client(streamable_http_client("https://mcp.northseacommodity.com/mcp", http_client=http)) as c:
        print([t.name for t in (await c.list_tools()).tools])

asyncio.run(main(input("token: ")))
```

## 9. Expected handshake and discovery

1. ChatGPT calls `/mcp` without a token and gets `401` + `resource_metadata`.
2. It reads `/.well-known/oauth-protected-resource/mcp` → authorization server = `https://mcp.northseacommodity.com`.
3. It reads `/.well-known/oauth-authorization-server`, registers (or uses a CIMD client id).
4. Your browser opens `/oauth/authorize`: tick scopes, sign in with your AXE account, Allow.
5. ChatGPT exchanges the code (PKCE) at `/oauth/token`, then lists 14 tools.

## 10. Connection steps in ChatGPT

Custom MCP apps require a plan/workspace that allows them; on Business/Enterprise an
admin may need to enable developer mode or custom apps first. Menu labels change over
time; the path at the time of writing:

1. ChatGPT → **Settings** → **Security and login** (or **Apps & Connectors**) → turn on **Developer mode**.
2. **Settings** → **Apps & Connectors** → **Create** (add a custom app / connector).
3. Name: `NorthSea Commodity Partners`. Description: `NorthSea deal review, qualification, research and approval-controlled communications`.
4. MCP server URL: `https://mcp.northseacommodity.com/mcp` (the `/mcp` path is required).
5. Authentication: **OAuth**. Leave client id/secret empty so ChatGPT registers itself.
6. Accept the warning for custom apps, click **Create**, then **Connect**: the NorthSea consent page opens. Tick scopes, sign in with your AXE account, **Sign in and allow**.
7. In a new chat, enable the NorthSea app (developer mode / tools menu) and ask: “Review deal DEAL-001 and tell me what blocks execution.”

## 11. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Connector creation fails “could not reach server” | DNS not set or not “DNS only”; certificate missing — check `curl https://mcp.northseacommodity.com/health` |
| Sign-in page says “Sign-in failed” | wrong AXE credentials, or your Supabase user id is not in `NORTHSEA_MCP_ALLOWED_USER_IDS` |
| Tools listed but every call says `insufficient_scope` | the scope was not ticked on the consent page — disconnect and reconnect with the right scopes |
| `rate_limited` | per-principal limit (PERMISSIONS.md); wait the stated seconds |
| research returns `budget_exhausted` | shared Perplexity daily budget on axe-core-api is spent; resets 00:00 UTC |
| repeated sign-in prompts | refresh token was revoked (reuse detection or manual revoke) — reconnect |
| `upstream_error` | AXE Commodities unreachable or the service key rotated — check `/ready` with an admin token |

## 12. Revocation

- In ChatGPT: Settings → Apps & Connectors → NorthSea → Disconnect/Delete.
- On the server (all tokens of that connection):
  ```bash
  sudo -u northsea-mcp env $(grep -v '^#' /opt/northsea-mcp/.env | xargs) /opt/northsea-mcp/venv/bin/python -m northsea_mcp.admin list
  sudo -u northsea-mcp env $(grep -v '^#' /opt/northsea-mcp/.env | xargs) /opt/northsea-mcp/venv/bin/python -m northsea_mcp.admin revoke-client --client-id <client_id>
  ```
- Emergency: remove the user id from `NORTHSEA_MCP_ALLOWED_USER_IDS` and `systemctl restart northsea-mcp` (no new sign-ins), then revoke clients.
