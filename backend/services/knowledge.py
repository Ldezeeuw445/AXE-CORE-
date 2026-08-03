"""AXE RAG — personal knowledge base for the operator.

Document upload, chunking, embedding-based retrieval, context injection.
Uses embeddings.embed_text (Ollama nomic-embed-text → local fallback)
and optional Qdrant when QDRANT_URL is set.
"""
import hashlib
import re
from datetime import datetime, timezone
from typing import Optional, List

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.services.embeddings import (
    cosine_similarity,
    embed_text,
    local_embed,
    qdrant_search,
    qdrant_upsert,
)

CHUNK_SIZE = 512
CHUNK_OVERLAP = 100


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end < len(text):
            search_text = text[start:end]
            sentence_breaks = [m.end() for m in re.finditer(r'[.!?]\s+', search_text)]
            if sentence_breaks:
                end = start + sentence_breaks[-1]
        chunks.append(text[start:end].strip())
        start = end - overlap if end < len(text) else end
    return [c for c in chunks if c]


class KnowledgeBase:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.documents = db.kb_documents
        self.chunks = db.kb_chunks

    async def add_document(
        self,
        email: str,
        title: str,
        content: str,
        doc_type: str = "note",
        source: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> dict:
        doc_id = hashlib.md5(f"{email}:{title}:{content[:100]}".encode()).hexdigest()

        doc = {
            "doc_id": doc_id,
            "email": email,
            "title": title,
            "content": content[:10000],
            "doc_type": doc_type,
            "source": source,
            "tags": tags or [],
            "chunk_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await self.documents.update_one({"doc_id": doc_id}, {"$set": doc}, upsert=True)

        chunks = _chunk_text(content)
        chunk_docs = []
        for i, chunk_text in enumerate(chunks):
            embedding = await embed_text(chunk_text)
            chunk_id = f"{doc_id}_{i}"
            chunk_docs.append({
                "chunk_id": chunk_id,
                "doc_id": doc_id,
                "email": email,
                "text": chunk_text,
                "embedding": embedding,
                "index": i,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            await qdrant_upsert(
                chunk_id,
                embedding,
                {"email": email, "doc_id": doc_id, "text": chunk_text[:500], "title": title},
            )

        if chunk_docs:
            await self.chunks.delete_many({"doc_id": doc_id})
            await self.chunks.insert_many(chunk_docs)
            await self.documents.update_one(
                {"doc_id": doc_id}, {"$set": {"chunk_count": len(chunk_docs)}}
            )

        return {"status": "ok", "doc_id": doc_id, "title": title, "chunks_created": len(chunks)}

    async def search(
        self,
        email: str,
        query: str,
        top_k: int = 5,
        doc_type: Optional[str] = None,
    ) -> List[dict]:
        query_embedding = await embed_text(query)

        # Prefer Qdrant when available
        qhits = await qdrant_search(query_embedding, limit=top_k, score_threshold=0.15)
        if qhits:
            results = []
            for h in qhits:
                payload = h.get("payload") or {}
                if payload.get("email") and payload.get("email") != email:
                    continue
                results.append({
                    "text": payload.get("text", ""),
                    "doc_id": payload.get("doc_id"),
                    "chunk_id": str(h.get("id")),
                    "score": round(float(h.get("score") or 0), 4),
                })
            if results:
                return results[:top_k]

        cursor = self.chunks.find({"email": email}, {"_id": 0}).sort("created_at", -1).limit(500)
        chunks = await cursor.to_list(500)

        scored = []
        for chunk in chunks:
            emb = chunk.get("embedding") or local_embed(chunk.get("text", ""))
            score = cosine_similarity(query_embedding, emb)
            scored.append((score, chunk))
        scored.sort(key=lambda x: -x[0])

        results = []
        for score, chunk in scored[:top_k]:
            results.append({
                "text": chunk["text"],
                "doc_id": chunk["doc_id"],
                "chunk_id": chunk["chunk_id"],
                "score": round(score, 4),
            })
        return results

    async def get_context_for_chat(self, email: str, message: str, max_tokens: int = 1500) -> str:
        results = await self.search(email, message, top_k=5)
        if not results:
            return ""
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

    async def list_documents(self, email: str, doc_type: Optional[str] = None, tag: Optional[str] = None) -> List[dict]:
        query = {"email": email}
        if doc_type:
            query["doc_type"] = doc_type
        if tag:
            query["tags"] = tag
        return await self.documents.find(query, {"_id": 0, "content": 0}).sort("updated_at", -1).to_list(100)

    async def get_document(self, email: str, doc_id: str) -> Optional[dict]:
        return await self.documents.find_one({"doc_id": doc_id, "email": email}, {"_id": 0})

    async def delete_document(self, email: str, doc_id: str) -> dict:
        await self.documents.delete_one({"doc_id": doc_id, "email": email})
        await self.chunks.delete_many({"doc_id": doc_id})
        return {"status": "ok", "deleted": doc_id}

    async def add_conversation_memory(self, email: str, session_id: str, summary: str):
        title = f"Conversation: {session_id[:8]}..."
        return await self.add_document(
            email=email,
            title=title,
            content=summary,
            doc_type="conversation",
            source=f"session:{session_id}",
        )


_knowledge_base = None


def get_knowledge_base(db: AsyncIOMotorDatabase) -> KnowledgeBase:
    global _knowledge_base
    if _knowledge_base is None:
        _knowledge_base = KnowledgeBase(db)
    return _knowledge_base
