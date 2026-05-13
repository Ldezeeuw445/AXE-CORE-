import asyncio
from .base import ok, err, now_iso
from services.http import get_client

NAME = "macro"
TTL = 600  # economic data updates slowly


async def _wb(c, code):
    try:
        r = await c.get(f"https://api.worldbank.org/v2/country/US/indicator/{code}?format=json&per_page=3")
        r.raise_for_status()
        data = r.json()
        rows = data[1] if isinstance(data, list) and len(data) > 1 else []
        latest = next((d for d in rows if d.get("value") is not None), None)
        return latest
    except Exception:
        return None


async def fetch():
    try:
        c = get_client()
        # World Bank indicators + Frankfurter FX
        unemp, cpi, gdp = await asyncio.gather(
            _wb(c, "SL.UEM.TOTL.ZS"),
            _wb(c, "FP.CPI.TOTL.ZG"),
            _wb(c, "NY.GDP.MKTP.CD"),
        )
        fx_r = await c.get("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CNY,CHF")
        fx_r.raise_for_status()
        fx = fx_r.json()
        items = []
        if unemp:
            items.append({"id": "macro_unemp_us", "layer": "macro", "source": "worldbank",
                          "title": "US Unemployment", "value": unemp.get("value"),
                          "unit": "%", "period": unemp.get("date"), "ts": now_iso()})
        if cpi:
            items.append({"id": "macro_cpi_us", "layer": "macro", "source": "worldbank",
                          "title": "US CPI YoY", "value": cpi.get("value"),
                          "unit": "%", "period": cpi.get("date"), "ts": now_iso()})
        if gdp:
            items.append({"id": "macro_gdp_us", "layer": "macro", "source": "worldbank",
                          "title": "US GDP", "value": gdp.get("value"),
                          "unit": "USD", "period": gdp.get("date"), "ts": now_iso()})
        for k, v in (fx.get("rates") or {}).items():
            items.append({"id": f"macro_fx_{k.lower()}", "layer": "macro", "source": "frankfurter",
                          "title": f"USD/{k}", "value": v, "unit": "rate", "ts": now_iso()})
        return ok(items)
    except Exception as e:
        return err(f"macro: {e}")
