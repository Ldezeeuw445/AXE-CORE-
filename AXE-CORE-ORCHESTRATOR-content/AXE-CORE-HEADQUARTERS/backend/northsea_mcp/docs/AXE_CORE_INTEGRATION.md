# AXE CORE integration

## One record, multiple views

| NorthSea object | Record | Shown in AXE CORE |
|---|---|---|
| Deal | `opportunities` | Northsea desk (Maps tab): map, cards, deals table |
| Tasks | `deal_tasks` (+ `action_queue`) | AXE Chase rail, desk |
| Drafts and sends | `reply_drafts`, `communications` | Deal Desk approval flow |
| Events | `deal_events` | deal history |
| Audit | `core_audit_log` (AXE Companion) | same table as axe-core-api |

The MCP writes only these existing records. It creates no MCP-only tasks, calendars or deals.

## How AXE CORE calls the same capabilities

Option A (recommended, same interface as ChatGPT): a scoped **service token** against
`https://mcp.northseacommodity.com/mcp`, or `http://127.0.0.1:8040/mcp` from processes on
the same box. Issue it with label `axe-core` (OPERATIONS.md) and store it with the other
AXE secrets.

Option B (in-process, Python on the box): import the service layer.

```python
from northsea_mcp.config import Settings
from northsea_mcp.server import create_app   # or build NorthSeaService directly
from northsea_mcp.service import Caller, NorthSeaService
```

`Caller(principal=..., client_id="axe-core", scopes=frozenset({...}))` applies the same
identity redaction and approval rules as MCP clients.

## Agenda, cron, notifications

This server schedules nothing. Time-bound work stays in AXE CORE's scheduler and the
existing NorthSea automations (`resend-inbound`, `resend-lifecycle`, desk cron). A task with
`due_at` created through MCP is a `deal_tasks` row and appears wherever AXE CORE already
reads deal tasks.

## Not yet wired (explicit)

- The AXE CORE desktop app still reads NorthSea data through `backend/axe_api/northsea.py`
  via the MCP hub on the Mac (read-only). Switching the desk to call this MCP with a service
  token is a follow-up change in the app.
- AXE CORE's MCP Center can list this server as a connection once it is deployed (Streamable
  HTTP + bearer token), using the existing `mcp_hub.py` client.
