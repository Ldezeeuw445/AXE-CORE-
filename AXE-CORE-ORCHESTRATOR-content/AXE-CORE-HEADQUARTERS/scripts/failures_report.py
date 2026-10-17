#!/usr/bin/env python3
"""Huidige failures per bron, leesbaar, zonder writes.

Draai op de Mac (service role staat daar, niet in deze cloud-agent):

    cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
    python3 scripts/failures_report.py

Leest SUPABASE_URL + SUPABASE_SERVICE_ROLE uit de omgeving of .env.
Geen sends, geen orders, geen geld.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

HQ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HQ / "backend" / "axe_api"))

from taak_fout import taak_fout  # noqa: E402


def laad_env() -> None:
    for pad in (HQ / ".env", HQ / "backend" / "axe_api" / ".env", Path.home() / ".axe" / "env"):
        if not pad.is_file():
            continue
        for regel in pad.read_text(encoding="utf-8").splitlines():
            if not regel.strip() or regel.strip().startswith("#") or "=" not in regel:
                continue
            k, _, v = regel.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def bronnen_uit(rijen: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Pure omzetting: testbaar zonder database."""
    uit: list[dict[str, Any]] = []
    for t in rijen.get("core_tasks") or []:
        fout = taak_fout(t.get("error"), str(t.get("title") or ""))
        uit.append({
            "bron": "core_tasks",
            "id": t.get("id"),
            "titel": t.get("title"),
            "assignee": t.get("assignee"),
            "capability": t.get("capability"),
            "status": t.get("status"),
            "regel": fout["regel"],
            "actie": fout["actie"],
            "updated_at": t.get("updated_at"),
        })
    for s in rijen.get("core_schedules") or []:
        fout = taak_fout(s.get("last_result") or s.get("last_status"), str(s.get("name") or ""))
        if int(s.get("consecutive_failures") or 0) <= 0 and str(s.get("last_status") or "") in ("ok", "skipped", ""):
            continue
        uit.append({
            "bron": "core_schedules",
            "id": s.get("id"),
            "titel": s.get("name"),
            "status": s.get("last_status"),
            "regel": fout["regel"] or f"Schedule failed {s.get('consecutive_failures')}x",
            "actie": "retry",
            "updated_at": s.get("last_run_at"),
        })
    for st in rijen.get("core_coding_seats") or []:
        if st.get("logged_in") is False:
            uit.append({
                "bron": "seats",
                "id": st.get("seat_id") or st.get("id"),
                "titel": st.get("label") or st.get("seat_id"),
                "regel": "This account is logged out. Reconnect it in Settings → Seats.",
                "actie": "reconnect",
            })
        elif st.get("rate_limited"):
            uit.append({
                "bron": "seats",
                "id": st.get("seat_id") or st.get("id"),
                "titel": st.get("label") or st.get("seat_id"),
                "regel": "This seat hit its usage limit. Retry after it cools, or reconnect another seat.",
                "actie": "retry",
            })
    return uit


def haal(db: Any, sinds: str) -> dict[str, list[dict[str, Any]]]:
    taken = (db.table("core_tasks")
             .select("id,title,status,assignee,capability,error,updated_at")
             .eq("status", "failed")
             .gte("updated_at", sinds)
             .order("updated_at", desc=True)
             .limit(80)
             .execute().data) or []
    roosters = (db.table("core_schedules")
                .select("id,name,last_status,last_result,consecutive_failures,last_run_at,enabled")
                .eq("enabled", True)
                .limit(80)
                .execute().data) or []
    stoelen = (db.table("core_coding_seats")
               .select("id,seat_id,label,logged_in,rate_limited,last_limit_message")
               .limit(40)
               .execute().data) or []
    return {"core_tasks": taken, "core_schedules": roosters, "core_coding_seats": stoelen}


def main() -> int:
    laad_env()
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE", "").strip()
    if not url or not key:
        print("failures_report: SUPABASE_URL of SUPABASE_SERVICE_ROLE ontbreekt.", file=sys.stderr)
        return 2
    from supabase import create_client
    db = create_client(url, key)
    sinds = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    rijen = haal(db, sinds)
    meldingen = bronnen_uit(rijen)
    groepen: dict[str, list[dict[str, Any]]] = {}
    for m in meldingen:
        groepen.setdefault(m["bron"], []).append(m)
    print(json.dumps({"sinds": sinds, "aantal": len(meldingen), "per_bron": {
        k: len(v) for k, v in groepen.items()
    }, "failures": meldingen}, indent=2, default=str))
    if not meldingen:
        print("geen failures in de laatste 24 uur", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
