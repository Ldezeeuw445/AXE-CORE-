from __future__ import annotations

import contextlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from mcp.server.auth.middleware.auth_context import auth_context_var  # noqa: E402
from mcp.server.auth.middleware.bearer_auth import AuthenticatedUser  # noqa: E402
from mcp.server.auth.provider import AccessToken  # noqa: E402

from fakes import FakeAuditor, FakeCrew, FakeRepo, FakeResearch  # noqa: E402
from northsea_mcp.config import Settings  # noqa: E402
from northsea_mcp.policy import SCOPES  # noqa: E402
from northsea_mcp.server import create_app  # noqa: E402
from northsea_mcp.service import Caller, NorthSeaService  # noqa: E402
from northsea_mcp.store import Store  # noqa: E402

PUBLIC = "https://mcp.northsea.test"
USER = "acff7a12-1111-481d-a7a9-cc07583b8069"
ALL = frozenset(SCOPES)
READ = frozenset({"northsea.read", "northsea.deal.read"})


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(public_url=PUBLIC, commodities_url="https://commodities.supabase.test", commodities_key="svc-test",
                    axe_url="https://axe.supabase.test", axe_key="axe-test", allowed_user_ids=frozenset({USER}),
                    state_db=str(tmp_path / "state.db"))


@pytest.fixture
def store(settings) -> Store:
    return Store(settings.state_db)


@pytest.fixture
def repo() -> FakeRepo:
    return FakeRepo()


@pytest.fixture
def research() -> FakeResearch:
    return FakeResearch()


@pytest.fixture
def crew() -> FakeCrew:
    return FakeCrew()


@pytest.fixture
def auditor() -> FakeAuditor:
    return FakeAuditor()


@pytest.fixture
def service(repo, research, crew) -> NorthSeaService:
    return NorthSeaService(repo, research, crew)


@pytest.fixture
def app(settings, repo, research, crew, store, auditor):
    return create_app(settings, repo=repo, research=research, crew=crew, store=store, auditor=auditor)


@pytest.fixture
def mcp_server(app):
    return app.state.northsea["mcp"]


def caller(scopes=ALL, principal=USER) -> Caller:
    return Caller(principal=principal, client_id="test-client", scopes=frozenset(scopes))


@contextlib.contextmanager
def signed_in(scopes=ALL, subject=USER, client_id="test-client"):
    """Zet een geauthenticeerde gebruiker in de SDK-authcontext, zoals de HTTP-middleware doet."""
    token = AccessToken(token="test", client_id=client_id, scopes=sorted(scopes), resource=f"{PUBLIC}/mcp", subject=subject)
    reset = auth_context_var.set(AuthenticatedUser(token))
    try:
        yield
    finally:
        auth_context_var.reset(reset)
