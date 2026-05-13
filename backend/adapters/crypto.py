from .base import ok, err, now_iso
from services.http import get_client

NAME = "crypto"
TTL = 45


async def fetch():
    try:
        c = get_client()
        url = ("https://api.coingecko.com/api/v3/coins/markets"
               "?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h,7d")
        r = await c.get(url)
        r.raise_for_status()
        data = r.json()
        items = [{
            "id": f"crypto_{x['id']}", "layer": "crypto", "source": "coingecko",
            "title": x.get("name"), "symbol": (x.get("symbol") or "").upper(),
            "price_usd": x.get("current_price"),
            "change_24h_pct": x.get("price_change_percentage_24h"),
            "change_7d_pct": x.get("price_change_percentage_7d_in_currency"),
            "market_cap": x.get("market_cap"), "volume_24h": x.get("total_volume"),
            "image": x.get("image"), "ts": now_iso(),
        } for x in (data or [])]
        return ok(items)
    except Exception as e:
        return err(f"crypto: {e}")
