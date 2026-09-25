import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AxeJob } from '@/domain/tierRouter/axeJobRegels';

/**
 * The realtime voice call itself needs a live WebRTC connection and real
 * audio hardware to test end to end — that stays a human pass. What IS
 * fully testable without either: the five tool handlers (they must call
 * straight into the EXISTING job/approval/memory stack, never a second one)
 * and the fallback to the proven Whisper loop when OpenAI Realtime cannot
 * even start.
 */

const originalStartListening = vi.fn();

const voiceState: Record<string, unknown> = {
  voiceStatus: 'idle',
  transcript: '',
  error: null,
  conversation: [],
  response: '',
  startListening: originalStartListening,
  stopListening: vi.fn(),
  sendMessage: vi.fn(),
  setResponseMode: vi.fn(),
};

vi.mock('@/presentation/store/voiceStore', () => ({
  useVoiceStore: {
    getState: () => voiceState,
    setState: (patch: unknown) => {
      const p = typeof patch === 'function'
        ? (patch as (s: typeof voiceState) => Partial<typeof voiceState>)(voiceState)
        : patch;
      Object.assign(voiceState, p);
    },
  },
  writeConversationMemory: vi.fn(),
}));

const stopAllAudio = vi.fn();
vi.mock('@/presentation/store/installWhisperVoice', () => ({
  stopAllAudio: (...a: unknown[]) => stopAllAudio(...a),
}));

const startAxeJobs = vi.fn();
const setRealtimeJobAnnouncer = vi.fn();
vi.mock('@/presentation/store/installTierRouter', () => ({
  startAxeJobs: (...a: unknown[]) => startAxeJobs(...a),
  setRealtimeJobAnnouncer: (...a: unknown[]) => setRealtimeJobAnnouncer(...a),
}));

let openAiRealtimeConfigured = true;
vi.mock('@/infrastructure/gateways/openAiRealtimeVoice', () => ({
  isOpenAiRealtimeConfigured: () => openAiRealtimeConfigured,
  openRealtimeVoice: vi.fn(),
  OPENAI_REALTIME_MODEL: 'gpt-realtime',
}));

const getDurableTask = vi.fn();
const cancelDurableTask = vi.fn();
const decideDurableTaskApproval = vi.fn();
vi.mock('@/infrastructure/gateways/axeCoreApiService', () => ({
  getDurableTask: (...a: unknown[]) => getDurableTask(...a),
  cancelDurableTask: (...a: unknown[]) => cancelDurableTask(...a),
  decideDurableTaskApproval: (...a: unknown[]) => decideDurableTaskApproval(...a),
}));

const searchRagMemories = vi.fn();
const extractMemoryFromMessage = vi.fn();
vi.mock('@/infrastructure/persistence/ragMemoryService', () => ({
  searchRagMemories: (...a: unknown[]) => searchRagMemories(...a),
  extractMemoryFromMessage: (...a: unknown[]) => extractMemoryFromMessage(...a),
}));

const noteRetrieval = vi.fn();
const noteOwnerOutcome = vi.fn();
vi.mock('@/infrastructure/persistence/memoryFeedbackService', () => ({
  noteRetrieval: (...a: unknown[]) => noteRetrieval(...a),
  noteOwnerOutcome: (...a: unknown[]) => noteOwnerOutcome(...a),
}));

vi.mock('@/infrastructure/gateways/whisperService', () => ({
  acquireMic: vi.fn(),
  releaseMic: vi.fn(),
}));

vi.mock('@/infrastructure/config/apiUrl', () => ({ isTauriRuntime: () => false }));

const { handleRealtimeTool, REALTIME_TOOLS, installOpenAIRealtimeVoice } =
  await import('@/presentation/store/installOpenAIRealtimeVoice');
const { useAxeJobStore } = await import('@/presentation/store/axeJobStore');

function seedJob(overrides: Partial<AxeJob> = {}): AxeJob {
  const job: AxeJob = {
    id: overrides.id ?? 'job-1',
    title: overrides.title ?? 'Check the northsea deals',
    agent: overrides.agent ?? 'northsea',
    state: overrides.state ?? 'running',
    startedAt: Date.now(),
    sourceText: overrides.sourceText ?? 'check northsea deals',
    taskId: overrides.taskId ?? 'task-1',
    ...overrides,
  };
  useAxeJobStore.getState().voeg([job]);
  return job;
}

beforeEach(() => {
  useAxeJobStore.getState().leeg();
  openAiRealtimeConfigured = true;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('REALTIME_TOOLS', () => {
  it('declares exactly the five real tools this voice call has', () => {
    expect(REALTIME_TOOLS.map((t) => t.name).sort()).toEqual([
      'answer_pending_approval',
      'cancel_task',
      'get_task_status',
      'search_memory',
      'start_background_task',
    ]);
  });
});

describe('start_background_task', () => {
  it('dispatches through the existing stuurAxeJobs stack — no second task queue', async () => {
    const result = JSON.parse(await handleRealtimeTool('start_background_task', {
      request: 'pull the latest trades',
      title: 'Pull trades',
    }));
    expect(result.ok).toBe(true);
    expect(startAxeJobs).toHaveBeenCalledTimes(1);
    const [stukken] = startAxeJobs.mock.calls[0] as [Array<{ text: string; route: { tier: number } }>];
    expect(stukken[0].text).toBe('pull the latest trades');
    expect(stukken[0].route.tier).toBe(3);
  });

  it('refuses without a request instead of starting an empty job', async () => {
    const result = JSON.parse(await handleRealtimeTool('start_background_task', {}));
    expect(result.ok).toBe(false);
    expect(startAxeJobs).not.toHaveBeenCalled();
  });
});

describe('get_task_status', () => {
  it('gives the session overview with no hint', async () => {
    seedJob({ state: 'done', summary: 'Pulled 3 trades.' });
    const result = JSON.parse(await handleRealtimeTool('get_task_status', {}));
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Pulled 3 trades');
  });

  it('finds the right job from a loose spoken hint', async () => {
    seedJob({ agent: 'northsea', title: 'Check inbox' });
    const result = JSON.parse(await handleRealtimeTool('get_task_status', { job_hint: 'the northsea one' }));
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/northsea/i);
  });
});

describe('cancel_task', () => {
  it('cancels the matching running task via the real cancel endpoint (73950a5)', async () => {
    seedJob({ taskId: 'task-42' });
    cancelDurableTask.mockResolvedValueOnce({ task: {} });
    const result = JSON.parse(await handleRealtimeTool('cancel_task', {}));
    expect(result.ok).toBe(true);
    expect(cancelDurableTask).toHaveBeenCalledWith('task-42', expect.any(String));
  });

  it('refuses when nothing is running instead of guessing', async () => {
    const result = JSON.parse(await handleRealtimeTool('cancel_task', {}));
    expect(result.ok).toBe(false);
    expect(cancelDurableTask).not.toHaveBeenCalled();
  });

  it('asks instead of guessing when the hint matches more than one job', async () => {
    seedJob({ id: 'a', agent: 'northsea', title: 'Northsea sweep' });
    seedJob({ id: 'b', agent: 'trading', title: 'Trading sweep' });
    const result = JSON.parse(await handleRealtimeTool('cancel_task', { job_hint: 'sweep' }));
    expect(result.ok).toBe(false);
    expect(cancelDurableTask).not.toHaveBeenCalled();
  });
});

describe('answer_pending_approval', () => {
  it('approves a low-risk shell approval that stays on this machine', async () => {
    seedJob({ state: 'waiting', taskId: 'task-9' });
    getDurableTask.mockResolvedValueOnce({
      approvals: [{
        id: 'appr-1', status: 'pending', kind: 'shell_command',
        title: 'AXE wants to run: ls', detail: 'ls',
        metadata: { command: 'ls', reason: 'list files' },
      }],
    });
    const result = JSON.parse(await handleRealtimeTool('answer_pending_approval', { approve: true }));
    expect(result.ok).toBe(true);
    expect(decideDurableTaskApproval).toHaveBeenCalledWith('task-9', 'appr-1', true, expect.any(String));
  });

  it('refuses an outbound/high-risk approval instead of deciding it by voice', async () => {
    seedJob({ state: 'waiting', taskId: 'task-9' });
    getDurableTask.mockResolvedValueOnce({
      approvals: [{
        id: 'appr-1', status: 'pending', kind: 'shell_command',
        title: 'AXE wants to run: send mail', detail: 'sendmail -t luka',
        metadata: { command: 'sendmail -t luka', reason: 'sends something out' },
      }],
    });
    const result = JSON.parse(await handleRealtimeTool('answer_pending_approval', { approve: true }));
    expect(result.ok).toBe(false);
    expect(decideDurableTaskApproval).not.toHaveBeenCalled();
  });

  it('refuses when nothing is waiting on an approval', async () => {
    const result = JSON.parse(await handleRealtimeTool('answer_pending_approval', { approve: true }));
    expect(result.ok).toBe(false);
    expect(getDurableTask).not.toHaveBeenCalled();
  });
});

describe('search_memory', () => {
  it('returns matching memory content from the existing RAG store', async () => {
    searchRagMemories.mockResolvedValueOnce([{ content: 'Luka prefers Cloudflare over Vercel.' }]);
    const result = JSON.parse(await handleRealtimeTool('search_memory', { query: 'hosting preference' }));
    expect(result.ok).toBe(true);
    expect(result.results).toEqual(['Luka prefers Cloudflare over Vercel.']);
  });

  it('refuses without a query instead of searching for nothing', async () => {
    const result = JSON.parse(await handleRealtimeTool('search_memory', {}));
    expect(result.ok).toBe(false);
    expect(searchRagMemories).not.toHaveBeenCalled();
  });
});

describe('installOpenAIRealtimeVoice — Whisper fallback', () => {
  it('falls back to the existing Whisper loop when no OpenAI key is configured on this device', async () => {
    openAiRealtimeConfigured = false;
    installOpenAIRealtimeVoice();

    const startListening = voiceState.startListening as () => Promise<void>;
    expect(startListening).not.toBe(originalStartListening);
    await startListening();

    expect(originalStartListening).toHaveBeenCalledTimes(1);
    expect(voiceState.setResponseMode).toHaveBeenCalledWith('speak');
  });
});
