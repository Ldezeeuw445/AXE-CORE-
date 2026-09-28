# Operations

All commands run on the box as root unless noted. `ENV` below means:
`sudo -u northsea-mcp env $(grep -v '^#' /opt/northsea-mcp/.env | xargs)`.

## Health

| Endpoint | Public | Returns |
|---|---|---|
| `GET /health` | yes | `{"status":"ok","version":...}` — process alive |
| `GET /ready` | yes | `{"ready": true/false}` — 503 when not ready |
| `GET /ready` + `Authorization: Bearer <token with northsea.admin>` | no | checks: state_store, supabase, audit, crewai, research_perplexity, research_search; flushes pending audit rows |
| `GET /version` | yes | name, version, MCP endpoint |

Ready requires: state store, AXE Commodities reachable, `core_audit_log` reachable.

## Service

```bash
systemctl status northsea-mcp
journalctl -u northsea-mcp -n 200 --no-pager
systemctl restart northsea-mcp
```

## Tokens

```bash
ENV /opt/northsea-mcp/venv/bin/python -m northsea_mcp.admin list
ENV /opt/northsea-mcp/venv/bin/python -m northsea_mcp.admin issue --label axe-core --scopes northsea.read,northsea.deal.read --days 90
ENV /opt/northsea-mcp/venv/bin/python -m northsea_mcp.admin revoke --label axe-core
ENV /opt/northsea-mcp/venv/bin/python -m northsea_mcp.admin revoke-client --client-id nsc_...
```

Rotation of a service token: issue a new one with a new label, update the client, revoke the
old label.

## Audit

Every call writes `core_audit_log` (AXE Companion) with `action = northsea_mcp.<tool>`,
`resource = northsea/<entity ids>`, `performed_by = <user id or service label>`, and details:
request_id, client_id, tool, risk, entity_ids, decision, approval_state, northsea_run_id,
crewai_run_id/status, research (status/provider/calls/cost), mutations, duration_ms,
result_class, error_code, rate. If the insert fails, rows queue in `state.db` and flush on the
next authenticated `/ready`.

```sql
select created_at, action, performed_by, details->>'result_class' result, details->>'duration_ms' ms
from core_audit_log where action like 'northsea_mcp.%' order by created_at desc limit 50;
```

## Incidents

| Situation | Action |
|---|---|
| Suspected token leak | `revoke-client` / `revoke --label`; rotate affected provider keys in their consoles |
| Wrong data written | writes are only deal_tasks, deal_events, reply_drafts (pending/approved); correct in the Deal Desk; audit shows who and when |
| Email sent unexpectedly | check audit for `northsea_mcp.northsea_send_approved_communication`; the draft had to be approved first — find the approval row |
| Research costs high | lower RESEARCH limits in `server.py` or the Perplexity daily cap on axe-core-api |
| Bad deploy | `deploy.sh rollback` |

## Backups

`state.db` holds OAuth clients and token hashes only; losing it forces clients to reconnect.
Copy it with `sqlite3 /opt/northsea-mcp/state/state.db ".backup /opt/northsea-mcp/backups/state-$(date -u +%F).db"`.
