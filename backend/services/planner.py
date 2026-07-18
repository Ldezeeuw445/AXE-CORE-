"""AXE Autonomous Task Planner — multi-step task decomposition.

Inspired by Mark XXXIX-OR's agent_task planner.
Breaks complex goals into actionable steps that can be executed
via the action registry.
"""
import os
import json
import asyncio
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

from google import genai
from google.genai import types

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_PLANNER_MODEL", "gemini-2.5-flash")


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class PlanStep:
    id: str
    description: str
    action_id: Optional[str] = None
    action_params: Dict[str, Any] = field(default_factory=dict)
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[dict] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    depends_on: List[str] = field(default_factory=list)


@dataclass
class TaskPlan:
    id: str
    goal: str
    description: str
    steps: List[PlanStep]
    status: TaskStatus = TaskStatus.PENDING
    created_at: str = ""
    completed_at: Optional[str] = None
    context: Optional[str] = None
    
    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now(timezone.utc).isoformat()


PLANNER_SYSTEM_PROMPT = (
    "You are AXE Planner — an autonomous task decomposition engine. "
    "You break complex operator goals into discrete, executable steps. "
    "Each step must map to an AXE action or a clear reasoning step. "
    "Output ONLY valid JSON. No prose, no markdown."
)


def _get_client():
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured")
    return genai.Client(api_key=GEMINI_API_KEY)


async def create_plan(
    goal: str,
    context: Optional[str] = None,
    available_actions: Optional[List[dict]] = None,
    session_id: Optional[str] = None,
) -> TaskPlan:
    """Create a task plan for a given goal.
    
    Args:
        goal: The high-level goal to achieve
        context: Additional context about the task
        available_actions: List of available action definitions
        session_id: Optional session ID
    
    Returns:
        TaskPlan with decomposed steps
    """
    plan_id = f"plan-{session_id or datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    
    action_list = ""
    if available_actions:
        action_list = "\n\nAVAILABLE ACTIONS:\n"
        for a in available_actions:
            action_list += f"- {a['id']}: {a['description']}\n"
    
    prompt = (
        f"Decompose this goal into executable steps.\n\nGOAL: {goal}\n"
        f"{action_list}\n"
        "Return JSON exactly:\n"
        '{"description":"1-2 sentence summary","steps":['
        '{"id":"step_1","description":"...","action_id":"optional_action_id",'
        '"action_params":{},"depends_on":[]}]}\n'
        "Each step should be concrete and actionable. If a step maps to an available action, "
        "include the action_id and appropriate parameters. Use depends_on for sequential dependencies."
    )
    
    if context:
        prompt += f"\n\nCONTEXT: {context}"
    
    try:
        client = _get_client()
        contents = [types.Content(role="user", parts=[types.Part(text=prompt)])]
        
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=PLANNER_SYSTEM_PROMPT,
                max_output_tokens=4096,
                temperature=0.1,
            ),
        )
        
        text = ""
        if response.candidates:
            for candidate in response.candidates:
                if candidate.content and candidate.content.parts:
                    for part in candidate.content.parts:
                        if part.text:
                            text += part.text
        
        text = text.strip()
        
        # Clean JSON
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.lower().startswith("json"):
                text = text[4:]
            text = text.rsplit("```", 1)[0].strip()
        
        parsed = json.loads(text)
        
        steps = []
        for s in parsed.get("steps", []):
            steps.append(PlanStep(
                id=s.get("id", f"step_{len(steps)+1}"),
                description=s.get("description", ""),
                action_id=s.get("action_id"),
                action_params=s.get("action_params", {}),
                depends_on=s.get("depends_on", []),
            ))
        
        return TaskPlan(
            id=plan_id,
            goal=goal,
            description=parsed.get("description", "No description provided"),
            steps=steps,
            context=context,
        )
    
    except Exception as e:
        # Fallback plan with a single step
        return TaskPlan(
            id=plan_id,
            goal=goal,
            description=f"Execute goal: {goal}",
            steps=[PlanStep(
                id="step_1",
                description=f"Execute the goal directly: {goal}",
                action_id="ai_chat",
                action_params={"message": goal},
            )],
            context=context,
        )


async def execute_plan(
    plan: TaskPlan,
    db=None,
    email: Optional[str] = None,
    max_concurrent: int = 3,
) -> TaskPlan:
    """Execute a task plan step by step.
    
    Args:
        plan: The TaskPlan to execute
        db: Database connection
        email: Operator email
        max_concurrent: Max concurrent steps (for independent steps)
    
    Returns:
        Updated TaskPlan with results
    """
    plan.status = TaskStatus.RUNNING
    
    from services.action_registry import get_registry
    registry = get_registry()
    
    completed_steps = set()
    failed_steps = set()
    
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def run_step(step: PlanStep):
        step.status = TaskStatus.RUNNING
        step.started_at = datetime.now(timezone.utc).isoformat()
        
        async with semaphore:
            try:
                if step.action_id:
                    # Inject context from previous steps if needed
                    params = dict(step.action_params)
                    
                    # If params reference a previous step result, resolve it
                    for prev_id in step.depends_on:
                        prev_step = next((s for s in plan.steps if s.id == prev_id), None)
                        if prev_step and prev_step.result:
                            # Simple heuristic: if a param contains {prev_step.result}, inject it
                            for key, val in params.items():
                                if isinstance(val, str) and "{" in val:
                                    params[key] = val.replace(
                                        f"{{{prev_id}}}",
                                        json.dumps(prev_step.result)[:500]
                                    )
                    
                    result = await registry.invoke(
                        step.action_id,
                        params,
                        db=db,
                        email=email,
                    )
                    step.result = result
                    step.status = TaskStatus.COMPLETED if result.get("status") == "ok" else TaskStatus.FAILED
                    if result.get("status") != "ok":
                        step.error = result.get("error", "Unknown error")
                else:
                    # Reasoning step — just mark as completed
                    step.status = TaskStatus.COMPLETED
                    step.result = {"status": "ok", "note": "Reasoning step completed", "description": step.description}
                
            except Exception as e:
                step.status = TaskStatus.FAILED
                step.error = str(e)
                step.result = {"status": "error", "error": str(e)}
            
            step.completed_at = datetime.now(timezone.utc).isoformat()
            completed_steps.add(step.id)
            if step.status == TaskStatus.FAILED:
                failed_steps.add(step.id)
    
    # Execute steps respecting dependencies
    while len(completed_steps) + len(failed_steps) < len(plan.steps):
        ready = [
            s for s in plan.steps
            if s.id not in completed_steps and s.id not in failed_steps
            and all(d in completed_steps for d in s.depends_on)
        ]
        
        if not ready:
            # Deadlock or all remaining depend on failed steps
            for s in plan.steps:
                if s.id not in completed_steps and s.id not in failed_steps:
                    s.status = TaskStatus.CANCELLED
                    s.error = "Dependencies failed or circular dependency detected"
            break
        
        await asyncio.gather(*[run_step(s) for s in ready])
    
    # Update plan status
    if all(s.status == TaskStatus.COMPLETED for s in plan.steps):
        plan.status = TaskStatus.COMPLETED
    elif any(s.status == TaskStatus.FAILED for s in plan.steps):
        plan.status = TaskStatus.FAILED
    else:
        plan.status = TaskStatus.COMPLETED  # Partial completion
    
    plan.completed_at = datetime.now(timezone.utc).isoformat()
    return plan


def plan_to_dict(plan: TaskPlan) -> dict:
    """Convert a TaskPlan to a serializable dict."""
    return {
        "id": plan.id,
        "goal": plan.goal,
        "description": plan.description,
        "status": plan.status.value,
        "created_at": plan.created_at,
        "completed_at": plan.completed_at,
        "context": plan.context,
        "steps": [
            {
                "id": s.id,
                "description": s.description,
                "action_id": s.action_id,
                "action_params": s.action_params,
                "status": s.status.value,
                "result": s.result,
                "error": s.error,
                "started_at": s.started_at,
                "completed_at": s.completed_at,
                "depends_on": s.depends_on,
            }
            for s in plan.steps
        ],
    }
