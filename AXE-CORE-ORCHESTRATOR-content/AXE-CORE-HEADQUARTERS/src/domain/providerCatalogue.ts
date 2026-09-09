/**
 * Elke provider en sleutel die AXE kent -- de enige lijst.
 *
 * Hij stond in SettingsPage, en de uitschuifbalk rechts had daarnaast zijn
 * eigen lijstje van vijf. Twee plekken die hetzelfde horen te tonen, met een
 * andere inhoud: precies waar je niet meer op kunt vertrouwen wat je ziet.
 *
 * Het icoon staat hier als NAAM en niet als component: domain/ mag niets van
 * React weten. De presentatielaag zet die naam om in een icoon, en dat is ook
 * de enige plek die dat hoort te doen.
 */

export interface ProviderInvoer {
  id: string;
  name: string;
  icon: string;
  accent: string;
  placeholder: string;
  defaultModel: string;
  docsUrl: string;
  free: boolean;
  needsKey: boolean;
}

export const PROVIDER_KEY_CATALOGUE: ProviderInvoer[] = [
  { id: 'google',      name: 'Gemini',         icon: 'Sparkles', accent: '#3B82F6', placeholder: 'AIza... / AQ.Ab...',  defaultModel: 'gemini-3.5-flash',           docsUrl: 'https://aistudio.google.com/app/apikey',  free: true,  needsKey: true  },
  { id: 'anthropic',   name: 'Anthropic',      icon: 'Bot', accent: '#A78BFA', placeholder: 'sk-ant-api03-...',    defaultModel: 'claude-sonnet-5',            docsUrl: 'https://console.anthropic.com/keys',      free: false, needsKey: true  },
  { id: 'openai',      name: 'OpenAI',         icon: 'Zap', accent: '#10B981', placeholder: 'sk-proj-...',         defaultModel: 'gpt-4o-mini',                docsUrl: 'https://platform.openai.com/api-keys',    free: false, needsKey: true  },
  { id: 'groq',        name: 'Groq',           icon: 'Rocket', accent: '#EC4899', placeholder: 'gsk_...',             defaultModel: 'openai/gpt-oss-120b',        docsUrl: 'https://console.groq.com/keys',           free: true,  needsKey: true  },
  { id: 'openrouter',  name: 'OpenRouter',     icon: 'Router', accent: '#F59E0B', placeholder: 'sk-or-v1-...',        defaultModel: 'openrouter/free',            docsUrl: 'https://openrouter.ai/keys',              free: true,  needsKey: true  },
  { id: 'openrouter2', name: 'OpenRouter 2',   icon: 'Router', accent: '#F59E0B', placeholder: 'sk-or-v1-...',        defaultModel: 'openrouter/auto',            docsUrl: 'https://openrouter.ai/keys',              free: true,  needsKey: true  },
  { id: 'cerebras',    name: 'Cerebras',       icon: 'Zap', accent: '#F97316', placeholder: 'csk-...',             defaultModel: 'gpt-oss-120b',               docsUrl: 'https://cloud.cerebras.ai',               free: true,  needsKey: true  },
  { id: 'hermes',      name: 'Hermes 3 (VPS)', icon: 'Server', accent: '#10B981', placeholder: '(no key needed)',     defaultModel: 'hermes3:8b',                 docsUrl: 'https://ollama.ai',                       free: true,  needsKey: false },
  { id: 'ollama',      name: 'Ollama (VPS)',   icon: 'Server', accent: '#10B981', placeholder: '(geen key nodig)',    defaultModel: 'gemma4:latest',              docsUrl: 'https://ollama.ai',                       free: true,  needsKey: false },
  { id: 'openhands',   name: 'OpenHands (VPS)',icon: 'Hand', accent: '#F97316', placeholder: '(geen key nodig)',    defaultModel: 'claude-sonnet-4-5',          docsUrl: 'https://docs.openhands.dev',              free: true,  needsKey: false },
  { id: 'openclaw',    name: 'OpenClaw (VPS)', icon: 'Terminal', accent: '#F97316', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                docsUrl: '',                                        free: true,  needsKey: false },
  { id: 'crewai',      name: 'CrewAI (VPS)',   icon: 'Users', accent: '#F97316', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                docsUrl: '',                                        free: true,  needsKey: false },
  { id: 'exa',         name: 'Exa Search',     icon: 'Search', accent: '#6366F1', placeholder: 'exa-...',             defaultModel: '',                           docsUrl: 'https://docs.exa.ai',                     free: false, needsKey: true },
  { id: 'elevenlabs',  name: 'ElevenLabs',     icon: 'Mic', accent: '#8B5CF6', placeholder: 'sk_...',              defaultModel: '',                           docsUrl: 'https://elevenlabs.io/app/settings/api-keys', free: false, needsKey: true },
  { id: 'tavily',      name: 'Tavily Search',  icon: 'Globe', accent: '#22D3EE', placeholder: 'tvly-...',            defaultModel: '',                           docsUrl: 'https://app.tavily.com/home',             free: true,  needsKey: true },
  { id: 'axon',        name: 'AXON Memory',    icon: 'Brain', accent: '#14B8A6', placeholder: 'axon_live_...',       defaultModel: '',                           docsUrl: 'https://app.axon-memory.com',             free: true,  needsKey: true },
];
