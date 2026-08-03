"""AXE embedding helpers — Ollama nomic-embed-text + local fallback.

Used by knowledge.py and memory.py for semantic retrieval.
Optional Qdrant upsert/search when QDRANT_URL is set.
"""
from __future__ import annotations

import hashlib
import logging
import os
from typing import List, Optional

import httpx

logger = logging.getLogger("axe.embeddings")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")
QDRANT_URL = os.getenv("QDRANT_URL", "").rstrip("/")  # e.g. http://127.0.0.1:6333
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "axe_memory")
LOCAL_DIM = 128


def local_embed(text: str, dim: int = LOCAL_DIM) -> List[float]:
    """Deterministic character-bigram embedding (no network)."""
    text_lower = (text or "").lower()
    vec = [0.0] * dim
    for i in range(max(0, len(text_lower) - 1)):
        bigram = text_lower[i : i + 2]
        h = int(hashlib.md5(bigram.encode()).hexdigest(), 16)
        vec[h % dim] += 1.0
    mag = sum(v * v for v in vec) ** 0.5
    if mag > 0:
        vec = [v / mag for v in vec]
    return vec


def cosine_similarity(a: List[float], b: List[float]) -> float:
    n = min(len(a), len(b))
    if n == 0:
        return 0.0
    return sum(a[i] * b[i] for i in range(n))


async def embed_text(text: str) -> List[float]:
    """Prefer Ollama embeddings; fall back to local hash vector."""
    prompt = (text or "")[:8000]
    if not prompt.strip():
        return local_embed("")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={"model": EMBED_MODEL, "prompt": prompt},
            )
            if r.status_code == 200:
                data = r.json()
                vec = data.get("embedding") or []
                if isinstance(vec, list) and len(vec) >= 8:
                    mag = sum(x * x for x in vec) ** 0.5 or 1.0
                    return [float(x) / mag for x in vec]
    except Exception as exc:
        logger.debug("ollama embed failed: %s", exc)
    return local_embed(prompt)


async def qdrant_upsert(
    point_id: str,
    vector: List[float],
    payload: dict,
) -> bool:
    if not QDRANT_URL:
        return False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            # ensure collection (best-effort)
            await client.put(
                f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}",
                json={
                    "vectors": {
                        "size": len(vector),
                        "distance": "Cosine",
                    }
                },
            )
            r = await client.put(
                f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points",
                json={
                    "points": [
                        {
                            "id": point_id
                            if _is_uuid_like(point_id)
                            else abs(hash(point_id)) % (2**63),
                            "vector": vector,
                            "payload": payload,
                        }
                    ]
                },
            )
            return r.status_code in (200, 201)
    except Exception as exc:
        logger.debug("qdrant upsert failed: %s", exc)
        return False


async def qdrant_search(
    vector: List[float],
    limit: int = 5,
    score_threshold: float = 0.2,
) -> List[dict]:
    if not QDRANT_URL:
        return []
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.post(
                f"{QDRANT_URL}/collections/{QDRANT_COLLECTION}/points/search",
                json={
                    "vector": vector,
                    "limit": limit,
                    "with_payload": True,
                    "score_threshold": score_threshold,
                },
            )
            if r.status_code != 200:
                return []
            data = r.json()
            return data.get("result") or []
    except Exception as exc:
        logger.debug("qdrant search failed: %s", exc)
        return []


def _is_uuid_like(s: str) -> bool:
    return len(s) >= 32 and all(c in "0123456789abcdef-" for c in s.lower())
