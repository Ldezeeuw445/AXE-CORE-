"""AXE Intelligence Terminal — FastAPI backend.
Auth (email/password JWT) + 8 OSINT adapters + sweep + Claude correlation.
"""
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from routes import auth as auth_routes  # noqa: E402
from routes import sources as sources_routes  # noqa: E402
from routes import ai as ai_routes  # noqa: E402
from routes import system as system_routes  # noqa: E402
from services.sweep import scheduled_sweep_loop  # noqa: E402
import asyncio  # noqa: E402

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ensure default operator exists
    await auth_routes.ensure_default_operator(db)
    # start background sweep loop (every 30s)
    task = asyncio.create_task(scheduled_sweep_loop(db))
    try:
        yield
    finally:
        task.cancel()
        client.close()


app = FastAPI(title="AXE Intelligence Terminal", lifespan=lifespan)
app.state.db = db

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(sources_routes.router)
app.include_router(ai_routes.router)
app.include_router(system_routes.router)


@app.get("/api/")
async def root():
    return {"name": "AXE Intelligence Terminal", "status": "online", "ts": datetime.now(timezone.utc).isoformat()}
