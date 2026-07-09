import type { ProviderId } from '@/store/voiceStore';

const ENV_BASE_URLS: Partial<Record<ProviderId, string>> = {
  ollama: import.meta.env.VITE_OLLAMA_URL ?? '',
  openhands: import.meta.env.VITE_OPENHANDS_URL ?? '',
  openjarvis: import.meta.env.VITE_OPENJARVIS_URL ?? '',
  openclaw: import.meta.env.VITE_OPENCLAW_URL ?? '',
  kilocode: import.meta.env.VITE_KILOCODE_URL ?? '',
  crewai: import.meta.env.VITE_CREWAI_URL ?? '',
  hermes: import.meta.env.VITE_HERMES_URL ?? '',
  groq: import.meta.env.VITE_GROQ_URL ?? '',
};

const PROXY_BASE_URLS: Partial<Record<ProviderId, string>> = {
  ollama: '/proxy/ollama',
  openhands: '/proxy/openhands',
  openjarvis: '/proxy/openjarvis',
  openclaw: '/proxy/openclaw',
  kilocode: '/proxy/kilocode',
  crewai: '/proxy/crewai',
  hermes: '/proxy/hermes',
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
  const trimmed = baseUrl?.trim();
  if (envBaseUrl && (!trimmed || /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(trimmed))) {
    return envBaseUrl;
  }
  if ((!trimmed || /^http:\/\//.test(trimmed) || /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(trimmed)) && proxyBaseUrl) {
    return proxyBaseUrl;
  }
  return trimmed || envBaseUrl || proxyBaseUrl;
}
