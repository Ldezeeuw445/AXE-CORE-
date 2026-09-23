# NorthSea Commodity Partners — Remote MCP

The secured remote MCP interface for NorthSea inside AXE CORE. It gives AXE CORE,
authorised ChatGPT connections and future clients the same NorthSea capabilities
over one HTTPS endpoint, without a second backend, database, task system or
business-logic copy.

```
ChatGPT / AXE CORE / other MCP client
        │  HTTPS, OAuth 2.1 (PKCE) or scoped service token
        ▼
NorthSea Remote MCP  (this package, /mcp — thin handlers, policy, audit)
        ▼
NorthSeaService      (northsea_mcp/service.py — the shared service layer)
        ├─ AXE Commodities (Supabase) via typed PostgREST repository
        ├─ send-approved-reply edge function (the only send path)
        ├─ AXE research: /research/perplexity (shared budget) + Tavily
        └─ CrewAI boundary: /crew/run on axe-core-api (depth=deep only)
```

| | |
|---|---|
| Production URL (planned) | `https://mcp.northseacommodity.com/mcp` |
| Transport | MCP Streamable HTTP (stateless, JSON responses), spec 2026-07-28 via `mcp` 2.2.0 |
| Auth | OAuth 2.1 authorization code + PKCE S256 (DCR and CIMD); scoped service tokens |
| Host | IONOS API box `212.227.91.79`, systemd unit `northsea-mcp`, nginx + Let's Encrypt |
| Tools | 10 core + 4 controlled write tools — see [docs/TOOLS.md](docs/TOOLS.md) |

## Documentation

- [ARCHITECTURE](docs/ARCHITECTURE.md) — layers, what is reused, what is deliberately not built
- [TOOLS](docs/TOOLS.md) — every tool, inputs, outputs, side effects
- [AUTH](docs/AUTH.md) and [PERMISSIONS](docs/PERMISSIONS.md) — OAuth, tokens, scopes, identity policy, approvals
- [CHATGPT_MCP_CONNECTION](docs/CHATGPT_MCP_CONNECTION.md) — connecting ChatGPT
- [CREWAI_INTEGRATION](docs/CREWAI_INTEGRATION.md) and [AXE_CORE_INTEGRATION](docs/AXE_CORE_INTEGRATION.md)
- [DEPLOYMENT](docs/DEPLOYMENT.md), [OPERATIONS](docs/OPERATIONS.md), [SECURITY](docs/SECURITY.md), [TESTING](docs/TESTING.md)

## Develop and test

```bash
cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/northsea_mcp
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt pytest pytest-asyncio
.venv/bin/python -m pytest -q
```
