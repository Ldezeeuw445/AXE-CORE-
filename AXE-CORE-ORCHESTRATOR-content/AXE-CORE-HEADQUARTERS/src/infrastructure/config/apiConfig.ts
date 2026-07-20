/**
 * API Configuration for AXE CORE
 * Automatically detects environment and sets correct base URLs.
 *
 * The list of known services lives in serviceEndpoints.ts (shared with
 * vite.config.ts) — this module only decides HOW to reach them per runtime:
 *  - Tauri desktop app → direct URL (no proxy available)
 *  - Web (dev or prod) → /proxy/<service> path handled by Vite/Vercel
 */
import { SERVICE_ENDPOINTS } from './serviceEndpoints';

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
  if (isTauri()) {
    return SERVICE_ENDPOINTS[service]?.target ?? '';
  }

  // In web, use Vite proxy paths
  return `/proxy/${service}`;
}

export { isTauri, isDev, VPS_BASE, VPS_PROXY_HTTP };
