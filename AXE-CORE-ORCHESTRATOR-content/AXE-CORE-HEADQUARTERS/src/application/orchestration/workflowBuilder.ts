/**
 * workflowBuilder.ts
 * "CORE, build a workflow." — The killer feature.
 *
 * Flow:
 *   User says what they want
 *     → CORE generates n8n workflow JSON (via LLM)
 *     → Validate structure
 *     → Create in n8n via API
 *     → Activate
 *     → Save to automation_registry + trigger_registry
 *     → Test by running it once
 *     → Return result to user
 *
 * Usage:
 *   import { buildWorkflow } from '@/application/orchestration/workflowBuilder';
 *   const result = await buildWorkflow('Send a Slack message when GitHub gets a new star');
 */

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import {
  createWorkflow,
  setWorkflowActive,
  executeWorkflow,
  registerWorkflow,
  isN8nConfigured,
  syncWorkflowsToRegistry,
} from '@/infrastructure/gateways/n8nService';

// ── Types ─────────────────────────────────────────────────────────────────

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
}

export interface N8nWorkflowSpec {
  name: string;
  description: string;
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  tags?: string[];
  trigger_type?: 'webhook' | 'schedule' | 'manual' | 'event';
}

export interface BuildResult {
  success: boolean;
  workflowId?: string;
  workflowName?: string;
  registryId?: string;
  testResult?: unknown;
  error?: string;
  steps: string[];
}

// ── Node templates ────────────────────────────────────────────────────────
// These are pre-built node configs CORE can combine to build workflows.

export const NODE_TEMPLATES = {
  webhook: (path: string): N8nNode => ({
    id: 'webhook-trigger',
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [240, 300],
    parameters: { httpMethod: 'POST', path, responseMode: 'onReceived' },
  }),

  schedule: (cronExpression: string): N8nNode => ({
    id: 'schedule-trigger',
    name: 'Schedule',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1,
    position: [240, 300],
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: cronExpression }] } },
  }),

  httpRequest: (url: string, method = 'GET'): N8nNode => ({
    id: `http-${Date.now()}`,
    name: 'HTTP Request',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4,
    position: [460, 300],
    parameters: { method, url, options: {} },
  }),

  supabaseInsert: (table: string): N8nNode => ({
    id: `supabase-${Date.now()}`,
    name: `Save to ${table}`,
    type: 'n8n-nodes-base.supabase',
    typeVersion: 1,
    position: [680, 300],
    parameters: { operation: 'create', tableId: table },
  }),

  discordMessage: (): N8nNode => ({
    id: `discord-${Date.now()}`,
    name: 'Discord Message',
    type: 'n8n-nodes-base.discord',
    typeVersion: 2,
    position: [680, 300],
    parameters: { operation: 'sendMessage', text: '={{ $json.message }}' },
  }),

  emailSend: (): N8nNode => ({
    id: `email-${Date.now()}`,
    name: 'Send Email',
    type: 'n8n-nodes-base.emailSend',
    typeVersion: 2,
    position: [680, 300],
    parameters: {
      fromEmail: 'noreply@axecompanion.com',
      toEmail: '={{ $json.to }}',
      subject: '={{ $json.subject }}',
      text: '={{ $json.body }}',
    },
  }),

  codeNode: (code: string): N8nNode => ({
    id: `code-${Date.now()}`,
    name: 'Transform',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [460, 300],
    parameters: { mode: 'runOnceForAllItems', jsCode: code },
  }),

  githubTrigger: (): N8nNode => ({
    id: 'github-trigger',
    name: 'GitHub Trigger',
    type: 'n8n-nodes-base.githubTrigger',
    typeVersion: 1,
    position: [240, 300],
    parameters: { events: ['push'] },
  }),
} as const;

// ── Intent → Spec parser ──────────────────────────────────────────────────

/**
 * Parse a natural language intent into a workflow spec.
 * Uses the LLM from voiceStore to generate the spec.
 * Falls back to template matching if no LLM available.
 */
export async function intentToWorkflowSpec(intent: string): Promise<N8nWorkflowSpec | null> {
  // Try LLM generation first
  const llmSpec = await generateWithLLM(intent);
  if (llmSpec) return llmSpec;

  // Fallback: pattern matching on common intents
  return matchTemplate(intent);
}

async function generateWithLLM(intent: string): Promise<N8nWorkflowSpec | null> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY ?? '';
  if (!apiKey) return null;

  const systemPrompt = `You are an n8n workflow architect. 
Given a user intent, generate a valid n8n workflow JSON spec.
Return ONLY valid JSON with this exact structure:
{
  "name": "workflow name",
  "description": "what it does",
  "trigger_type": "webhook|schedule|manual|event",
  "tags": ["tag1", "tag2"],
  "nodes": [...n8n node objects...],
  "connections": {...n8n connections object...}
}

Rules:
- Every workflow needs exactly 1 trigger node
- Nodes must have: id, name, type, typeVersion, position [x,y], parameters
- connections maps node names to their outputs
- Use real n8n node types (n8n-nodes-base.*)`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Build a workflow for: ${intent}` },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
    const jsonStr = jsonMatch[1]?.trim() ?? text.trim();
    return JSON.parse(jsonStr) as N8nWorkflowSpec;
  } catch {
    return null;
  }
}

function matchTemplate(intent: string): N8nWorkflowSpec | null {
  const lower = intent.toLowerCase();

  // GitHub → Supabase sync
  if (lower.includes('github') && (lower.includes('supabase') || lower.includes('sync'))) {
    return {
      name: 'GitHub → Supabase Sync',
      description: 'Syncs GitHub events to Supabase',
      trigger_type: 'webhook',
      tags: ['github', 'supabase'],
      nodes: [
        NODE_TEMPLATES.webhook('github-events'),
        NODE_TEMPLATES.supabaseInsert('github_events'),
      ],
      connections: {
        Webhook: { main: [[{ node: 'Save to github_events', type: 'main', index: 0 }]] },
      },
    };
  }

  // Scheduled health check
  if (lower.includes('health') || lower.includes('monitor') || lower.includes('check')) {
    return {
      name: 'System Health Check',
      description: 'Periodically checks service health',
      trigger_type: 'schedule',
      tags: ['health', 'monitoring'],
      nodes: [
        NODE_TEMPLATES.schedule('0 */5 * * * *'), // every 5 min
        NODE_TEMPLATES.httpRequest('https://axe-core-rust.vercel.app/api/health'),
      ],
      connections: {
        Schedule: { main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]] },
      },
    };
  }

  return null;
}

// ── Validator ─────────────────────────────────────────────────────────────

export function validateWorkflowSpec(spec: N8nWorkflowSpec): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!spec.name?.trim()) errors.push('Workflow name is required');
  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) errors.push('At least one node required');

  const triggerTypes = [
    'n8n-nodes-base.webhook',
    'n8n-nodes-base.scheduleTrigger',
    'n8n-nodes-base.manualTrigger',
    'n8n-nodes-base.githubTrigger',
    '@n8n/n8n-nodes-langchain.chatTrigger',
  ];

  const hasTrigger = spec.nodes.some(n => triggerTypes.some(t => n.type.includes(t.split('.')[1])));
  if (!hasTrigger) errors.push('Workflow must have a trigger node');

  for (const node of spec.nodes) {
    if (!node.id) errors.push(`Node "${node.name}" missing id`);
    if (!node.type) errors.push(`Node "${node.name}" missing type`);
    if (!Array.isArray(node.position)) errors.push(`Node "${node.name}" missing position`);
  }

  return { valid: errors.length === 0, errors };
}

// ── Main: buildWorkflow ────────────────────────────────────────────────────

/**
 * CORE's killer feature: take a natural language intent, build and deploy a workflow.
 *
 * @param intent  Natural language description of what the workflow should do
 * @param autoActivate  Whether to activate immediately (default: true)
 * @param testRun  Whether to do a test execution (default: false for webhooks)
 */
export async function buildWorkflow(
  intent: string,
  autoActivate = true,
  testRun = false,
): Promise<BuildResult> {
  const steps: string[] = [];

  if (!isN8nConfigured()) {
    return {
      success: false,
      error: 'n8n is not configured. Add VITE_N8N_URL and VITE_N8N_API_KEY to your environment.',
      steps: ['n8n not configured'],
    };
  }

  // Step 1: Generate spec from intent
  steps.push('Analyzing intent...');
  const spec = await intentToWorkflowSpec(intent);
  if (!spec) {
    return {
      success: false,
      error: 'Could not generate workflow from that description. Try being more specific.',
      steps: [...steps, 'Failed to generate workflow spec'],
    };
  }
  steps.push(`Generated spec: "${spec.name}"`);

  // Step 2: Validate
  steps.push('Validating workflow structure...');
  const validation = validateWorkflowSpec(spec);
  if (!validation.valid) {
    return {
      success: false,
      error: `Validation failed: ${validation.errors.join(', ')}`,
      steps: [...steps, `Validation errors: ${validation.errors.join(', ')}`],
    };
  }
  steps.push('Validation passed');

  // Step 3: Create in n8n
  steps.push('Creating workflow in n8n...');
  const workflow = await createWorkflow(spec.name, spec.nodes, false);
  if (!workflow) {
    return {
      success: false,
      error: 'Failed to create workflow in n8n. Check n8n connection.',
      steps: [...steps, 'n8n create failed'],
    };
  }
  steps.push(`Created in n8n (id: ${workflow.id})`);

  // Step 4: Activate
  if (autoActivate) {
    steps.push('Activating workflow...');
    const activated = await setWorkflowActive(workflow.id, true);
    steps.push(activated ? 'Activated' : 'Activation failed (workflow saved but inactive)');
  }

  // Step 5: Save to registry
  steps.push('Registering in CORE registry...');
  const registryId = await registerWorkflow({
    name: spec.name,
    description: spec.description ?? intent,
    appName: 'axe_core',
    triggerType: spec.trigger_type ?? 'manual',
    tags: spec.tags ?? [],
  });
  steps.push(registryId ? `Saved to registry (${registryId})` : 'Registry save failed (non-critical)');

  // Save to audit trail
  const sb = getSupabase();
  if (sb) {
    void sb.from('audit_trail').insert({
      actor: 'agent:axe_core',
      action: 'workflow.build',
      resource_type: 'workflow',
      resource_id: workflow.id,
      details: { intent, spec_name: spec.name, auto_activate: autoActivate },
      success: true,
    });
  }

  // Step 6: Test run (only for manual-trigger workflows)
  let testResult: unknown = null;
  if (testRun && spec.trigger_type === 'manual') {
    steps.push('Running test execution...');
    testResult = await executeWorkflow(workflow.id, {}, 'build_test');
    steps.push(testResult ? 'Test execution succeeded' : 'Test execution failed');
  }

  // Step 7: Sync registry
  void syncWorkflowsToRegistry();

  return {
    success: true,
    workflowId: workflow.id,
    workflowName: workflow.name,
    registryId: registryId ?? undefined,
    testResult,
    steps,
  };
}

/**
 * Format a BuildResult as a human-readable response for CORE chat.
 */
export function formatBuildResult(result: BuildResult): string {
  if (!result.success) {
    return `I couldn't build that workflow.\n\nReason: ${result.error}\n\nSteps completed:\n${result.steps.map(s => `• ${s}`).join('\n')}`;
  }

  return [
    `Workflow built and deployed successfully.`,
    ``,
    `**${result.workflowName}** (n8n id: \`${result.workflowId}\`)`,
    ``,
    `Steps:`,
    ...result.steps.map(s => `• ${s}`),
    ``,
    result.testResult
      ? `Test execution: passed`
      : `Ready to run. Trigger it from n8n or via the API.`,
  ].join('\n');
}
