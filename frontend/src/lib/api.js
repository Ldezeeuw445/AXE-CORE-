import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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

export const vision = {
  screenshot: (image_base64, context, session_id) =>
    api.post("/vision/screenshot", { image_base64, context, session_id }).then((r) => r.data),
  webcam: (image_base64, context, session_id) =>
    api.post("/vision/webcam", { image_base64, context, session_id }).then((r) => r.data),
};

export const files = {
  analyze: (formData) =>
    api.post("/files/analyze", formData, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data),
  analyzeCode: (payload) =>
    api.post("/files/analyze/code", payload).then((r) => r.data),
};

export const actions = {
  list: (params) => api.get("/actions/list", { params }).then((r) => r.data),
  categories: () => api.get("/actions/categories").then((r) => r.data),
  get: (id) => api.get(`/actions/${id}`).then((r) => r.data),
  invoke: (payload) => api.post("/actions/invoke", payload).then((r) => r.data),
};

export const planner = {
  create: (payload) => api.post("/planner/create", payload).then((r) => r.data),
  execute: (payload) => api.post("/planner/execute", payload).then((r) => r.data),
  run: (payload) => api.post("/planner/run", payload).then((r) => r.data),
};

export const memory = {
  save: (payload) =>
    api.post("/memory/save", payload).then((r) => r.data),
  get: (id) =>
    api.get(`/memory/${id}`).then((r) => r.data),
  search: (payload) =>
    api.post("/memory/search", payload).then((r) => r.data),
  topics: () =>
    api.get("/memory/topics").then((r) => r.data),
  tags: () =>
    api.get("/memory/tags").then((r) => r.data),
  delete: (id) =>
    api.delete(`/memory/${id}`).then((r) => r.data),
  extract: (payload) =>
    api.post("/memory/extract", payload).then((r) => r.data),
  context: (query) =>
    api.get("/memory/context", { params: { query } }).then((r) => r.data),
};

export const alerts = {
  rules: () =>
    api.get("/alerts/rules").then((r) => r.data),
  createRule: (data) =>
    api.post("/alerts/rules", data).then((r) => r.data),
  updateRule: (id, data) =>
    api.put(`/alerts/rules/${id}`, data).then((r) => r.data),
  deleteRule: (id) =>
    api.delete(`/alerts/rules/${id}`).then((r) => r.data),
  events: (limit = 60, unacknowledged_only = false) =>
    api.get(`/alerts/events?limit=${limit}&unacknowledged_only=${unacknowledged_only}`).then((r) => r.data),
  ackEvent: (id) =>
    api.post(`/alerts/events/${id}/ack`).then((r) => r.data),
  ackAll: () =>
    api.post("/alerts/events/ack-all").then((r) => r.data),
  seedPreset: (preset) =>
    api.post("/alerts/rules/seed-preset", { preset }).then((r) => r.data),
};
