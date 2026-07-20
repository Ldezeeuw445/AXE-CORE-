/** Legacy single-endpoint AI configuration shape (used by useAIConfig + aiAgent). */
export interface AIConfig {
  apiKey: string;
  apiEndpoint: string;
  model: string;
  isConfigured: boolean;
}
