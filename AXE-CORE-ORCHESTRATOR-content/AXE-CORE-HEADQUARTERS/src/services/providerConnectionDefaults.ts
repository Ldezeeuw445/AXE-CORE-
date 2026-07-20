/**
 * Compatibility shim — the base-URL configuration and normalization logic
 * moved to core/llm/baseUrls.ts (it previously formed a circular dependency
 * with the voice store). Import from '@/core/llm/baseUrls' in new code.
 */
export {
  getDefaultProviderBaseUrl,
  getProxyProviderBaseUrl,
  normalizeProviderBaseUrl,
} from '@/core/llm/baseUrls';
