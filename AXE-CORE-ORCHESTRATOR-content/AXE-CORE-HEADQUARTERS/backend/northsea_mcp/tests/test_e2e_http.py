"""Echte remote MCP over Streamable HTTP: uvicorn op een poort, de officiële MCP-client ertegen.

Dit is dezelfde weg als ChatGPT: HTTP, Bearer-token, /mcp. Alleen de database en
het onderzoek zijn nep; server, auth-middleware, transport en tools zijn echt.
"""
from __future__ import annotations

import socket
import threading
import time

import httpx
import httpx2
import pytest
import uvicorn
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from conftest import PUBLIC
from fakes import DRAFT_APPROVED, OPP


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def server_url(app):
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", lifespan="on"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    assert server.started, "uvicorn did not start"
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(timeout=10)


def _token(store, scopes, resource=f"{PUBLIC}/mcp"):
    return store.issue(kind="service", client_id="service:e2e", subject="service:e2e", scopes=scopes, resource=resource, ttl_s=600, label="e2e")


async def test_remote_client_lists_and_calls_tools_with_service_token(server_url, store, repo):
    token = _token(store, ["northsea.read", "northsea.deal.read"])
    http = httpx2.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=30)
    async with Client(streamable_http_client(f"{server_url}/mcp", http_client=http)) as c:
        tools = (await c.list_tools()).tools
        assert len(tools) == 14
        res = await c.call_tool("northsea_review_deal", {"opportunity_id": OPP})
        assert not res.is_error and res.structured_content["opportunity_id"] == OPP
        denied = await c.call_tool("northsea_send_approved_communication",
                                   {"draft_id": DRAFT_APPROVED, "confirm": True, "idempotency_key": "e2e-send-00001"})
        assert denied.is_error and "insufficient_scope" in denied.content[0].text
    assert repo.sends == []


async def test_remote_without_token_gets_401_with_discovery(server_url):
    async with httpx.AsyncClient() as h:
        r = await h.post(f"{server_url}/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                         headers={"accept": "application/json, text/event-stream", "content-type": "application/json"})
    assert r.status_code == 401 and "resource_metadata" in r.headers.get("www-authenticate", "")


async def test_token_for_another_resource_is_rejected(server_url, store):
    token = _token(store, ["northsea.read", "northsea.deal.read"], resource="https://some-other-server.example/mcp")
    async with httpx.AsyncClient() as h:
        r = await h.post(f"{server_url}/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                         headers={"authorization": f"Bearer {token}", "accept": "application/json, text/event-stream",
                                  "content-type": "application/json"})
    assert r.status_code == 401


async def test_foreign_host_header_is_rejected(server_url, store):
    token = _token(store, ["northsea.read"])
    async with httpx.AsyncClient() as h:
        r = await h.post(f"{server_url}/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                         headers={"authorization": f"Bearer {token}", "host": "attacker.example",
                                  "accept": "application/json, text/event-stream", "content-type": "application/json"})
    assert r.status_code in (400, 403, 421)
