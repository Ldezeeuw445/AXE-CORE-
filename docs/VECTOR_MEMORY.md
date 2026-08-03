# AXE Vector Memory

## What changed

Memory retrieval is **semantic** (vector cosine similarity), not only keyword match.

| Layer | Behavior |
|--------|----------|
| Frontend `ragMemoryService` | embeds on save, cosine search on query |
| `embeddingService` | Ollama `nomic-embed-text` → local hash fallback |
| Backend `embeddings.py` | same for knowledge/memory services |
| Qdrant (optional) | fast ANN index when `QDRANT_URL` is set |

## Does AXE type fewer characters?

**No — not directly.** Embeddings improve *what is retrieved*, not writing style.

What *does* improve:
- AXE gets **more relevant** memory in context (less noise)
- Prompt can stay smaller because you inject top‑k hits instead of dumping everything
- Answers feel sharper because the right facts surface

To make replies shorter/cleaner, use response-style settings / system prompt (separate from vectors).

## Ollama embeddings (recommended on VPS or Mac)

```bash
ollama pull nomic-embed-text
# test
curl http://127.0.0.1:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "Luka prefers concise Dutch replies"
}'
```

Env (frontend):
```env
VITE_OLLAMA_URL=http://127.0.0.1:11434
VITE_EMBED_MODEL=nomic-embed-text
```

Env (backend):
```env
OLLAMA_URL=http://127.0.0.1:11434
EMBED_MODEL=nomic-embed-text
```

## Qdrant (optional, makes scale better)

Qdrant is a dedicated vector database. Worth it when you have thousands+ of chunks.

### Docker on VPS

```bash
docker run -d --name qdrant \
  -p 6333:6333 -p 6334:6334 \
  -v qdrant_data:/qdrant/storage \
  qdrant/qdrant
```

### Env

```env
QDRANT_URL=http://127.0.0.1:6333
QDRANT_COLLECTION=axe_memory
```

### Collection

- Distance: **Cosine**
- Vector size: **768** for `nomic-embed-text` (auto-created on first upsert by backend helper)

### When to use Qdrant vs local

| Size | Approach |
|------|----------|
| < ~1k memories | in-process cosine (current frontend + Mongo chunks) is fine |
| many docs / multi-user | Qdrant (or pgvector) |

## Flow

```
save memory → embed(text) → store content (+ vector local / Qdrant)
user query  → embed(query) → top-k cosine → inject into AXE prompt
```

## VPS checklist

1. `ollama pull nomic-embed-text`
2. (optional) start Qdrant container
3. set `OLLAMA_URL`, `EMBED_MODEL`, optional `QDRANT_URL`
4. restart AXE API / Tauri app
5. chat once so core RAG seeds + embeddings cache
