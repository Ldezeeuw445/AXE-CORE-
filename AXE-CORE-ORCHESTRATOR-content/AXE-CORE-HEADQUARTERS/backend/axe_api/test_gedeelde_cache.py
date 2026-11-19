"""Gedeelde cache voor /agents/activity (19 nov 2026): N apps = één berekening."""
import asyncio

from missie_api import GedeeldeCache


def test_binnen_ttl_een_berekening_daarna_opnieuw():
    nu = [0.0]
    cache = GedeeldeCache(15, klok=lambda: nu[0])
    teller = {"n": 0}

    async def bereken():
        teller["n"] += 1
        return teller["n"]

    async def scenario():
        uit = await asyncio.gather(*(cache.haal(8, bereken) for _ in range(3)))
        assert uit == [1, 1, 1]
        nu[0] = 14.9
        assert await cache.haal(8, bereken) == 1
        nu[0] = 15.1
        assert await cache.haal(8, bereken) == 2
        assert await cache.haal(20, bereken) == 3  # andere sleutel, eigen antwoord

    asyncio.run(scenario())
    assert teller["n"] == 3


def test_fout_wordt_niet_onthouden():
    cache = GedeeldeCache(15, klok=lambda: 0.0)
    pogingen = {"n": 0}

    async def bereken():
        pogingen["n"] += 1
        if pogingen["n"] == 1:
            raise RuntimeError("database weg")
        return "ok"

    async def scenario():
        try:
            await cache.haal(8, bereken)
        except RuntimeError:
            pass
        assert await cache.haal(8, bereken) == "ok"

    asyncio.run(scenario())
