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

export const alerts = {
  rules: () => api.get("/alerts/rules").then((r) => r.data),
  createRule: (data) => api.post("/alerts/rules", data).then((r) => r.data),
  updateRule: (id, data) => api.put(`/alerts/rules/${id}`, data).then((r) => r.data),
  deleteRule: (id) => api.delete(`/alerts/rules/${id}`).then((r) => r.data),
  events: (limit = 60, unacknowledged_only = false) =>
    api.get(`/alerts/events?limit=${limit}&unacknowledged_only=${unacknowledged_only}`).then((r) => r.data),
  ackEvent: (id) => api.post(`/alerts/events/${id}/ack`).then((r) => r.data),
  ackAll: () => api.post("/alerts/events/ack-all").then((r) => r.data),
  seedPreset: (preset) => api.post("/alerts/rules/seed-preset", { preset }).then((r) => r.data),
};
