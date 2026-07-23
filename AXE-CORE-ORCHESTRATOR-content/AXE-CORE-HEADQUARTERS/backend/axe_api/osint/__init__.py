"""OSINT adapters for the 3D maps — ported from the standalone Intelligence
Terminal prototype (repo root backend/adapters + services), stripped of its
Mongo/JWT/CRA baggage. Each adapter is a stateless async fetch() returning
{"status","fetched_at","count","items",...}; router.py adds TTL caching and
the /osint/* HTTP surface. AISStream (live vessel feed) is optional — it
only activates when AISSTREAM_API_KEY is set in the axe_api environment.
"""
