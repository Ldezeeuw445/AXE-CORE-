"""VESSEL adapter — trading-intel focused.

- Pulls live AIS positions from Finnish Digitraffic (Baltic + N Sea coverage)
- Enriches MMSIs against curated HIGH_IMPACT_VESSELS registry
- Returns BOTH live items AND the full high-impact watchlist (with last-known
  status if matched in the live feed). UI can show 'WATCHLIST' panel where the
  operator scans the high-impact universe.
"""
from .base import ok, err, now_iso
from services.http import get_client
from data.vessels_registry import HIGH_IMPACT_VESSELS, BY_MMSI, sector_summary

NAME = "vessel"
TTL = 30

# Type code -> human + category. AIS shipType is an integer.
SHIPTYPE_MAP = {
    20: ("WIG", "Other"),
    30: ("Fishing", "Fishing"),
    31: ("Tug", "Service"),
    32: ("Tug", "Service"),
    33: ("Dredger", "Service"),
    36: ("Sailing", "Pleasure"),
    37: ("Pleasure Craft", "Pleasure"),
    40: ("High-Speed", "Other"),
    50: ("Pilot Vessel", "Service"),
    51: ("SAR", "Service"),
    52: ("Tug", "Service"),
    60: ("Passenger", "Cruise/Passenger"),
    70: ("Cargo", "Cargo"),
    71: ("Hazard A Cargo", "Cargo"),
    72: ("Hazard B Cargo", "Cargo"),
    73: ("Hazard C Cargo", "Cargo"),
    74: ("Hazard D Cargo", "Cargo"),
    80: ("Tanker", "Tanker"),
    81: ("Hazard A Tanker", "Tanker"),
    82: ("Hazard B Tanker", "Tanker"),
    83: ("Hazard C Tanker", "Tanker"),
    84: ("Hazard D Tanker", "Tanker"),
}


def _classify(t):
    if t is None: return ("Unknown", "Other")
    return SHIPTYPE_MAP.get(t, (f"Type {t}", "Other"))


async def fetch():
    try:
        c = get_client()
        # Pull positions and metadata in parallel
        # Locations
        r1 = await c.get("https://meri.digitraffic.fi/api/ais/v1/locations",
                        headers={"Accept-Encoding": "gzip"})
        r1.raise_for_status()
        loc_data = r1.json()
        feats = loc_data.get("features") or []
        # Vessel metadata (names, ship types, sizes)
        meta = {}
        try:
            r2 = await c.get("https://meri.digitraffic.fi/api/ais/v1/vessels",
                            headers={"Accept-Encoding": "gzip"})
            r2.raise_for_status()
            md = r2.json() or []
            for v in md:
                m = v.get("mmsi") if isinstance(v, dict) else None
                if m:
                    meta[m] = v
        except Exception:
            pass

        items = []
        cargo_count = 0
        tanker_count = 0
        cruise_count = 0
        registry_hits = []

        for f in feats[:800]:
            g = (f.get("geometry") or {}).get("coordinates") or [None, None]
            p = f.get("properties") or {}
            mmsi = f.get("mmsi")
            md = meta.get(mmsi) or {}
            ship_type_int = md.get("shipType")
            tname, tcat = _classify(ship_type_int)
            if tcat == "Cargo": cargo_count += 1
            elif tcat == "Tanker": tanker_count += 1
            elif tcat == "Cruise/Passenger": cruise_count += 1
            registry = BY_MMSI.get(mmsi)
            item = {
                "id": f"vessel_{mmsi}",
                "ts": now_iso(),
                "source": "digitraffic",
                "layer": "vessel",
                "mmsi": mmsi,
                "lon": g[0], "lat": g[1],
                "sog": p.get("sog"),
                "cog": p.get("cog"),
                "heading": p.get("heading"),
                "nav_status": p.get("navStat"),
                "name": md.get("name"),
                "callsign": md.get("callSign"),
                "flag": md.get("shipFlag"),
                "length": md.get("shipLength"),
                "width": md.get("shipWidth"),
                "draught": md.get("draught"),
                "destination": md.get("destination"),
                "eta": md.get("eta"),
                "ship_type": ship_type_int,
                "ship_type_name": tname,
                "category": tcat,
            }
            if registry:
                item.update({
                    "is_registry_match": True,
                    "impact_name": registry.get("name"),
                    "impact_type": registry.get("type"),
                    "operator": registry.get("operator"),
                    "sector": registry.get("sector"),
                    "ticker": registry.get("ticker"),
                    "notes": registry.get("notes"),
                    "dwt": registry.get("dwt"),
                    "teu": registry.get("teu"),
                })
                registry_hits.append(mmsi)
            items.append(item)

        # Build a 'watchlist' view of the registry with live status
        live_mmsi = {x["mmsi"] for x in items if x.get("is_registry_match")}
        watchlist = []
        for v in HIGH_IMPACT_VESSELS:
            live = v["mmsi"] in live_mmsi
            position = next((x for x in items if x["mmsi"] == v["mmsi"]), None) if live else None
            watchlist.append({
                "mmsi": v["mmsi"], "name": v["name"], "type": v["type"],
                "operator": v["operator"], "flag": v.get("flag"),
                "dwt": v.get("dwt"), "teu": v.get("teu"),
                "sector": v["sector"], "ticker": v.get("ticker"),
                "notes": v.get("notes"),
                "live": live,
                "position": ({"lat": position["lat"], "lon": position["lon"], "sog": position["sog"]} if position else None),
            })

        sectors = sector_summary()
        return ok(items, {
            "chokepoints": 9,
            "total_seen": len(feats),
            "cargo_count": cargo_count,
            "tanker_count": tanker_count,
            "cruise_count": cruise_count,
            "registry_hits": len(registry_hits),
            "registry_size": len(HIGH_IMPACT_VESSELS),
            "watchlist": watchlist,
            "sector_summary": sectors,
        })
    except Exception as e:
        return err(f"vessel: {e}")
