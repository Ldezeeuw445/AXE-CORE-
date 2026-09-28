"""Strikte in- en uitvoercontracten voor de specialist-crews.

Malformed of onveilige uitvoer wordt geweigerd, niet geraden. Crews mogen geen
canonieke deal-mutatie, geen send, geen verified-zonder-bron.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

CrewFamily = Literal["deal_execution", "intelligence_operations", "counterparty_sourcing"]
FactLevel = Literal["VERIFIED", "SELF-CLAIMED", "INFERRED", "UNKNOWN", "CONFLICTING"]


class CrewInput(BaseModel):
    """Wat een specialist-crew mag zien. Geen file_read, geen secrets."""
    model_config = {"extra": "forbid"}
    action: str = Field(min_length=1)
    route: str = Field(min_length=1)
    event_id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    canonical_state: dict[str, Any]
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("canonical_state")
    @classmethod
    def _from_service(cls, v: dict[str, Any]) -> dict[str, Any]:
        if v.get("file_read") is True:
            raise ValueError("canonical state must not be loaded via file_read")
        if v.get("source") not in ("northsea_service", "handoff_payload_only"):
            raise ValueError("canonical state must come from the NorthSea service/MCP boundary")
        return v


class CrewTypedResult(BaseModel):
    """Getypt crew-resultaat. extra=ignore: onbekende velden vallen weg, ze muteren niets."""
    model_config = {"extra": "ignore"}
    analysis: str = Field(min_length=1)
    specialist_crew: str
    agents_run: int = Field(ge=1)
    claims: list[dict[str, Any]] = Field(default_factory=list)
    blockers: list[Any] = Field(default_factory=list)
    recommendations: list[Any] = Field(default_factory=list)
    next_best_action: dict[str, Any] | str | None = None
    approval_required: bool = False
    approval_granted: bool = False
    deals_mutated: bool = False
    committed: bool = False
    signed: bool = False
    outreach: bool = False
    tools: list[str] = Field(default_factory=list)
    skills: list[dict[str, Any]] = Field(default_factory=list)
    models: list[str] = Field(default_factory=list)
    budget_usage: dict[str, Any] = Field(default_factory=dict)
    typed_result: dict[str, Any] = Field(default_factory=dict)

    @field_validator("approval_granted", "deals_mutated", "committed", "signed", "outreach")
    @classmethod
    def _never_true(cls, v: bool) -> bool:
        if v:
            raise ValueError("crews cannot send, approve, sign, commit, or mutate deals")
        return v


def parse_typed_result(raw: dict[str, Any], *, specialist_crew: str, agents_run: int) -> tuple[CrewTypedResult | None, str | None]:
    data = dict(raw)
    data.setdefault("specialist_crew", specialist_crew)
    data.setdefault("agents_run", agents_run)
    if "typed_result" not in data:
        skip = {"analysis", "claims", "blockers", "recommendations", "tools", "skills", "models", "budget_usage",
                "specialist_crew", "agents_run", "approval_required", "approval_granted", "deals_mutated",
                "committed", "signed", "outreach", "next_best_action"}
        data["typed_result"] = {k: v for k, v in raw.items() if k not in skip}
    nba = data.get("next_best_action")
    if isinstance(nba, dict) and nba.get("approval_required"):
        data["approval_required"] = True
    try:
        return CrewTypedResult.model_validate(data), None
    except ValidationError as e:
        return None, f"crew output failed typed schema ({e.error_count()} error(s))"


def market_as_transaction_evidence(result: CrewTypedResult) -> bool:
    """True als de crew marktinfo als transactiebewijs probeert te promoveren (verboden)."""
    tr = result.typed_result or {}
    for row in tr.get("market_context") or []:
        if isinstance(row, dict) and (row.get("proof_of_delivery") or row.get("verification_status") == "verified"):
            return True
        if isinstance(row, dict) and str(row.get("classification") or "") not in ("context_only", "", "context"):
            if row.get("as_evidence") or row.get("transaction_evidence"):
                return True
    for ev in tr.get("document_findings") or []:
        if isinstance(ev, dict) and (ev.get("verified") is True or str(ev.get("verification_status") or "").lower() == "verified"):
            if str(ev.get("source") or ev.get("kind") or "").lower().find("market") >= 0:
                return True
    return False
