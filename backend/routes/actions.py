"""AXE Action Registry routes — discoverable actions and invocation endpoints."""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from routes.auth import get_current_operator
from services.action_registry import get_registry

router = APIRouter(prefix="/api/actions", tags=["actions"])


class InvokeRequest(BaseModel):
    action_id: str
    parameters: Dict[str, Any] = {}
    session_id: Optional[str] = None


class InvokeResponse(BaseModel):
    status: str
    result: Optional[dict] = None
    error: Optional[str] = None
    action_id: Optional[str] = None


@router.get("/list")
async def actions_list(
    request: Request,
    category: Optional[str] = None,
    enabled_only: bool = True,
    search: Optional[str] = None,
    _: str = Depends(get_current_operator)
):
    """List all registered actions, optionally filtered by category or search query."""
    registry = get_registry()
    actions = registry.list_actions(
        category=category,
        enabled_only=enabled_only,
        search=search,
    )
    return {
        "status": "ok",
        "actions": actions,
        "categories": registry.get_categories(),
        "count": len(actions),
    }


@router.get("/categories")
async def actions_categories(_: str = Depends(get_current_operator)):
    """Get all unique action categories."""
    registry = get_registry()
    return {
        "status": "ok",
        "categories": registry.get_categories(),
    }


@router.get("/{action_id}")
async def actions_get(
    action_id: str,
    _: str = Depends(get_current_operator)
):
    """Get a specific action definition by ID."""
    registry = get_registry()
    action = registry.get(action_id)
    if not action:
        return {"status": "error", "error": f"Action '{action_id}' not found"}
    
    return {
        "status": "ok",
        "action": {
            "id": action.id,
            "name": action.name,
            "description": action.description,
            "category": action.category,
            "parameters": [
                {
                    "name": p.name,
                    "type": p.type,
                    "description": p.description,
                    "required": p.required,
                    "default": p.default,
                }
                for p in action.parameters
            ],
            "enabled": action.enabled,
            "requires_auth": action.requires_auth,
        }
    }


@router.post("/invoke", response_model=InvokeResponse)
async def actions_invoke(
    req: InvokeRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Invoke an action with the given parameters."""
    db = request.app.state.db
    registry = get_registry()
    result = await registry.invoke(
        req.action_id,
        req.parameters,
        db=db,
        email=email,
    )
    return InvokeResponse(
        status=result.get("status", "ok"),
        result=result if result.get("status") == "ok" else None,
        error=result.get("error"),
        action_id=req.action_id,
    )


@router.get("/health")
async def actions_health(_: str = Depends(get_current_operator)):
    """Check action registry health."""
    registry = get_registry()
    all_actions = registry.list_actions(enabled_only=False)
    return {
        "status": "ok",
        "total_actions": len(all_actions),
        "enabled_actions": len([a for a in all_actions if a["enabled"]]),
        "categories": registry.get_categories(),
    }
