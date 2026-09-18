"""
northsea_gateway.py -- AXE CORE as an MCP client of the NorthSea MCP.

## What this is, and what it deliberately is not

This is NOT a second CrewGateway, NOT a second policy layer, and NOT a second
research implementation. It is a thin MCP client -- the same `mcp` SDK, the
same governed boundary ChatGPT/Claude already use (see
backend/northsea_mcp/docs/CHATGPT_MCP_CONNECTION.md) -- that forwards one of a
small, fixed list of business actions to the existing NorthSea MCP tool of the
same name. Scopes, rate limits, budget, crew routing and audit
(`core_audit_log` / `northsea_audit_events`) all stay on the NorthSea MCP side;
none of that service.py/policy.py/server.py logic is duplicated here.

## Auth

One service token, issued once on the API box with
`python -m northsea_mcp.admin issue --label axe-core --scopes ...`
(see docs/northsea/ACTIVATION_RUNBOOK.md). Never via OAuth/login: this is a
backend-to-backend connection, not a human sitting in a chat client. The token
lives only in `NORTHSEA_MCP_SERVICE_TOKEN` in axe_api's own environment --
never in git, never sent to the frontend, never logged.

## What is deliberately NOT in ACTIONS

`northsea_approve_draft`, `northsea_send_approved_communication`,
`northsea_create_task`, `northsea_update_task` and the generic
`northsea_handle_event` entry point are not exposed here: writing, sending,
approving and the generic event ingress stay out of AXE CORE until a separate,
explicit authorization (ACTIVATION_RUNBOOK.md step 7). `northsea_prepare_outreach`
is exposed, but `save_as_pending_draft` is always forced to `False` here -- it
can draft text, never leave a pending draft behind.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger("axe_api.northsea_gateway")

MCP_URL = os.environ.get("NORTHSEA_MCP_URL", "https://mcp.northseacommodity.com/mcp")
SERVICE_TOKEN_ENV = "NORTHSEA_MCP_SERVICE_TOKEN"
# Boven de DEEP_TIMEOUT (190s) aan de MCP-kant (server.py), zodat een echte
# crew-run niet hier al afkapt vlak voordat de MCP zelf zijn nette timeout geeft.
CALL_TIMEOUT_S = 195.0


class NorthSeaGatewayError(Exception):
    """One stable shape for the axe_api route: a code and a message, never a stacktrace."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ActionSpec:
    tool: str
    required: tuple[str, ...]
    optional: tuple[str, ...] = ()
    # Fields the caller may never override (e.g. forcing save_as_pending_draft=False).
    fixed: dict[str, Any] = field(default_factory=dict)


# Business-semantic actions the Global Trade Center UI may call. Read/research
# only -- writing, sending and approving stay behind the existing approval
# screens (docs/northsea/ACTIVATION_RUNBOOK.md step 7).
ACTIONS: dict[str, ActionSpec] = {
    "get_next_actions": ActionSpec("northsea_get_next_actions", ("opportunity_id",)),
    "review_deal": ActionSpec("northsea_review_deal", ("opportunity_id",)),
    "qualify_opportunity": ActionSpec("northsea_qualify_opportunity", ("opportunity_id",), ("depth",)),
    "investigate_blockers": ActionSpec("northsea_investigate_blockers", ("opportunity_id",), ("blocker_codes", "priority", "depth")),
    "assess_match": ActionSpec("northsea_assess_match", ("buyer_requirement_id", "supplier_offer_id")),
    "process_reply": ActionSpec("northsea_process_reply", ("communication_id",)),
    "research_counterparty": ActionSpec("northsea_research_counterparty", ("objective",), ("counterparty_id", "context", "priority", "depth")),
    "prepare_outreach": ActionSpec(
        "northsea_prepare_outreach", ("objective",), ("opportunity_id", "counterparty_id", "channel", "template"),
        fixed={"save_as_pending_draft": False},
    ),
}


def _build_arguments(spec: ActionSpec, params: dict[str, Any]) -> dict[str, Any]:
    missing = [f for f in spec.required if not params.get(f)]
    if missing:
        raise NorthSeaGatewayError("missing_params", f"Missing required field(s): {', '.join(missing)}")
    arguments = {f: params[f] for f in spec.required}
    for f in spec.optional:
        if params.get(f) is not None:
            arguments[f] = params[f]
    arguments.update(spec.fixed)
    return arguments


def _first_text(result: Any) -> str | None:
    for block in getattr(result, "content", None) or []:
        text = getattr(block, "text", None)
        if text:
            return text
    return None


async def _run_tool_call(tool: str, arguments: dict[str, Any]):
    # Imported lazily: axe_api's test suite runs fine without `mcp`/`httpx2`
    # installed for tests that never touch this module (and this module is
    # exercised in tests via monkeypatching this function, not real sockets).
    import httpx2
    from mcp import Client
    from mcp.client.streamable_http import streamable_http_client

    token = os.environ.get(SERVICE_TOKEN_ENV, "")
    if not token:
        raise NorthSeaGatewayError("not_configured", f"{SERVICE_TOKEN_ENV} is not set on this backend.")

    http = httpx2.AsyncClient(headers={"Authorization": f"Bearer {token}"}, timeout=CALL_TIMEOUT_S)
    try:
        async with Client(streamable_http_client(MCP_URL, http_client=http)) as session:
            return await session.call_tool(tool, arguments)
    finally:
        await http.aclose()


async def call_action(action: str, params: dict[str, Any]) -> dict[str, Any]:
    """Forward one allowed business action to the real NorthSea MCP tool.

    Returns the tool's own structured result unchanged (including a `crew`
    block with route/backend/actual_crew/fallback_used when the tool used
    CrewAI) -- nothing here invents or augments it.
    """
    spec = ACTIONS.get(action)
    if spec is None:
        raise NorthSeaGatewayError("unknown_action", f"'{action}' is not an allowed NorthSea action.")
    arguments = _build_arguments(spec, params)

    try:
        result = await _run_tool_call(spec.tool, arguments)
    except NorthSeaGatewayError:
        raise
    except Exception as e:  # noqa: BLE001 -- transport/library errors, never leak internals to the UI
        log.warning("northsea_gateway transport error for action=%s tool=%s: %s", action, spec.tool, e)
        raise NorthSeaGatewayError("upstream_unreachable", "Could not reach the NorthSea MCP service.") from None

    if getattr(result, "is_error", False):
        raise NorthSeaGatewayError("tool_error", _first_text(result) or "The NorthSea MCP tool reported an error.")

    data = getattr(result, "structured_content", None)
    if data is None:
        text = _first_text(result)
        try:
            data = json.loads(text) if text else {}
        except (TypeError, ValueError):
            raise NorthSeaGatewayError("bad_response", "The NorthSea MCP returned an unstructured response.") from None

    return {"action": action, "tool": spec.tool, "result": data}
