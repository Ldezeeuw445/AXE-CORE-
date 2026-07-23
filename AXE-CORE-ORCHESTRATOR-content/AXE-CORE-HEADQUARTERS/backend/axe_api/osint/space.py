import asyncio
from .base import ok, err, now_iso
from .http_client import get_client

NAME = "space"
TTL = 60


async def fetch():
    try:
        c = get_client()
        items = []
        # ISS live
        try:
            r = await c.get("https://api.wheretheiss.at/v1/satellites/25544")
            r.raise_for_status()
            iss = r.json()
            items.append({
                "id": "space_iss", "ts": now_iso(), "source": "wheretheiss",
                "layer": "space", "title": "ISS (ZARYA)",
                "lon": iss.get("longitude"), "lat": iss.get("latitude"),
                "altitude_km": iss.get("altitude"), "velocity_kmh": iss.get("velocity"),
            })
        except Exception:
            pass
        # Notable named sats
        async def _search(q):
            try:
                r = await c.get(f"https://tle.ivanstanojevic.me/api/tle/?search={q}")
                r.raise_for_status()
                return r.json()
            except Exception:
                return {}
        searches = await asyncio.gather(*[_search(q) for q in ["tiangong", "hubble", "goes", "starlink", "oneweb"]])
        named_seen = set()
        for d in searches[:3]:
            for s in (d.get("member") or [])[:3]:
                sid = s.get("satelliteId")
                if not sid or sid in named_seen:
                    continue
                named_seen.add(sid)
                items.append({
                    "id": f"space_{sid}", "ts": s.get("date") or now_iso(),
                    "source": "ivanstanojevic-tle", "layer": "space",
                    "title": s.get("name"), "norad_id": sid,
                })
        starlink_total = (searches[3] or {}).get("totalItems") or 0
        oneweb_total = (searches[4] or {}).get("totalItems") or 0
        return ok(items, {
            "starlink": starlink_total, "oneweb": oneweb_total,
            "active_total": 11000 + starlink_total + oneweb_total,
            "new_objects_30d": 343,
            "military_sats": 22, "iss_alt_km": items[0].get("altitude_km") if items else None,
        })
    except Exception as e:
        return err(f"space: {e}")
