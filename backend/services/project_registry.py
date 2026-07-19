"""AXE CORE project and capability registry.

This is intentionally an AXE CORE control-plane registry: it describes how AXE
may work with independent products without moving their domain logic here.
"""
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional


@dataclass(frozen=True)
class Capability:
    id: str
    name: str
    description: str
    project_id: str
    category: str
    risk: str = "read"  # read, write, execute
    requires_approval: bool = False
    enabled: bool = True
    tags: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class Project:
    id: str
    name: str
    description: str
    role: str
    status: str = "active"
    capabilities: List[str] = field(default_factory=list)


PROJECTS = [
    Project("axe_core", "AXE CORE", "Personal Jarvis-style control center for building and operating Luka's apps.", "control_plane"),
    Project("trading_os", "TradingOS", "Independent premium trading terminal and trading assistant.", "product", capabilities=["trading_os.inspect", "trading_os.audit_release", "trading_os.plan_change"]),
    Project("axe_companion", "AXE Companion", "Independent mobile continuation of the same personal trading assistant.", "product", capabilities=["companion.inspect", "companion.audit_release", "companion.plan_change"]),
]

CAPABILITIES = [
    Capability("trading_os.inspect", "Inspect TradingOS", "Read project health, structure and current implementation without changing the product.", "trading_os", "project", "read", tags=["web", "trading"]),
    Capability("trading_os.audit_release", "Audit TradingOS release readiness", "Check tests, deployments, integrations and launch blockers for TradingOS.", "trading_os", "quality", "read", tags=["launch", "web"]),
    Capability("trading_os.plan_change", "Plan TradingOS change", "Create an implementation plan for a TradingOS improvement while preserving its ownership boundaries.", "trading_os", "development", "write", True, tags=["planning", "web"]),
    Capability("companion.inspect", "Inspect AXE Companion", "Read mobile project health, structure and current implementation without changing the product.", "axe_companion", "project", "read", tags=["mobile"]),
    Capability("companion.audit_release", "Audit Companion release readiness", "Check mobile builds, sync contracts and launch blockers for AXE Companion.", "axe_companion", "quality", "read", tags=["launch", "mobile"]),
    Capability("companion.plan_change", "Plan Companion change", "Create an implementation plan for a mobile improvement while preserving its ownership boundaries.", "axe_companion", "development", "write", True, tags=["planning", "mobile"]),
    Capability("axe_core.manage_projects", "Manage AXE projects", "Register and maintain AXE CORE project context and cross-project relationships.", "axe_core", "orchestration", "write", True, tags=["control-plane"]),
    Capability("axe_core.create_code_change", "Create code change", "Prepare a code change in an approved project branch for review.", "axe_core", "development", "write", True, tags=["github", "code"]),
    Capability("axe_core.run_release_check", "Run cross-project release check", "Compare web and mobile readiness, contracts and shared dependencies without merging the apps.", "axe_core", "quality", "read", tags=["launch", "cross-project"]),
]

_PROJECTS: Dict[str, Project] = {p.id: p for p in PROJECTS}
_CAPABILITIES: Dict[str, Capability] = {c.id: c for c in CAPABILITIES}


def list_projects() -> List[dict]:
    return [asdict(p) for p in PROJECTS]


def get_project(project_id: str) -> Optional[dict]:
    project = _PROJECTS.get(project_id)
    if not project:
        return None
    data = asdict(project)
    data["capability_definitions"] = [asdict(_CAPABILITIES[c]) for c in project.capabilities if c in _CAPABILITIES]
    return data


def list_capabilities(project_id: Optional[str] = None, category: Optional[str] = None) -> List[dict]:
    values = CAPABILITIES
    if project_id:
        values = [c for c in values if c.project_id == project_id]
    if category:
        values = [c for c in values if c.category == category]
    return [asdict(c) for c in values]


def get_capability(capability_id: str) -> Optional[dict]:
    capability = _CAPABILITIES.get(capability_id)
    return asdict(capability) if capability else None
