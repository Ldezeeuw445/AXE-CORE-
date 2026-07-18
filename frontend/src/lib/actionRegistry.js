/** AXE Action Registry Client — discover and invoke actions. */

import { api } from "./api";

/**
 * List all available actions.
 * @param {string} category - Optional category filter
 * @param {string} search - Optional search query
 * @returns {Promise<object>}
 */
export async function listActions(category = null, search = null) {
  const params = {};
  if (category) params.category = category;
  if (search) params.search = search;
  const res = await api.get("/actions/list", { params });
  return res.data;
}

/**
 * Get action categories.
 * @returns {Promise<object>}
 */
export async function getCategories() {
  const res = await api.get("/actions/categories");
  return res.data;
}

/**
 * Get a specific action definition.
 * @param {string} actionId
 * @returns {Promise<object>}
 */
export async function getAction(actionId) {
  const res = await api.get(`/actions/${actionId}`);
  return res.data;
}

/**
 * Invoke an action with parameters.
 * @param {string} actionId
 * @param {object} parameters
 * @param {string} sessionId
 * @returns {Promise<object>}
 */
export async function invokeAction(actionId, parameters = {}, sessionId = null) {
  const res = await api.post("/actions/invoke", {
    action_id: actionId,
    parameters,
    session_id: sessionId,
  });
  return res.data;
}

/**
 * Quick invoke helpers for common actions.
 */
export const quickActions = {
  webSearch: (query, numResults = 5) => invokeAction("web_search", { query, num_results: numResults }),
  browserFetch: (url) => invokeAction("browser_fetch", { url }),
  browserAnalyze: (url) => invokeAction("browser_analyze", { url }),
  correlate: () => invokeAction("correlate_sources"),
  sweep: () => invokeAction("sweep_sources"),
  kimiChat: (message, variant = "kimi-claw") => invokeAction("kimi_chat", { message, variant }),
  memorySearch: (query, limit = 10) => invokeAction("memory_search", { query, limit }),
  memorySave: (content, topic = "general", tags = []) => invokeAction("memory_save", { content, topic, tags }),
  browserOpen: (url) => invokeAction("browser_open_tab", { url }),
  browserClose: () => invokeAction("browser_close_tab"),
};
