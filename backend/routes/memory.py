"""AXE Memory routes — deep memory system endpoints."""
from typing import Optional, List
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from routes.auth import get_current_operator
from services.memory import (
    save_memory,
    get_memory,
    search_memory,
    list_topics,
    list_tags,
    delete_memory,
    extract_facts,
    get_context_for_chat,
)

router = APIRouter(prefix="/api/memory", tags=["memory"])


class SaveMemoryRequest(BaseModel):
    content: str
    topic: str = "general"
    tags: List[str] = []
    source: str = "operator"
    importance: str = "normal"
    session_id: Optional[str] = None


class SearchMemoryRequest(BaseModel):
    query: str
    limit: int = 10
    topic: Optional[str] = None
    tags: List[str] = []
    importance: Optional[str] = None
    min_similarity: float = 0.3


class ExtractFactsRequest(BaseModel):
    conversation_text: str
    session_id: Optional[str] = None


class MemoryResponse(BaseModel):
    status: str
    memory_id: Optional[str] = None
    content: Optional[str] = None
    topic: Optional[str] = None
    tags: Optional[List[str]] = None
    importance: Optional[str] = None
    error: Optional[str] = None
    results: Optional[List[dict]] = None
    results_count: Optional[int] = None


@router.post("/save", response_model=MemoryResponse)
async def memory_save(
    req: SaveMemoryRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Save a memory entry."""
    db = request.app.state.db
    result = await save_memory(
        db=db,
        content=req.content,
        topic=req.topic,
        tags=req.tags,
        source=req.source,
        email=email,
        session_id=req.session_id,
        importance=req.importance,
    )
    return MemoryResponse(**result)


@router.get("/{memory_id}")
async def memory_get(
    memory_id: str,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Get a specific memory entry by ID."""
    db = request.app.state.db
    result = await get_memory(db=db, memory_id=memory_id, email=email)
    if result.get("status") == "ok" and result.get("memory"):
        m = result["memory"]
        return MemoryResponse(
            status="ok",
            memory_id=m.get("memory_id"),
            content=m.get("content"),
            topic=m.get("topic"),
            tags=m.get("tags"),
            importance=m.get("importance"),
        )
    return MemoryResponse(status=result.get("status", "error"), error=result.get("error"))


@router.post("/search", response_model=MemoryResponse)
async def memory_search(
    req: SearchMemoryRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Search memory entries by query text."""
    db = request.app.state.db
    result = await search_memory(
        db=db,
        query=req.query,
        limit=req.limit,
        topic=req.topic,
        tags=req.tags if req.tags else None,
        email=email,
        importance=req.importance,
        min_similarity=req.min_similarity,
    )
    return MemoryResponse(
        status=result.get("status", "error"),
        results=result.get("results"),
        results_count=result.get("results_count"),
        error=result.get("error"),
    )


@router.get("/topics")
async def memory_topics(
    request: Request,
    email: str = Depends(get_current_operator)
):
    """List all unique memory topics."""
    db = request.app.state.db
    result = await list_topics(db=db, email=email)
    return result


@router.get("/tags")
async def memory_tags(
    request: Request,
    email: str = Depends(get_current_operator)
):
    """List all unique memory tags."""
    db = request.app.state.db
    result = await list_tags(db=db, email=email)
    return result


@router.delete("/{memory_id}")
async def memory_delete(
    memory_id: str,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Delete a memory entry by ID."""
    db = request.app.state.db
    result = await delete_memory(db=db, memory_id=memory_id, email=email)
    return result


@router.post("/extract")
async def memory_extract(
    req: ExtractFactsRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Extract facts from conversation text and save to memory."""
    db = request.app.state.db
    result = await extract_facts(
        db=db,
        conversation_text=req.conversation_text,
        email=email,
        session_id=req.session_id,
    )
    return result


@router.get("/context")
async def memory_context(
    query: str,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Get relevant memory context for a chat query."""
    db = request.app.state.db
    context = await get_context_for_chat(
        db=db,
        query=query,
        email=email,
        limit=5,
    )
    return {
        "status": "ok",
        "context": context,
        "query": query,
    }


@router.get("/health")
async def memory_health(request: Request, _: str = Depends(get_current_operator)):
    """Check memory service health."""
    db = request.app.state.db
    try:
        count = await db["axe_memory"].count_documents({})
        return {
            "status": "ok",
            "collection": "axe_memory",
            "document_count": count,
            "capabilities": [
                "Save and retrieve memories",
                "Text similarity search",
                "Topic and tag filtering",
                "Auto-extract facts from conversations",
                "Chat context injection",
            ],
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}
