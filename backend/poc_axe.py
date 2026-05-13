"""
AXE INTELLIGENCE TERMINAL — Phase 1 POC (v2)
All 8 adapters using verified free/no-auth endpoints + Claude Sonnet 4.5.
"""
import asyncio
import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

HTTP_TIMEOUT = 15.0
UA = "Mozilla/5.0 (AXE-Intelligence-Terminal/1.0)"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ok(items: list[dict], extra: dict | None = None) -> dict:
    return {"status": "ok", "fetched_at": now_iso(), "count": len(items), "items": items, **(extra or {})}


def err(msg: str) -> dict:
    return {"status": "error", "fetched_at": now_iso(), "count": 0, "items": [], "error": str(msg)[:300]}


async def jget(client: httpx.AsyncClient, url: str, **kw) -> Any:
    r = await client.get(url, timeout=HTTP_TIMEOUT, headers={"User-Agent": UA, **kw.pop("headers", {})}, **kw)
    r.raise_for_status()
    return r.json()


# ---------- adapters ----------

async def a_news(c):
    # GDELT DOC 2.0 - rate-limit is 1 req/5s so we use it sparingly
    try:
        url = ("https://api.gdeltproject.org/api/v2/doc/doc"
               "?query=(conflict OR sanctions OR strike OR cyberattack OR earthquake OR explosion)"
               "&timespan=1d&maxrecords=30&format=json&mode=artlist&sort=datedesc")
        data = await jget(c, url)
        items = [{
            "id": f"news_{i}", "ts": a.get("seendate"), "source": a.get("domain") or "gdelt",
            "layer": "news", "title": a.get("title"), "url": a.get("url"),
            "language": a.get("language"), "country": a.get("sourcecountry"),
        } for i, a in enumerate((data.get("articles") or [])[:30])]
        return ok(items)
    except Exception as e:
        return err(f"news: {e}")


async def a_air(c):
    # adsb.lol — free, no-auth, returns live ADS-B aircraft
    try:
        # Sample multiple major airspaces to get global coverage
        regions = [
            (45, 10, 500),   # Europe
            (40, -90, 500),  # USA
            (35, 110, 500),  # East Asia
            (25, 55, 500),   # Middle East
            (-25, 135, 500), # Australia
        ]
        all_items = []
        seen = set()
        countries = set()
        for lat, lon, dist in regions:
            try:
                data = await jget(c, f"https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{dist}")
                for ac in (data.get("ac") or [])[:120]:
                    h = ac.get("hex")
                    if not h or h in seen: continue
                    seen.add(h)
                    if ac.get("lat") is None or ac.get("lon") is None: continue
                    flight = (ac.get("flight") or "").strip()
                    countries.add((ac.get("r") or "")[:2])
                    all_items.append({
                        "id": f"air_{h}",
                        "ts": now_iso(),
                        "source": "adsb-lol",
                        "layer": "air",
                        "callsign": flight,
                        "icao24": h,
                        "registration": ac.get("r"),
                        "lat": ac.get("lat"),
                        "lon": ac.get("lon"),
                        "altitude_ft": ac.get("alt_baro"),
                        "speed_kt": ac.get("gs"),
                        "heading": ac.get("track"),
                        "category": ac.get("category"),
                        "type": ac.get("t"),
                    })
            except Exception:
                continue
        return ok(all_items[:500], {"theaters": len([x for x in countries if x])})
    except Exception as e:
        return err(f"air: {e}")


async def a_vessel(c):
    # Finnish Digitraffic AIS - free, no auth, Baltic Sea coverage (very dense)
    try:
        r = await c.get("https://meri.digitraffic.fi/api/ais/v1/locations",
                        timeout=HTTP_TIMEOUT,
                        headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
        r.raise_for_status()
        data = r.json()
        feats = data.get("features") or []
        items = []
        for f in feats[:400]:
            g = (f.get("geometry") or {}).get("coordinates") or [None, None]
            p = f.get("properties") or {}
            items.append({
                "id": f"vessel_{f.get('mmsi')}",
                "ts": now_iso(),
                "source": "digitraffic",
                "layer": "vessel",
                "mmsi": f.get("mmsi"),
                "lon": g[0],
                "lat": g[1],
                "sog": p.get("sog"),
                "cog": p.get("cog"),
                "heading": p.get("heading"),
                "nav_status": p.get("navStat"),
            })
        return ok(items, {"total_seen": len(feats)})
    except Exception as e:
        return err(f"vessel: {e}")


async def a_space(c):
    # ISS live + a few key named satellites via tle.ivanstanojevic.me
    try:
        items = []
        try:
            iss = await jget(c, "https://api.wheretheiss.at/v1/satellites/25544")
            items.append({
                "id": "space_iss", "ts": now_iso(), "source": "wheretheiss",
                "layer": "space", "title": "ISS (ZARYA)",
                "lon": iss.get("longitude"), "lat": iss.get("latitude"),
                "altitude_km": iss.get("altitude"), "velocity_kmh": iss.get("velocity"),
            })
        except Exception:
            pass
        # Search for notable satellites
        for q in ["Tiangong", "Hubble", "GOES", "Starlink"]:
            try:
                data = await jget(c, f"https://tle.ivanstanojevic.me/api/tle/?search={q}")
                for s in (data.get("member") or [])[:2]:
                    items.append({
                        "id": f"space_{s.get('satelliteId')}",
                        "ts": s.get("date"),
                        "source": "ivanstanojevic-tle",
                        "layer": "space",
                        "title": s.get("name"),
                        "norad_id": s.get("satelliteId"),
                    })
            except Exception:
                continue
        # constellation totals
        starlink_total = 0
        try:
            data = await jget(c, "https://tle.ivanstanojevic.me/api/tle/?search=starlink")
            starlink_total = data.get("totalItems") or 0
        except Exception:
            pass
        return ok(items, {"starlink_total": starlink_total, "active_total": 11000 + starlink_total})
    except Exception as e:
        return err(f"space: {e}")


async def a_macro(c):
    try:
        wb_unemp = await jget(c, "https://api.worldbank.org/v2/country/US/indicator/SL.UEM.TOTL.ZS?format=json&per_page=3")
        wb_cpi = await jget(c, "https://api.worldbank.org/v2/country/US/indicator/FP.CPI.TOTL.ZG?format=json&per_page=3")
        wb_gdp = await jget(c, "https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.CD?format=json&per_page=3")
        fx = await jget(c, "https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CNY,CHF")
        unemp = next((d for d in (wb_unemp[1] if len(wb_unemp) > 1 else []) if d.get("value") is not None), None)
        cpi = next((d for d in (wb_cpi[1] if len(wb_cpi) > 1 else []) if d.get("value") is not None), None)
        gdp = next((d for d in (wb_gdp[1] if len(wb_gdp) > 1 else []) if d.get("value") is not None), None)
        items = [
            {"id": "macro_unemp_us", "layer": "macro", "source": "worldbank",
             "title": "US Unemployment", "value": unemp.get("value") if unemp else None,
             "unit": "%", "period": unemp.get("date") if unemp else None, "ts": now_iso()},
            {"id": "macro_cpi_us", "layer": "macro", "source": "worldbank",
             "title": "US CPI YoY", "value": cpi.get("value") if cpi else None,
             "unit": "%", "period": cpi.get("date") if cpi else None, "ts": now_iso()},
            {"id": "macro_gdp_us", "layer": "macro", "source": "worldbank",
             "title": "US GDP", "value": gdp.get("value") if gdp else None,
             "unit": "USD", "period": gdp.get("date") if gdp else None, "ts": now_iso()},
        ]
        for k, v in (fx.get("rates") or {}).items():
            items.append({"id": f"macro_fx_{k.lower()}", "layer": "macro", "source": "frankfurter",
                          "title": f"USD/{k}", "value": v, "unit": "rate", "ts": now_iso()})
        return ok(items)
    except Exception as e:
        return err(f"macro: {e}")


async def a_crypto(c):
    try:
        data = await jget(c, "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h")
        items = [{
            "id": f"crypto_{x['id']}", "layer": "crypto", "source": "coingecko",
            "title": x.get("name"), "symbol": (x.get("symbol") or "").upper(),
            "price_usd": x.get("current_price"),
            "change_24h_pct": x.get("price_change_percentage_24h"),
            "market_cap": x.get("market_cap"),
            "volume_24h": x.get("total_volume"),
            "image": x.get("image"),
            "ts": now_iso(),
        } for x in (data or [])]
        return ok(items)
    except Exception as e:
        return err(f"crypto: {e}")


async def a_heatmap(c):
    # NIFC VIIRS_Heat_Detections — public ArcGIS, no auth
    try:
        url = ("https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/"
               "VIIRS_Heat_Detections/FeatureServer/0/query"
               "?where=1%3D1&outFields=*&returnGeometry=true&resultRecordCount=400&f=geojson"
               "&orderByFields=DetectionDate%20DESC")
        data = await jget(c, url)
        feats = data.get("features") or []
        items = []
        for f in feats[:400]:
            coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
            p = f.get("properties") or {}
            items.append({
                "id": f"thermal_{p.get('OBJECTID')}",
                "layer": "thermal",
                "source": "nifc-viirs",
                "title": p.get("Name", "Thermal hotspot"),
                "lon": coords[0], "lat": coords[1],
                "frp": p.get("FRP"),
                "confidence": p.get("Confidence"),
                "satellite": p.get("Sensor"),
                "brightness": p.get("Brightness"),
                "detection_time": p.get("Detection_Time"),
                "ts": now_iso(),
            })
        return ok(items)
    except Exception as e:
        return err(f"heatmap: {e}")


async def a_intel(c):
    try:
        items = []
        eq = await jget(c, "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson")
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
        try:
            kev = await jget(c, "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json")
            for v in (kev.get("vulnerabilities") or [])[-20:]:
                items.append({
                    "id": f"intel_cve_{v.get('cveID')}",
                    "layer": "intel", "source": "cisa-kev",
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


# ---------- sweep ----------

async def run_sweep():
    started = time.time()
    print(f"[{now_iso()}] sweep start")
    async with httpx.AsyncClient(follow_redirects=True) as c:
        results = await asyncio.gather(
            a_news(c), a_air(c), a_vessel(c), a_space(c),
            a_macro(c), a_crypto(c), a_heatmap(c), a_intel(c),
            return_exceptions=True,
        )
    layers = ["news", "air", "vessel", "space", "macro", "crypto", "heatmap", "intel"]
    sources = {}
    events_total = 0
    for layer, r in zip(layers, results):
        if isinstance(r, Exception):
            sources[layer] = err(f"unhandled: {r}")
        else:
            sources[layer] = r
            events_total += r.get("count", 0)
    return {
        "sweep_id": f"sweep_{int(started)}",
        "started_at": datetime.fromtimestamp(started, tz=timezone.utc).isoformat(),
        "duration_s": round(time.time() - started, 2),
        "sources": sources,
        "events_total": events_total,
    }


# ---------- claude correlation ----------

async def correlate(snapshot):
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return {"status": "error", "error": "EMERGENT_LLM_KEY missing"}
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    compact = {
        "sweep_id": snapshot["sweep_id"],
        "started_at": snapshot["started_at"],
        "sources": {
            k: {
                "status": v.get("status"),
                "count": v.get("count"),
                "sample": v.get("items", [])[:5],
                **{kk: vv for kk, vv in v.items() if kk in ("theaters","starlink_total","total_seen","active_total")},
            }
            for k, v in snapshot["sources"].items()
        },
    }
    sys_msg = ("You are AXE Intelligence — an elite OSINT correlation engine. "
               "You connect signals across news, air, vessel, space, macro, crypto, thermal, intel. "
               "Output ONLY valid JSON. No prose, no markdown.")
    prompt = (
        "Analyze this multi-source intelligence sweep and produce CROSS-SOURCE SIGNALS that link "
        "events across ≥2 different layers (e.g., wildfire+shipping+oil, military air+FX, "
        "thermal+commodities, cyber+crypto).\n\n"
        f"SWEEP:\n{json.dumps(compact, default=str)[:25000]}\n\n"
        "Return JSON exactly:\n"
        '{"headline_risk":"<phrase>","alert_level":"LOW|ELEVATED|HIGH|CRITICAL",'
        '"signals":[{"id":"sig_1","title":"...","narrative":"2-3 sentences",'
        '"sources_involved":["news","air"],"confidence":"LOW|MEDIUM|HIGH",'
        '"geo_focus":"region","suggested_actions":["..","..","..]}],'
        '"leverageable_ideas":[{"side":"LONG|SHORT|HEDGE","ticker_or_theme":"..","horizon":"HOURS|DAYS|WEEKS",'
        '"confidence":"LOW|MEDIUM|HIGH","thesis":"..","risk":".."}]}\n'
        "Produce 3-6 signals and 3-5 ideas. Specific, actionable."
    )
    chat = LlmChat(api_key=key, session_id=f"poc-{snapshot['sweep_id']}",
                   system_message=sys_msg).with_model("anthropic", "claude-sonnet-4-5-20250929")
    raw = await chat.send_message(UserMessage(text=prompt))
    text = raw if isinstance(raw, str) else str(raw)
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1]
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.rsplit("```", 1)[0]
    try:
        return {"status": "ok", "result": json.loads(cleaned.strip())}
    except Exception as e:
        return {"status": "parse_error", "error": str(e), "raw_preview": text[:500]}


async def main():
    snap = await run_sweep()
    print("\n========== SWEEP HEALTH ==========")
    for k, v in snap["sources"].items():
        e = f" err={v['error'][:80]}" if v.get("error") else ""
        print(f"  {k:8s}  {v.get('status'):6s}  count={v.get('count'):<5}{e}")
    print(f"\nTotal events: {snap['events_total']}, duration={snap['duration_s']}s")
    with open("/tmp/poc_snapshot.json", "w") as f:
        json.dump(snap, f, indent=2, default=str)
    print("\n========== CLAUDE CORRELATION ==========")
    corr = await correlate(snap)
    print(json.dumps(corr, indent=2, default=str)[:2500])
    with open("/tmp/poc_correlation.json", "w") as f:
        json.dump(corr, f, indent=2, default=str)
    ok_count = sum(1 for v in snap["sources"].values() if v.get("status") == "ok")
    print(f"\n========== POC RESULT ==========")
    print(f"Adapters OK: {ok_count}/8 | Correlation: {corr.get('status')}")
    return 0 if (ok_count >= 7 and corr.get("status") == "ok") else 1


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except Exception:
        traceback.print_exc()
        sys.exit(2)
