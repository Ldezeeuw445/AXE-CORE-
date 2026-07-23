from .base import ok, err, now_iso
from .http_client import get_client

NAME = "news"
TTL = 90  # GDELT rate limit ~1/5s; cache 90s


async def fetch():
    try:
        c = get_client()
        url = (
            "https://api.gdeltproject.org/api/v2/doc/doc"
            "?query=(conflict OR sanctions OR strike OR cyberattack OR earthquake OR explosion OR protest OR missile)"
            "&timespan=1d&maxrecords=40&format=json&mode=artlist&sort=datedesc"
        )
        r = await c.get(url)
        r.raise_for_status()
        data = r.json()
        articles = data.get("articles") if isinstance(data, dict) else None
        if not articles:
            return ok([])
        items = [{
            "id": f"news_{i}", "ts": a.get("seendate") or now_iso(),
            "source": a.get("domain") or "gdelt", "layer": "news",
            "title": a.get("title"), "url": a.get("url"),
            "language": a.get("language"), "country": a.get("sourcecountry"),
        } for i, a in enumerate(articles[:40])]
        return ok(items)
    except Exception as e:
        return err(f"news: {e}")
