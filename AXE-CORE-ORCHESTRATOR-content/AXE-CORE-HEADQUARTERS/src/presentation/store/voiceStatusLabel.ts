import type { VoiceStatus } from '@/presentation/store/voiceStore';

/**
 * The one label per voice status, shared by every surface that shows one.
 *
 * Found 21 sep: TopNav's top-bar badge and AxePresenceDock's own status line
 * both read the same `voice.voiceStatus`, but each spelled out its own
 * strings — "THINKING" in one, "Working" in the other, for the identical
 * `processing` state. Same state, different words, so a user watching both
 * at once (the top bar and the presence card, on Code Editor for instance)
 * saw AXE apparently disagree with itself about what it was doing. TopNav.tsx
 * even carries a comment about exactly this failure mode for its OWN three
 * chains (background/border/text) — it just didn't cover the second
 * component reading the same status. One map, both places read it.
 */
export const VOICE_STATUS_LABEL: Record<Exclude<VoiceStatus, 'idle'>, string> = {
  listening: 'Listening',
  processing: 'Thinking',
  speaking: 'Speaking',
};
