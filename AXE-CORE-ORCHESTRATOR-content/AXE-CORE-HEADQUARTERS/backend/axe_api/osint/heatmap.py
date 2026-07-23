from .base import ok, err, now_iso
from .http_client import get_client

NAME = "heatmap"
TTL = 180


async def fetch():
    try:
        c = get_client()
        url = ("https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/"
               "VIIRS_Heat_Detections/FeatureServer/0/query"
               "?where=1%3D1&outFields=*&returnGeometry=true&resultRecordCount=500&f=geojson"
               "&orderByFields=DetectionDate%20DESC")
        r = await c.get(url)
        r.raise_for_status()
        data = r.json()
        feats = data.get("features") or []
        items = []
        night_count = 0
        high_frp = 0
        for f in feats[:500]:
            coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
            p = f.get("properties") or {}
            frp_raw = p.get("FRP") or ""
            try:
                frp_num = float(str(frp_raw).split()[0])
            except Exception:
                frp_num = 0
            if p.get("Day_Night") == "Night":
                night_count += 1
            if frp_num > 10:
                high_frp += 1
            items.append({
                "id": f"thermal_{p.get('OBJECTID')}", "layer": "thermal", "source": "nifc-viirs",
                "title": p.get("Name", "Thermal hotspot"),
                "lon": coords[0], "lat": coords[1],
                "frp": p.get("FRP"), "frp_num": frp_num,
                "confidence": p.get("Confidence"), "satellite": p.get("Sensor"),
                "brightness": p.get("Brightness"),
                "detection_time": p.get("Detection_Time"),
                "day_night": p.get("Day_Night"),
                "ts": now_iso(),
            })
        return ok(items, {"night_detections": night_count, "high_intensity": high_frp})
    except Exception as e:
        return err(f"heatmap: {e}")
