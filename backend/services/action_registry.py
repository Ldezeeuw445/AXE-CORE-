"""AXE Action Registry — discoverable, plugin-like actions for AI agents.

Inspired by Mark XXXIX-OR's modular action system.
Each action has metadata, parameters, and a handler.
"""
import asyncio
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class ActionParameter:
    name: str
    type: str  # string, number, boolean, array, object
    description: str
    required: bool = True
    default: Any = None


@dataclass
class ActionDefinition:
    id: str
    name: str
    description: str
    category: str  # web, file, vision, code, system, data, etc.
    parameters: List[ActionParameter] = field(default_factory=list)
    handler: Optional[Callable] = None
    enabled: bool = True
    requires_auth: bool = True


class ActionRegistry:
    """Central registry for all AXE actions."""
    
    def __init__(self):
        self._actions: Dict[str, ActionDefinition] = {}
        self._register_builtin_actions()
    
    def _register_builtin_actions(self):
        """Register the built-in AXE actions."""
        
        # Web actions
        self.register(ActionDefinition(
            id="web_search",
            name="Web Search",
            description="Search the web for information using a query string.",
            category="web",
            parameters=[
                ActionParameter("query", "string", "Search query", required=True),
                ActionParameter("num_results", "number", "Number of results to return", default=5),
            ],
        ))
        
        self.register(ActionDefinition(
            id="browser_fetch",
            name="Fetch Web Page",
            description="Fetch and extract content from a web page URL.",
            category="web",
            parameters=[
                ActionParameter("url", "string", "URL to fetch", required=True),
                ActionParameter("wait_for", "string", "Optional CSS selector to wait for", default=None),
            ],
        ))
        
        self.register(ActionDefinition(
            id="browser_analyze",
            name="Analyze Web Page",
            description="Analyze a web page and extract key information, headings, links.",
            category="web",
            parameters=[
                ActionParameter("url", "string", "URL to analyze", required=True),
            ],
        ))
        
        # File actions
        self.register(ActionDefinition(
            id="file_analyze",
            name="Analyze File",
            description="Analyze an uploaded file (image, PDF, code) using AI.",
            category="file",
            parameters=[
                ActionParameter("filename", "string", "Name of the file", required=True),
                ActionParameter("action", "string", "Analysis action: summarize, describe, review, ocr", default="auto"),
            ],
        ))
        
        self.register(ActionDefinition(
            id="file_extract_text",
            name="Extract Text from File",
            description="Extract text content from PDF, document, or text files.",
            category="file",
            parameters=[
                ActionParameter("filename", "string", "Name of the file", required=True),
            ],
        ))
        
        # Vision actions
        self.register(ActionDefinition(
            id="screen_capture",
            name="Screen Capture",
            description="Capture the user's screen and analyze it.",
            category="vision",
            parameters=[
                ActionParameter("context", "string", "Optional context about what to look for", default=""),
            ],
        ))
        
        self.register(ActionDefinition(
            id="webcam_capture",
            name="Webcam Capture",
            description="Capture a frame from the user's webcam and analyze it.",
            category="vision",
            parameters=[
                ActionParameter("context", "string", "Optional context about what to look for", default=""),
            ],
        ))
        
        # Code actions
        self.register(ActionDefinition(
            id="code_review",
            name="Review Code",
            description="Review code for bugs, security issues, and improvements.",
            category="code",
            parameters=[
                ActionParameter("code", "string", "Source code to review", required=True),
                ActionParameter("language", "string", "Programming language", default="auto"),
            ],
        ))
        
        self.register(ActionDefinition(
            id="code_explain",
            name="Explain Code",
            description="Explain what code does and how it works.",
            category="code",
            parameters=[
                ActionParameter("code", "string", "Source code to explain", required=True),
                ActionParameter("language", "string", "Programming language", default="auto"),
            ],
        ))
        
        # Data / OSINT actions
        self.register(ActionDefinition(
            id="correlate_sources",
            name="Correlate OSINT Sources",
            description="Run a correlation across all OSINT data sources.",
            category="data",
            parameters=[
                ActionParameter("force", "boolean", "Force fresh correlation even if cached", default=False),
            ],
        ))
        
        self.register(ActionDefinition(
            id="sweep_sources",
            name="Sweep OSINT Sources",
            description="Run a fresh sweep across all intelligence sources.",
            category="data",
            parameters=[
                ActionParameter("sources", "array", "Optional list of specific sources to sweep", default=[]),
            ],
        ))
        
        self.register(ActionDefinition(
            id="get_latest_snapshot",
            name="Get Latest Snapshot",
            description="Retrieve the latest OSINT data snapshot.",
            category="data",
            parameters=[],
        ))
        
        # System actions
        self.register(ActionDefinition(
            id="browser_open_tab",
            name="Open Browser Tab",
            description="Open a URL in the in-app browser panel.",
            category="system",
            parameters=[
                ActionParameter("url", "string", "URL to open", required=True),
            ],
        ))
        
        self.register(ActionDefinition(
            id="browser_close_tab",
            name="Close Browser Tab",
            description="Close the in-app browser panel.",
            category="system",
            parameters=[],
        ))
        
        self.register(ActionDefinition(
            id="memory_search",
            name="Search Memory",
            description="Search the long-term memory for relevant information.",
            category="system",
            parameters=[
                ActionParameter("query", "string", "Search query", required=True),
                ActionParameter("limit", "number", "Max results", default=10),
            ],
        ))
        
        self.register(ActionDefinition(
            id="memory_save",
            name="Save to Memory",
            description="Save a fact or insight to long-term memory.",
            category="system",
            parameters=[
                ActionParameter("content", "string", "Content to save", required=True),
                ActionParameter("topic", "string", "Topic or category", default="general"),
                ActionParameter("tags", "array", "Tags for the memory entry", default=[]),
            ],
        ))
        
        # AI actions
        self.register(ActionDefinition(
            id="kimi_chat",
            name="Kimi Chat",
            description="Send a message to a Kimi AI variant (claw, code, work).",
            category="ai",
            parameters=[
                ActionParameter("variant", "string", "Variant: kimi-claw, kimi-code, kimi-work", default="kimi-claw"),
                ActionParameter("message", "string", "Message to send", required=True),
            ],
        ))
        
        self.register(ActionDefinition(
            id="ai_chat",
            name="AXE Chat",
            description="Send a message to AXE intelligence engine.",
            category="ai",
            parameters=[
                ActionParameter("message", "string", "Message to send", required=True),
            ],
        ))
    
    def register(self, action: ActionDefinition):
        """Register a new action."""
        self._actions[action.id] = action
    
    def unregister(self, action_id: str):
        """Unregister an action."""
        if action_id in self._actions:
            del self._actions[action_id]
    
    def get(self, action_id: str) -> Optional[ActionDefinition]:
        """Get an action definition by ID."""
        return self._actions.get(action_id)
    
    def list_actions(
        self,
        category: Optional[str] = None,
        enabled_only: bool = True,
        search: Optional[str] = None,
    ) -> List[dict]:
        """List registered actions, optionally filtered."""
        results = []
        for action in self._actions.values():
            if enabled_only and not action.enabled:
                continue
            if category and action.category != category:
                continue
            if search and search.lower() not in (action.name + action.description).lower():
                continue
            
            results.append({
                "id": action.id,
                "name": action.name,
                "description": action.description,
                "category": action.category,
                "parameters": [
                    {
                        "name": p.name,
                        "type": p.type,
                        "description": p.description,
                        "required": p.required,
                        "default": p.default,
                    }
                    for p in action.parameters
                ],
                "enabled": action.enabled,
                "requires_auth": action.requires_auth,
            })
        return results
    
    def get_categories(self) -> List[str]:
        """Get all unique category names."""
        return sorted(set(a.category for a in self._actions.values()))
    
    async def invoke(
        self,
        action_id: str,
        parameters: Dict[str, Any],
        db=None,
        email: Optional[str] = None,
    ) -> dict:
        """Invoke an action with the given parameters.
        
        This is a router that delegates to the appropriate service.
        """
        action = self.get(action_id)
        if not action:
            return {"status": "error", "error": f"Action '{action_id}' not found"}
        
        if not action.enabled:
            return {"status": "error", "error": f"Action '{action_id}' is disabled"}
        
        # Validate required parameters
        for param in action.parameters:
            if param.required and param.name not in parameters:
                return {"status": "error", "error": f"Missing required parameter: {param.name}"}
        
        # Route to the appropriate handler
        # These are the built-in action handlers
        try:
            if action_id == "web_search":
                from services.browser import search_web
                session_id = f"browser-{email}" if email else "anonymous"
                return await search_web(
                    parameters.get("query", ""),
                    session_id,
                    parameters.get("num_results", 5),
                )
            
            elif action_id == "browser_fetch":
                from services.browser import fetch_page
                session_id = f"browser-{email}" if email else "anonymous"
                return await fetch_page(
                    parameters.get("url", ""),
                    session_id,
                    parameters.get("wait_for"),
                )
            
            elif action_id == "browser_analyze":
                from services.browser import analyze_page
                session_id = f"browser-{email}" if email else "anonymous"
                return await analyze_page(
                    parameters.get("url", ""),
                    session_id,
                )
            
            elif action_id == "correlate_sources":
                from services.ai import correlate
                from services.sweep import get_last_snapshot
                snap = get_last_snapshot()
                if not snap:
                    from services.sweep import run_sweep
                    snap = await run_sweep()
                return await correlate(snap)
            
            elif action_id == "sweep_sources":
                from services.sweep import run_sweep
                return await run_sweep()
            
            elif action_id == "get_latest_snapshot":
                from services.sweep import get_last_snapshot
                snap = get_last_snapshot()
                return {"status": "ok", "snapshot": snap}
            
            elif action_id == "kimi_chat":
                from services.kimi import kimi_chat
                return await kimi_chat(
                    variant=parameters.get("variant", "kimi-claw"),
                    message=parameters.get("message", ""),
                )
            
            elif action_id == "ai_chat":
                from services.ai import chat_message
                session_id = f"action-{email}-{datetime.now(timezone.utc).isoformat()}" if email else "anonymous"
                reply = await chat_message(
                    session_id=session_id,
                    message=parameters.get("message", ""),
                )
                return {"status": "ok", "response": reply}
            
            elif action_id == "memory_search":
                if not db:
                    return {"status": "error", "error": "Memory search requires database connection"}
                from services.memory import search_memory
                return await search_memory(
                    db=db,
                    query=parameters.get("query", ""),
                    limit=parameters.get("limit", 10),
                    email=email,
                )
            
            elif action_id == "memory_save":
                if not db:
                    return {"status": "error", "error": "Memory save requires database connection"}
                from services.memory import save_memory
                return await save_memory(
                    db=db,
                    content=parameters.get("content", ""),
                    topic=parameters.get("topic", "general"),
                    tags=parameters.get("tags", []),
                    email=email,
                )
            
            elif action_id == "browser_open_tab":
                # This is a frontend-side action — return instructions
                return {
                    "status": "ok",
                    "action_type": "frontend",
                    "instruction": "open_browser",
                    "url": parameters.get("url", ""),
                }
            
            elif action_id == "browser_close_tab":
                return {
                    "status": "ok",
                    "action_type": "frontend",
                    "instruction": "close_browser",
                }
            
            else:
                # Custom action handler
                if action.handler:
                    return await action.handler(parameters)
                return {
                    "status": "ok",
                    "action_id": action_id,
                    "parameters": parameters,
                    "note": "Action registered but no backend handler implemented. Execute on frontend or extend handler.",
                }
        
        except Exception as e:
            return {"status": "error", "error": str(e), "action_id": action_id}


# Global registry instance
_registry: Optional[ActionRegistry] = None


def get_registry() -> ActionRegistry:
    """Get the global action registry instance."""
    global _registry
    if _registry is None:
        _registry = ActionRegistry()
    return _registry


def reset_registry():
    """Reset the global registry (useful for testing)."""
    global _registry
    _registry = None
