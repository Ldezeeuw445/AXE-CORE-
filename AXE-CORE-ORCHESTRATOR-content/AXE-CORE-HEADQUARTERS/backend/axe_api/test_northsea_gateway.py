"""northsea_gateway: AXE CORE als MCP-client. Geen netwerk: _run_tool_call is nagebootst."""
import asyncio
from dataclasses import dataclass, field

import pytest

import northsea_gateway as g


@dataclass
class FakeBlock:
    text: str


@dataclass
class FakeResult:
    structured_content: object = None
    is_error: bool = False
    content: list = field(default_factory=list)


def test_onbekende_actie_wordt_geweigerd():
    with pytest.raises(g.NorthSeaGatewayError) as exc:
        asyncio.run(g.call_action("send_approved_communication", {}))
    assert exc.value.code == "unknown_action"


def test_hoog_risico_tools_staan_niet_in_de_lijst():
    # approve_draft, send_approved_communication, create_task, update_task en
    # handle_event zijn expliciet weggelaten: schrijven/versturen/goedkeuren
    # blijven achter de bestaande approval-schermen.
    verboden = {
        "northsea_approve_draft", "northsea_send_approved_communication",
        "northsea_create_task", "northsea_update_task", "northsea_handle_event",
    }
    gebruikt = {spec.tool for spec in g.ACTIONS.values()}
    assert not (verboden & gebruikt)


def test_ontbrekend_verplicht_veld_geeft_missing_params():
    with pytest.raises(g.NorthSeaGatewayError) as exc:
        asyncio.run(g.call_action("get_next_actions", {}))
    assert exc.value.code == "missing_params"


def test_geslaagde_aanroep_geeft_het_gestructureerde_resultaat_ongewijzigd_terug(monkeypatch):
    gezien = {}

    async def fake_run_tool_call(tool, arguments):
        gezien["tool"] = tool
        gezien["arguments"] = arguments
        return FakeResult(structured_content={"blockers": [], "crew": {"backend": "northsea_local", "fallback_used": False}})

    monkeypatch.setattr(g, "_run_tool_call", fake_run_tool_call)
    uit = asyncio.run(g.call_action("get_next_actions", {"opportunity_id": "abc-123"}))
    assert gezien["tool"] == "northsea_get_next_actions"
    assert gezien["arguments"] == {"opportunity_id": "abc-123"}
    assert uit == {"action": "get_next_actions", "tool": "northsea_get_next_actions",
                   "result": {"blockers": [], "crew": {"backend": "northsea_local", "fallback_used": False}}}


def test_prepare_outreach_forceert_save_as_pending_draft_false(monkeypatch):
    gezien = {}

    async def fake_run_tool_call(tool, arguments):
        gezien["arguments"] = arguments
        return FakeResult(structured_content={"draft": "…"})

    monkeypatch.setattr(g, "_run_tool_call", fake_run_tool_call)
    asyncio.run(g.call_action("prepare_outreach", {"objective": "confirm availability", "save_as_pending_draft": True}))
    assert gezien["arguments"]["save_as_pending_draft"] is False


def test_tool_fout_wordt_een_gatewayfout_met_de_tooltekst(monkeypatch):
    async def fake_run_tool_call(tool, arguments):
        return FakeResult(is_error=True, content=[FakeBlock(text="insufficient_scope: this tool requires scope(s): northsea.research")])

    monkeypatch.setattr(g, "_run_tool_call", fake_run_tool_call)
    with pytest.raises(g.NorthSeaGatewayError) as exc:
        asyncio.run(g.call_action("research_counterparty", {"objective": "verify seller authority"}))
    assert exc.value.code == "tool_error"
    assert "insufficient_scope" in exc.value.message


def test_transportfout_wordt_upstream_unreachable(monkeypatch):
    async def fake_run_tool_call(tool, arguments):
        raise ConnectionError("boom")

    monkeypatch.setattr(g, "_run_tool_call", fake_run_tool_call)
    with pytest.raises(g.NorthSeaGatewayError) as exc:
        asyncio.run(g.call_action("get_next_actions", {"opportunity_id": "abc-123"}))
    assert exc.value.code == "upstream_unreachable"


def test_run_tool_call_weigert_zonder_service_token(monkeypatch):
    monkeypatch.delenv(g.SERVICE_TOKEN_ENV, raising=False)
    with pytest.raises(g.NorthSeaGatewayError) as exc:
        asyncio.run(g._run_tool_call("northsea_get_next_actions", {"opportunity_id": "abc-123"}))
    assert exc.value.code == "not_configured"
