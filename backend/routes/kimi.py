"""AXE Kimi routes — KimiClaw, Kimi Code, Kimi Work endpoints."""
from typing import Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from routes.auth import get_current_operator
from services.kimi import (
    kimi_chat,
    kimi_browser_task,
    kimi_code_task,
    kimi_work_task,
    route_to_kimi,
    KIMI_MODELS,
)

router = APIRouter(prefix="/api/kimi", tags=["kimi"])


class KimiChatRequest(BaseModel):
    variant: str = "kimi-claw"  # kimi-claw, kimi-code, kimi-work
    message: str
    context: Optional[str] = None
    temperature: float = 0.3


class KimiBrowserRequest(BaseModel):
    task: str
    url: Optional[str] = None
    search_query: Optional[str] = None


class KimiCodeRequest(BaseModel):
    task: str
    code: Optional[str] = None
    language: Optional[str] = None
    file_path: Optional[str] = None


class KimiWorkRequest(BaseModel):
    task: str
    document: Optional[str] = None
    doc_type: Optional[str] = None


class KimiRouteRequest(BaseModel):
    intent: str = "auto"  # browser, code, work, auto
    message: str


@router.get("/models")
async def list_models(_: str = Depends(get_current_operator)):
    """List available Kimi models."""
    return {
        "models": KIMI_MODELS,
        "variants": [
            {"id": "kimi-claw", "name": "KimiClaw", "description": "Web intelligence & browser automation", "icon": "globe"},
            {"id": "kimi-code", "name": "Kimi Code", "description": "Code generation, review & debugging", "icon": "code"},
            {"id": "kimi-work", "name": "Kimi Work", "description": "Document analysis & productivity", "icon": "file-text"},
        ]
    }


@router.post("/chat")
async def kimiclient_chat(
    req: KimiChatRequest,
    _: str = Depends(get_current_operator)
):
    """Send a chat message to a specific Kimi variant."""
    result = await kimi_chat(
        variant=req.variant,
        message=req.message,
        context=req.context,
        temperature=req.temperature,
    )
    return result


@router.post("/browser")
async def kimiclient_browser(
    req: KimiBrowserRequest,
    _: str = Depends(get_current_operator)
):
    """Execute a browser/web task with KimiClaw."""
    result = await kimi_browser_task(
        task=req.task,
        url=req.url,
        search_query=req.search_query,
    )
    return result


@router.post("/code")
async def kimiclient_code(
    req: KimiCodeRequest,
    _: str = Depends(get_current_operator)
):
    """Execute a code task with Kimi Code."""
    result = await kimi_code_task(
        task=req.task,
        code=req.code,
        language=req.language,
        file_path=req.file_path,
    )
    return result


@router.post("/work")
async def kimiclient_work(
    req: KimiWorkRequest,
    _: str = Depends(get_current_operator)
):
    """Execute a document/productivity task with Kimi Work."""
    result = await kimi_work_task(
        task=req.task,
        document=req.document,
        doc_type=req.doc_type,
    )
    return result


@router.post("/route")
async def kimiclient_route(
    req: KimiRouteRequest,
    _: str = Depends(get_current_operator)
):
    """Auto-route a request to the best Kimi variant."""
    result = await route_to_kimi(
        intent=req.intent,
        message=req.message,
    )
    return result


@router.get("/health")
async def kimi_health(_: str = Depends(get_current_operator)):
    """Check if Kimi API is configured and reachable."""
    from services.kimi import KIMI_API_KEY, KIMI_BASE_URL
    return {
        "configured": bool(KIMI_API_KEY),
        "base_url": KIMI_BASE_URL,
        "key_prefix": KIMI_API_KEY[:8] + "..." if KIMI_API_KEY else None,
    }
