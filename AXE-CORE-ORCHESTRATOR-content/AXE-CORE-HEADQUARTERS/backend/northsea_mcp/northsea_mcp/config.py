"""Instellingen uit de omgeving. Nooit uit de code, nooit gelogd.

Twee Supabase-projecten, en dat is geen vergissing:

- AXE Commodities (`NORTHSEA_SUPABASE_*`) is de bron van waarheid voor NorthSea:
  bedrijven, deals, communicatie, drafts, taken.
- AXE Companion (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE`, dezelfde namen die
  axe-core-api al gebruikt) levert de LOGIN (Supabase Auth van Luka's AXE-account)
  en de AUDIT (`core_audit_log`, dezelfde tabel waar de API al in schrijft).

Ontbreekt een verplichte waarde, dan start de server niet en noemt hij de NAMEN
die ontbreken -- nooit waarden.
"""
from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field

from . import __version__


class ConfigError(RuntimeError):
    pass


VERPLICHT = (
    "NORTHSEA_MCP_PUBLIC_URL",
    "NORTHSEA_SUPABASE_URL",
    "NORTHSEA_SUPABASE_SERVICE_ROLE",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE",
    "NORTHSEA_MCP_ALLOWED_USER_IDS",
)


@dataclass(frozen=True)
class Settings:
    public_url: str
    commodities_url: str
    commodities_key: str
    axe_url: str
    axe_key: str
    allowed_user_ids: frozenset[str]
    state_db: str = "/opt/northsea-mcp/state.db"
    axe_api_url: str = "http://127.0.0.1:8001"
    axe_api_key: str = ""
    tavily_key: str = ""
    zenserp_key: str = ""
    crew_venv_py: str = "/opt/axe-crew-venv/bin/python3"
    # Toegewijde NorthSea CrewAI-deployments per route: {"deal_run": (url, token), ...}. Leeg = nog niet geleverd.
    crew_routes: dict[str, tuple[str, str]] = field(default_factory=dict)
    crew_fallback_on: tuple[str, ...] = ("dedicated_backend_not_configured", "dedicated_backend_unavailable",
                                         "health_check_failed", "capacity_exhausted", "timeout")
    crew_poll_s: float = 3.0
    access_token_ttl_s: int = 3600
    refresh_token_ttl_s: int = 30 * 24 * 3600
    auth_code_ttl_s: int = 300
    http_timeout_s: float = 20.0
    research_timeout_s: float = 130.0
    version: str = __version__
    extra: dict[str, str] = field(default_factory=dict)

    @property
    def issuer(self) -> str:
        return self.public_url.rstrip("/")

    @property
    def resource_url(self) -> str:
        """De MCP-resource zelf; tokens worden hiervoor uitgegeven (RFC 8707)."""
        return f"{self.issuer}/mcp"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        env = os.environ if env is None else env
        ontbreekt = [n for n in VERPLICHT if not (env.get(n) or "").strip()]
        if ontbreekt:
            raise ConfigError("Missing required environment variables: " + ", ".join(ontbreekt))
        public = env["NORTHSEA_MCP_PUBLIC_URL"].strip().rstrip("/")
        if not public.startswith("https://") and not env.get("NORTHSEA_MCP_ALLOW_HTTP"):
            raise ConfigError("NORTHSEA_MCP_PUBLIC_URL must be https:// in production")
        ids = frozenset(x.strip() for x in env["NORTHSEA_MCP_ALLOWED_USER_IDS"].split(",") if x.strip())
        if not ids:
            raise ConfigError("NORTHSEA_MCP_ALLOWED_USER_IDS is empty")

        def getal(naam: str, standaard: int) -> int:
            try:
                return int(env.get(naam, standaard))
            except ValueError as e:
                raise ConfigError(f"{naam} must be an integer") from e

        routes = {}
        for route in ("discovery", "deal", "intelligence", "operations"):
            url = (env.get(f"NORTHSEA_CREW_{route.upper()}_URL") or "").strip()
            token = (env.get(f"NORTHSEA_CREW_{route.upper()}_TOKEN") or "").strip()
            if url and token:
                if not url.startswith("https://"):
                    raise ConfigError(f"NORTHSEA_CREW_{route.upper()}_URL must be https://")
                routes[f"{route}_run"] = (url.rstrip("/"), token)
        fallback_raw = (env.get("NORTHSEA_CREW_FALLBACK_ON") or "").strip()
        fallback_on = Settings.crew_fallback_on if not fallback_raw else (
            () if fallback_raw.lower() == "none" else tuple(x.strip() for x in fallback_raw.split(",") if x.strip()))

        return cls(
            crew_routes=routes,
            crew_fallback_on=fallback_on,
            public_url=public,
            commodities_url=env["NORTHSEA_SUPABASE_URL"].strip().rstrip("/"),
            commodities_key=env["NORTHSEA_SUPABASE_SERVICE_ROLE"].strip(),
            axe_url=env["SUPABASE_URL"].strip().rstrip("/"),
            axe_key=env["SUPABASE_SERVICE_ROLE"].strip(),
            allowed_user_ids=ids,
            state_db=env.get("NORTHSEA_MCP_STATE_DB", "/opt/northsea-mcp/state.db"),
            axe_api_url=env.get("AXE_API_INTERNAL_URL", "http://127.0.0.1:8001").rstrip("/"),
            axe_api_key=env.get("AXE_API_KEY", ""),
            tavily_key=env.get("TAVILY_API_KEY", ""),
            zenserp_key=env.get("ZENSERP_API_KEY", ""),
            crew_venv_py=env.get("CREW_VENV_PY", "/opt/axe-crew-venv/bin/python3"),
            access_token_ttl_s=getal("NORTHSEA_MCP_ACCESS_TTL_S", 3600),
            refresh_token_ttl_s=getal("NORTHSEA_MCP_REFRESH_TTL_S", 30 * 24 * 3600),
        )
