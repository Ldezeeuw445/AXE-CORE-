"""Streaming-tak van POST /proxy/ai.

De bestaande route wacht op de hele upstream-body en geeft {text} terug.
De chat wil first-token: als de client stream=true stuurt, zetten we
upstream op stream en sturen we SSE door (data: {"delta":"..."}).

Zonder stream=true blijft het oude JSON-antwoord. Een oude client merkt
niets. Een nieuwe client met een oude server krijgt JSON en toont de
tekst in één keer — geen regressie, alleen geen first-token tot de VPS
deze module draait.
"""
from __future__ import annotations

import json
from typing import Any, AsyncIterator, Callable

import httpx
from fastapi.responses import StreamingResponse

# Zelfde budgets als de gebufferde tak in main.py.
PROXY_TIMEOUT_OLLAMA = 90
PROXY_TIMEOUT_CLOUD = 25


def wil_stream(body: dict) -> bool:
    return body.get("stream") is True


def _openai_chat_url(base_url: str) -> str:
    b = (base_url or "").rstrip("/")
    if b.endswith("/chat/completions"):
        return b
    if b.endswith("/v1"):
        return f"{b}/chat/completions"
    return f"{b}/v1/chat/completions"


def delta_uit_openai_regel(regel: str) -> str:
    t = regel.strip()
    if t.startswith("data:"):
        t = t[5:].strip()
    if not t or t == "[DONE]":
        return ""
    try:
        d = json.loads(t)
    except json.JSONDecodeError:
        return ""
    choice = (d.get("choices") or [{}])[0]
    delta = (choice.get("delta") or {}).get("content")
    if isinstance(delta, str):
        return delta
    msg = (choice.get("message") or {}).get("content")
    return msg if isinstance(msg, str) else ""


def delta_uit_google_chunk(raw: str, tot_nu: str) -> tuple[str, str]:
    t = raw.strip()
    if t.startswith("data:"):
        t = t[5:].strip()
    if not t:
        return "", tot_nu
    try:
        d = json.loads(t)
    except json.JSONDecodeError:
        return "", tot_nu
    cands = d.get("candidates") or [{}]
    parts = ((cands[0].get("content") or {}).get("parts") or [{}])
    stuk = parts[0].get("text") or ""
    if not isinstance(stuk, str) or not stuk:
        return "", tot_nu
    if tot_nu and stuk.startswith(tot_nu):
        extra = stuk[len(tot_nu):]
        return extra, stuk
    return stuk, tot_nu + stuk


def delta_uit_anthropic_regel(regel: str) -> str:
    t = regel.strip()
    if t.startswith("data:"):
        t = t[5:].strip()
    if not t:
        return ""
    try:
        d = json.loads(t)
    except json.JSONDecodeError:
        return ""
    if d.get("type") != "content_block_delta":
        return ""
    delta = d.get("delta") or {}
    tekst = delta.get("text")
    return tekst if isinstance(tekst, str) else ""


def sse_delta(delta: str) -> bytes:
    return f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n".encode("utf-8")


DONE = b"data: [DONE]\n\n"


async def _iter_openai(r: httpx.Response) -> AsyncIterator[bytes]:
    async for regel in r.aiter_lines():
        delta = delta_uit_openai_regel(regel)
        if delta:
            yield sse_delta(delta)
    yield DONE


async def _iter_google(r: httpx.Response) -> AsyncIterator[bytes]:
    acc = ""
    async for regel in r.aiter_lines():
        extra, acc = delta_uit_google_chunk(regel, acc)
        if extra:
            yield sse_delta(extra)
    yield DONE


async def _iter_anthropic(r: httpx.Response) -> AsyncIterator[bytes]:
    async for regel in r.aiter_lines():
        delta = delta_uit_anthropic_regel(regel)
        if delta:
            yield sse_delta(delta)
    yield DONE


def bouw_stream_request(body: dict) -> tuple[str, dict[str, str], dict[str, Any], Callable[[httpx.Response], AsyncIterator[bytes]]]:
    """URL, headers, JSON, iterator — puur, zodat tests geen httpx nodig hebben."""
    provider = body.get("provider")
    key = body.get("key") or ""
    model = body.get("model")
    fmt = body.get("format")
    base_url = (body.get("baseUrl") or "").rstrip("/")
    messages = body.get("messages") or []

    if fmt == "anthropic":
        anthro_base = (base_url or "https://api.anthropic.com").rstrip("/")
        if anthro_base.endswith("/v1"):
            anthro_base = anthro_base[:-3].rstrip("/")
        sys_msg = next((m.get("content") for m in messages if m.get("role") == "system"), None)
        return (
            f"{anthro_base}/v1/messages",
            {
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            {
                "model": model,
                "max_tokens": 4096,
                "stream": True,
                **({"system": sys_msg} if sys_msg else {}),
                "messages": [m for m in messages if m.get("role") != "system"],
            },
            _iter_anthropic,
        )

    if fmt == "google":
        sys_msg = next((m.get("content") for m in messages if m.get("role") == "system"), None)
        url = f"{base_url}/v1beta/models/{model}:streamGenerateContent?alt=sse"
        if key:
            url = f"{url}&key={key}"
        return (
            url,
            {"content-type": "application/json"},
            {
                "contents": [
                    {
                        "role": "user" if m.get("role") == "user" else "model",
                        "parts": [{"text": m.get("content", "")}],
                    }
                    for m in messages
                    if m.get("role") != "system"
                ],
                **({"systemInstruction": {"parts": [{"text": sys_msg}]}} if sys_msg else {}),
                "generationConfig": {"maxOutputTokens": 8192},
            },
            _iter_google,
        )

    chat_url = _openai_chat_url(base_url)
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return (
        chat_url,
        headers,
        {
            "model": model,
            "messages": messages,
            "max_tokens": 4096,
            "temperature": 0.7,
            "stream": True,
        },
        _iter_openai,
    )


async def proxy_ai_stream_response(body: dict) -> StreamingResponse:
    provider = body.get("provider")
    timeout = PROXY_TIMEOUT_OLLAMA if provider == "ollama" else PROXY_TIMEOUT_CLOUD
    url, headers, payload, iterator = bouw_stream_request(body)

    client = httpx.AsyncClient(timeout=timeout)

    async def gen() -> AsyncIterator[bytes]:
        try:
            async with client.stream("POST", url, headers=headers, json=payload) as r:
                if r.is_error:
                    detail = (await r.aread())[:300].decode(errors="replace")
                    fout = json.dumps({"error": f"{provider} HTTP {r.status_code}: {detail}"})
                    yield f"data: {fout}\n\n".encode()
                    yield DONE
                    return
                async for chunk in iterator(r):
                    yield chunk
        except httpx.HTTPError as e:
            yield f"data: {json.dumps({'error': str(e)[:300]})}\n\n".encode()
            yield DONE
        finally:
            await client.aclose()

    return StreamingResponse(gen(), media_type="text/event-stream")
