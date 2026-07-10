"""AXE Knowledge routes — personal knowledge base management."""
from typing import Optional, List
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from routes.auth import get_current_operator
from services.knowledge import get_knowledge_base

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class AddDocumentRequest(BaseModel):
    title: str
    content: str
    doc_type: str = "note"
    source: Optional[str] = None
    tags: Optional[List[str]] = None


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


@router.post("/documents")
async def add_document(
    req: AddDocumentRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Add a document to the knowledge base."""
    db = request.app.state.db
    kb = get_knowledge_base(db)
    result = await kb.add_document(
        email=email,
        title=req.title,
        content=req.content,
        doc_type=req.doc_type,
        source=req.source,
        tags=req.tags
    )
    return result


@router.get("/documents")
async def list_documents(
    request: Request,
    doc_type: Optional[str] = None,
    tag: Optional[str] = None,
    email: str = Depends(get_current_operator)
):
    """List all documents in the knowledge base."""
    db = request.app.state.db
    kb = get_knowledge_base(db)
    docs = await kb.list_documents(email, doc_type, tag)
    return {"documents": docs, "count": len(docs)}


@router.get("/documents/{doc_id}")
async def get_document(
    doc_id: str,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Get a specific document."""
    db = request.app.state.db
    kb = get_knowledge_base(db)
    doc = await kb.get_document(email, doc_id)
    if not doc:
        return {"status": "error", "message": "Document not found"}
    return doc


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Delete a document from the knowledge base."""
    db = request.app.state.db
    kb = get_knowledge_base(db)
    return await kb.delete_document(email, doc_id)


@router.post("/search")
async def search_knowledge(
    req: SearchRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Search the knowledge base for relevant chunks."""
    db = request.app.state.db
    kb = get_knowledge_base(db)
    results = await kb.search(email, req.query, req.top_k)
    return {"results": results, "count": len(results)}


@router.get("/search")
async def search_knowledge_get(
    q: str,
    top_k: int = 5,
    request: Request = None,
    email: str = Depends(get_current_operator)
):
    """Search the knowledge base (GET version)."""
    db = request.app.state.db
    kb = get_knowledge_base(db)
    results = await kb.search(email, q, top_k)
    return {"results": results, "count": len(results)}


@router.post("/conversation-memory")
async def add_conversation_memory(
    request: Request,
    session_id: str,
    summary: str,
    email: str = Depends(get_current_operator)
):
    """Add a conversation summary to the knowledge base."""
    db = request.app.state.db
    kb = get_knowledge_base(db)
    return await kb.add_conversation_memory(email, session_id, summary)
