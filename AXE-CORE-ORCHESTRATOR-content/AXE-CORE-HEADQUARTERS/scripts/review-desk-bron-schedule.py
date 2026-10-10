#!/usr/bin/env python3
"""
Zet de Review Desk-bronworker op de bestaande scheduler (core_schedules): één rij, herhaalbaar op job_key.

Uurlijks van 08:07 tot 20:07 Amsterdam, uitvoerder 'mac' (de sleutels staan in de kluis op de Mac). Een run zonder
autorisatie eindigt als 'skipped' en telt niet als mislukking, dus de job zet zichzelf niet uit.

Draai dit pas nadat de lokale API de nieuwe code draait (anders weigert de Mac-uitvoerder het action_type en loopt
de job na vijf fouten zichzelf uit):   curl -s localhost:8001/review-desk/limits   moet dan JSON geven.

Gebruik:  python3 scripts/review-desk-bron-schedule.py            (maakt of werkt bij, AAN)
          python3 scripts/review-desk-bron-schedule.py --uit      (zet uit; verwijdert niets)
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

JOB_KEY = "axe-review-desk-sources"
ENV = os.path.join(os.path.dirname(__file__), "..", "backend", "axe_api", ".env.local")


def env() -> dict:
    uit = dict(os.environ)
    try:
        for r in open(ENV, encoding="utf-8"):
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", r.strip())
            if m:
                uit.setdefault(m.group(1), m.group(2).strip().strip('"'))
    except OSError:
        pass
    return uit


def main() -> int:
    e = env()
    url, key = e.get("SUPABASE_URL", "").rstrip("/"), e.get("SUPABASE_SERVICE_ROLE", "")
    if not url or not key:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE ontbreken (backend/axe_api/.env.local).")
        return 2
    aan = "--uit" not in sys.argv
    kop = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "return=representation"}

    def req(methode, pad, body=None):
        r = urllib.request.Request(url + "/rest/v1/" + pad, method=methode, headers=kop, data=json.dumps(body).encode() if body is not None else None)
        with urllib.request.urlopen(r, timeout=30) as x:
            return json.load(x)

    rij = {
        "name": "Review Desk: bronnen lezen (Gmail, Sites, Stripe, Metricool)", "job_key": JOB_KEY, "app": "axe_core", "executor": "mac",
        "action_type": "review_desk", "action_payload": {}, "cron_expr": "7 8-20 * * *", "timezone": "Europe/Amsterdam",
        "enabled": aan, "max_runtime_s": 600,
        "description": "Leest de vier bronnen van het privérapport axe_website_review_desk_v1, ontdubbelt en werkt het rapport bij met CAS. "
                       "Geen AI voor lege controles; verzendt niets. Zie docs/REVIEW-DESK-BRONNEN.md.",
    }
    bestaand = req("GET", "core_schedules?" + urllib.parse.urlencode({"job_key": f"eq.{JOB_KEY}", "select": "id,enabled"}))
    if bestaand:
        patch = {k: v for k, v in rij.items() if k not in ("job_key",)}
        uit = req("PATCH", "core_schedules?" + urllib.parse.urlencode({"id": f"eq.{bestaand[0]['id']}"}), patch)
        print(f"Bijgewerkt: {JOB_KEY} enabled={aan}")
    else:
        from datetime import datetime, timezone
        rij["next_run_at"] = datetime.now(timezone.utc).isoformat()
        uit = req("POST", "core_schedules", rij)
        print(f"Aangemaakt: {JOB_KEY} enabled={aan}")
    print("volgende run:", (uit[0] or {}).get("next_run_at") if uit else "?")
    return 0


if __name__ == "__main__":
    sys.exit(main())
