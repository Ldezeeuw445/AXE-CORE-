"""Bevestigde uitval, herstel en een duurzame uitgaande meldingenlijst.

De bewaker draait buiten uvicorn: een API die dood is kan zichzelf niet melden.
SQLite bewaart incidenten en nog niet afgeleverde meldingen over een herstart.
Geen extra Supabase-tabellen; de apparaten lezen core_notifications en de
bestaande systeemnotitie. Geheimen en ruwe foutantwoorden worden niet opgeslagen.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

STATUS_PATH = "AXE/System/service-monitor.md"
USER_ID = "acff7a12-1111-481d-a7a9-cc07583b8069"
COMPONENTS = {
    "axe_core_api": ("AXE Core API", "Chat, tools and remote execution", "Check axe-core-api logs and host memory before restarting the service."),
    "local_api": ("Mac mini API", "Local coding agents and planner", "Check the local API log and the Mac mini connection."),
    "supabase": ("Supabase", "Memory, tasks, approvals and notifications", "Check the project status, credentials and Data API access."),
    "github": ("GitHub", "Repository access and code delivery", "Check GitHub status and the configured token permissions."),
    "ollama": ("Ollama", "Local model inference", "Check Ollama logs, memory limits and the configured model endpoint."),
    "docker": ("Docker", "Agent sandboxes and container workloads", "Check the Docker daemon and available disk space."),
    "openhands": ("OpenHands", "Coding-agent execution", "Check the OpenHands health endpoint and container logs."),
    "crewai": ("CrewAI", "Crew execution", "Check the isolated CrewAI environment and package import."),
    # Eén hartslag per product (docs/programma). Een bereikbare pagina is nog geen
    # werkend product; northsea_db leest daarom een echte rij in AXE Commodities.
    "axe_core_web": ("AXE Core web", "axeheadquarters.com on phone and iPad", "Check the Cloudflare Pages build of the orchestrator branch."),
    "companion_web": ("AXE Companion", "axecompanion.com for every subscriber", "Check axe-companion.service and nginx on the VPS."),
    "trading_os_web": ("Trading OS", "tradingosapp.com for every subscriber", "Check the hosting account of tradingosapp.com and its last deployment."),
    "axon_web": ("AXON Memory", "app.axon-memory.com and the memory MCP", "Check the Cloudflare Pages project of AXON and its last upload."),
    "northsea_mcp": ("NorthSea MCP", "Engine ticks, desk, crews and the ChatGPT connector", "Check northsea-mcp on the VPS and its health on port 8040."),
    "northsea_db": ("NorthSea database", "Every deal, contact and message of NorthSea", "Check AXE Commodities in Supabase; restart only after pausing northsea:engine."),
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ServiceMonitor:
    def __init__(self, path: str | Path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS probes (
                component TEXT PRIMARY KEY, stable TEXT, candidate TEXT,
                count INTEGER NOT NULL, first_at TEXT NOT NULL,
                checked_at TEXT NOT NULL, observed TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY, component TEXT NOT NULL,
                type TEXT NOT NULL, message TEXT NOT NULL,
                created_at TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0
            );
        """)
        self.db.commit()
        columns = {r[1] for r in self.db.execute("PRAGMA table_info(events)")}
        if "local_notified" not in columns:
            self.db.execute("ALTER TABLE events ADD COLUMN local_notified INTEGER NOT NULL DEFAULT 0")
            self.db.commit()

    def observe(self, component: str, status: str, at: str | None = None) -> None:
        if component not in COMPONENTS or status not in {"online", "offline", "unknown", "unconfigured"}:
            raise ValueError("Unknown monitor component or status")
        at = at or utc_now()
        with self.db:
            prev = self.db.execute("SELECT * FROM probes WHERE component=?", (component,)).fetchone()
            stable = prev["stable"] if prev else None
            # Onbekend is geen gemeten uitval. Een ontbrekende bovenliggende API
            # reset de bevestiging, zodat losse fouten niet bij elkaar optellen.
            count = (prev["count"] + 1) if prev and prev["candidate"] == status else 1
            first = prev["first_at"] if prev and prev["candidate"] == status else at
            candidate = status if status in {"online", "offline"} else None
            if candidate is None:
                count = 0
            if status == "unconfigured":
                stable = None
            # Een groene beginmeting is de nullijn. Uitval (ook bij de eerste
            # start) en herstel vragen twee opeenvolgende metingen.
            confirmed = (status == "online" and stable is None) or (candidate is not None and count >= 2)
            if confirmed and stable != status:
                if status == "offline" or stable == "offline":
                    label, impact, mitigation = COMPONENTS[component]
                    recovered = status == "online"
                    message = (
                        f"AXE service {'recovered' if recovered else 'outage'} — {label}\n"
                        f"Severity: {'recovery' if recovered else 'high'}. Component: {label}. "
                        f"Impact: {impact}. First step: "
                        f"{'Verify the affected workflow before resuming queued work.' if recovered else mitigation} "
                        f"Confirmed at: {at}."
                    )
                    event_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"axe-monitor:{component}:{status}:{first}"))
                    previous_alert = self.db.execute("SELECT * FROM events WHERE component=? AND type='error' ORDER BY created_at DESC LIMIT 1", (component,)).fetchone()
                    # Geen oude alarmbui na herstel van Supabase. Een lokaal
                    # reeds getoonde storing krijgt wél een herstelbericht.
                    unseen = recovered and previous_alert and not previous_alert["delivered"] and not previous_alert["local_notified"]
                    if recovered and previous_alert and not previous_alert["delivered"]:
                        self.db.execute("UPDATE events SET delivered=1 WHERE id=?", (previous_alert["id"],))
                    if not unseen:
                        self.db.execute(
                            "INSERT OR IGNORE INTO events(id,component,type,message,created_at) VALUES(?,?,?,?,?)",
                            (event_id, component, "success" if recovered else "error", message, at),
                        )
                stable = status
            self.db.execute("""
                INSERT INTO probes VALUES(?,?,?,?,?,?,?)
                ON CONFLICT(component) DO UPDATE SET stable=excluded.stable,
                candidate=excluded.candidate,count=excluded.count,first_at=excluded.first_at,
                checked_at=excluded.checked_at,observed=excluded.observed
            """, (component, stable, candidate, count, first, at, status))

    def pending(self) -> list[dict]:
        return [dict(r) for r in self.db.execute("SELECT * FROM events WHERE delivered=0 ORDER BY created_at,id")]

    def delivered(self, event_id: str) -> None:
        with self.db:
            self.db.execute("UPDATE events SET delivered=1 WHERE id=?", (event_id,))

    def local_pending(self) -> list[dict]:
        return [dict(r) for r in self.db.execute("SELECT * FROM events WHERE local_notified=0 AND delivered=0 ORDER BY created_at,id")]

    def local_notified(self, event_id: str) -> None:
        with self.db:
            self.db.execute("UPDATE events SET local_notified=1 WHERE id=?", (event_id,))

    def snapshot(self, at: str | None = None) -> dict:
        return {
            "checked_at": at or utc_now(),
            "interval_seconds": 60,
            "pending_notifications": len(self.pending()),
            "services": [{"component": r["component"], "label": COMPONENTS[r["component"]][0],
                          "status": r["observed"], "confirmed": r["stable"], "checked_at": r["checked_at"]}
                         for r in self.db.execute("SELECT * FROM probes ORDER BY component")],
        }
