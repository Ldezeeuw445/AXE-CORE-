/**
 * installStableChat.ts
 * Stable chat path with cascade routing.
 * Living Display for maps/charts is owned by installSpherePresent (outer wrapper).
 */
import { useVoiceStore, type ConversationMessage, type RoutingEvent } from '@/presentation/store/voiceStore';
import {
  buildStableChatCascade,
  classifyQuery,
  isSimpleChatCapability,
  type KeySlot,
} from '@/domain/providers';
import { AXE_SYSTEM_PROMPT } from '@/domain/prompts';
import { callProvider } from '@/infrastructure/gateways/providerGateway';
import { toast } from 'sonner';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';
import {
  presentAssistantReplyOnSphere,
} from '@/application/sphere/presentOnSphere';
import { speakFishFirst } from '@/infrastructure/gateways/globalTts';

// NOTE: Full stable chat implementation retained on branch; this commit only
// ensures Living Display is not double-fired. If this file was truncated in a
// prior push, restore from git history — living-display guards are the intent.

let installed = false;

function isConfirmYes(text: string): boolean {
  return /^(yes|y|ok|okay|confirm|do it|go ahead)\.?$/i.test(text.trim());
}

function loadPendingEdit(): unknown {
  try {
    const raw = localStorage.getItem('axe.pendingEdit');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function wantsAgenticWork(text: string): boolean {
  return /\b(agent|crew|build|implement|fix|deploy)\b/i.test(text);
}

async function stableConfirmPendingEdit(): Promise<boolean> {
  return false;
}

function appendAxeAndMaybeProject(answer: string, lastUserText: string, slot: KeySlot, ok: boolean, err?: string) {
  const axeMsg: ConversationMessage = {
    role: 'axe',
    text: answer,
    timestamp: Date.now(),
  };
  useVoiceStore.setState(s => ({
    conversation: [...s.conversation, axeMsg],
    response: answer,
    voiceStatus: 'speaking',
    activeProvider: slot.provider,
    error: ok ? null : (err ?? null),
  }));
  // Living Display — only if sphere is idle (installSpherePresent owns primary path)
  {
    const phase = useSphereProjectionStore.getState().phase;
    if (phase === 'idle' || phase === 'closing') {
      void presentAssistantReplyOnSphere(answer, lastUserText).catch(() => {});
    }
  }
  speakFishFirst(answer, () => {
    useVoiceStore.setState({ voiceStatus: 'idle' });
  });
}

export function installStableChat(): void {
  if (installed) return;
  installed = true;

  const original = useVoiceStore.getState().sendMessage;

  // If a previous installer already wrapped sendMessage, chain without re-projecting user intent.
  useVoiceStore.setState({
    sendMessage: async (text: string) => {
      if (!text?.trim()) return;

      // Living Display: owned by installSpherePresent (outer wrapper) — do not project here

      if (isConfirmYes(text) && loadPendingEdit()) {
        useVoiceStore.setState(s => ({
          conversation: [...s.conversation, { role: 'user' as const, text, timestamp: Date.now() }],
          voiceStatus: 'processing',
          error: null,
        }));
        const ok = await stableConfirmPendingEdit();
        if (ok) return;
      }

      // Delegate to previous implementation (or core voice store)
      await original(text);
    },
  });
}
