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
from routes import watchlists as watchlists_routes  # noqa: E402
from routes import history as history_routes  # noqa: E402
from routes import alerts as alerts_routes  # noqa: E402
from routes import tradingos as tradingos_routes  # noqa: E402
from routes import feedback as feedback_routes  # noqa: E402
from routes import knowledge as knowledge_routes  # noqa: E402
from routes import kimi as kimi_routes  # noqa: E402
from routes import browser as browser_routes  # noqa: E402
from routes import memory as memory_routes  # noqa: E402
from routes import planner as planner_routes  # noqa: E402
from routes import vision as vision_routes  # noqa: E402
from routes import files as files_routes  # noqa: E402
from routes import actions as actions_routes  # noqa: E402
from routes import project_registry as project_registry_routes  # noqa: E402

from services.sweep import scheduled_sweep_loop  # noqa: E402
from services.aisstream import start_global_stream  # noqa: E402
import asyncio  # noqa: E402

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ensure default operator exists
    await auth_routes.ensure_default_operator(db)
    # start background sweep loop (every 30s)
    sweep_task = asyncio.create_task(scheduled_sweep_loop(db))
    # start global AISStream WebSocket consumer (non-blocking; no-op if key absent)
    ais_task = asyncio.create_task(start_global_stream())
    try:
        yield
    finally:
        sweep_task.cancel()
        ais_task.cancel()
        client.close()


app = FastAPI(title="AXE Intelligence Terminal", lifespan=lifespan)
app.state.db = db

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[
        o.strip() for o in os.environ.get(
            "CORS_ORIGINS",
            "https://tradingosapp.com,http://localhost:3000,http://localhost:5173,http://localhost:5002,*",
        ).split(",") if o.strip()
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(sources_routes.router)
app.include_router(ai_routes.router)
app.include_router(system_routes.router)
app.include_router(watchlists_routes.router)
app.include_router(history_routes.router)
app.include_router(alerts_routes.router)
app.include_router(tradingos_routes.router)
app.include_router(feedback_routes.router)
app.include_router(knowledge_routes.router)
app.include_router(kimi_routes.router)
app.include_router(browser_routes.router)
app.include_router(memory_routes.router)
app.include_router(planner_routes.router)
app.include_router(vision_routes.router)
app.include_router(files_routes.router)
app.include_router(actions_routes.router)
app.include_router(project_registry_routes.router)


@app.get("/api/")
async def root():
    return {"name": "AXE Intelligence Terminal", "status": "online", "ts": datetime.now(timezone.utc).isoformat()}
