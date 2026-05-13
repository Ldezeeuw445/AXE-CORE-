from .base import ok, err, now_iso
from services.http import get_client

NAME = "vessel"
TTL = 30


async def fetch():
    try:
        c = get_client()
        r = await c.get(
            "https://meri.digitraffic.fi/api/ais/v1/locations",
            headers={"Accept-Encoding": "gzip"},
        )
        r.raise_for_status()
        data = r.json()
        feats = data.get("features") or []
        items = []
        for f in feats[:600]:
            g = (f.get("geometry") or {}).get("coordinates") or [None, None]
            p = f.get("properties") or {}
            items.append({
                "id": f"vessel_{f.get('mmsi')}", "ts": now_iso(),
                "source": "digitraffic", "layer": "vessel",
                "mmsi": f.get("mmsi"), "lon": g[0], "lat": g[1],
                "sog": p.get("sog"), "cog": p.get("cog"),
                "heading": p.get("heading"), "nav_status": p.get("navStat"),
            })
        return ok(items, {"chokepoints": 9, "total_seen": len(feats)})
    except Exception as e:
        return err(f"vessel: {e}")
