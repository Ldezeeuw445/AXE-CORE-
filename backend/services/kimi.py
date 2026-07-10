"""AXE Kimi Integration — KimiClaw, Kimi Code, Kimi Work.

KimiClaw: Tool-use / browser automation / web search
Kimi Code: Code generation, review, refactoring
Kimi Work: Document analysis, summarization, productivity

Uses Moonshot AI's OpenAI-compatible API.
"""
import os
import json
import aiohttp
from typing import Optional, List, Dict, Any

# Kimi API configuration
KIMI_BASE_URL = os.environ.get("KIMI_BASE_URL", "https://api.moonshot.cn/v1")
KIMI_API_KEY = os.environ.get("KIMI_API_KEY", "")

# Model mapping
KIMI_MODELS = {
    "kimi-claw": "kimi-k2-0711-preview",      # Latest K2 with tool use
    "kimi-code": "kimi-k2-0711-preview",       # Code tasks (same model, different prompt)
    "kimi-work": "kimi-k2-0711-preview",       # Document/productivity
    "moonshot-128k": "moonshot-v1-128k",
    "moonshot-32k": "moonshot-v1-32k",
    "moonshot-8k": "moonshot-v1-8k",
}

# System prompts per Kimi variant
KIMI_CLAW_SYSTEM = (
    "You are KimiClaw — AXE's web intelligence and tool-use specialist. "
    "You can browse websites, search the web, extract data, and perform actions. "
    "When given a URL or search query, explain what you would find and how it connects to the operator's request. "
    "Be concise and action-oriented. Always cite your sources. "
    "If you cannot access a live URL, explain what the operator would find there based on your knowledge."
)

KIMI_CODE_SYSTEM = (
    "You are Kimi Code — AXE's code specialist. "
    "You write, review, refactor, and debug code across multiple languages. "
    "Always provide complete, working code. Explain your changes briefly. "
    "Follow best practices and modern patterns. "
    "When reviewing code, be specific about issues and provide fixes."
)

KIMI_WORK_SYSTEM = (
    "You are Kimi Work — AXE's document and productivity specialist. "
    "You analyze documents, summarize content, extract key information, and help with productivity tasks. "
    "Be thorough but concise. Use structured output when appropriate. "
    "Highlight action items, deadlines, and key decisions."
)


def get_kimi_headers() -> dict:
    """Get headers for Kimi API requests."""
    return {
        "Authorization": f"Bearer {KIMI_API_KEY}",
        "Content-Type": "application/json",
    }


def get_model_for_variant(variant: str) -> str:
    """Get the actual model name for a Kimi variant."""
    return KIMI_MODELS.get(variant, KIMI_MODELS["kimi-claw"])


def get_system_prompt(variant: str) -> str:
    """Get the system prompt for a Kimi variant."""
    prompts = {
        "kimi-claw": KIMI_CLAW_SYSTEM,
        "kimi-code": KIMI_CODE_SYSTEM,
        "kimi-work": KIMI_WORK_SYSTEM,
    }
    return prompts.get(variant, KIMI_CLAW_SYSTEM)


async def kimi_chat(
    variant: str,
    message: str,
    session_id: Optional[str] = None,
    context: Optional[str] = None,
    temperature: float = 0.3,
) -> dict:
    """Send a chat message to Kimi API.
    
    Args:
        variant: One of 'kimi-claw', 'kimi-code', 'kimi-work'
        message: The user message
        session_id: Optional session ID for continuity
        context: Optional additional context
        temperature: Sampling temperature
    
    Returns:
        dict with 'response' and 'variant'
    """
    if not KIMI_API_KEY:
        return {"status": "error", "error": "KIMI_API_KEY not configured", "variant": variant}
    
    model = get_model_for_variant(variant)
    system_prompt = get_system_prompt(variant)
    
    # Build messages
    messages = [{"role": "system", "content": system_prompt}]
    
    if context:
        messages.append({"role": "system", "content": f"[CONTEXT]\n{context}"})
    
    messages.append({"role": "user", "content": message})
    
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 4096,
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{KIMI_BASE_URL}/chat/completions",
                headers=get_kimi_headers(),
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    return {"status": "error", "error": f"HTTP {resp.status}: {text[:200]}", "variant": variant}
                
                data = await resp.json()
                choice = data.get("choices", [{}])[0]
                content = choice.get("message", {}).get("content", "")
                
                return {
                    "status": "ok",
                    "response": content,
                    "variant": variant,
                    "model": model,
                    "usage": data.get("usage", {}),
                }
    except Exception as e:
        return {"status": "error", "error": str(e), "variant": variant}


async def kimi_browser_task(
    task: str,
    url: Optional[str] = None,
    search_query: Optional[str] = None,
) -> dict:
    """Execute a browser/web task using KimiClaw.
    
    Args:
        task: Description of what to do
        url: Optional specific URL to visit
        search_query: Optional search query
    
    Returns:
        dict with task results
    """
    context_parts = []
    if url:
        context_parts.append(f"Target URL: {url}")
    if search_query:
        context_parts.append(f"Search query: {search_query}")
    
    context = "\n".join(context_parts) if context_parts else None
    
    prompt = (
        f"Execute this web task: {task}\n\n"
        "If a URL is provided, analyze what would be found there. "
        "If a search query is provided, explain what search results would show and how to interpret them. "
        "Provide actionable intelligence the operator can use."
    )
    
    result = await kimi_chat(
        variant="kimi-claw",
        message=prompt,
        context=context,
        temperature=0.2,
    )
    
    return result


async def kimi_code_task(
    task: str,
    code: Optional[str] = None,
    language: Optional[str] = None,
    file_path: Optional[str] = None,
) -> dict:
    """Execute a code task using Kimi Code.
    
    Args:
        task: Description of the code task (write, review, refactor, debug)
        code: Optional code snippet
        language: Programming language
        file_path: Optional file path for context
    
    Returns:
        dict with code results
    """
    context_parts = []
    if language:
        context_parts.append(f"Language: {language}")
    if file_path:
        context_parts.append(f"File: {file_path}")
    if code:
        context_parts.append(f"```\n{code[:8000]}\n```")
    
    context = "\n".join(context_parts) if context_parts else None
    
    result = await kimi_chat(
        variant="kimi-code",
        message=task,
        context=context,
        temperature=0.2,
    )
    
    return result


async def kimi_work_task(
    task: str,
    document: Optional[str] = None,
    doc_type: Optional[str] = None,
) -> dict:
    """Execute a document/productivity task using Kimi Work.
    
    Args:
        task: Description of the task
        document: Optional document content
        doc_type: Type of document (pdf, email, report, etc.)
    
    Returns:
        dict with task results
    """
    context = None
    if document:
        context = f"Document ({doc_type or 'unknown'}):\n{document[:10000]}"
    
    result = await kimi_chat(
        variant="kimi-work",
        message=task,
        context=context,
        temperature=0.3,
    )
    
    return result


async def route_to_kimi(
    intent: str,
    message: str,
    **kwargs
) -> dict:
    """Route a request to the appropriate Kimi variant based on intent.
    
    Args:
        intent: One of 'browser', 'code', 'work', 'auto'
        message: The user message
        **kwargs: Additional arguments passed to the specific task function
    
    Returns:
        dict with response from the appropriate Kimi variant
    """
    if intent == "browser" or (intent == "auto" and any(kw in message.lower() for kw in [
        "browse", "search", "url", "website", "web", "lookup", "find online",
        "zoek", "website", "web", "browser", "opzoeken",
    ])):
        return await kimi_browser_task(message, **kwargs)
    
    elif intent == "code" or (intent == "auto" and any(kw in message.lower() for kw in [
        "code", "program", "function", "script", "debug", "refactor",
        "write code", "review code", "fix bug", "error in",
    ])):
        return await kimi_code_task(message, **kwargs)
    
    elif intent == "work" or (intent == "auto" and any(kw in message.lower() for kw in [
        "document", "summarize", "summary", "analyze doc", "email", "report",
        "samenvatting", "document", "rapport", "email",
    ])):
        return await kimi_work_task(message, **kwargs)
    
    # Default to claw for general queries
    return await kimi_chat("kimi-claw", message)
