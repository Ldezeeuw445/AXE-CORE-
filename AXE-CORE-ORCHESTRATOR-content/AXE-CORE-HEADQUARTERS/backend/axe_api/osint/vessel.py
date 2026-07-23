"""VESSEL adapter — trading-intel focused.

Combines TWO live AIS sources:
1. Finnish Digitraffic (Baltic + N Sea) — anchor data, very high density there.
2. AISStream.io global WebSocket feed — Bloomberg-grade global coverage,
   especially for our HIGH_IMPACT_VESSELS registry (operating worldwide).

Enriches all MMSIs against the curated HIGH_IMPACT_VESSELS registry and
returns BOTH live items AND the full registry watchlist (with last-known
status if matched in either feed).
"""
from .base import ok, err, now_iso
from .http_client import get_client
from . import aisstream
from .registry_vessels import HIGH_IMPACT_VESSELS, BY_MMSI, sector_summary

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
    items: list[dict] = []
    cargo_count = 0
    tanker_count = 0
    cruise_count = 0
    registry_hits: list[int] = []
    seen_mmsi: set[int] = set()
    digitraffic_count = 0
    aisstream_count = 0
    digitraffic_error: str | None = None

    # ---------- 1) Digitraffic (Baltic) ----------
    try:
        c = get_client()
        r1 = await c.get(
            "https://meri.digitraffic.fi/api/ais/v1/locations",
            headers={"Accept-Encoding": "gzip"},
        )
        r1.raise_for_status()
        loc_data = r1.json()
        feats = loc_data.get("features") or []
        meta = {}
        try:
            r2 = await c.get(
                "https://meri.digitraffic.fi/api/ais/v1/vessels",
                headers={"Accept-Encoding": "gzip"},
            )
            r2.raise_for_status()
            md = r2.json() or []
            for v in md:
                m = v.get("mmsi") if isinstance(v, dict) else None
                if m:
                    meta[m] = v
        except Exception:
            pass

        for f in feats[:800]:
            g = (f.get("geometry") or {}).get("coordinates") or [None, None]
            p = f.get("properties") or {}
            mmsi = f.get("mmsi")
            if mmsi is None:
                continue
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
            seen_mmsi.add(mmsi)
            digitraffic_count += 1
    except Exception as e:
        digitraffic_error = f"digitraffic: {e}"

    # ---------- 2) AISStream.io global ----------
    try:
        global_snap = aisstream.get_global_snapshot(limit=900, prefer_registry=True)
        for rec in global_snap:
            mmsi = rec.get("mmsi")
            if mmsi is None or mmsi in seen_mmsi:
                continue
            ship_type_int = rec.get("ship_type")
            tname, tcat = _classify(ship_type_int)
            if tcat == "Cargo": cargo_count += 1
            elif tcat == "Tanker": tanker_count += 1
            elif tcat == "Cruise/Passenger": cruise_count += 1
            item = {
                "id": rec.get("id") or f"vessel_ais_{mmsi}",
                "ts": rec.get("ts") or now_iso(),
                "source": "aisstream",
                "layer": "vessel",
                "mmsi": mmsi,
                "lon": rec.get("lon"),
                "lat": rec.get("lat"),
                "sog": rec.get("sog"),
                "cog": rec.get("cog"),
                "heading": rec.get("heading"),
                "nav_status": rec.get("nav_status"),
                "name": rec.get("name"),
                "callsign": rec.get("callsign"),
                "flag": rec.get("flag"),
                "length": rec.get("length"),
                "width": rec.get("width"),
                "destination": rec.get("destination"),
                "imo": rec.get("imo"),
                "ship_type": ship_type_int,
                "ship_type_name": tname,
                "category": tcat,
            }
            if rec.get("is_registry_match"):
                item.update({
                    "is_registry_match": True,
                    "impact_name": rec.get("impact_name"),
                    "impact_type": rec.get("impact_type"),
                    "operator": rec.get("operator"),
                    "sector": rec.get("sector"),
                    "ticker": rec.get("ticker"),
                    "notes": rec.get("notes"),
                    "dwt": rec.get("dwt"),
                    "teu": rec.get("teu"),
                })
                registry_hits.append(mmsi)
            items.append(item)
            seen_mmsi.add(mmsi)
            aisstream_count += 1
    except Exception:
        # AISStream is best-effort enrichment; never let it break the adapter
        pass

    # ---------- 3) Build registry watchlist with live status ----------
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
            "position": (
                {"lat": position["lat"], "lon": position["lon"], "sog": position["sog"],
                 "source": position.get("source")} if position else None
            ),
        })

    if not items and digitraffic_error:
        return err(digitraffic_error)

    ais_stats = aisstream.stats()
    return ok(items, {
        "chokepoints": 9,
        "total_seen": digitraffic_count + aisstream_count,
        "digitraffic_count": digitraffic_count,
        "aisstream_count": aisstream_count,
        "aisstream_running": ais_stats.get("running"),
        "aisstream_msg_count": ais_stats.get("msg_count"),
        "cargo_count": cargo_count,
        "tanker_count": tanker_count,
        "cruise_count": cruise_count,
        "registry_hits": len(registry_hits),
        "registry_size": len(HIGH_IMPACT_VESSELS),
        "watchlist": watchlist,
        "sector_summary": sector_summary(),
    })
