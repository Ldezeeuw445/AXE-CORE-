/**
 * serviceEndpoints.ts
 * ------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for every external service AXE CORE talks to.
 *
 * Consumed by:
 *  - vite.config.ts        → generates the dev-server /proxy/<name> table
 *  - apiConfig.ts          → resolves runtime URLs (Tauri = direct, web = proxy)
 *
 * Pure data — no imports, no environment access — so it is safe to load
 * both in the browser bundle and in the Vite (Node) config process.
 */

export interface ServiceEndpoint {
  /** Direct base URL of the service (Tauri runtime + default dev-proxy target). */
  target: string;
  /** Env var that overrides the dev-proxy target (read by vite.config.ts only). */
  targetEnvVar?: string;
  /** Set false for raw-IP / self-signed targets so the dev proxy skips TLS verification. */
  secure?: boolean;
}

export const SERVICE_ENDPOINTS: Record<string, ServiceEndpoint> = {
  anthropic: { target: 'https://api.anthropic.com' },
  openai: { target: 'https://api.openai.com' },
  google: { target: 'https://generativelanguage.googleapis.com' },
  xai: { target: 'https://api.x.ai' },
  groq: { target: 'https://api.groq.com' },
  openrouter: { target: 'https://openrouter.ai' },
  krater: { target: 'https://api.krater.ai' },
  ollama: { target: 'https://ollama.axecompanion.com', targetEnvVar: 'OLLAMA_PROXY_TARGET', secure: false },
  n8n: { target: 'http://89.167.78.6:5678', targetEnvVar: 'N8N_PROXY_TARGET', secure: false },
  openhands: { target: 'http://89.167.78.6:3001', targetEnvVar: 'OPENHANDS_PROXY_TARGET', secure: false },
  openjarvis: { target: 'http://89.167.78.6:2025', targetEnvVar: 'OPENJARVIS_PROXY_TARGET', secure: false },
  openclaw: { target: 'http://89.167.78.6:5001', targetEnvVar: 'OPENCLAW_PROXY_TARGET', secure: false },
  kilocode: { target: 'http://89.167.78.6:5002', targetEnvVar: 'KILOCODE_PROXY_TARGET', secure: false },
  crewai: { target: 'http://89.167.78.6:5003', targetEnvVar: 'CREWAI_PROXY_TARGET', secure: false },
  hermes: { target: 'http://89.167.78.6:3010', targetEnvVar: 'HERMES_PROXY_TARGET', secure: false },
  axecore: { target: 'https://api.axecompanion.com', targetEnvVar: 'AXE_CORE_API_PROXY_TARGET' },
};
