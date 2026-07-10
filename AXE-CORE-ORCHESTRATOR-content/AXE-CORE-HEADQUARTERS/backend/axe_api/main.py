"""
AXE Core API — God Mode Backend Service
========================================
Runs on VPS (89.167.78.6) alongside n8n.
Gives AXE CORE frontend privileged access to:
  • Supabase   — service_role key (bypasses ALL RLS)
  • n8n        — workflow CRUD + triggers
  • GitHub     — file read/write, commits, PRs

All write operations are audit-logged to core_audit_log.
Protected by Bearer token auth (AXE_API_KEY env var).
CORS restricted to axe-core-rust.vercel.app.

Future: Cloudflare, Vercel, Railway, MetaAPI
"""

from __future__ import annotations
import base64
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

from dotenv import load_dotenv
load_dotenv()  

# ══════════════════════════════════════════════════════════════════════════════
# TERMINAL — WebSocket proxy to local terminal-server (Docker 4022)
# ══════════════════════════════════════════════════════════════════════════════

from fastapi import WebSocket, WebSocketDisconnect
import websockets

TERMINAL_WS = "ws://127.0.0.1:4022/"

@app.websocket("/terminal/ws")
async def terminal_proxy(ws: WebSocket):
    await ws.accept()
    try:
        async with websockets.connect(TERMINAL_WS, max_size=None) as backend:
            async def client_to_backend():
                try:
                    while True:
                        msg = await ws.receive_text()
                        await backend.send(msg)
                except WebSocketDisconnect:
                    pass
                except Exception:
                    pass

            async def backend_to_client():
                try:
                    async for msg in backend:
                        if msg.__class__.__name__ == "str":
                            await ws.send_text(msg)
                        else:
                            await ws.send_bytes(msg.data if hasattr(msg, "data") else bytes(msg))
                except Exception:
                    pass

            import asyncio
            await asyncio.gather(client_to_backend(), backend_to_client())
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# TERMINAL — WebSocket proxy to local terminal-server (Docker 4022)
# ══════════════════════════════════════════════════════════════════════════════

from fastapi import WebSocket, WebSocketDisconnect
import websockets

TERMINAL_WS = "ws://127.0.0.1:4022/"

@app.websocket("/terminal/ws")
async def terminal_proxy(ws: WebSocket):
    await ws.accept()
    try:
        async with websockets.connect(TERMINAL_WS, max_size=None) as backend:
            async def client_to_backend():
                try:
                    while True:
                        msg = await ws.receive_text()
                        await backend.send(msg)
                except WebSocketDisconnect:
                    pass
                except Exception:
                    pass

            async def backend_to_client():
                try:
                    async for msg in backend:
                        if msg.__class__.__name__ == "str":
                            await ws.send_text(msg)
                        else:
                            await ws.send_bytes(msg.data if hasattr(msg, "data") else bytes(msg))
                except Exception:
                    pass

            import asyncio
            await asyncio.gather(client_to_backend(), backend_to_client())
    except Exception:
        pass
