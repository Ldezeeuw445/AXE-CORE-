# Deployment

Target: the existing AXE API box **212.227.91.79** (IONOS, `api.axecompanion.com`), next to
axe-core-api. Same philosophy as the rest of AXE: systemd unit, nginx reverse proxy,
Let's Encrypt via certbot, secrets in an environment file, compare before overwrite.

Note: “STRATO” in the NorthSea material is the AI front desk (voice receptionist), not a
hosting provider. No STRATO server exists in this infrastructure.

## Layout on the box

```
/opt/northsea-mcp/
  .env            root:northsea-mcp 640 — names in deploy/env.example
  app/northsea_mcp/
  venv/           Python 3.12, requirements.txt (mcp==2.2.0)
  state/state.db  OAuth + token hashes + idempotency + rate windows (northsea-mcp user)
  backups/<utc>/  last 10 app versions
systemd: northsea-mcp.service → uvicorn 127.0.0.1:8040, 1 worker, Restart=always, hardened
nginx:   /etc/nginx/sites-available/mcp.northseacommodity.com (+ conf.d/northsea-mcp-limits.conf)
```

## First deployment

1. **DNS** (Cloudflare zone northseacommodity.com): `A  mcp  212.227.91.79`, proxy status
   **DNS only**. Verify: `dig +short mcp.northseacommodity.com` → `212.227.91.79`.
2. **Secrets** on the box: create `/opt/northsea-mcp/.env` from `deploy/env.example`.
   - `NORTHSEA_SUPABASE_SERVICE_ROLE`: AXE Commodities service-role (or secret) key — Supabase dashboard → project kbimnuepbecbyezedvih → Settings → API keys. Not present on the box or in the vault today.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `AXE_API_KEY`, `TAVILY_API_KEY`: copy from `/opt/axe-core-api/.env` on the same box (`grep` the lines into the new file; do not print them).
   - `NORTHSEA_MCP_ALLOWED_USER_IDS`: Luka's AXE Supabase user id.
3. **Install** from the Mac: `backend/northsea_mcp/deploy/deploy.sh install`
   (copies code, creates user/venv/unit, obtains the certificate, enables the vhost).
4. **Verify**: `curl -s https://mcp.northseacommodity.com/health` and the discovery commands in CHATGPT_MCP_CONNECTION.md; `/ready` with an admin service token shows supabase/audit/crewai/research checks.

## Updates

```bash
backend/northsea_mcp/deploy/deploy.sh check     # what would change on the box
backend/northsea_mcp/deploy/deploy.sh deploy    # backup → rsync → pip → restart → health; auto-rollback on failure
backend/northsea_mcp/deploy/deploy.sh rollback  # restore the latest backup
```

Always run the test suite first (TESTING.md). A deploy restarts only `northsea-mcp`;
axe-core-api is untouched.

## Resource impact

One uvicorn worker, typically < 120 MB RSS, capped at 512 MB by systemd. The box has
7.8 GB RAM and 165 GB free disk (measured 15 Sep 2026).
