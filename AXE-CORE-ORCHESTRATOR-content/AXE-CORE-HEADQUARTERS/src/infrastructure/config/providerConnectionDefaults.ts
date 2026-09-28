import type { ProviderId } from '@/domain/providers';

const OLLAMA_DEFAULT_URL = import.meta.env.VITE_OLLAMA_URL
  ?? (import.meta.env.DEV ? '/proxy/ollama' : 'https://ollama.axecompanion.com');

const ENV_BASE_URLS: Partial<Record<ProviderId, string>> = {
  ollama: OLLAMA_DEFAULT_URL,
  openhands: import.meta.env.VITE_OPENHANDS_URL ?? '',
  openjarvis: import.meta.env.VITE_OPENJARVIS_URL ?? '',
  openclaw: import.meta.env.VITE_OPENCLAW_URL ?? '',
  kilocode: import.meta.env.VITE_KILOCODE_URL ?? '',
  crewai: import.meta.env.VITE_CREWAI_URL ?? '',
  // Hermes is not its own service -- it's an Ollama model (hermes3:8b), see
  // providers.ts's own comment on this. A separate VITE_HERMES_URL never
  // existed, so this always resolved to '' -> undefined -> the dead
  // '/proxy/hermes' fallback below, which is what threw "Request URL is
  // missing an 'http://' or 'https://' protocol" on Test. Share Ollama's URL.
  hermes: OLLAMA_DEFAULT_URL,
  groq: import.meta.env.VITE_GROQ_URL ?? '',
};

const PROXY_BASE_URLS: Partial<Record<ProviderId, string>> = {
  ollama: '/proxy/ollama',
  openhands: '/proxy/openhands',
  openjarvis: '/proxy/openjarvis',
  openclaw: '/proxy/openclaw',
  kilocode: '/proxy/kilocode',
  crewai: '/proxy/crewai',
  // Same reasoning as ENV_BASE_URLS.hermes above.
  hermes: '/proxy/ollama',
};

export function getDefaultProviderBaseUrl(providerId: ProviderId): string | undefined {
  return ENV_BASE_URLS[providerId] || undefined;
}

export function getProxyProviderBaseUrl(providerId: ProviderId): string | undefined {
  return PROXY_BASE_URLS[providerId] || undefined;
}

export function normalizeProviderBaseUrl(providerId: ProviderId, baseUrl?: string | null): string | undefined {
  const envBaseUrl = getDefaultProviderBaseUrl(providerId);
  const proxyBaseUrl = getProxyProviderBaseUrl(providerId);
  let trimmed = baseUrl?.trim();
  // A saved "/proxy/*" value is a dev-only relative path. Never use it as-is:
  // in prod it's handed to a server-side fetch and throws "Invalid URL
  // string" (this is exactly what broke Krater). Treat it as unset so the
  // env/proxy default for the CURRENT environment applies instead.
  if (trimmed && /^\/proxy\//.test(trimmed)) trimmed = undefined;
  if (providerId === 'ollama' && envBaseUrl && (!trimmed || trimmed === '/proxy/ollama' || /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(trimmed))) {
    return envBaseUrl;
  }
  if (envBaseUrl && (!trimmed || /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(trimmed))) {
    return envBaseUrl;
  }
  if ((!trimmed || /^http:\/\//.test(trimmed) || /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(trimmed)) && proxyBaseUrl) {
    return proxyBaseUrl;
  }
  return trimmed || envBaseUrl || proxyBaseUrl;
}
