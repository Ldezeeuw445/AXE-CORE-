/** The three AI engines available on the AXE Browser start page. */
export type BrowserAIProviderId = 'deepseek' | 'browser-use' | 'camofox';

export interface BrowserAIProviderConfig {
  id: BrowserAIProviderId;
  name: string;
  tagline: string;
  placeholder: string;
  accent: string;
  accentMuted: string;
  /** Optional mode chips shown inside the composer (DeepSeek-style). */
  modes?: Array<{ id: string; label: string; icon?: string }>;
}

export const BROWSER_AI_PROVIDERS: Record<BrowserAIProviderId, BrowserAIProviderConfig> = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    tagline: 'Hi, I\'m DeepSeek. How can I help you today?',
    placeholder: 'Message DeepSeek',
    accent: '#4D6BFE',
    accentMuted: 'rgba(77, 107, 254, 0.15)',
    modes: [
      { id: 'deepthink', label: 'DeepThink (R1)', icon: 'grid' },
      { id: 'search', label: 'Search', icon: 'globe' },
    ],
  },
  'browser-use': {
    id: 'browser-use',
    name: 'Browser Use',
    tagline: 'The AI browser agent — navigates, clicks, types and fills forms for you.',
    placeholder: 'Describe a task for the browser agent…',
    accent: '#C8F542',
    accentMuted: 'rgba(200, 245, 66, 0.12)',
    modes: [
      { id: 'automate', label: 'Automate', icon: 'mouse' },
      { id: 'scrape', label: 'Scrape', icon: 'database' },
    ],
  },
  camofox: {
    id: 'camofox',
    name: 'Camofox',
    tagline: 'Anti-detection browser for AI agents — scrape, research, automate.',
    placeholder: 'Give Camofox a stealth browsing task…',
    accent: '#E85D3B',
    accentMuted: 'rgba(232, 93, 59, 0.12)',
    modes: [
      { id: 'stealth', label: 'Stealth', icon: 'shield' },
      { id: 'research', label: 'Research', icon: 'search' },
    ],
  },
};

export const BROWSER_AI_PROVIDER_LIST = Object.values(BROWSER_AI_PROVIDERS);
