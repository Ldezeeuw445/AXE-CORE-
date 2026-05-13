"""Simple in-memory + Mongo-backed cache for adapter results."""
import asyncio
import time
from typing import Any, Optional


class MemoryCache:
    def __init__(self):
        self._data: dict[str, tuple[float, Any]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def get(self, key: str, ttl: float) -> Optional[Any]:
        v = self._data.get(key)
        if not v:
            return None
        ts, val = v
        if time.time() - ts <= ttl:
            return val
        return None

    def set(self, key: str, value: Any) -> None:
        self._data[key] = (time.time(), value)

    def age(self, key: str) -> Optional[float]:
        v = self._data.get(key)
        if not v:
            return None
        return time.time() - v[0]

    def lock_for(self, key: str) -> asyncio.Lock:
        if key not in self._locks:
            self._locks[key] = asyncio.Lock()
        return self._locks[key]


cache = MemoryCache()
