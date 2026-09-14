"""ASGI-ingang voor uvicorn: `uvicorn --factory northsea_mcp.app:create`.

Een factory en geen module-niveau `app`: dan leest pas het draaiende proces de
omgeving, en faalt een import in een test niet op ontbrekende sleutels.
"""
from __future__ import annotations

import logging

from .server import create_app


def create():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    return create_app()
