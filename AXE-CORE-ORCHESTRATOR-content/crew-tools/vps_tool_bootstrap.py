"""
AXE CORE — VPS CrewAI tool bootstrap
====================================
Drop this next to your crew project on the VPS (or import from run_crew_kickoff).

Env (set by HQ /crew/run payload `tool_env` or systemd Environment=):
  EXA_API_KEY
  FIRECRAWL_API_KEY
  BRIGHTDATA_API_KEY   (optional)
  E2B_API_KEY
  QDRANT_URL
  QDRANT_API_KEY       (optional for local)
  QDRANT_COLLECTION    (default axe_knowledge)

pip install: crewai crewai-tools exa-py firecrawl-py e2b-code-interpreter qdrant-client
"""
from __future__ import annotations

import os
from typing import Any, List


def _env(name: str) -> str | None:
    v = os.environ.get(name, "").strip()
    return v or None


def build_research_tools() -> List[Any]:
    """Tools for news / OSINT / fundamentals agents."""
    tools: List[Any] = []

    if _env("EXA_API_KEY"):
        try:
            from crewai_tools import EXASearchTool  # type: ignore

            tools.append(EXASearchTool())
        except Exception:
            try:
                from crewai_tools import ExaSearchTool  # type: ignore

                tools.append(ExaSearchTool())
            except Exception as e:
                print(f"[axe-tools] Exa unavailable: {e}")

    if _env("FIRECRAWL_API_KEY"):
        try:
            from crewai_tools import FirecrawlScrapeWebsiteTool  # type: ignore

            tools.append(FirecrawlScrapeWebsiteTool(api_key=_env("FIRECRAWL_API_KEY")))
        except Exception:
            try:
                from crewai_tools import FirecrawlCrawlWebsiteTool  # type: ignore

                tools.append(FirecrawlCrawlWebsiteTool(api_key=_env("FIRECRAWL_API_KEY")))
            except Exception as e:
                print(f"[axe-tools] Firecrawl unavailable: {e}")

    return tools


def build_code_tools() -> List[Any]:
    """E2B sandbox for backtesting engineer / quant agents."""
    tools: List[Any] = []
    if not _env("E2B_API_KEY"):
        return tools
    try:
        from crewai_tools import CodeInterpreterTool  # type: ignore

        tools.append(CodeInterpreterTool())
    except Exception:
        try:
            from e2b_code_interpreter import Sandbox  # type: ignore

            class E2BPythonTool:
                name: str = "e2b_python"
                description: str = "Run Python (pandas/numpy) in an E2B sandbox for backtests."

                def run(self, code: str) -> str:
                    sbx = Sandbox(api_key=_env("E2B_API_KEY"))
                    try:
                        execution = sbx.run_code(code)
                        out = []
                        if execution.logs and execution.logs.stdout:
                            out.extend(execution.logs.stdout)
                        if execution.error:
                            out.append(str(execution.error))
                        return "\n".join(out) if out else str(execution.results)
                    finally:
                        sbx.kill()

            tools.append(E2BPythonTool())
        except Exception as e:
            print(f"[axe-tools] E2B unavailable: {e}")
    return tools


def apply_tool_env(tool_env: dict | None) -> None:
    """Merge HQ-provided tool_env into process env before agent build."""
    if not tool_env:
        return
    for k, v in tool_env.items():
        if isinstance(k, str) and isinstance(v, str) and v.strip():
            os.environ[k] = v.strip()


def tool_status() -> dict:
    return {
        "exa": bool(_env("EXA_API_KEY")),
        "firecrawl": bool(_env("FIRECRAWL_API_KEY")),
        "brightdata": bool(_env("BRIGHTDATA_API_KEY")),
        "e2b": bool(_env("E2B_API_KEY")),
        "qdrant": bool(_env("QDRANT_URL")),
    }
