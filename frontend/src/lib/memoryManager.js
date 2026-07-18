/** AXE Memory Manager Client — deep memory operations. */

import { api } from "./api";

/**
 * Save a memory entry.
 * @param {string} content - Memory content
 * @param {string} topic - Topic/category
 * @param {string[]} tags - Tags
 * @param {string} importance - low, normal, high, critical
 * @param {string} sessionId - Optional session ID
 * @returns {Promise<object>}
 */
export async function saveMemory(content, topic = "general", tags = [], importance = "normal", sessionId = null) {
  const res = await api.post("/memory/save", {
    content,
    topic,
    tags,
    importance,
    session_id: sessionId,
  });
  return res.data;
}

/**
 * Get a memory entry by ID.
 * @param {string} memoryId
 * @returns {Promise<object>}
 */
export async function getMemory(memoryId) {
  const res = await api.get(`/memory/${memoryId}`);
  return res.data;
}

/**
 * Search memory entries.
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @param {string} topic - Optional topic filter
 * @param {string[]} tags - Optional tags filter
 * @param {string} importance - Optional importance filter
 * @returns {Promise<object>}
 */
export async function searchMemory(query, limit = 10, topic = null, tags = [], importance = null) {
  const res = await api.post("/memory/search", {
    query,
    limit,
    topic,
    tags,
    importance,
  });
  return res.data;
}

/**
 * List all memory topics.
 * @returns {Promise<object>}
 */
export async function listTopics() {
  const res = await api.get("/memory/topics");
  return res.data;
}

/**
 * List all memory tags.
 * @returns {Promise<object>}
 */
export async function listTags() {
  const res = await api.get("/memory/tags");
  return res.data;
}

/**
 * Delete a memory entry.
 * @param {string} memoryId
 * @returns {Promise<object>}
 */
export async function deleteMemory(memoryId) {
  const res = await api.delete(`/memory/${memoryId}`);
  return res.data;
}

/**
 * Extract facts from a conversation and save to memory.
 * @param {string} conversationText
 * @param {string} sessionId
 * @returns {Promise<object>}
 */
export async function extractFacts(conversationText, sessionId = null) {
  const res = await api.post("/memory/extract", {
    conversation_text: conversationText,
    session_id: sessionId,
  });
  return res.data;
}

/**
 * Get memory context for a chat query.
 * @param {string} query
 * @returns {Promise<object>}
 */
export async function getMemoryContext(query) {
  const res = await api.get("/memory/context", { params: { query } });
  return res.data;
}

/**
 * Format memory results for display.
 * @param {object} result
 * @returns {string}
 */
export function formatMemoryResults(result) {
  if (!result || result.status !== "ok") return "[Memory search failed]";
  const results = result.results || [];
  if (results.length === 0) return "No relevant memories found.";

  const lines = ["🧠 Relevant Memories:"];
  results.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.topic}] ${r.content.slice(0, 200)}${r.content.length > 200 ? "..." : ""}`);
    if (r.tags?.length) lines.push(`   Tags: ${r.tags.join(", ")}`);
  });
  return lines.join("\n");
}
