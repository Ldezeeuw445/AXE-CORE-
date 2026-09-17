# NorthSea — integration hold (17 Sep 2026)

`feat/northsea-p2-mail-gtc` is **integration-ready**. It waits for the controlled
AXE Foundation integration pass. It is not `orchestrator`.

Do **not**: merge to `orchestrator`, deploy MCP/edge, start `axe_api` on the
iMac, approve/reject drafts, or send mail.

Mac mini `axe_api` down (`:8001` refused, Caddy `:8443` empty 502) is a
runtime/integration issue, not a reason for a second brain on the iMac.

Operational snapshot: **17 Sep 2026, 21:27 CEST** (last successful
`GET /northsea/*`). Inbox JSON and the exact operational backlog are on this
machine only:

`AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/.local/northsea-snapshot-2026-09-17/`

Resume from that backlog after the integrated Mac mini runtime is healthy.
