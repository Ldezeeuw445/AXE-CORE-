"""AXE Vision routes — screen capture and webcam frame analysis endpoints."""
import base64
from typing import Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from routes.auth import get_current_operator
from services.vision import (
    analyze_screenshot,
    analyze_webcam_frame,
    decode_base64_image,
)

router = APIRouter(prefix="/api/vision", tags=["vision"])


class ScreenshotRequest(BaseModel):
    image_base64: str
    context: Optional[str] = None
    session_id: Optional[str] = None


class WebcamFrameRequest(BaseModel):
    image_base64: str
    context: Optional[str] = None
    session_id: Optional[str] = None


class VisionResponse(BaseModel):
    status: str
    analysis: str
    model: Optional[str] = None
    session_id: Optional[str] = None
    timestamp: Optional[str] = None
    error: Optional[str] = None


@router.post("/screenshot", response_model=VisionResponse)
async def vision_screenshot(
    req: ScreenshotRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Analyze a screenshot captured from the user's screen."""
    try:
        image_bytes = decode_base64_image(req.image_base64)
        result = await analyze_screenshot(
            image_bytes=image_bytes,
            context=req.context,
            session_id=req.session_id or f"screenshot-{email}",
        )
        return VisionResponse(**result)
    except Exception as e:
        return VisionResponse(
            status="error",
            analysis="",
            error=str(e),
            session_id=req.session_id,
        )


@router.post("/webcam", response_model=VisionResponse)
async def vision_webcam(
    req: WebcamFrameRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Analyze a webcam frame captured from the user's camera."""
    try:
        image_bytes = decode_base64_image(req.image_base64)
        result = await analyze_webcam_frame(
            image_bytes=image_bytes,
            context=req.context,
            session_id=req.session_id or f"webcam-{email}",
        )
        return VisionResponse(**result)
    except Exception as e:
        return VisionResponse(
            status="error",
            analysis="",
            error=str(e),
            session_id=req.session_id,
        )


@router.get("/health")
async def vision_health(_: str = Depends(get_current_operator)):
    """Check vision service health."""
    from services.vision import GEMINI_API_KEY, GEMINI_MODEL
    return {
        "status": "ok",
        "configured": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL,
        "capabilities": [
            "Screenshot analysis",
            "Webcam frame analysis",
            "UI element detection",
            "Text extraction (OCR)",
            "Anomaly detection",
        ],
    }
