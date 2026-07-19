"""AXE CORE project/capability registry API."""
from typing import Optional
from fastapi import APIRouter, Depends
from routes.auth import get_current_operator
from services.project_registry import get_capability, get_project, list_capabilities, list_projects

router = APIRouter(prefix="/api/project-registry", tags=["project-registry"])

@router.get("")
async def registry_overview(_: str = Depends(get_current_operator)):
    return {"status": "ok", "projects": list_projects(), "capabilities": list_capabilities()}

@router.get("/projects")
async def projects(_: str = Depends(get_current_operator)):
    return {"status": "ok", "projects": list_projects(), "count": len(list_projects())}

@router.get("/projects/{project_id}")
async def project(project_id: str, _: str = Depends(get_current_operator)):
    result = get_project(project_id)
    return {"status": "ok", "project": result} if result else {"status": "error", "error": "Project not found"}

@router.get("/capabilities")
async def capabilities(project_id: Optional[str] = None, category: Optional[str] = None, _: str = Depends(get_current_operator)):
    result = list_capabilities(project_id, category)
    return {"status": "ok", "capabilities": result, "count": len(result)}

@router.get("/capabilities/{capability_id}")
async def capability(capability_id: str, _: str = Depends(get_current_operator)):
    result = get_capability(capability_id)
    return {"status": "ok", "capability": result} if result else {"status": "error", "error": "Capability not found"}
