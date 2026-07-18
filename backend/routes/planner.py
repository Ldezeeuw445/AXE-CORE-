"""AXE Planner routes — multi-step task planning and execution endpoints."""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from routes.auth import get_current_operator
from services.planner import create_plan, execute_plan, plan_to_dict, TaskPlan

router = APIRouter(prefix="/api/planner", tags=["planner"])


class CreatePlanRequest(BaseModel):
    goal: str
    context: Optional[str] = None
    session_id: Optional[str] = None


class ExecutePlanRequest(BaseModel):
    plan: Dict[str, Any]
    session_id: Optional[str] = None


class PlanResponse(BaseModel):
    status: str
    plan: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@router.post("/create", response_model=PlanResponse)
async def planner_create(
    req: CreatePlanRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Create a task plan for a given goal."""
    try:
        from services.action_registry import get_registry
        registry = get_registry()
        actions = registry.list_actions(enabled_only=True)
        
        plan = await create_plan(
            goal=req.goal,
            context=req.context,
            available_actions=actions,
            session_id=req.session_id or f"planner-{email}",
        )
        
        return PlanResponse(
            status="ok",
            plan=plan_to_dict(plan),
        )
    except Exception as e:
        return PlanResponse(
            status="error",
            error=str(e),
        )


@router.post("/execute", response_model=PlanResponse)
async def planner_execute(
    req: ExecutePlanRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Execute a task plan step by step."""
    try:
        db = request.app.state.db
        
        # Reconstruct TaskPlan from dict
        plan_data = req.plan
        from services.planner import PlanStep, TaskStatus
        
        steps = []
        for s in plan_data.get("steps", []):
            status_map = {
                "pending": TaskStatus.PENDING,
                "running": TaskStatus.RUNNING,
                "completed": TaskStatus.COMPLETED,
                "failed": TaskStatus.FAILED,
                "cancelled": TaskStatus.CANCELLED,
            }
            steps.append(PlanStep(
                id=s.get("id", f"step_{len(steps)+1}"),
                description=s.get("description", ""),
                action_id=s.get("action_id"),
                action_params=s.get("action_params", {}),
                status=status_map.get(s.get("status", "pending"), TaskStatus.PENDING),
                depends_on=s.get("depends_on", []),
            ))
        
        plan = TaskPlan(
            id=plan_data.get("id", "unknown"),
            goal=plan_data.get("goal", ""),
            description=plan_data.get("description", ""),
            steps=steps,
            context=plan_data.get("context"),
        )
        plan.status = status_map.get(plan_data.get("status", "pending"), TaskStatus.PENDING)
        plan.created_at = plan_data.get("created_at", "")
        
        executed = await execute_plan(
            plan=plan,
            db=db,
            email=email,
        )
        
        return PlanResponse(
            status="ok",
            plan=plan_to_dict(executed),
        )
    except Exception as e:
        return PlanResponse(
            status="error",
            error=str(e),
        )


@router.post("/run")
async def planner_run(
    req: CreatePlanRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Create and execute a plan in one request."""
    try:
        db = request.app.state.db
        from services.action_registry import get_registry
        registry = get_registry()
        actions = registry.list_actions(enabled_only=True)
        
        plan = await create_plan(
            goal=req.goal,
            context=req.context,
            available_actions=actions,
            session_id=req.session_id or f"planner-{email}",
        )
        
        executed = await execute_plan(
            plan=plan,
            db=db,
            email=email,
        )
        
        return PlanResponse(
            status="ok",
            plan=plan_to_dict(executed),
        )
    except Exception as e:
        return PlanResponse(
            status="error",
            error=str(e),
        )


@router.get("/health")
async def planner_health(_: str = Depends(get_current_operator)):
    """Check planner service health."""
    from services.planner import GEMINI_API_KEY, GEMINI_MODEL
    return {
        "status": "ok",
        "configured": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL,
        "capabilities": [
            "Multi-step task decomposition",
            "Action-based plan execution",
            "Dependency-aware step ordering",
            "Concurrent independent steps",
        ],
    }
