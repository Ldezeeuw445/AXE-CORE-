"""Parser-tests voor de streaming-tak van /proxy/ai.

Zonder deze tests is een kapotte delta stil: de client krijgt SSE zonder
tekst en valt niet terug op JSON. Dat is erger dan geen stream.
"""
from proxy_ai_stream import (
    wil_stream,
    delta_uit_openai_regel,
    delta_uit_google_chunk,
    delta_uit_anthropic_regel,
    bouw_stream_request,
    sse_delta,
)


def test_alleen_expliciet_stream_true():
    assert wil_stream({"stream": True}) is True
    assert wil_stream({}) is False
    assert wil_stream({"stream": False}) is False
    assert wil_stream({"stream": "true"}) is False


def test_openai_chunk_naar_delta():
    assert delta_uit_openai_regel('data: {"choices":[{"delta":{"content":"Hel"}}]}') == "Hel"
    assert delta_uit_openai_regel("data: [DONE]") == ""
    assert delta_uit_openai_regel("niet-json") == ""


def test_google_zowel_incrementeel_als_accumulerend():
    extra, acc = delta_uit_google_chunk(
        'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}',
        "",
    )
    assert extra == "Hi" and acc == "Hi"
    extra, acc = delta_uit_google_chunk(
        'data: {"candidates":[{"content":{"parts":[{"text":"Hi there"}]}}]}',
        "Hi",
    )
    assert extra == " there" and acc == "Hi there"
    extra, acc = delta_uit_google_chunk(
        'data: {"candidates":[{"content":{"parts":[{"text":" there"}]}}]}',
        "Hi",
    )
    assert extra == " there" and acc == "Hi there"


def test_anthropic_alleen_text_deltas():
    assert delta_uit_anthropic_regel(
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Yo"}}'
    ) == "Yo"
    assert delta_uit_anthropic_regel('data: {"type":"message_start"}') == ""


def test_bouw_zet_upstream_op_stream():
    openai = bouw_stream_request({
        "provider": "openai", "key": "k", "model": "gpt-4o-mini",
        "format": "openai", "baseUrl": "https://api.openai.com/v1",
        "messages": [{"role": "user", "content": "hoi"}],
    })
    assert openai[0].endswith("/chat/completions")
    assert openai[2]["stream"] is True

    google = bouw_stream_request({
        "provider": "google", "key": "k", "model": "gemini-2.5-flash",
        "format": "google", "baseUrl": "https://generativelanguage.googleapis.com",
        "messages": [{"role": "user", "content": "hoi"}],
    })
    assert "streamGenerateContent" in google[0]
    assert "alt=sse" in google[0]
    assert google[2].get("stream") is None  # Google streamt via de URL

    anthro = bouw_stream_request({
        "provider": "anthropic", "key": "k", "model": "claude-sonnet-4-5",
        "format": "anthropic", "baseUrl": "https://api.anthropic.com/v1",
        "messages": [{"role": "system", "content": "x"}, {"role": "user", "content": "hoi"}],
    })
    assert anthro[0].endswith("/v1/messages")
    assert "/v1/v1/" not in anthro[0]
    assert anthro[2]["stream"] is True


def test_sse_delta_is_ons_contract():
    assert sse_delta("Hel") == b'data: {"delta": "Hel"}\n\n'
