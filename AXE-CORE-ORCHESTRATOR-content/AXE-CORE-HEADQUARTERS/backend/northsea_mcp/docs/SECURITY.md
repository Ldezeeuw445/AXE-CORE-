# Security

## Threats and controls

| Threat | Control |
|---|---|
| Anonymous access | `/mcp` requires bearer; 401 with discovery metadata |
| Token theft from disk | only SHA-256 hashes stored; tokens bound to this resource; short access TTL; refresh rotation with reuse detection |
| Over-privileged clients | per-tool scopes; high-impact scopes unticked by default on consent |
| Unauthorised sign-in | AXE account via Supabase Auth + user-id allowlist; per-IP attempt limit; uniform failure message |
| OAuth code interception | PKCE S256 mandatory; single-use codes (5 min); exact redirect URI match; `iss` returned |
| Malicious client registration | public clients only; https/loopback redirect URIs; registration rate limit; consent shows redirect host |
| SSRF via CIMD | only public https hosts, no redirects, 64 KB limit |
| DNS rebinding / foreign Host | transport security host and origin allowlist |
| Clickjacking / XSS on consent page | CSP `default-src 'none'`, `frame-ancestors 'none'`, no JavaScript, HTML-escaped values |
| Injection via tool arguments | UUID validation before any filter; no SQL strings; PostgREST params only; Pydantic input schemas with length limits |
| Data leakage to non-identity callers | structured redaction + free-text masking (names, name cores, distinctive words, domains, emails, phones); own-domain sources dropped |
| Leaking internals in errors | stable error codes; no stack traces, keys or query text; request id for correlation |
| Unsafe outbound email | single send path (edge function); approved draft + confirm + scope; sensitive rule; idempotency on three levels |
| Cost abuse | research rate limits per principal + shared server-side Perplexity budget |
| Denial of service | nginx body limit 1 MB and OAuth `limit_req`; app body limit 256 KB; per-risk timeouts; systemd memory cap |
| Audit gaps | every call audited including denials; local fallback queue if `core_audit_log` is unreachable; secrets/emails/bodies scrubbed |

## Secrets

- Never in git, logs, tool results or chat. `.env` on the box only, mode 640.
- `admin issue` prints a service token once to the operator's terminal.
- Rotation of provider keys (Supabase, Tavily, Perplexity, AXE API) is done by Luka in the
  respective consoles; the server reads them at start (restart after rotation).

## Known limits

- Rate limits and idempotency live in one SQLite file: correct for the single-worker service;
  do not scale workers without moving them to shared storage.
- Free-text redaction is pattern-based. It covers names on record, but a research answer can
  mention an unrelated third party by name; that party is not a NorthSea counterparty.
- Web candidates in `find_suppliers/find_buyers` show names only with `northsea.identity`.
