"""AXE File Analysis Service — PDF, image, and code file analysis.

Provides deep analysis capabilities for uploaded files using AI models.
"""
import os
import base64
import io
import re
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pathlib import Path

from google import genai
from google.genai import types

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_FILE_MODEL", "gemini-2.5-flash")

CODE_REVIEW_SYSTEM = (
    "You are AXE Code Review — an elite code reviewer. "
    "Analyze code for bugs, security issues, performance, and style. "
    "Be concise. Use bullet points. Max 5 findings per review. "
    "Rate each finding: CRITICAL | WARNING | NOTE."
)

PDF_ANALYSIS_SYSTEM = (
    "You are AXE Document Analysis — a document intelligence specialist. "
    "Extract key information, summarize, and identify action items. "
    "Be concise. Use structured output. Max 4 bullets."
)

IMAGE_ANALYSIS_SYSTEM = (
    "You are AXE Image Analysis — a visual intelligence specialist. "
    "Describe images precisely, extract text via OCR, and identify objects. "
    "Be concise. Max 3 bullets."
)


def _get_client():
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not configured")
    return genai.Client(api_key=GEMINI_API_KEY)


def _detect_file_type(filename: str, content_type: Optional[str] = None) -> str:
    """Detect file type from extension and content type."""
    ext = Path(filename).suffix.lower().lstrip(".")
    
    image_exts = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "svg", "ico"}
    code_exts = {
        "py", "js", "ts", "jsx", "tsx", "html", "css", "java", "c", "cpp", "cs",
        "go", "rs", "rb", "php", "swift", "kt", "sh", "bash", "ps1", "lua", "r",
        "m", "sql", "yaml", "yml", "toml", "json", "xml", "md", "txt", "log",
    }
    pdf_exts = {"pdf"}
    doc_exts = {"docx", "doc", "odt", "rtf"}
    sheet_exts = {"csv", "xlsx", "xls", "ods"}
    archive_exts = {"zip", "rar", "tar", "gz", "7z", "bz2"}
    
    if ext in image_exts or (content_type and content_type.startswith("image/")):
        return "image"
    if ext in code_exts:
        return "code"
    if ext in pdf_exts or (content_type and content_type == "application/pdf"):
        return "pdf"
    if ext in doc_exts:
        return "document"
    if ext in sheet_exts:
        return "spreadsheet"
    if ext in archive_exts:
        return "archive"
    
    return "unknown"


def _extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes using available libraries."""
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
        text_parts = []
        for page in reader.pages:
            text_parts.append(page.extract_text() or "")
        return "\n".join(text_parts).strip()
    except ImportError:
        pass
    
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text_parts.append(page.extract_text() or "")
        return "\n".join(text_parts).strip()
    except ImportError:
        pass
    
    return "[PDF text extraction requires PyPDF2 or pdfplumber. Install: pip install PyPDF2]"


async def analyze_pdf(
    pdf_bytes: bytes,
    filename: str,
    action: str = "summarize",
    session_id: Optional[str] = None,
) -> dict:
    """Analyze a PDF document.
    
    Args:
        pdf_bytes: Raw PDF bytes
        filename: Original filename
        action: One of 'summarize', 'extract_text', 'analyze', 'extract_pages'
        session_id: Optional session ID
    
    Returns:
        dict with status, analysis, and metadata
    """
    try:
        extracted_text = _extract_text_from_pdf_bytes(pdf_bytes)
        
        if not extracted_text or extracted_text.startswith("["):
            return {
                "status": "error",
                "error": "Could not extract text from PDF",
                "filename": filename,
                "session_id": session_id,
            }
        
        # Truncate if too long
        max_text = 25000
        if len(extracted_text) > max_text:
            extracted_text = extracted_text[:max_text] + "\n...[truncated]"
        
        prompts = {
            "summarize": "Summarize this PDF document. Key points, conclusions, and action items. Be concise.",
            "extract_text": "Extract and format the full text from this PDF. Preserve structure where possible.",
            "analyze": "Analyze this PDF document. Identify key topics, data points, anomalies, and recommendations.",
            "extract_pages": "Extract the content page by page, noting page numbers.",
        }
        prompt = prompts.get(action, prompts["summarize"])
        
        client = _get_client()
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part(text=f"{prompt}\n\nDOCUMENT: {filename}\n\n{extracted_text}"),
                ],
            )
        ]
        
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=PDF_ANALYSIS_SYSTEM,
                max_output_tokens=4096,
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
        
        text = text.strip() or "[No analysis generated]"
        
        return {
            "status": "ok",
            "analysis": text,
            "filename": filename,
            "action": action,
            "text_length": len(extracted_text),
            "model": GEMINI_MODEL,
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "filename": filename,
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


async def analyze_image_file(
    image_bytes: bytes,
    filename: str,
    action: str = "describe",
    session_id: Optional[str] = None,
) -> dict:
    """Analyze an image file using Gemini vision.
    
    Args:
        image_bytes: Raw image bytes
        filename: Original filename
        action: One of 'describe', 'ocr', 'analyze'
        session_id: Optional session ID
    """
    try:
        prompts = {
            "describe": "Describe this image in detail. Be concise.",
            "ocr": "Extract all text visible in this image. Return only the text, formatted clearly.",
            "analyze": "Analyze this image thoroughly: objects, colors, composition, any text, context. Be concise.",
        }
        prompt = prompts.get(action, prompts["describe"])
        
        client = _get_client()
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
                system_instruction=IMAGE_ANALYSIS_SYSTEM,
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
        
        text = text.strip() or "[No image analysis generated]"
        
        return {
            "status": "ok",
            "analysis": text,
            "filename": filename,
            "action": action,
            "model": GEMINI_MODEL,
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "filename": filename,
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


async def analyze_code(
    code: str,
    filename: str,
    language: Optional[str] = None,
    action: str = "review",
    session_id: Optional[str] = None,
) -> dict:
    """Analyze code for quality, bugs, and improvements.
    
    Args:
        code: Source code string
        filename: Original filename
        language: Programming language (auto-detected if None)
        action: One of 'review', 'explain', 'fix', 'document'
        session_id: Optional session ID
    """
    try:
        if not language:
            ext = Path(filename).suffix.lower().lstrip(".")
            lang_map = {
                "py": "Python", "js": "JavaScript", "ts": "TypeScript",
                "jsx": "React JSX", "tsx": "React TSX", "html": "HTML",
                "css": "CSS", "java": "Java", "c": "C", "cpp": "C++",
                "cs": "C#", "go": "Go", "rs": "Rust", "rb": "Ruby",
                "php": "PHP", "swift": "Swift", "kt": "Kotlin",
                "sh": "Shell", "bash": "Bash", "sql": "SQL",
                "yaml": "YAML", "yml": "YAML", "json": "JSON",
                "xml": "XML", "md": "Markdown", "txt": "Text",
            }
            language = lang_map.get(ext, "Unknown")
        
        prompts = {
            "review": f"Review this {language} code. Find bugs, security issues, and performance problems. Rate each: CRITICAL | WARNING | NOTE.",
            "explain": f"Explain this {language} code. What does it do? How does it work? Key patterns?",
            "fix": f"Fix any issues in this {language} code. Provide corrected version with brief explanations.",
            "document": f"Generate documentation for this {language} code. Function signatures, parameters, return values.",
        }
        prompt = prompts.get(action, prompts["review"])
        
        max_code = 15000
        if len(code) > max_code:
            code = code[:max_code] + "\n...[truncated]"
        
        client = _get_client()
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part(text=f"{prompt}\n\nFile: {filename}\nLanguage: {language}\n\n```\n{code}\n```"),
                ],
            )
        ]
        
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=CODE_REVIEW_SYSTEM,
                max_output_tokens=4096,
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
        
        text = text.strip() or "[No code analysis generated]"
        
        return {
            "status": "ok",
            "analysis": text,
            "filename": filename,
            "language": language,
            "action": action,
            "model": GEMINI_MODEL,
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "filename": filename,
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


async def analyze_file(
    file_bytes: bytes,
    filename: str,
    content_type: Optional[str] = None,
    action: str = "auto",
    session_id: Optional[str] = None,
) -> dict:
    """Auto-detect file type and analyze accordingly.
    
    Args:
        file_bytes: Raw file bytes
        filename: Original filename
        content_type: MIME type
        action: Analysis action (auto-detected if 'auto')
        session_id: Optional session ID
    """
    file_type = _detect_file_type(filename, content_type)
    
    if file_type == "image":
        return await analyze_image_file(file_bytes, filename, action if action != "auto" else "describe", session_id)
    
    elif file_type == "pdf":
        return await analyze_pdf(file_bytes, filename, action if action != "auto" else "summarize", session_id)
    
    elif file_type == "code":
        try:
            code = file_bytes.decode("utf-8", errors="replace")
        except Exception:
            code = "[Could not decode file as text]"
        return await analyze_code(code, filename, action=action if action != "auto" else "review", session_id=session_id)
    
    elif file_type in ("document", "spreadsheet", "archive"):
        return {
            "status": "unsupported",
            "message": f"{file_type.upper()} files are not yet fully supported. Try extracting text first.",
            "filename": filename,
            "file_type": file_type,
            "session_id": session_id,
        }
    
    else:
        # Try to decode as text and treat as code/document
        try:
            text = file_bytes.decode("utf-8", errors="replace")
            if len(text) > 0 and len(text) < 50000:
                return await analyze_code(text, filename, action="explain", session_id=session_id)
        except Exception:
            pass
        
        return {
            "status": "unknown",
            "message": f"Could not determine how to analyze {filename}. Supported: images, PDFs, code files.",
            "filename": filename,
            "file_type": file_type,
            "session_id": session_id,
        }
