import type { AIConfig } from '@/domain/types/aiConfig';
import type { AIMode } from '@/domain/types/browser';
import { getOpenAITools, parseToolCalls, extractMessageContent, executeToolCall } from '@/application/browser/tools';
import type { ToolCall, ToolResult } from '@/application/browser/tools';

// System prompt with tool awareness
function getSystemPrompt(mode: AIMode, currentUrl: string, context: {
  tabs: string[];
  bookmarks: Array<{ title: string; url: string; folder: string }>;
  history: Array<{ title: string; url: string }>;
}): string {
  const quickLinks = ['Google', 'GitHub', 'Vercel', 'Supabase', 'Cloudflare', 'Railway', 'ChatGPT', 'Perplexity', 'Claude', 'Google AI Studio', 'Kimi', 'OpenAI', 'Krater'];

  const basePrompt = `You are AXE AI, a powerful browser assistant integrated into AXE Browser. You have COMPLETE CONTROL over the browser through tools.

CURRENT STATE:
- Current page: ${currentUrl || 'New Tab'}
- Open tabs: ${context.tabs.join(', ') || 'None'}
- Available bookmarks: ${context.bookmarks.map(b => `${b.title} (${b.folder})`).join(', ') || 'None'}

AVAILABLE QUICK LINKS: ${quickLinks.join(', ')}

You have access to browser tools. When the user wants to browse, search, navigate, or perform any browser action, USE THE TOOLS - don't just tell them what to do. Be proactive and execute actions immediately.

Key behaviors:
1. If user says "go to X" or "open X" → use navigate or open_quick_link
2. If user says "search for X" → use search
3. If user says "bookmark this" → use bookmark
4. If user asks about the current page → use summarize_page or explain_selection
5. If user wants a new tab → use new_tab
6. If user mentions bookmarks → use open_bookmark

After using tools, briefly confirm what you did and offer to help further.`;

  switch (mode) {
    case 'summarize':
      return basePrompt + '\n\nMODE: Summarize. Use summarize_page tool to read and summarize the current page. Focus on key takeaways.';
    case 'explain':
      return basePrompt + '\n\nMODE: Explain. Use explain_selection to break down topics. Use simple analogies. Be educational.';
    default:
      return basePrompt + '\n\nMODE: General. Help with anything - browsing, searching, explaining, or just chatting.';
  }
}

// All supported providers
export interface ProviderPreset {
  name: string;
  endpoint: string;
  model: string;
  supportsTools: boolean;
  headers?: Record<string, string>;
  format: 'openai' | 'anthropic' | 'ollama';
  needsKey: boolean;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    supportsTools: true,
    format: 'openai',
    needsKey: true,
  },
  {
    name: 'Kimi (Moonshot)',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k',
    supportsTools: true,
    format: 'openai',
    needsKey: true,
  },
  {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    supportsTools: true,
    format: 'openai',
    needsKey: true,
  },
  {
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-haiku-20240307',
    supportsTools: true,
    format: 'anthropic',
    headers: { 'anthropic-version': '2023-06-01' },
    needsKey: true,
  },
  {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    supportsTools: true,
    format: 'openai',
    needsKey: true,
  },
  {
    name: 'xAI (Grok)',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-beta',
    supportsTools: true,
    format: 'openai',
    needsKey: true,
  },
  {
    name: 'Cohere',
    endpoint: 'https://api.cohere.ai/v1/chat',
    model: 'command-r',
    supportsTools: false,
    format: 'openai',
    needsKey: true,
  },
  {
    name: 'Together AI',
    endpoint: 'https://api.together.xyz/v1/chat/completions',
    model: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
    supportsTools: true,
    format: 'openai',
    needsKey: true,
  },
  {
    name: 'Fireworks',
    endpoint: 'https://api.fireworks.ai/inference/v1/chat/completions',
    model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    supportsTools: true,
    format: 'openai',
    needsKey: true,
  },
  {
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.1-8b-instruct',
    supportsTools: true,
    format: 'openai',
    headers: { 'HTTP-Referer': 'https://axe-core.app', 'X-Title': 'AXE CORE' },
    needsKey: true,
  },
  {
    name: 'Ollama',
    endpoint: 'http://localhost:11434/api/chat',
    model: 'phi4',
    supportsTools: true,
    format: 'ollama',
    needsKey: false,
  },
  {
    name: 'Custom',
    endpoint: '',
    model: '',
    supportsTools: true,
    format: 'openai',
    needsKey: true,
  },
];

export interface AgentResponse {
  message: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  isError?: boolean;
}

// Send message to AI with tool calling
export async function sendToAI(
  config: AIConfig,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  mode: AIMode,
  currentUrl: string,
  context: {
    tabs: string[];
    bookmarks: Array<{ title: string; url: string; folder: string }>;
    history: Array<{ title: string; url: string }>;
  },
  toolCallbacks: Parameters<typeof executeToolCall>[1]
): Promise<AgentResponse> {
  if (!config.isConfigured || !config.apiKey) {
    return {
      message: 'Please configure your AI API key first. Click the settings icon to add your key.',
      isError: true,
    };
  }

  const preset = PROVIDER_PRESETS.find(p => p.endpoint === config.apiEndpoint) || PROVIDER_PRESETS[0];
  const systemPrompt = getSystemPrompt(mode, currentUrl, context);

  try {
    let response: Response;

    if (preset.format === 'ollama') {
      // Ollama format
      const ollamaMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      ];

      response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(preset.headers || {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages: ollamaMessages,
          tools: getOpenAITools(),
          stream: false,
        }),
      });
    } else if (preset.format === 'anthropic') {
      // Anthropic format
      const anthropicMessages = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: anthropicMessages,
          tools: preset.supportsTools ? getOpenAITools() : undefined,
        }),
      });
    } else {
      // OpenAI-compatible format
      const apiMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ];

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        ...(preset.headers || {}),
      };

      response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: apiMessages,
          tools: preset.supportsTools ? getOpenAITools() : undefined,
          temperature: 0.7,
          max_tokens: 4096,
        }),
      });
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || error.message || `API error: ${response.status}`);
    }

    const data = await response.json();

    // Handle Ollama format (has message field)
    const normalizedData = data.message
      ? { choices: [{ message: data.message }] }
      : data;

    // Extract tool calls
    const toolCalls = preset.supportsTools ? parseToolCalls(normalizedData) : [];

    // Extract message content
    let messageContent = extractMessageContent(normalizedData);

    // Execute tool calls
    const toolResults: ToolResult[] = [];
    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        const result = executeToolCall(call, toolCallbacks);
        toolResults.push(result);
      }

      // If the model didn't provide text, summarize the actions
      if (!messageContent) {
        messageContent = toolResults.map(r => r.message).join('. ');
      }
    }

    return {
      message: messageContent || 'Done!',
      toolCalls,
      toolResults,
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Failed to connect to AI service.',
      isError: true,
    };
  }
}
