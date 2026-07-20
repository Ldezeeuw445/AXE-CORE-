import { useState, useCallback } from 'react';

export interface AIConfig {
  apiKey: string;
  apiEndpoint: string;
  model: string;
  isConfigured: boolean;
}

const DEFAULT_CONFIG: AIConfig = {
  apiKey: '',
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  isConfigured: false,
};

// Load from localStorage
function loadConfig(): AIConfig {
  try {
    const saved = localStorage.getItem('axe_ai_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...parsed, isConfigured: !!parsed.apiKey };
    }
  } catch { /* ignore */ }
  return DEFAULT_CONFIG;
}

export function useAIConfig() {
  const [config, setConfig] = useState<AIConfig>(loadConfig);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const updateConfig = useCallback((updates: Partial<AIConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...updates, isConfigured: !!(updates.apiKey ?? prev.apiKey) };
      localStorage.setItem('axe_ai_config', JSON.stringify(next));
      return next;
    });
  }, []);

  const clearConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    localStorage.removeItem('axe_ai_config');
  }, []);

  return {
    config,
    isSettingsOpen,
    setIsSettingsOpen,
    updateConfig,
    clearConfig,
  };
}
