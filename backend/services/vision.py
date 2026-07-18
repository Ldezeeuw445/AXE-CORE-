"""AXE Vision Service — screen capture and webcam frame analysis.

Receives base64-encoded images from the frontend (captured via browser APIs)
and analyzes them using Gemini vision models.
"""
import os
import base64
import io
from typing import Optional
from datetime import datetime, timezone

from google import genai
from google.genai import types

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_VISION_MODEL", "gemini-2.5-flash")

VISION_SYSTEM_PROMPT = (
    "You are AXE Vision — the visual intelligence layer of AXE. "
    "You analyze images, screenshots, and webcam frames with technical precision. "
    "Be concise, action-oriented, and operator-grade terse. "
    "Max 4 short bullets or 3 sentences per response. "
    "When you see UI elements, describe their layout and state. "
    "When you see data, summarize the key numbers. "
    "When you see anomalies, flag them immediately."
)


def _get_client():
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured")
    return genai.Client(api_key=GEMINI_API_KEY)


async def analyze_image(
    image_bytes: bytes,
    prompt: str = "Describe what you see in this image.",
    session_id: Optional[str] = None,
) -> dict:
    """Analyze an image using Gemini vision.
    
    Args:
        image_bytes: Raw image bytes (JPEG/PNG)
        prompt: Specific analysis prompt
        session_id: Optional session ID for tracking
    
    Returns:
        dict with status, analysis text, and metadata
    """
    try:
        client = _get_client()
        
        # Build contents with inline image data
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part(text=prompt),
                    types.Part(
                        inline_data=types.Blob(
                            mime_type="image/jpeg",
                            data=image_bytes,
                        )
                    ),
                ],
            )
        ]
        
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=VISION_SYSTEM_PROMPT,
                max_output_tokens=2048,
                temperature=0.2,
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
        if not text:
            text = "[No vision analysis generated]"
        
        return {
            "status": "ok",
            "analysis": text,
            "model": GEMINI_MODEL,
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


async def analyze_screenshot(
    image_bytes: bytes,
    context: Optional[str] = None,
    session_id: Optional[str] = None,
) -> dict:
    """Analyze a screenshot with UI-specific prompt."""
    prompt = (
        "Analyze this screenshot. Describe the UI layout, any visible data, "
        "errors, warnings, or anomalies. Be concise."
    )
    if context:
        prompt += f"\n\nOperator context: {context}"
    return await analyze_image(image_bytes, prompt, session_id)


async def analyze_webcam_frame(
    image_bytes: bytes,
    context: Optional[str] = None,
    session_id: Optional[str] = None,
) -> dict:
    """Analyze a webcam frame with environment-specific prompt."""
    prompt = (
        "Analyze this webcam frame. Describe what you see in the environment, "
        "any people, objects, text, or activity. Be concise and factual."
    )
    if context:
        prompt += f"\n\nOperator context: {context}"
    return await analyze_image(image_bytes, prompt, session_id)


def decode_base64_image(base64_string: str) -> bytes:
    """Decode a base64-encoded image string to bytes."""
    # Remove data URI prefix if present
    if "," in base64_string:
        base64_string = base64_string.split(",", 1)[1]
    return base64.b64decode(base64_string)
