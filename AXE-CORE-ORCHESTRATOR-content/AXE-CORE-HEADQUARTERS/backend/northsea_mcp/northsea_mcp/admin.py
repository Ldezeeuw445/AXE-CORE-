"""Beheer van service-tokens en OAuth-verbindingen, op de box zelf.

    python -m northsea_mcp.admin issue --label axe-core --scopes northsea.read,northsea.deal.read
    python -m northsea_mcp.admin list
    python -m northsea_mcp.admin revoke --label axe-core
    python -m northsea_mcp.admin revoke-client --client-id nsc_...

`issue` print het token één keer op stdout. Het wordt nergens bewaard behalve als
hash, en het staat dus ook niet in een log. Zet het direct in de omgeving van de
client (bijv. AXE CORE) en sluit de terminal.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

from .policy import INTERNAL_SCOPES, SCOPES
from .store import Store


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="northsea_mcp.admin")
    sub = p.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("issue", help="Issue a service token (prints once)")
    i.add_argument("--label", required=True)
    i.add_argument("--scopes", required=True, help="Comma-separated")
    i.add_argument("--subject", default=None)
    i.add_argument("--days", type=int, default=90, help="Expiry in days (0 = never; not recommended)")
    r = sub.add_parser("revoke", help="Revoke all tokens with a label")
    r.add_argument("--label", required=True)
    rc = sub.add_parser("revoke-client", help="Revoke all tokens of an OAuth client (e.g. a ChatGPT connection)")
    rc.add_argument("--client-id", required=True)
    sub.add_parser("list", help="List service and refresh tokens (no secrets)")
    a = p.parse_args(argv)

    public = os.environ.get("NORTHSEA_MCP_PUBLIC_URL", "").rstrip("/")
    db = os.environ.get("NORTHSEA_MCP_STATE_DB", "/opt/northsea-mcp/state.db")
    store = Store(db)

    if a.cmd == "issue":
        if not public:
            print("NORTHSEA_MCP_PUBLIC_URL is not set", file=sys.stderr)
            return 2
        scopes = [s.strip() for s in a.scopes.split(",") if s.strip()]
        onbekend = [s for s in scopes if s not in SCOPES and s not in INTERNAL_SCOPES]
        if onbekend or not scopes:
            print(f"Unknown scopes: {', '.join(onbekend) or '(none given)'}", file=sys.stderr)
            return 2
        token = store.issue(kind="service", client_id=f"service:{a.label}", subject=a.subject or f"service:{a.label}",
                            scopes=scopes, resource=f"{public}/mcp", ttl_s=a.days * 86400 if a.days else None, label=a.label)
        print(token)
        return 0
    if a.cmd == "revoke":
        print(f"revoked {store.revoke_label(a.label)} token(s)")
        return 0
    if a.cmd == "revoke-client":
        print(f"revoked {store.revoke_client(a.client_id)} token(s)")
        return 0
    for t in store.list_tokens():
        exp = datetime.fromtimestamp(t["expires_at"], timezone.utc).isoformat() if t["expires_at"] else "never"
        print(f"{t['kind']:8} {t['label'] or '-':16} client={t['client_id']:28} scopes={t['scopes']} "
              f"expires={exp} revoked={bool(t['revoked'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
