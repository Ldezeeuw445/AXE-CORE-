---
name: Free OSINT data sources
description: Which public OSINT feeds are usable without an API key/account, for map or dashboard layers.
---

Sources confirmed usable without a paid key or signup, each with a stable GeoJSON-ish shape:
- **Earthquakes:** USGS `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson` — very stable, CORS-open, well documented.
- **Live flights (ADS-B):** OpenSky Network `opensky-network.org/api/states/all` — anonymous access works but is rate-limited (~400 req/day), so cache server-side (e.g. 60s) and never call it per-client-request.
- **Geocoded news/conflict events:** GDELT GEO 2.0 `api.gdeltproject.org/api/v2/geo/geo?query=...&mode=PointData&format=GeoJSON` — free, unauthenticated, but schema is looser/less guaranteed than USGS; wrap parsing defensively.
- **Global disasters (cyclones, floods, volcanoes):** GDACS `gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP` — free, no key.

**Why:** These cover most "OSINT layer" requests (quakes, flights, conflict/news, disasters) without needing to ask the user for new API keys.

**How to apply:** There is no reliable free-and-keyless option for AIS ship tracking — that needs a free-tier signup (e.g. aisstream.io) at minimum. Say so plainly rather than faking a ships layer.
