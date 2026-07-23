from .base import ok, err, now_iso
from .http_client import get_client
from datetime import datetime, timezone

NAME = "intel"
TTL = 120


async def fetch():
    try:
        c = get_client()
        items = []
        # USGS significant earthquakes (week)
        r = await c.get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson")
        r.raise_for_status()
        eq = r.json()
        for f in (eq.get("features") or [])[:50]:
            p = f.get("properties") or {}
            g = (f.get("geometry") or {}).get("coordinates") or [None, None, None]
            items.append({
                "id": f"intel_eq_{f.get('id')}", "layer": "intel", "source": "usgs",
                "title": p.get("title"), "magnitude": p.get("mag"), "place": p.get("place"),
                "lon": g[0], "lat": g[1], "depth_km": g[2], "url": p.get("url"),
                "category": "earthquake",
                "ts": datetime.fromtimestamp((p.get("time") or 0)/1000, tz=timezone.utc).isoformat() if p.get("time") else now_iso(),
            })
        # CISA KEV - latest cyber vulns
        try:
            r2 = await c.get("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json")
            r2.raise_for_status()
            kev = r2.json()
            for v in (kev.get("vulnerabilities") or [])[-30:]:
                items.append({
                    "id": f"intel_cve_{v.get('cveID')}", "layer": "intel", "source": "cisa-kev",
                    "title": f"{v.get('cveID')} — {v.get('vulnerabilityName')}",
                    "vendor": v.get("vendorProject"), "product": v.get("product"),
                    "date_added": v.get("dateAdded"), "due_date": v.get("dueDate"),
                    "ransomware_use": v.get("knownRansomwareCampaignUse"),
                    "category": "cyber-vuln", "ts": now_iso(),
                })
        except Exception:
            pass
        return ok(items)
    except Exception as e:
        return err(f"intel: {e}")
