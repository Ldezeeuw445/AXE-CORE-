"""AXE Browser — in-app browser automation service.

Provides web scraping, page analysis, and browser control capabilities
that AXE can use to interact with websites on behalf of the operator.
"""
import os
import asyncio
import aiohttp
from typing import Optional, Dict, List
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

# Browser configuration
BROWSER_TIMEOUT = int(os.environ.get("BROWSER_TIMEOUT", "30"))
MAX_CONTENT_LENGTH = int(os.environ.get("BROWSER_MAX_CONTENT", "50000"))

# Common user agents
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
]


class BrowserSession:
    """A browser session that can navigate pages and extract content."""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.history = []
        self.current_url = None
        self.cookies = {}
        self.headers = {
            "User-Agent": USER_AGENTS[0],
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
        }
    
    def record_navigation(self, url: str, title: Optional[str] = None, status: str = "ok"):
        """Record a navigation event in history."""
        self.history.append({
            "url": url,
            "title": title or url,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": status,
        })
        self.current_url = url


# Active browser sessions
_browser_sessions: Dict[str, BrowserSession] = {}


def get_browser_session(session_id: str) -> BrowserSession:
    """Get or create a browser session."""
    if session_id not in _browser_sessions:
        _browser_sessions[session_id] = BrowserSession(session_id)
    return _browser_sessions[session_id]


def close_browser_session(session_id: str):
    """Close a browser session."""
    if session_id in _browser_sessions:
        del _browser_sessions[session_id]


async def fetch_page(
    url: str,
    session_id: str,
    wait_for: Optional[str] = None,
) -> dict:
    """Fetch a web page and extract its content.
    
    Args:
        url: The URL to fetch
        session_id: Browser session ID
        wait_for: Optional CSS selector to wait for
    
    Returns:
        dict with page content, title, links, and metadata
    """
    session = get_browser_session(session_id)
    
    try:
        timeout = aiohttp.ClientTimeout(total=BROWSER_TIMEOUT)
        async with aiohttp.ClientSession(timeout=timeout) as http_session:
            async with http_session.get(
                url,
                headers=session.headers,
                allow_redirects=True,
                max_redirects=5,
            ) as resp:
                content_type = resp.headers.get("Content-Type", "")
                
                if "text/html" in content_type:
                    text = await resp.text()
                    # Truncate if too long
                    if len(text) > MAX_CONTENT_LENGTH:
                        text = text[:MAX_CONTENT_LENGTH] + "\n...[truncated]"
                    
                    # Extract basic info
                    title = _extract_title(text) or url
                    links = _extract_links(text, url)
                    meta = _extract_meta(text)
                    
                    session.record_navigation(url, title, "ok")
                    
                    return {
                        "status": "ok",
                        "url": str(resp.url),
                        "title": title,
                        "content": text,
                        "links": links[:50],  # Limit links
                        "meta": meta,
                        "status_code": resp.status,
                        "content_type": content_type,
                    }
                else:
                    # Non-HTML content
                    content = await resp.read()
                    session.record_navigation(url, None, "binary")
                    return {
                        "status": "ok",
                        "url": str(resp.url),
                        "content_type": content_type,
                        "size": len(content),
                        "is_binary": True,
                    }
                    
    except asyncio.TimeoutError:
        session.record_navigation(url, None, "timeout")
        return {"status": "error", "error": f"Timeout fetching {url}", "url": url}
    except Exception as e:
        session.record_navigation(url, None, "error")
        return {"status": "error", "error": str(e), "url": url}


def _extract_title(html: str) -> Optional[str]:
    """Extract the page title from HTML."""
    import re
    match = re.search(r'<title[^>]*>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return None


def _extract_links(html: str, base_url: str) -> List[dict]:
    """Extract links from HTML."""
    import re
    links = []
    seen = set()
    
    for match in re.finditer(r'href=["\'](.*?)["\']', html, re.IGNORECASE):
        href = match.group(1)
        full_url = urljoin(base_url, href)
        
        # Deduplicate
        if full_url in seen:
            continue
        seen.add(full_url)
        
        # Try to extract link text
        # Simple regex to find text near the link
        text_match = re.search(
            rf'<a[^>]*href=["\']{re.escape(href)}["\'][^>]*>(.*?)</a>',
            html,
            re.IGNORECASE | re.DOTALL
        )
        text = text_match.group(1) if text_match else ""
        # Strip HTML tags from text
        text = re.sub(r'<[^>]+>', '', text).strip()
        
        links.append({
            "url": full_url,
            "text": text[:100],
            "is_external": not full_url.startswith(base_url.rstrip("/")),
        })
    
    return links


def _extract_meta(html: str) -> dict:
    """Extract meta tags from HTML."""
    import re
    meta = {}
    
    # Description
    desc_match = re.search(
        r'<meta[^>]*name=["\']description["\'][^>]*content=["\'](.*?)["\']',
        html,
        re.IGNORECASE
    )
    if desc_match:
        meta["description"] = desc_match.group(1)
    
    # OG tags
    og_tags = {}
    for match in re.finditer(
        r'<meta[^>]*property=["\']og:(.*?)["\'][^>]*content=["\'](.*?)["\']',
        html,
        re.IGNORECASE
    ):
        og_tags[match.group(1)] = match.group(2)
    if og_tags:
        meta["og"] = og_tags
    
    return meta


async def search_web(
    query: str,
    session_id: str,
    num_results: int = 5,
) -> dict:
    """Search the web using a search engine.
    
    Note: In production, integrate with a real search API like:
    - SerpAPI (Google)
    - Bing Search API
    - DuckDuckGo API
    
    For now, returns a structured response explaining the search.
    """
    session = get_browser_session(session_id)
    
    # Record the search
    search_url = f"search://{query.replace(' ', '+')}"
    session.record_navigation(search_url, f"Search: {query}", "search")
    
    return {
        "status": "ok",
        "query": query,
        "note": "To enable live web search, configure a search API (SerpAPI, Bing, etc.)",
        "suggested_search_engines": [
            {"name": "SerpAPI", "url": "https://serpapi.com", "docs": "Google search via API"},
            {"name": "Bing Search API", "url": "https://azure.microsoft.com/services/cognitive-services/bing-web-search-api/"},
            {"name": "Brave Search API", "url": "https://brave.com/search/api/"},
        ],
        "tip": "With KimiClaw, AXE can analyze any URL you provide. Just paste the URL in chat.",
    }


async def analyze_page(
    url: str,
    session_id: str,
) -> dict:
    """Analyze a web page and extract key information."""
    page = await fetch_page(url, session_id)
    
    if page["status"] != "ok":
        return page
    
    # Extract key sections
    content = page.get("content", "")
    
    # Extract headings
    import re
    headings = []
    for match in re.finditer(r'<h([1-6])[^>]*>(.*?)</h\1>', content, re.IGNORECASE | re.DOTALL):
        level = int(match.group(1))
        text = re.sub(r'<[^>]+>', '', match.group(2)).strip()
        headings.append({"level": level, "text": text})
    
    # Extract paragraphs (first few)
    paragraphs = []
    for match in re.finditer(r'<p[^>]*>(.*?)</p>', content, re.IGNORECASE | re.DOTALL):
        text = re.sub(r'<[^>]+>', '', match.group(1)).strip()
        if len(text) > 20:
            paragraphs.append(text)
        if len(paragraphs) >= 5:
            break
    
    return {
        "status": "ok",
        "url": page["url"],
        "title": page.get("title"),
        "description": page.get("meta", {}).get("description"),
        "headings": headings[:20],
        "paragraphs": paragraphs,
        "link_count": len(page.get("links", [])),
        "external_links": [l for l in page.get("links", []) if l.get("is_external")][:10],
    }


async def get_session_info(session_id: str) -> dict:
    """Get information about a browser session."""
    session = get_browser_session(session_id)
    return {
        "session_id": session_id,
        "current_url": session.current_url,
        "history_count": len(session.history),
        "history": session.history[-20:],  # Last 20 entries
    }
