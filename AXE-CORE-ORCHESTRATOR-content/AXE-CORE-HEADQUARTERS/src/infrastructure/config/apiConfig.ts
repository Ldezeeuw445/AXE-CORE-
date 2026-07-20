/**
 * API Configuration for AXE CORE
 * Automatically detects environment and sets correct base URLs
 */

const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;
};

const isDev = () => {
  return import.meta.env.DEV || import.meta.env.MODE === 'development';
};

// VPS backend URLs for production
const VPS_BASE = 'https://api.axecompanion.com';
const VPS_PROXY_HTTP = 'http://89.167.78.6';

/**
 * Get the correct API base URL based on environment
 */
export function getApiBaseUrl(): string {
  if (isTauri()) {
    // In Tauri app, use direct VPS URL
    return VPS_BASE;
  }
  if (isDev()) {
    // In development, use Vite proxy
    return '';
  }
  // In production web (Vercel), use relative or VPS URL
  return VPS_BASE;
}

/**
 * Get proxy URL for a specific service
 */
export function getProxyUrl(service: string): string {
  const proxies: Record<string, string> = {
    anthropic: 'https://api.anthropic.com',
    openai: 'https://api.openai.com',
    google: 'https://generativelanguage.googleapis.com',
    xai: 'https://api.x.ai',
    groq: 'https://api.groq.com',
    openrouter: 'https://openrouter.ai',
    krater: 'https://api.krater.ai',
    ollama: 'https://ollama.axecompanion.com',
    n8n: 'http://89.167.78.6:5678',
    openhands: 'http://89.167.78.6:3001',
    openjarvis: 'http://89.167.78.6:2025',
    openclaw: 'http://89.167.78.6:5001',
    kilocode: 'http://89.167.78.6:5002',
    crewai: 'http://89.167.78.6:5003',
    hermes: 'http://89.167.78.6:3010',
    axecore: 'https://api.axecompanion.com',
  };

  if (isTauri()) {
    return proxies[service] || '';
  }

  // In web, use Vite proxy paths
  return `/proxy/${service}`;
}

export { isTauri, isDev, VPS_BASE, VPS_PROXY_HTTP };
