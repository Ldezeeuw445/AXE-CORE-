"""AXE File Analysis routes — PDF, image, and code file analysis endpoints."""
from typing import Optional, List
from fastapi import APIRouter, Depends, Request, UploadFile, File
from pydantic import BaseModel

from routes.auth import get_current_operator
from services.files import analyze_file, analyze_pdf, analyze_image_file, analyze_code

router = APIRouter(prefix="/api/files", tags=["files"])


class CodeAnalysisRequest(BaseModel):
    code: str
    filename: str
    language: Optional[str] = None
    action: str = "review"
    session_id: Optional[str] = None


class FileAnalysisResponse(BaseModel):
    status: str
    analysis: Optional[str] = None
    filename: Optional[str] = None
    file_type: Optional[str] = None
    action: Optional[str] = None
    model: Optional[str] = None
    session_id: Optional[str] = None
    timestamp: Optional[str] = None
    error: Optional[str] = None
    message: Optional[str] = None
    language: Optional[str] = None


@router.post("/analyze", response_model=FileAnalysisResponse)
async def files_analyze(
    request: Request,
    email: str = Depends(get_current_operator),
    file: UploadFile = File(...),
    action: str = "auto",
    session_id: Optional[str] = None,
):
    """Upload and analyze a file (image, PDF, code, etc.)."""
    try:
        file_bytes = await file.read()
        result = await analyze_file(
            file_bytes=file_bytes,
            filename=file.filename or "upload",
            content_type=file.content_type,
            action=action,
            session_id=session_id or f"file-{email}",
        )
        return FileAnalysisResponse(**result)
    except Exception as e:
        return FileAnalysisResponse(
            status="error",
            error=str(e),
            filename=file.filename,
            session_id=session_id,
        )


@router.post("/analyze/code", response_model=FileAnalysisResponse)
async def files_analyze_code(
    req: CodeAnalysisRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Analyze source code without uploading a file."""
    result = await analyze_code(
        code=req.code,
        filename=req.filename,
        language=req.language,
        action=req.action,
        session_id=req.session_id or f"code-{email}",
    )
    return FileAnalysisResponse(**result)


@router.get("/health")
async def files_health(_: str = Depends(get_current_operator)):
    """Check file analysis service health."""
    from services.files import GEMINI_API_KEY, GEMINI_MODEL
    return {
        "status": "ok",
        "configured": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL,
        "capabilities": [
            "PDF text extraction and summarization",
            "Image analysis and OCR",
            "Code review and explanation",
            "Auto-detect file type",
            "Multi-format support",
        ],
    }
