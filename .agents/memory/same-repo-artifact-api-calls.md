---
name: Same-repo artifact-to-artifact calls
description: How a web artifact should call another artifact's backend (e.g. an api-server) living in the same repl.
---

When one artifact (e.g. a React/Vite frontend) needs to call another artifact's backend service in the same repl, and that backend is registered with `previewPath`/`paths` like `/api`, the platform's shared path-based proxy already routes any `/api/*` browser request straight to that service — including WebSocket upgrade requests.

**Why:** This is different from calling an *external* third-party API (which goes through the project's Vite dev-proxy entries like `/proxy/anthropic`) or from local dev where you might reach for `localhost:<port>` or `$REPLIT_DEV_DOMAIN`. Hardcoding a host/port for an in-repo service breaks in the proxied preview and in production.

**How to apply:** From frontend code, just fetch/WebSocket to `/api/...` (same-origin, protocol-aware `ws:`/`wss:` based on `location.protocol` for sockets). Reserve `$REPLIT_DEV_DOMAIN` and `localhost` for manual shell-side curl/debugging only, never inside app code.
