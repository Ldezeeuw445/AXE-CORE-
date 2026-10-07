"""Alleen de missie-router achter een Bearer-check, voor de CLI-test.

main.py zelf start niet tegen een kale PostgREST (hij wil een echte Supabase-
URL); de router is precies dezelfde code die main.py ophangt.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import Depends, FastAPI, HTTPException  # noqa: E402
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer  # noqa: E402

import omgeving  # noqa: E402
from missie_api import maak_router  # noqa: E402

SLEUTEL = os.environ.get("AXE_API_KEY", "test-sleutel")
_bearer = HTTPBearer()


def auth(c: HTTPAuthorizationCredentials = Depends(_bearer)) -> None:
    if c.credentials != SLEUTEL:
        raise HTTPException(401, "Invalid API key")


app = FastAPI()
app.include_router(maak_router(omgeving.db_factory()), dependencies=[Depends(auth)])
