"""AXE RAG — personal knowledge base for the operator.

Provides document upload, text chunking, embedding-based retrieval,
and context injection into chat conversations.
"""
import os
import re
import hashlib
from datetime import datetime, timezone
from typing import Optional, List, Dict

from motor.motor_asyncio import AsyncIOMotorDatabase


# Simple sentence-based chunking (can be upgraded to semantic chunking)
CHUNK_SIZE = 512  # characters per chunk
CHUNK_OVERLAP = 100


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        # Try to break at a sentence boundary
        if end < len(text):
            # Look for sentence ending punctuation followed by space
            search_text = text[start:end]
            sentence_breaks = [
                m.end() for m in re.finditer(r'[.!?]\s+', search_text)
            ]
            if sentence_breaks:
                # Use the last sentence break within the chunk
                end = start + sentence_breaks[-1]
        chunks.append(text[start:end].strip())
        start = end - overlap if end < len(text) else end
    return [c for c in chunks if c]


def _simple_embedding(text: str) -> List[float]:
    """Create a simple bag-of-words embedding.
    
    In production, replace with OpenAI embeddings or sentence-transformers.
    This is a lightweight fallback that works without external embedding APIs.
    """
    # Simple character-level hash-based embedding for demo
    # This preserves enough signal for basic similarity search
    import struct
    
    text_lower = text.lower()
    # Create a fixed-size vector based on character n-grams
    vector_size = 128
    vec = [0.0] * vector_size
    
    # Use character bigrams
    for i in range(len(text_lower) - 1):
        bigram = text_lower[i:i+2]
        hash_val = int(hashlib.md5(bigram.encode()).hexdigest(), 16)
        idx = hash_val % vector_size
        vec[idx] += 1.0
    
    # Normalize
    magnitude = sum(v**2 for v in vec) ** 0.5
    if magnitude > 0:
        vec = [v / magnitude for v in vec]
    
    return vec


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    return dot


class KnowledgeBase:
    """Personal knowledge base for the operator."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.documents = db.kb_documents
        self.chunks = db.kb_chunks

    async def add_document(
        self,
        email: str,
        title: str,
        content: str,
        doc_type: str = "note",  # note, file, url, conversation
        source: Optional[str] = None,
        tags: Optional[List[str]] = None
    ) -> dict:
        """Add a document to the knowledge base."""
        doc_id = hashlib.md5(f"{email}:{title}:{content[:100]}".encode()).hexdigest()
        
        # Store document
        doc = {
            "doc_id": doc_id,
            "email": email,
            "title": title,
            "content": content[:10000],  # Store truncated version
            "doc_type": doc_type,
            "source": source,
            "tags": tags or [],
            "chunk_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        
        await self.documents.update_one(
            {"doc_id": doc_id},
            {"$set": doc},
            upsert=True
        )
        
        # Chunk and store
        chunks = _chunk_text(content)
        chunk_docs = []
        for i, chunk_text in enumerate(chunks):
            embedding = _simple_embedding(chunk_text)
            chunk_docs.append({
                "chunk_id": f"{doc_id}_{i}",
                "doc_id": doc_id,
                "email": email,
                "text": chunk_text,
                "embedding": embedding,
                "index": i,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        
        if chunk_docs:
            # Remove old chunks for this doc
            await self.chunks.delete_many({"doc_id": doc_id})
            # Insert new chunks
            await self.chunks.insert_many(chunk_docs)
            # Update chunk count
            await self.documents.update_one(
                {"doc_id": doc_id},
                {"$set": {"chunk_count": len(chunk_docs)}}
            )
        
        return {
            "status": "ok",
            "doc_id": doc_id,
            "title": title,
            "chunks_created": len(chunks)
        }

    async def search(
        self,
        email: str,
        query: str,
        top_k: int = 5,
        doc_type: Optional[str] = None
    ) -> List[dict]:
        """Search the knowledge base for relevant chunks."""
        query_embedding = _simple_embedding(query)
        
        # Build match filter
        match_filter = {"email": email}
        if doc_type:
            # Need to join with documents collection
            pass
        
        # Fetch all chunks for this user (in production, use vector DB)
        # For now, fetch recent chunks and score them
        cursor = self.chunks.find(
            match_filter,
            {"_id": 0}
        ).sort("created_at", -1).limit(500)
        
        chunks = await cursor.to_list(500)
        
        # Score by cosine similarity
        scored = []
        for chunk in chunks:
            score = _cosine_similarity(query_embedding, chunk.get("embedding", []))
            scored.append((score, chunk))
        
        # Sort by score descending
        scored.sort(key=lambda x: -x[0])
        
        # Return top_k
        results = []
        for score, chunk in scored[:top_k]:
            results.append({
                "text": chunk["text"],
                "doc_id": chunk["doc_id"],
                "chunk_id": chunk["chunk_id"],
                "score": round(score, 4),
            })
        
        return results

    async def get_context_for_chat(
        self,
        email: str,
        message: str,
        max_tokens: int = 1500
    ) -> str:
        """Get relevant context from knowledge base for a chat message."""
        results = await self.search(email, message, top_k=5)
        
        if not results:
            return ""
        
        # Build context string
        context_parts = ["[OPERATOR KNOWLEDGE BASE]"]
        total_len = 0
        
        for r in results:
            chunk_text = f"\n---\n{r['text']}"
            if total_len + len(chunk_text) > max_tokens:
                break
            context_parts.append(chunk_text)
            total_len += len(chunk_text)
        
        context_parts.append("\n---\n[END KNOWLEDGE BASE]")
        return "\n".join(context_parts)

    async def list_documents(
        self,
        email: str,
        doc_type: Optional[str] = None,
        tag: Optional[str] = None
    ) -> List[dict]:
        """List all documents in the knowledge base."""
        query = {"email": email}
        if doc_type:
            query["doc_type"] = doc_type
        if tag:
            query["tags"] = tag
        
        docs = await self.documents.find(
            query,
            {"_id": 0, "content": 0}  # Exclude full content
        ).sort("updated_at", -1).to_list(100)
        
        return docs

    async def get_document(self, email: str, doc_id: str) -> Optional[dict]:
        """Get a specific document."""
        doc = await self.documents.find_one(
            {"doc_id": doc_id, "email": email},
            {"_id": 0}
        )
        return doc

    async def delete_document(self, email: str, doc_id: str) -> dict:
        """Delete a document and its chunks."""
        await self.documents.delete_one({"doc_id": doc_id, "email": email})
        await self.chunks.delete_many({"doc_id": doc_id})
        return {"status": "ok", "deleted": doc_id}

    async def add_conversation_memory(
        self,
        email: str,
        session_id: str,
        summary: str
    ):
        """Add a conversation summary as a knowledge document."""
        title = f"Conversation: {session_id[:8]}..."
        return await self.add_document(
            email=email,
            title=title,
            content=summary,
            doc_type="conversation",
            source=f"session:{session_id}"
        )


# Singleton instance
_knowledge_base = None


def get_knowledge_base(db: AsyncIOMotorDatabase) -> KnowledgeBase:
    global _knowledge_base
    if _knowledge_base is None:
        _knowledge_base = KnowledgeBase(db)
    return _knowledge_base
