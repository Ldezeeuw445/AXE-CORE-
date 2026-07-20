/**
 * agenticEngine.ts
 *
 * AXE CORE Agentic Engine
 * -----------------------
 * A real agentic loop where the LLM decides to use tools (read files, write code,
 * push to GitHub, search web) rather than giving hardcoded responses.
 *
 * The loop:
 *   1. Send user prompt + available tools to LLM
 *   2. Parse response for tool calls (JSON function calling format)
 *   3. Execute tool calls
 *   4. Send tool results back to LLM
 *   5. Repeat until LLM returns a final answer (no more tool calls)
 *   6. Log EVERY step to Supabase `agentic_logs` table
 *
 * Max 10 iterations, timeout after 2 minutes.
 */

import { callProvider } from '@/infrastructure/gateways/llmGateway';
import type { KeySlot } from '@/domain/providers';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { readFile, writeFile, listSourceFiles, findFile, getPrimaryRepo, type GHFile } from '@/infrastructure/gateways/githubCodeService';
import { executeCodeEdit, type CodeEditRequest } from '@/application/agents/codeEditorAgent';
import { clawSearch, browserFetch, browserSearch } from '@/infrastructure/gateways/kimiClawService';
import { isAxeApiConfigured, ghUpdateFile, ghGetFile, ghGetTree } from '@/infrastructure/gateways/axeCoreApiService';
import type { RepoConfig } from '@/infrastructure/persistence/repoConfigService';

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface AgentStep {
  stepNumber: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  latencyMs?: number;
  model?: string;
  provider?: string;
}

export interface AgentRunResult {
  success: boolean;
  finalAnswer: string;
  latencyMs: number;
  error?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOL REGISTRY
// ══════════════════════════════════════════════════════════════════════════════

const TOOL_DEFINITIONS: Omit<Tool, 'execute'>[] = [
  {
    name: 'read_file',
    description: 'Read a file from a GitHub repository. Returns the file content and metadata.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path within the repo (e.g., src/pages/Home.tsx)' },
        repoHint: { type: 'string', description: 'Optional repo hint: "axe-core", "companion", or "trading-os"' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write/update a file in a GitHub repository. Uses the primary configured repo.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path within the repo' },
        content: { type: 'string', description: 'Complete new file content' },
        message: { type: 'string', description: 'Git commit message' },
      },
      required: ['path', 'content', 'message'],
    },
  },
  {
    name: 'list_files',
    description: 'List source files in a repository directory. Returns all .ts/.tsx/.js/.jsx/.css files.',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory path (optional, defaults to src/)' },
        repoHint: { type: 'string', description: 'Optional repo hint' },
      },
      required: [],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for information. Returns search results with titles, URLs, and snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        numResults: { type: 'number', description: 'Number of results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'browser_fetch',
    description: 'Fetch and extract content from a specific URL. Returns the page title, text content, and links.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
      },
      required: ['url'],
    },
  },
  {
    name: 'exec_command',
    description: 'Execute a terminal command via the VPS terminal endpoint. Returns command output.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'github_push',
    description: 'Commit and push changes to a GitHub repository. Returns commit status.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path that was modified' },
        content: { type: 'string', description: 'New file content' },
        message: { type: 'string', description: 'Commit message' },
        branch: { type: 'string', description: 'Branch name (default: orchestrator)' },
      },
      required: ['path', 'content', 'message'],
    },
  },
  {
    name: 'analyze_code',
    description: 'Send code to the LLM for analysis (review, debug, explain). Returns analysis result.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code snippet to analyze' },
        language: { type: 'string', description: 'Programming language (e.g., typescript, python)' },
        task: { type: 'string', description: 'What to do: review, debug, explain, refactor' },
      },
      required: ['code', 'task'],
    },
  },
  {
    name: 'edit_code',
    description: 'Use the code editor agent to make a targeted code edit. Returns diff and commit info.',
    parameters: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Natural language instruction for the edit' },
        filePath: { type: 'string', description: 'Optional specific file path' },
        repoHint: { type: 'string', description: 'Optional repo hint' },
      },
      required: ['instruction'],
    },
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// TOOL IMPLEMENTATIONS
// ══════════════════════════════════════════════════════════════════════════════

async function toolReadFile(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const path = String(args.path || '');
    const repoHint = args.repoHint ? String(args.repoHint) : undefined;
    const file = await readFile(path);
    return {
      success: true,
      output: `File: ${file.path}\nSHA: ${file.sha}\nRepo: ${file.repo.label}\n\nContent:\n${file.content.slice(0, 8000)}${file.content.length > 8000 ? '\n\n... (truncated)' : ''}`,
    };
  } catch (err) {
    return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

async function toolWriteFile(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const path = String(args.path || '');
    const content = String(args.content || '');
    const message = String(args.message || 'AXE CORE agentic edit');
    const file = await readFile(path);
    await writeFile(path, content, file.sha, message, file.repo);
    return { success: true, output: `Successfully updated ${path} and committed: "${message}"` };
  } catch (err) {
    return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

async function toolListFiles(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const files = await listSourceFiles();
    const dir = args.directory ? String(args.directory) : '';
    const filtered = dir ? files.filter(f => f.startsWith(dir)) : files;
    return { success: true, output: `Found ${filtered.length} files:\n${filtered.slice(0, 50).join('\n')}${filtered.length > 50 ? '\n... and more' : ''}` };
  } catch (err) {
    return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

async function toolWebSearch(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const query = String(args.query || '');
    const numResults = typeof args.numResults === 'number' ? args.numResults : 5;
    const results = await clawSearch(query, numResults);
    const output = results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join('\n\n');
    return { success: true, output: output || 'No results found.' };
  } catch (err) {
    return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

async function toolBrowserFetch(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const url = String(args.url || '');
    const result = await browserFetch(url);
    return {
      success: true,
      output: `Title: ${result.title}\nURL: ${result.url}\n\nText:\n${result.text.slice(0, 6000)}${result.text.length > 6000 ? '\n\n... (truncated)' : ''}\n\nLinks: ${result.links.length}`,
    };
  } catch (err) {
    return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

async function toolExecCommand(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const command = String(args.command || '');
    const cwd = args.cwd ? String(args.cwd) : '/';
    const BASE_URL = (
      import.meta.env.DEV
        ? '/proxy/axecore'
        : (import.meta.env.VITE_AXE_CORE_API_URL ?? '')
    ).replace(/\/$/, '');
    const API_KEY = import.meta.env.VITE_AXE_CORE_API_KEY ?? '';

    if (!BASE_URL || !API_KEY) {
      return { success: false, output: '', error: 'AXE Core API not configured for terminal access.' };
    }

    const res = await fetch(`${BASE_URL}/terminal/exec`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command, cwd }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      return { success: false, output: '', error: `Terminal exec failed: ${err.detail ?? res.statusText}` };
    }

    const data = await res.json();
    return {
      success: true,
      output: `Exit code: ${data.exit_code ?? '?'}
STDOUT:\n${data.stdout || '(empty)'}
STDERR:\n${data.stderr || '(empty)'}`,
    };
  } catch (err) {
    return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

async function toolGitHubPush(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const path = String(args.path || '');
    const content = String(args.content || '');
    const message = String(args.message || 'AXE CORE agentic commit');
    const branch = String(args.branch || 'orchestrator');

    if (!isAxeApiConfigured) {
      // Fallback: try direct GitHub API via githubCodeService
      const file = await readFile(path);
      await writeFile(path, content, file.sha, message, file.repo);
      return { success: true, output: `Committed ${path} to ${file.repo.branch}: "${message}"` };
    }

    const repo = getPrimaryRepo();
    if (!repo) return { success: false, output: '', error: 'No primary repo configured.' };

    const fullRepo = `${repo.owner}/${repo.repo}`;
    const result = await ghUpdateFile(fullRepo, path, content, message, branch);
    return {
      success: true,
      output: `Committed ${path} to ${fullRepo}:${branch}. New SHA: ${result.sha}`,
    };
  } catch (err) {
    return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

async function toolAnalyzeCode(args: Record<string, unknown>, slot: KeySlot): Promise<ToolResult> {
  try {
    const code = String(args.code || '');
    const language = String(args.language || 'typescript');
    const task = String(args.task || 'review');

    const messages = [
      { role: 'system' as const, content: `You are a code analysis expert. ${task.toUpperCase()} the following ${language} code. Be specific, identify issues, and suggest improvements.` },
      { role: 'user' as const, content: `\`\`\`${language}\n${code}\n\`\`\`\n\nTask: ${task}` },
    ];

    const analysis = await callProvider(slot, messages);
    return { success: true, output: analysis };
  } catch (err) {
    return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

async function toolEditCode(args: Record<string, unknown>, slot: KeySlot): Promise<ToolResult> {
  try {
    const instruction = String(args.instruction || '');
    const filePath = args.filePath ? String(args.filePath) : undefined;
    const repoHint = args.repoHint ? String(args.repoHint) : undefined;

    const result = await executeCodeEdit({ instruction, filePath, repoHint }, slot);
    if (result.success) {
      return {
        success: true,
        output: `Edited ${result.filePath} in ${result.repo}\nCommit: ${result.commitMessage}\n\nDiff preview:\n${result.diff?.slice(0, 2000) || '(no diff)'}`,
      };
    }
    return { success: false, output: '', error: result.error || 'Code edit failed.' };
  } catch (err) {
    return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

// Build the full tool registry
function buildTools(slot: KeySlot): Tool[] {
  return [
    { ...TOOL_DEFINITIONS[0], execute: toolReadFile },
    { ...TOOL_DEFINITIONS[1], execute: toolWriteFile },
    { ...TOOL_DEFINITIONS[2], execute: toolListFiles },
    { ...TOOL_DEFINITIONS[3], execute: toolWebSearch },
    { ...TOOL_DEFINITIONS[4], execute: toolBrowserFetch },
    { ...TOOL_DEFINITIONS[5], execute: toolExecCommand },
    { ...TOOL_DEFINITIONS[6], execute: toolGitHubPush },
    { ...TOOL_DEFINITIONS[7], execute: (args) => toolAnalyzeCode(args, slot) },
    { ...TOOL_DEFINITIONS[8], execute: (args) => toolEditCode(args, slot) },
  ];
}

// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT BUILDER
// ══════════════════════════════════════════════════════════════════════════════

function buildToolsPrompt(tools: Tool[]): string {
  const toolDescriptions = tools.map(t => {
    const params = JSON.stringify(t.parameters, null, 2);
    return `<tool name="${t.name}">
${t.description}
Parameters:
${params}
</tool>`;
  }).join('\n\n');

  return `You are AXE CORE — an autonomous agentic engine with access to tools.

## AVAILABLE TOOLS
${toolDescriptions}

## RULES
1. ALWAYS respond in this exact JSON format:
   - If you want to call a tool:
     {"tool_call": {"name": "tool_name", "arguments": {"arg1": "value1"}}}
   - If you have the final answer (no more tools needed):
     {"final_answer": "Your response here"}

2. You may call ONE tool at a time. Wait for the result before calling another.
3. Think step by step. Plan your approach before acting.
4. If a tool fails, try an alternative or explain the issue to the user.
5. Be concise but thorough in your final answer.
6. When editing code, always use the edit_code tool for complex changes and write_file for simple replacements.
7. NEVER make up tool results — only use what the tool returns.

## RESPONSE FORMAT
Respond ONLY with valid JSON. No markdown, no explanations outside the JSON.`;
}

// ══════════════════════════════════════════════════════════════════════════════
// RESPONSE PARSER
// ══════════════════════════════════════════════════════════════════════════════

interface ParsedResponse {
  type: 'tool_call' | 'final_answer' | 'unknown';
  toolCall?: { name: string; arguments: Record<string, unknown> };
  finalAnswer?: string;
}

function parseAgentResponse(text: string): ParsedResponse {
  const cleaned = text.trim();

  // Try to extract JSON from markdown code blocks
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = jsonMatch ? jsonMatch[1].trim() : cleaned;

  try {
    const parsed = JSON.parse(jsonText);

    if (parsed.tool_call && typeof parsed.tool_call === 'object') {
      return {
        type: 'tool_call',
        toolCall: {
          name: String(parsed.tool_call.name || ''),
          arguments: parsed.tool_call.arguments || {},
        },
      };
    }

    if (parsed.final_answer !== undefined) {
      return {
        type: 'final_answer',
        finalAnswer: String(parsed.final_answer),
      };
    }
  } catch {
    // Not valid JSON — might be a plain text final answer
  }

  // If it doesn't look like a tool call, treat as final answer
  if (!cleaned.includes('tool_call')) {
    return { type: 'final_answer', finalAnswer: cleaned };
  }

  return { type: 'unknown' };
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════════════════════════════════

async function logAgentStep(step: {
  conversationId: string;
  userId?: string;
  agent: string;
  model?: string;
  provider?: string;
  stepNumber: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  try {
    await sb.from('agentic_logs').insert({
      conversation_id: step.conversationId,
      user_id: step.userId ?? null,
      agent: step.agent,
      model: step.model ?? null,
      provider: step.provider ?? null,
      step_number: step.stepNumber,
      role: step.role,
      content: step.content ?? null,
      tool_name: step.toolName ?? null,
      tool_input: step.toolInput ?? null,
      tool_output: step.toolOutput ?? null,
      status: step.status,
      latency_ms: step.latencyMs ?? null,
      metadata: step.metadata ?? null,
    });
  } catch (err) {
    console.error('[agenticEngine] logAgentStep failed:', err);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN AGENT LOOP
// ══════════════════════════════════════════════════════════════════════════════

const MAX_ITERATIONS = 10;
const TIMEOUT_MS = 120_000; // 2 minutes

export async function runAgent(
  userPrompt: string,
  conversationId: string,
  providerSlot: KeySlot,
  opts: {
    userId?: string;
    agentName?: string;
  } = {}
): Promise<AgentRunResult> {
  const startTime = Date.now();
  const agentName = opts.agentName || 'axe-core-agent';
  const userId = opts.userId || 'luka';

  let stepNumber = 0;

  // Log user prompt (step 0) — behind the scenes, goes to AI Core only
  await logAgentStep({
    conversationId,
    userId,
    agent: agentName,
    model: providerSlot.model,
    provider: providerSlot.provider,
    stepNumber: 0,
    role: 'user',
    content: userPrompt,
    status: 'success',
  });

  // Build tool registry
  const tools = buildTools(providerSlot);
  const toolsPrompt = buildToolsPrompt(tools);

  // Internal messages for the LLM (NOT exposed to chat UI)
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: toolsPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      // Check timeout
      if (Date.now() - startTime > TIMEOUT_MS) {
        await logAgentStep({
          conversationId,
          userId,
          agent: agentName,
          stepNumber: ++stepNumber,
          role: 'system',
          content: 'Agent loop timed out after 2 minutes.',
          status: 'error',
          latencyMs: Date.now() - startTime,
        });
        return {
          success: false,
          finalAnswer: 'The agent ran out of time. Try a more specific request or check the AI Core logs.',
          latencyMs: Date.now() - startTime,
          error: 'Timeout: Agent loop exceeded 2 minutes',
        };
      }

      // Call LLM
      const llmStart = Date.now();
      const llmStepNumber = ++stepNumber;

      await logAgentStep({
        conversationId,
        userId,
        agent: agentName,
        model: providerSlot.model,
        provider: providerSlot.provider,
        stepNumber: llmStepNumber,
        role: 'assistant',
        content: 'Thinking...',
        status: 'running',
      });

      let llmResponse: string;
      try {
        llmResponse = await callProvider(providerSlot, messages);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const llmLatency = Date.now() - llmStart;
        await logAgentStep({
          conversationId,
          userId,
          agent: agentName,
          model: providerSlot.model,
          provider: providerSlot.provider,
          stepNumber: llmStepNumber,
          role: 'assistant',
          content: `LLM call failed: ${errMsg}`,
          status: 'error',
          latencyMs: llmLatency,
        });
        return {
          success: false,
          finalAnswer: `LLM error: ${errMsg}`,
          latencyMs: llmLatency,
          error: errMsg,
        };
      }

      const llmLatency = Date.now() - llmStart;
      const parsed = parseAgentResponse(llmResponse);

      if (parsed.type === 'final_answer') {
        await logAgentStep({
          conversationId,
          userId,
          agent: agentName,
          model: providerSlot.model,
          provider: providerSlot.provider,
          stepNumber: llmStepNumber,
          role: 'assistant',
          content: parsed.finalAnswer || llmResponse,
          status: 'success',
          latencyMs: llmLatency,
        });
        return {
          success: true,
          finalAnswer: parsed.finalAnswer || llmResponse,
          latencyMs: Date.now() - startTime,
        };
      }

      if (parsed.type === 'tool_call' && parsed.toolCall) {
        const { name, arguments: args } = parsed.toolCall;
        const tool = tools.find(t => t.name === name);

        // Log LLM tool decision
        await logAgentStep({
          conversationId,
          userId,
          agent: agentName,
          model: providerSlot.model,
          provider: providerSlot.provider,
          stepNumber: llmStepNumber,
          role: 'assistant',
          content: `Decided to call tool: ${name}`,
          toolName: name,
          toolInput: args,
          status: 'success',
          latencyMs: llmLatency,
        });

        // Execute the tool
        const toolStart = Date.now();
        const toolStepNumber = ++stepNumber;

        await logAgentStep({
          conversationId,
          userId,
          agent: agentName,
          stepNumber: toolStepNumber,
          role: 'tool',
          toolName: name,
          toolInput: args,
          content: `Executing ${name}...`,
          status: 'running',
        });

        let toolResult: ToolResult;
        try {
          if (tool) {
            toolResult = await tool.execute(args || {});
          } else {
            toolResult = { success: false, output: '', error: `Tool "${name}" not found.` };
          }
        } catch (err) {
          toolResult = {
            success: false,
            output: '',
            error: err instanceof Error ? err.message : String(err),
          };
        }

        const toolLatency = Date.now() - toolStart;
        await logAgentStep({
          conversationId,
          userId,
          agent: agentName,
          stepNumber: toolStepNumber,
          role: 'tool',
          toolName: name,
          toolInput: args,
          toolOutput: { success: toolResult.success, output: toolResult.output, error: toolResult.error },
          content: toolResult.output || toolResult.error || '',
          status: toolResult.success ? 'success' : 'error',
          latencyMs: toolLatency,
        });

        // Add tool result to internal conversation for next LLM call
        messages.push({
          role: 'assistant',
          content: JSON.stringify({ tool_call: { name, arguments: args } }),
        });
        messages.push({
          role: 'user',
          content: `Tool result for ${name}:\n\n${toolResult.success ? toolResult.output : `ERROR: ${toolResult.error}`}\n\nNow continue with your plan or provide the final answer.`,
        });

        continue; // Next iteration
      }

      // Unknown response format
      await logAgentStep({
        conversationId,
        userId,
        agent: agentName,
        model: providerSlot.model,
        provider: providerSlot.provider,
        stepNumber: llmStepNumber,
        role: 'assistant',
        content: llmResponse,
        status: 'error',
        latencyMs: llmLatency,
      });

      // Try once more with a nudge
      messages.push({
        role: 'user',
        content: 'Your response was not in the expected JSON format. Please respond with either {"tool_call": {...}} or {"final_answer": "..."}.',
      });
    }

    // Max iterations reached
    await logAgentStep({
      conversationId,
      userId,
      agent: agentName,
      stepNumber: ++stepNumber,
      role: 'system',
      content: 'Maximum iterations (10) reached. Stopping agent loop.',
      status: 'error',
      latencyMs: Date.now() - startTime,
    });
    return {
      success: false,
      finalAnswer: 'The agent reached the maximum number of tool calls. Try simplifying your request.',
      latencyMs: Date.now() - startTime,
      error: 'Max iterations exceeded',
    };

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await logAgentStep({
      conversationId,
      userId,
      agent: agentName,
      stepNumber: ++stepNumber,
      role: 'system',
      content: `Fatal error in agent loop: ${errMsg}`,
      status: 'error',
      latencyMs: Date.now() - startTime,
    });
    return {
      success: false,
      finalAnswer: `Agent error: ${errMsg}`,
      latencyMs: Date.now() - startTime,
      error: errMsg,
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER: Quick agent check
// ══════════════════════════════════════════════════════════════════════════════

export async function isAgenticModeEnabled(): Promise<boolean> {
  try {
    return localStorage.getItem('axe_agentic_mode') === 'true';
  } catch {
    return false;
  }
}

export function setAgenticMode(enabled: boolean): void {
  try {
    localStorage.setItem('axe_agentic_mode', String(enabled));
  } catch {
    // ignore
  }
}
