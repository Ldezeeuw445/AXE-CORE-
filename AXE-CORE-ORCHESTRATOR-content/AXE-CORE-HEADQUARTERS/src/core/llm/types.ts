/**
 * core/llm/types.ts
 *
 * Framework-free domain types for the LLM subsystem. Nothing in this file may
 * import from React, Zustand, Supabase, or any service — it is the innermost
 * layer of the architecture and everything else depends on it.
 */

/** Chat wire-format roles shared by every provider adapter. */
export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type ProviderId =
  | 'anthropic' | 'openai' | 'google' | 'xai' | 'groq' | 'openrouter' | 'krater'
  | 'ollama' | 'openhands' | 'openjarvis' | 'openclaw' | 'kilocode' | 'crewai' | 'hermes';

export interface ProviderCfg {
  id: ProviderId;
  name: string;
  baseUrl: string;
  defaultModel: string;
  format: 'openai' | 'anthropic' | 'google';
  needsKey?: boolean;
}

/** A resolved, ready-to-call provider credential + model selection. */
export interface KeySlot {
  provider: ProviderId;
  key: string;
  model?: string;
  baseUrl?: string;
}

/** Capability classes used by the routing policy to order provider slots. */
export type QueryCapability = 'fast' | 'code' | 'analysis' | 'reasoning' | 'privacy' | 'creative';

/** One routing decision — created per message, populated as slots are tried. */
export interface RoutingEvent {
  id: string;
  ts: number;
  query: string;
  capability: string;
  slotOrder: string[];
  attempts: { provider: string; model?: string; outcome: 'ok' | 'fail'; err?: string }[];
  winner?: string;
  winnerModel?: string;
  via: 'langgraph' | 'fallback' | 'crew' | 'none';
  /** How many consecutive messages were coalesced into this entry (≥1). */
  count?: number;
}
