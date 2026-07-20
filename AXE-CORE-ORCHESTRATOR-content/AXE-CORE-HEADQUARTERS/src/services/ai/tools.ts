// AXE Browser Tool Calling System
// These tools give the AI complete control over the browser

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  required?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  required_params: string[];
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// Tool definitions for the AI
export const BROWSER_TOOLS: ToolDefinition[] = [
  {
    name: 'navigate',
    description: 'Navigate the browser to a specific URL. Use this when the user wants to visit a website.',
    parameters: {
      url: { type: 'string', description: 'The full URL to navigate to (e.g., https://github.com)' },
      title: { type: 'string', description: 'Optional page title to display' },
    },
    required_params: ['url'],
  },
  {
    name: 'search',
    description: 'Perform a Google search. Use this when the user asks to find, search, or look up something.',
    parameters: {
      query: { type: 'string', description: 'The search query (e.g., "React hooks tutorial")' },
    },
    required_params: ['query'],
  },
  {
    name: 'go_back',
    description: 'Go back to the previous page in browser history.',
    parameters: {},
    required_params: [],
  },
  {
    name: 'go_forward',
    description: 'Go forward to the next page in browser history.',
    parameters: {},
    required_params: [],
  },
  {
    name: 'refresh',
    description: 'Refresh/reload the current page.',
    parameters: {},
    required_params: [],
  },
  {
    name: 'scroll',
    description: 'Scroll the page up or down.',
    parameters: {
      direction: { type: 'string', description: 'Direction to scroll', enum: ['up', 'down', 'top', 'bottom'] },
      amount: { type: 'string', description: 'How much to scroll (e.g., "full", "half", or pixels like "300")' },
    },
    required_params: ['direction'],
  },
  {
    name: 'bookmark',
    description: 'Add the current page to bookmarks.',
    parameters: {
      title: { type: 'string', description: 'Custom title for the bookmark (optional, defaults to page title)' },
      folder: { type: 'string', description: 'Folder to save bookmark in (e.g., "Dev", "AI Tools", "Work")' },
    },
    required_params: [],
  },
  {
    name: 'open_bookmark',
    description: 'Open a bookmarked page by name or URL.',
    parameters: {
      name: { type: 'string', description: 'Name or partial name of the bookmark to open' },
    },
    required_params: ['name'],
  },
  {
    name: 'history_search',
    description: 'Search through browser history to find previously visited pages.',
    parameters: {
      query: { type: 'string', description: 'Search term to find in history' },
    },
    required_params: ['query'],
  },
  {
    name: 'summarize_page',
    description: 'Read and summarize the content of the current page. Returns a bullet-point summary.',
    parameters: {
      focus: { type: 'string', description: 'Optional specific topic to focus on in the summary' },
    },
    required_params: [],
  },
  {
    name: 'explain_selection',
    description: 'Explain a specific word, concept, or section from the current page.',
    parameters: {
      topic: { type: 'string', description: 'The topic, word, or concept to explain' },
      level: { type: 'string', description: 'Explanation level', enum: ['simple', 'technical', 'detailed'] },
    },
    required_params: ['topic'],
  },
  {
    name: 'open_quick_link',
    description: 'Open one of the preset quick links by name. Available: Google, GitHub, Vercel, Supabase, Cloudflare, Railway, ChatGPT, Perplexity, Claude, Google AI, Kimi, OpenAI, Krater.',
    parameters: {
      name: { type: 'string', description: 'Name of the quick link service to open' },
    },
    required_params: ['name'],
  },
  {
    name: 'new_tab',
    description: 'Open a new browser tab with an optional URL.',
    parameters: {
      url: { type: 'string', description: 'Optional URL to open in the new tab' },
    },
    required_params: [],
  },
  {
    name: 'close_tab',
    description: 'Close a specific tab by index or title.',
    parameters: {
      index: { type: 'string', description: 'Tab index (0-based) or "current" or "all"' },
    },
    required_params: ['index'],
  },
  {
    name: 'switch_tab',
    description: 'Switch to a different tab by index or title.',
    parameters: {
      index: { type: 'string', description: 'Tab index (0-based) or partial title match' },
    },
    required_params: ['index'],
  },
  {
    name: 'list_tabs',
    description: 'Get a list of all open tabs.',
    parameters: {},
    required_params: [],
  },
];

// Generate OpenAI-compatible tool schema
export function getOpenAITools() {
  return BROWSER_TOOLS.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([key, val]) => [
            key,
            {
              type: val.type,
              description: val.description,
              ...(val.enum ? { enum: val.enum } : {}),
            },
          ])
        ),
        required: tool.required_params,
      },
    },
  }));
}

// Parse tool calls from different provider formats
export function parseToolCalls(responseData: unknown): ToolCall[] {
  const calls: ToolCall[] = [];
  const data = responseData as Record<string, unknown>;

  // OpenAI / Groq / DeepSeek format
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  if (choices && choices[0]) {
    const message = choices[0].message as Record<string, unknown> | undefined;
    if (message) {
      // Native tool_calls
      const toolCalls = message.tool_calls as Array<Record<string, unknown>> | undefined;
      if (toolCalls) {
        for (const tc of toolCalls) {
          const fn = tc.function as Record<string, unknown> | undefined;
          if (fn) {
            try {
              const args = typeof fn.arguments === 'string'
                ? JSON.parse(fn.arguments)
                : fn.arguments;
              calls.push({ name: String(fn.name), arguments: args as Record<string, unknown> });
            } catch { /* ignore parse error */ }
          }
        }
      }

      // Check for content-based tool calls (some Ollama models)
      const content = message.content as string | undefined;
      if (content && calls.length === 0) {
        // Parse [[TOOL: name({...})]] format
        const toolRegex = /\[\[TOOL:\s*(\w+)\((.*?)\)\]\]/gs;
        let match;
        while ((match = toolRegex.exec(content)) !== null) {
          try {
            const args = JSON.parse(`{${match[2]}}`);
            calls.push({ name: match[1], arguments: args });
          } catch { /* ignore */ }
        }
      }
    }
  }

  return calls;
}

// Extract message content from response
export function extractMessageContent(responseData: unknown): string {
  const data = responseData as Record<string, unknown>;
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  if (choices && choices[0]) {
    const message = choices[0].message as Record<string, unknown> | undefined;
    if (message) {
      const content = message.content as string | null | undefined;
      // Remove tool call markers from content
      if (content) {
        return content.replace(/\[\[TOOL:.*?\]\]/gs, '').trim();
      }
    }
  }
  // Anthropic format
  const content = data.content as Array<Record<string, unknown>> | undefined;
  if (content && content[0]) {
    const text = content[0].text as string | undefined;
    if (text) return text;
  }
  return '';
}

// Execute a tool call and return result
export function executeToolCall(
  call: ToolCall,
  callbacks: {
    navigate: (url: string, title?: string) => void;
    search: (query: string) => void;
    goBack: () => void;
    goForward: () => void;
    refresh: () => void;
    bookmark: (title?: string, folder?: string) => void;
    openBookmark: (name: string) => void;
    historySearch: (query: string) => string[];
    summarizePage: (focus?: string) => void;
    explainSelection: (topic: string, level?: string) => void;
    openQuickLink: (name: string) => void;
    newTab: (url?: string) => void;
    closeTab: (index: string) => void;
    switchTab: (index: string) => void;
    listTabs: () => string[];
  }
): ToolResult {
  const args = call.arguments || {};

  switch (call.name) {
    case 'navigate': {
      const url = String(args.url || '');
      if (!url) return { tool: 'navigate', success: false, message: 'No URL provided' };
      callbacks.navigate(url, String(args.title || url));
      return { tool: 'navigate', success: true, message: `Navigating to ${url}`, data: { url } };
    }

    case 'search': {
      const query = String(args.query || '');
      if (!query) return { tool: 'search', success: false, message: 'No search query provided' };
      callbacks.search(query);
      return { tool: 'search', success: true, message: `Searching Google for: ${query}`, data: { query } };
    }

    case 'go_back':
      callbacks.goBack();
      return { tool: 'go_back', success: true, message: 'Going back' };

    case 'go_forward':
      callbacks.goForward();
      return { tool: 'go_forward', success: true, message: 'Going forward' };

    case 'refresh':
      callbacks.refresh();
      return { tool: 'refresh', success: true, message: 'Refreshing page' };

    case 'bookmark': {
      callbacks.bookmark(String(args.title || ''), String(args.folder || 'Default'));
      return { tool: 'bookmark', success: true, message: 'Page bookmarked', data: { folder: args.folder || 'Default' } };
    }

    case 'open_bookmark': {
      const name = String(args.name || '');
      callbacks.openBookmark(name);
      return { tool: 'open_bookmark', success: true, message: `Opening bookmark: ${name}`, data: { name } };
    }

    case 'history_search': {
      const hQuery = String(args.query || '');
      const results = callbacks.historySearch(hQuery);
      return { tool: 'history_search', success: true, message: `Found ${results.length} results`, data: { results } };
    }

    case 'summarize_page': {
      callbacks.summarizePage(String(args.focus || ''));
      return { tool: 'summarize_page', success: true, message: 'Summarizing current page' };
    }

    case 'explain_selection': {
      const topic = String(args.topic || '');
      const level = String(args.level || 'simple');
      callbacks.explainSelection(topic, level);
      return { tool: 'explain_selection', success: true, message: `Explaining: ${topic}` };
    }

    case 'open_quick_link': {
      const qlName = String(args.name || '');
      callbacks.openQuickLink(qlName);
      return { tool: 'open_quick_link', success: true, message: `Opening ${qlName}`, data: { name: qlName } };
    }

    case 'new_tab': {
      const tabUrl = String(args.url || '');
      callbacks.newTab(tabUrl || undefined);
      return { tool: 'new_tab', success: true, message: tabUrl ? `Opening new tab with ${tabUrl}` : 'Opening new tab' };
    }

    case 'close_tab': {
      const idx = String(args.index || 'current');
      callbacks.closeTab(idx);
      return { tool: 'close_tab', success: true, message: `Closing tab ${idx}` };
    }

    case 'switch_tab': {
      const sIdx = String(args.index || '0');
      callbacks.switchTab(sIdx);
      return { tool: 'switch_tab', success: true, message: `Switching to tab ${sIdx}` };
    }

    case 'list_tabs': {
      const tabs = callbacks.listTabs();
      return { tool: 'list_tabs', success: true, message: `Open tabs: ${tabs.join(', ')}`, data: { tabs } };
    }

    default:
      return { tool: call.name, success: false, message: `Unknown tool: ${call.name}` };
  }
}
