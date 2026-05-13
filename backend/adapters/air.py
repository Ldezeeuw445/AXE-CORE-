"""AIR adapter — trading-intel focused.

Blends three sources:
1. /v2/ladd  — Limited Aircraft Data Display (gov/VIP/blocked)
2. /v2/pia   — Privacy ICAO Address (corporate jets, private VIP)
3. Regional /v2/lat/lon  — general airspace sample for theater counts

Enriches matches against the curated CORPORATE_JETS registry (US-first, then EU)
so the operator immediately sees: which COMPANY / TICKER / SECTOR is in the air.
"""
import asyncio
from .base import ok, err, now_iso
from services.http import get_client
from data import BY_TAIL, CORPORATE_TYPES, CORPORATE_JETS

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


def _normalize_ac(ac, source):
    """Normalize one ADS-B aircraft into our schema, with optional registry enrichment."""
    h = ac.get("hex")
    if not h:
        return None
    if ac.get("lat") is None or ac.get("lon") is None:
        return None
    reg = (ac.get("r") or "").strip().upper()
    enrich = BY_TAIL.get(reg)
    flight = (ac.get("flight") or "").strip()
    t = (ac.get("t") or "").upper()
    is_corp_type = any(t.startswith(x) for x in CORPORATE_TYPES)
    is_corporate = bool(enrich) or source in ("ladd", "pia") or is_corp_type
    base = {
        "id": f"air_{h}",
        "ts": now_iso(),
        "source": f"adsb-{source}",
        "layer": "air",
        "callsign": flight,
        "icao24": h,
        "registration": reg,
        "lat": ac.get("lat"),
        "lon": ac.get("lon"),
        "altitude_ft": ac.get("alt_baro"),
        "speed_kt": ac.get("gs"),
        "heading": ac.get("track"),
        "category": ac.get("category"),
        "type": t,
        "squawk": ac.get("squawk"),
        "is_corporate": is_corporate,
    }
    if enrich:
        base.update({
            "owner": enrich.get("owner"),
            "ticker": enrich.get("ticker"),
            "sector": enrich.get("sector"),
            "region_tag": enrich.get("region"),
            "aircraft_model": enrich.get("aircraft"),
            "notes": enrich.get("notes"),
            "is_registry_match": True,
        })
    return base


async def _fetch_general(c, lat, lon, dist):
    try:
        r = await c.get(f"https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{dist}")
        r.raise_for_status()
        return r.json().get("ac") or []
    except Exception:
        return []


async def _fetch_endpoint(c, url):
    try:
        r = await c.get(url)
        r.raise_for_status()
        return r.json().get("ac") or []
    except Exception:
        return []


async def _fetch_by_registration(c, reg):
    try:
        r = await c.get(f"https://api.adsb.lol/v2/registration/{reg}")
        r.raise_for_status()
        return r.json().get("ac") or []
    except Exception:
        return []


async def fetch():
    try:
        c = get_client()
        # Run high-value endpoints + sample of regions in parallel
        gen_jobs = [_fetch_general(c, *r) for r in REGIONS]
        ladd_job = _fetch_endpoint(c, "https://api.adsb.lol/v2/ladd")
        pia_job = _fetch_endpoint(c, "https://api.adsb.lol/v2/pia")
        mil_job = _fetch_endpoint(c, "https://api.adsb.lol/v2/mil")
        results = await asyncio.gather(*gen_jobs, ladd_job, pia_job, mil_job, return_exceptions=True)
        gen_results = results[:len(REGIONS)]
        ladd_list = results[len(REGIONS)] if not isinstance(results[len(REGIONS)], Exception) else []
        pia_list = results[len(REGIONS) + 1] if not isinstance(results[len(REGIONS) + 1], Exception) else []
        mil_list = results[len(REGIONS) + 2] if not isinstance(results[len(REGIONS) + 2], Exception) else []

        seen = set()
        all_items = []
        countries = set()

        # Corporate first (PIA + LADD)
        corporate_count = 0
        for ac in (pia_list or [])[:200]:
            it = _normalize_ac(ac, "pia")
            if not it: continue
            if it["icao24"] in seen: continue
            seen.add(it["icao24"]); corporate_count += 1
            all_items.append(it)
        for ac in (ladd_list or [])[:200]:
            it = _normalize_ac(ac, "ladd")
            if not it: continue
            if it["icao24"] in seen: continue
            seen.add(it["icao24"]); corporate_count += 1
            all_items.append(it)

        # Military (separate flag)
        mil_count = 0
        for ac in (mil_list or [])[:120]:
            it = _normalize_ac(ac, "mil")
            if not it: continue
            if it["icao24"] in seen: continue
            it["is_military"] = True
            seen.add(it["icao24"]); mil_count += 1
            all_items.append(it)

        # General regional sample for theaters / coverage
        for batch in gen_results:
            for ac in (batch or [])[:160]:
                it = _normalize_ac(ac, "region")
                if not it: continue
                if it["icao24"] in seen: continue
                seen.add(it["icao24"])
                countries.add((ac.get("r") or "")[:2])
                all_items.append(it)

        # Try direct-registration lookup for a small batch of known corp jets to catch high-value targets
        # (only ~10 per sweep to stay friendly to the API)
        prio_tails = [j["tail"] for j in CORPORATE_JETS[:25]]
        reg_results = await asyncio.gather(*[_fetch_by_registration(c, t) for t in prio_tails], return_exceptions=True)
        for tail, ac_list in zip(prio_tails, reg_results):
            if isinstance(ac_list, Exception) or not ac_list:
                continue
            for ac in ac_list:
                it = _normalize_ac(ac, "registry")
                if not it: continue
                if it["icao24"] in seen: continue
                # Force registry enrichment
                ent = BY_TAIL.get(tail)
                if ent:
                    it.update({
                        "owner": ent.get("owner"),
                        "ticker": ent.get("ticker"),
                        "sector": ent.get("sector"),
                        "region_tag": ent.get("region"),
                        "aircraft_model": ent.get("aircraft"),
                        "is_registry_match": True,
                    })
                seen.add(it["icao24"])
                all_items.append(it)

        # Cap output
        all_items = all_items[:900]

        registry_hits = sum(1 for x in all_items if x.get("is_registry_match"))
        return ok(all_items, {
            "theaters": len([x for x in countries if x]),
            "corporate_count": corporate_count,
            "military_count": mil_count,
            "registry_hits": registry_hits,
            "registry_size": len(CORPORATE_JETS),
        })
    except Exception as e:
        return err(f"air: {e}")
