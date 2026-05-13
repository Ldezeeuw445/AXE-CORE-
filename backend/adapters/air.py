import asyncio
from .base import ok, err, now_iso
from services.http import get_client

NAME = "air"
TTL = 25

REGIONS = [
    (45, 10, 500),    # Europe
    (40, -90, 500),   # USA
    (35, 110, 500),   # East Asia
    (25, 55, 500),    # Middle East
    (-25, 135, 500),  # Australia
    (0, -60, 500),    # South America
]


async def _fetch_region(c, lat, lon, dist):
    try:
        r = await c.get(f"https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{dist}")
        r.raise_for_status()
        return r.json().get("ac") or []
    except Exception:
        return []


async def fetch():
    try:
        c = get_client()
        results = await asyncio.gather(*[_fetch_region(c, *r) for r in REGIONS])
        seen = set()
        items = []
        countries = set()
        for batch in results:
            for ac in batch[:160]:
                h = ac.get("hex")
                if not h or h in seen:
                    continue
                if ac.get("lat") is None or ac.get("lon") is None:
                    continue
                seen.add(h)
                countries.add((ac.get("r") or "")[:2])
                items.append({
                    "id": f"air_{h}", "ts": now_iso(), "source": "adsb-lol", "layer": "air",
                    "callsign": (ac.get("flight") or "").strip(), "icao24": h,
                    "registration": ac.get("r"),
                    "lat": ac.get("lat"), "lon": ac.get("lon"),
                    "altitude_ft": ac.get("alt_baro"), "speed_kt": ac.get("gs"),
                    "heading": ac.get("track"), "category": ac.get("category"),
                    "type": ac.get("t"),
                })
        items = items[:800]
        return ok(items, {"theaters": len([x for x in countries if x])})
    except Exception as e:
        return err(f"air: {e}")
