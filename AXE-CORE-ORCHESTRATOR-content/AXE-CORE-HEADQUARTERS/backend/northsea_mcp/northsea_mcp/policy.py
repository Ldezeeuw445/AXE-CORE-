"""Scopes, risicoklassen, identiteitsbeleid en goedkeuringen.

Dit is de enige plek waar staat wie wat mag. De server handhaaft het ZELF, los
van wat een client (ChatGPT) aan bevestigingsschermen toont: een client-dialoog
beschermt de gebruiker, niet het bedrijf.

Bronnen voor de regels, niet verzonnen:
- NorthSea POLICIES.md en crewai/APPROVALS.md (canonieke desk-pack, 14 sep 2026);
- de bestaande edge function `northsea-desk`: een gevoelige draft goedkeuren of
  versturen mag alleen met een getekende commissie-afspraak op de deal, en een
  deal voorbij "introduced" ook;
- `deal_automation_policy` in AXE Commodities.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Risk(str, Enum):
    READ_ONLY = "READ_ONLY"
    RESEARCH = "RESEARCH"
    DRAFT = "DRAFT"
    LOW_RISK_WRITE = "LOW_RISK_WRITE"
    HIGH_IMPACT_WRITE = "HIGH_IMPACT_WRITE"


# Scopes. Bewust klein; `northsea.identity` staat los omdat identiteiten van
# tegenpartijen het gevoeligste zijn wat deze server heeft.
SCOPES: dict[str, str] = {
    "northsea.read": "Read NorthSea requirements, offers, match assessments and communications analysis.",
    "northsea.deal.read": "Read full operational deal state (stage, gates, blockers, tasks, evidence).",
    "northsea.research": "Run cost-bearing external research (web search, Perplexity) on counterparties and blockers.",
    "northsea.deal.write": "Create and update NorthSea deal tasks.",
    "northsea.communications.draft": "Prepare communication drafts (never sends).",
    "northsea.communications.send": "Send a communication that a human already approved.",
    "northsea.identity": "See real counterparty company and contact identities instead of redacted descriptors.",
    "northsea.admin": "Approve drafts and other administrative NorthSea decisions.",
}

# Interne scopes: alleen via `northsea_mcp.admin issue` op de box, nooit via OAuth (niet in SCOPES,
# dus ook niet in scopes_supported en niet te kiezen in het toestemmingsscherm).
INTERNAL_SCOPES: dict[str, str] = {
    "northsea.engine": "Run the deterministic Communication Engine tick (no sending, no LLM). Service tokens only.",
}

# Wat een nieuwe ChatGPT-verbinding standaard aanvraagt als de client niets vraagt.
DEFAULT_SCOPES = ("northsea.read", "northsea.deal.read", "northsea.research", "northsea.communications.draft")


@dataclass(frozen=True)
class ToolPolicy:
    name: str
    risk: Risk
    scopes: tuple[str, ...]          # ALLE nodig
    uses_crew: bool = False          # mag CrewAI gebruiken (alleen bij depth="deep")
    needs_idempotency_key: bool = False


TOOLS: dict[str, ToolPolicy] = {p.name: p for p in (
    ToolPolicy("northsea_review_deal", Risk.READ_ONLY, ("northsea.deal.read",)),
    ToolPolicy("northsea_get_next_actions", Risk.READ_ONLY, ("northsea.deal.read",)),
    ToolPolicy("northsea_qualify_opportunity", Risk.READ_ONLY, ("northsea.deal.read",), uses_crew=True),
    ToolPolicy("northsea_assess_match", Risk.READ_ONLY, ("northsea.read",)),
    ToolPolicy("northsea_process_reply", Risk.READ_ONLY, ("northsea.read",)),
    ToolPolicy("northsea_research_counterparty", Risk.RESEARCH, ("northsea.research",), uses_crew=True),
    ToolPolicy("northsea_find_suppliers", Risk.RESEARCH, ("northsea.research", "northsea.read")),
    ToolPolicy("northsea_find_buyers", Risk.RESEARCH, ("northsea.research", "northsea.read")),
    ToolPolicy("northsea_investigate_blockers", Risk.RESEARCH, ("northsea.research", "northsea.deal.read"), uses_crew=True),
    ToolPolicy("northsea_prepare_outreach", Risk.DRAFT, ("northsea.communications.draft",)),
    ToolPolicy("northsea_create_task", Risk.LOW_RISK_WRITE, ("northsea.deal.write",), needs_idempotency_key=True),
    ToolPolicy("northsea_update_task", Risk.LOW_RISK_WRITE, ("northsea.deal.write",), needs_idempotency_key=True),
    ToolPolicy("northsea_approve_draft", Risk.HIGH_IMPACT_WRITE, ("northsea.admin",), needs_idempotency_key=True),
    ToolPolicy("northsea_send_approved_communication", Risk.HIGH_IMPACT_WRITE,
               ("northsea.communications.send",), needs_idempotency_key=True),
)}
# Leestools (server_read.py): allemaal READ_ONLY, zonder bijwerkingen.
from .read_catalog import READ_TOOL_SCOPES  # noqa: E402

TOOLS.update({naam: ToolPolicy(naam, Risk.READ_ONLY, (scope,)) for naam, scope in READ_TOOL_SCOPES.items()})



class PolicyDenied(Exception):
    """Een regel weigert. `code` is stabiel en veilig om aan een client te tonen."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def missing_scopes(tool: str, granted: set[str] | frozenset[str]) -> list[str]:
    beleid = TOOLS[tool]
    return [s for s in beleid.scopes if s not in granted]


def require_scopes(tool: str, granted: set[str] | frozenset[str]) -> None:
    mist = missing_scopes(tool, granted)
    if mist:
        raise PolicyDenied("insufficient_scope", f"This tool requires scope(s): {', '.join(mist)}")


def may_see_identity(granted: set[str] | frozenset[str]) -> bool:
    return "northsea.identity" in granted


# Stages voorbij de introductie. Uit `northsea-desk`: daar horen ze alleen met een
# getekende commissie-afspraak.
PROTECTED_STAGES = frozenset({"introduced", "negotiating", "contracting", "shipment", "commission_due", "won"})


def check_sensitive_draft(draft: dict, opportunity: dict | None) -> None:
    """Dezelfde regel als `northsea-desk` bij approve/send van een gevoelige draft."""
    if not draft.get("sensitive_action"):
        return
    if not draft.get("opportunity_id") or opportunity is None:
        raise PolicyDenied("sensitive_requires_deal",
                           "A sensitive draft must be linked to a protected deal before approval or sending.")
    if (opportunity.get("commission_agreement_status") or "") != "signed":
        raise PolicyDenied("commission_protection_required",
                           "Signed commission protection is required before approving or sending a sensitive draft.")


# Woorden die van een uitgaand bericht een gevoelige (goedkeuringsplichtige)
# handeling maken. Zelfde lijst als `resend-inbound` gebruikt om inkomende mail
# als gevoelig te markeren, zodat in- en uitgaand dezelfde grens hebben.
SENSITIVE_TERMS = (
    "introduce us", "introduction", "buyer identity", "seller identity", "counterparty identity",
    "bank account", "banking instructions", "swift", "iban", "sign", "signature", "spa",
    "fee agreement", "commission", "imfpa", "ncnnda", "ncnda", "accept price", "accept offer",
    "we accept", "binding", "contract execution",
)


def is_sensitive_text(text: str) -> bool:
    t = (text or "").lower()
    return any(term in t for term in SENSITIVE_TERMS)
