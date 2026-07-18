"""AXE Deep Memory Service — project-context memory, extracted facts, semantic search.

Provides persistent memory capabilities for AXE, including:
- Project-context memory (tagged by project/topic)
- Auto-extracted facts from conversations
- Semantic search/retrieval with text similarity
"""
import os
import json
import re
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from difflib import SequenceMatcher

MEMORY_COLLECTION = "axe_memory"


async def save_memory(
    db,
    content: str,
    topic: str = "general",
    tags: Optional[List[str]] = None,
    source: str = "operator",
    email: Optional[str] = None,
    session_id: Optional[str] = None,
    importance: str = "normal",  # low, normal, high, critical
) -> dict:
    """Save a memory entry to the database.
    
    Args:
        db: MongoDB database instance
        content: The memory content (text)
        topic: Topic or project category
        tags: Optional tags for filtering
        source: Source of the memory (operator, ai, system, extraction)
        email: Operator email (for user-scoped memory)
        session_id: Related session ID
        importance: Importance level
    
    Returns:
        dict with status and memory_id
    """
    try:
        memory_id = f"mem-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{os.urandom(4).hex()}"
        
        entry = {
            "memory_id": memory_id,
            "content": content,
            "topic": topic,
            "tags": tags or [],
            "source": source,
            "email": email,
            "session_id": session_id,
            "importance": importance,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "access_count": 0,
            "last_accessed": None,
        }
        
        await db[MEMORY_COLLECTION].insert_one(entry)
        
        return {
            "status": "ok",
            "memory_id": memory_id,
            "topic": topic,
            "content_preview": content[:200] + "..." if len(content) > 200 else content,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def get_memory(
    db,
    memory_id: str,
    email: Optional[str] = None,
) -> dict:
    """Retrieve a specific memory entry by ID."""
    try:
        query = {"memory_id": memory_id}
        if email:
            query["email"] = email
        
        entry = await db[MEMORY_COLLECTION].find_one(query, {"_id": 0})
        if not entry:
            return {"status": "not_found"}
        
        # Update access stats
        await db[MEMORY_COLLECTION].update_one(
            {"memory_id": memory_id},
            {
                "$inc": {"access_count": 1},
                "$set": {"last_accessed": datetime.now(timezone.utc).isoformat()},
            }
        )
        
        return {"status": "ok", "memory": entry}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def search_memory(
    db,
    query: str,
    limit: int = 10,
    topic: Optional[str] = None,
    tags: Optional[List[str]] = None,
    email: Optional[str] = None,
    importance: Optional[str] = None,
    min_similarity: float = 0.3,
) -> dict:
    """Search memory entries by text similarity.
    
    Uses a simple text similarity approach (SequenceMatcher) as a fallback.
    In production, this should be replaced with vector embeddings (e.g., OpenAI embeddings, 
    MongoDB Atlas Vector Search, or a dedicated vector DB like Pinecone/Weaviate).
    
    Args:
        db: MongoDB database instance
        query: Search query string
        limit: Max results to return
        topic: Filter by topic
        tags: Filter by tags (any match)
        email: Filter by operator email
        importance: Filter by importance level
        min_similarity: Minimum similarity score (0-1)
    
    Returns:
        dict with status and results list
    """
    try:
        # Build query filter
        mongo_query = {}
        if email:
            mongo_query["email"] = email
        if topic:
            mongo_query["topic"] = topic
        if tags:
            mongo_query["tags"] = {"$in": tags}
        if importance:
            mongo_query["importance"] = importance
        
        # Fetch candidates (we do a broader fetch and rank locally)
        candidates = await db[MEMORY_COLLECTION].find(
            mongo_query, {"_id": 0}
        ).sort("created_at", -1).to_list(200)
        
        if not candidates:
            return {"status": "ok", "results": [], "query": query}
        
        # Score by text similarity
        query_lower = query.lower()
        query_words = set(re.findall(r'\w+', query_lower))
        
        scored = []
        for entry in candidates:
            content = entry.get("content", "")
            content_lower = content.lower()
            
            # SequenceMatcher similarity
            sim = SequenceMatcher(None, query_lower, content_lower).ratio()
            
            # Word overlap bonus
            content_words = set(re.findall(r'\w+', content_lower))
            if content_words:
                overlap = len(query_words & content_words) / len(query_words | content_words)
                sim = max(sim, overlap)
            
            # Title/topic exact match bonus
            if query_lower in entry.get("topic", "").lower():
                sim = max(sim, 0.9)
            if query_lower in content_lower:
                sim = max(sim, 0.85)
            
            # Importance boost
            importance_boost = {
                "critical": 0.15,
                "high": 0.1,
                "normal": 0.0,
                "low": -0.05,
            }.get(entry.get("importance", "normal"), 0.0)
            
            sim += importance_boost
            sim = min(sim, 1.0)
            
            if sim >= min_similarity:
                scored.append({"score": sim, "memory": entry})
        
        # Sort by score descending
        scored.sort(key=lambda x: x["score"], reverse=True)
        top_results = scored[:limit]
        
        # Update access stats for returned memories
        for r in top_results:
            await db[MEMORY_COLLECTION].update_one(
                {"memory_id": r["memory"]["memory_id"]},
                {
                    "$inc": {"access_count": 1},
                    "$set": {"last_accessed": datetime.now(timezone.utc).isoformat()},
                }
            )
        
        return {
            "status": "ok",
            "query": query,
            "results_count": len(top_results),
            "results": [
                {
                    "memory_id": r["memory"]["memory_id"],
                    "content": r["memory"]["content"],
                    "topic": r["memory"].get("topic"),
                    "tags": r["memory"].get("tags"),
                    "importance": r["memory"].get("importance"),
                    "source": r["memory"].get("source"),
                    "score": round(r["score"], 3),
                    "created_at": r["memory"].get("created_at"),
                    "access_count": r["memory"].get("access_count", 0),
                }
                for r in top_results
            ],
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "query": query}


async def list_topics(
    db,
    email: Optional[str] = None,
) -> dict:
    """List all unique memory topics."""
    try:
        query = {}
        if email:
            query["email"] = email
        
        topics = await db[MEMORY_COLLECTION].distinct("topic", query)
        return {"status": "ok", "topics": sorted(topics)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def list_tags(
    db,
    email: Optional[str] = None,
) -> dict:
    """List all unique memory tags."""
    try:
        query = {}
        if email:
            query["email"] = email
        
        tags = await db[MEMORY_COLLECTION].distinct("tags", query)
        # Flatten (tags is an array field)
        all_tags = set()
        for tag_list in tags:
            if isinstance(tag_list, list):
                all_tags.update(tag_list)
            elif isinstance(tag_list, str):
                all_tags.add(tag_list)
        
        return {"status": "ok", "tags": sorted(all_tags)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def delete_memory(
    db,
    memory_id: str,
    email: Optional[str] = None,
) -> dict:
    """Delete a memory entry by ID."""
    try:
        query = {"memory_id": memory_id}
        if email:
            query["email"] = email
        
        result = await db[MEMORY_COLLECTION].delete_one(query)
        if result.deleted_count == 0:
            return {"status": "not_found"}
        
        return {"status": "ok", "deleted": memory_id}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def extract_facts(
    db,
    conversation_text: str,
    email: Optional[str] = None,
    session_id: Optional[str] = None,
) -> dict:
    """Auto-extract key facts from a conversation and save them to memory.
    
    This is a lightweight extraction that uses regex/heuristics.
    In production, this should use an LLM for structured extraction.
    
    Args:
        db: MongoDB database instance
        conversation_text: The conversation text to analyze
        email: Operator email
        session_id: Related session ID
    
    Returns:
        dict with status and extracted facts
    """
    try:
        facts = []
        
        # Extract URLs
        urls = re.findall(r'https?://[^\s\)\]\>\"\']+', conversation_text)
        for url in urls:
            facts.append({
                "type": "url",
                "content": f"URL referenced: {url}",
                "topic": "references",
                "tags": ["url", "reference"],
                "importance": "normal",
            })
        
        # Extract file paths / code references
        code_refs = re.findall(r'[\w/\\-]+\.(py|js|ts|jsx|tsx|html|css|java|cpp|go|rs|rb|php)', conversation_text, re.IGNORECASE)
        for ref in code_refs:
            facts.append({
                "type": "code_reference",
                "content": f"Code file referenced: {ref}",
                "topic": "code",
                "tags": ["code", "reference"],
                "importance": "normal",
            })
        
        # Extract key decisions (simple heuristic: lines with "decide", "choose", "use", "will")
        decision_keywords = ["decide", "decision", "choose", "chosen", "will use", "going with", "settled on", "agreed to"]
        for line in conversation_text.split("\n"):
            lower = line.lower()
            if any(kw in lower for kw in decision_keywords) and len(line) > 20:
                facts.append({
                    "type": "decision",
                    "content": line.strip(),
                    "topic": "decisions",
                    "tags": ["decision", "important"],
                    "importance": "high",
                })
        
        # Extract TODOs / action items
        todo_pattern = re.compile(r'(?:TODO|FIXME|HACK|BUG|ACTION|TASK)[\s:]+(.+)', re.IGNORECASE)
        for match in todo_pattern.finditer(conversation_text):
            facts.append({
                "type": "action_item",
                "content": f"Action item: {match.group(1).strip()}",
                "topic": "tasks",
                "tags": ["action_item", "todo"],
                "importance": "high",
            })
        
        # Extract important metrics / numbers
        metrics = re.findall(r'([\d,]+(?:\.\d+)?)\s*(%|percent|USD|EUR|GBP|BTC|ETH|million|billion|thousand|k|m|b)', conversation_text, re.IGNORECASE)
        for num, unit in metrics:
            facts.append({
                "type": "metric",
                "content": f"Metric noted: {num} {unit}",
                "topic": "metrics",
                "tags": ["metric", "data"],
                "importance": "normal",
            })
        
        # Save all extracted facts to memory
        saved = []
        for fact in facts:
            result = await save_memory(
                db=db,
                content=fact["content"],
                topic=fact["topic"],
                tags=fact["tags"],
                source="extraction",
                email=email,
                session_id=session_id,
                importance=fact["importance"],
            )
            if result.get("status") == "ok":
                saved.append(result)
        
        return {
            "status": "ok",
            "extracted_count": len(facts),
            "saved_count": len(saved),
            "facts": [
                {
                    "type": f["type"],
                    "content": f["content"],
                    "topic": f["topic"],
                    "importance": f["importance"],
                }
                for f in facts
            ],
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def get_context_for_chat(
    db,
    query: str,
    email: Optional[str] = None,
    limit: int = 5,
) -> str:
    """Get relevant memory context for a chat query.
    
    Returns a formatted string of relevant memories to inject into the chat prompt.
    """
    try:
        result = await search_memory(
            db=db,
            query=query,
            limit=limit,
            email=email,
            min_similarity=0.2,
        )
        
        if result.get("status") != "ok" or not result.get("results"):
            return ""
        
        lines = ["[RELEVANT MEMORY CONTEXT]"]
        for r in result["results"]:
            lines.append(f"- [{r['topic']}] {r['content']}")
        
        return "\n".join(lines)
    except Exception:
        return ""
