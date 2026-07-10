import axios from "axios";

// Backend URL: use env var or fallback to VPS
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://89.167.78.6:8000";
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("axe_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("axe_token");
      if (typeof window !== "undefined" && !window.location.pathname.includes("login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const auth = {
  login: (email, password) => api.post("/auth/login", { email, password }).then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
};

export const sources = {
  latest: () => api.get("/sources/latest").then((r) => r.data),
  sweep: () => api.post("/sources/sweep").then((r) => r.data),
  adapter: (name) => api.get(`/adapters/${name}`).then((r) => r.data),
};

export const ai = {
  correlate: () => api.post("/ai/correlate").then((r) => r.data),
  latestCorrelation: () => api.get("/ai/correlate/latest").then((r) => r.data),
  chat: (message, session_id) => api.post("/ai/chat", { message, session_id }).then((r) => r.data),
  history: (session_id) => api.get(`/ai/chat/history?session_id=${session_id}`).then((r) => r.data),
};

export const watchlists = {
  list: () => api.get("/watchlists").then((r) => r.data),
  create: (data) => api.post("/watchlists", data).then((r) => r.data),
  update: (id, data) => api.put(`/watchlists/${id}`, data).then((r) => r.data),
  remove: (id) => api.delete(`/watchlists/${id}`).then((r) => r.data),
};

export const history = {
  correlations: (limit = 30, skip = 0) =>
    api.get(`/history/correlations?limit=${limit}&skip=${skip}`).then((r) => r.data),
  sweeps: (limit = 60, skip = 0) =>
    api.get(`/history/sweeps?limit=${limit}&skip=${skip}`).then((r) => r.data),
  correlationForSweep: (sweep_id) =>
    api.get(`/history/correlation/${sweep_id}`).then((r) => r.data),
};

export const alerts = {
  rules: () => api.get("/alerts/rules").then((r) => r.data),
  createRule: (data) => api.post("/alerts/rules", data).then((r) => r.data),
  updateRule: (id, data) => api.put(`/alerts/rules/${id}`, data).then((r) => r.data),
  deleteRule: (id) => api.delete(`/alerts/rules/${id}`).then((r) => r.data),
  events: (limit = 60, unacknowledged_only = false) =>
    api.get(`/alerts/events?limit=${limit}&unacknowledged_only=${unacknowled_only}`).then((r) => r.data),
  ackEvent: (id) => api.post(`/alerts/events/${id}/ack`).then((r) => r.data),
  ackAll: () => api.post("/alerts/events/ack-all").then((r) => r.data),
  seedPreset: (preset) => api.post("/alerts/rules/seed-preset", { preset }).then((r) => r.data),
};

// ========== FEEDBACK (Self-Improving Loop) ==========
export const feedback = {
  submit: (data) => api.post("/feedback/submit", data).then((r) => r.data),
  stats: (days = 7) => api.get(`/feedback/stats?days=${days}`).then((r) => r.data),
  insights: () => api.get("/feedback/insights").then((r) => r.data),
  adapt: () => api.post("/feedback/adapt").then((r) => r.data),
  addAdaptation: (prompt_type, addition) =>
    api.post("/feedback/prompt-adaptation", { prompt_type, addition }).then((r) => r.data),
  getAdaptedPrompt: (prompt_type = "chat") =>
    api.get(`/feedback/adapted-prompt?prompt_type=${prompt_type}`).then((r) => r.data),
};

// ========== KNOWLEDGE (RAG) ==========
export const knowledge = {
  addDocument: (data) => api.post("/knowledge/documents", data).then((r) => r.data),
  listDocuments: (doc_type, tag) => {
    let url = "/knowledge/documents";
    const params = [];
    if (doc_type) params.push(`doc_type=${doc_type}`);
    if (tag) params.push(`tag=${tag}`);
    if (params.length) url += `?${params.join("&")}`;
    return api.get(url).then((r) => r.data);
  },
  getDocument: (doc_id) => api.get(`/knowledge/documents/${doc_id}`).then((r) => r.data),
  deleteDocument: (doc_id) => api.delete(`/knowledge/documents/${doc_id}`).then((r) => r.data),
  search: (query, top_k = 5) =>
    api.post("/knowledge/search", { query, top_k }).then((r) => r.data),
  addConversationMemory: (session_id, summary) =>
    api.post("/knowledge/conversation-memory", null, { params: { session_id, summary } }).then((r) => r.data),
};

// ========== KIMI (KimiClaw / Kimi Code / Kimi Work) ==========
export const kimi = {
  models: () => api.get("/kimi/models").then((r) => r.data),
  chat: (variant, message, context, temperature) =>
    api.post("/kimi/chat", { variant, message, context, temperature }).then((r) => r.data),
  browser: (task, url, search_query) =>
    api.post("/kimi/browser", { task, url, search_query }).then((r) => r.data),
  code: (task, code, language, file_path) =>
    api.post("/kimi/code", { task, code, language, file_path }).then((r) => r.data),
  work: (task, document, doc_type) =>
    api.post("/kimi/work", { task, document, doc_type }).then((r) => r.data),
  route: (intent, message) =>
    api.post("/kimi/route", { intent, message }).then((r) => r.data),
  health: () => api.get("/kimi/health").then((r) => r.data),
};

// ========== BROWSER (In-App Browser) ==========
export const browser = {
  fetch: (url, wait_for) => api.post("/browser/fetch", { url, wait_for }).then((r) => r.data),
  search: (query, num_results) => api.post("/browser/search", { query, num_results }).then((r) => r.data),
  analyze: (url) => api.post("/browser/analyze", { url }).then((r) => r.data),
  session: () => api.get("/browser/session").then((r) => r.data),
  closeSession: () => api.delete("/browser/session").then((r) => r.data),
  health: () => api.get("/browser/health").then((r) => r.data),
};
