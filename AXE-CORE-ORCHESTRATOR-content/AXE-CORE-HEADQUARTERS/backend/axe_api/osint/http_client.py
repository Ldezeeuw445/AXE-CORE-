"""Shared async HTTP client with sane defaults."""
import httpx

UA = "Mozilla/5.0 (AXE-Intelligence-Terminal/1.0)"
HTTP_TIMEOUT = 15.0

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            follow_redirects=True,
            timeout=HTTP_TIMEOUT,
            headers={"User-Agent": UA},
        )
    return _client
