#!/usr/bin/env python3
"""Bewijs dat anon core_* niet meer leest, en dat service_role dat wel doet.

Leest alleen. Geen INSERT/UPDATE/DELETE, geen migratie. Draai ná het toepassen
van 20261028120000_core_anon_dicht.sql:

  SUPABASE_URL=https://pqnngpcgbdwxavbatbia.supabase.co \\
  SUPABASE_ANON_KEY=... \\
  SUPABASE_SERVICE_ROLE=... \\
  python3 scripts/prove_core_rls.py

Zonder SERVICE_ROLE wordt alleen anon gecontroleerd.
Exit 0 = anon geweigerd (en service_role ok als die sleutel er is).
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

TABELLEN = [
    "core_ai_state", "core_context", "core_deployments", "core_events",
    "core_integrations", "core_memory", "core_metrics", "core_models",
    "core_permissions", "core_routing", "core_services", "core_sessions",
    "core_system_logs", "core_workflows", "core_task_events",
]


def rest(url: str, tabel: str, key: str, method: str = "GET") -> tuple[int, str]:
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/{tabel}?select=id&limit=1",
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "Prefer": "count=exact",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        return exc.code, body


def anon_geweigerd(status: int, body: str) -> bool:
    if status in (401, 403, 425):
        return True
    if status == 200:
        tekst = body.strip()
        if tekst in ("[]", "null", ""):
            return False
        try:
            data = json.loads(tekst)
        except json.JSONDecodeError:
            return False
        return isinstance(data, list) and len(data) == 0
    return False


def service_ok(status: int) -> bool:
    return status == 200


def beoordeel(url: str, anon: str, service: str | None) -> list[str]:
    fouten = []
    for tabel in TABELLEN:
        status, body = rest(url, tabel, anon)
        if status == 200 and body.strip() not in ("[]", "null", ""):
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                data = body
            if isinstance(data, list) and data:
                fouten.append(f"anon LAS {tabel}: {status} ({len(data)} rijen)")
                continue
        if not anon_geweigerd(status, body) and status == 200:
            # Lege 200: RLS hield de rijen tegen, maar GRANT staat nog.
            # Na deze migratie hoort het 401 te zijn. Leeg telt als
            # "niet gelekt", maar we markeren het als zwak.
            fouten.append(f"anon {tabel}: HTTP {status} leeg — REVOKE ontbreekt nog")
        elif not anon_geweigerd(status, body):
            fouten.append(f"anon {tabel}: HTTP {status} {body[:120]}")
        if service:
            s_status, _ = rest(url, tabel, service)
            if not service_ok(s_status):
                fouten.append(f"service_role {tabel}: HTTP {s_status}")
    return fouten


def main() -> int:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    anon = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
    service = os.environ.get("SUPABASE_SERVICE_ROLE")
    if not url or not anon:
        print("SKIP: SUPABASE_URL en SUPABASE_ANON_KEY ontbreken (niet tegen live aankomen).")
        return 0
    fouten = beoordeel(url, anon, service)
    if fouten:
        print("FAIL")
        print("\n".join(fouten))
        return 1
    extra = " + service_role ok" if service else " (service_role niet gezet)"
    print(f"OK: anon geweigerd op {len(TABELLEN)} tabellen{extra}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
