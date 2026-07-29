/**
 * Chat identity routing — keeps AXE feeling like one stable person.
 *
 * Architecture intent:
 *  - Primary (★) is the *voice of AXE* for normal conversation: same model,
 *    same memory context, fast first reply.
 *  - Configured fallback slots (fallback1/2/3) are the only emergency path
 *    when Primary is down — not a beauty contest across every API key.
 *  - Capability preferred_provider / code / analysis keep a fuller list so
 *    specialized work can pick a specialist model.
 *  - LangGraph still orchestrates the (short) list; it is not "who is AXE",
 *    it is "call this slot, retry the next if it fails".
 */
import type { KeySlot, ProviderId, QueryCapability } from '@/domain/providers';

export function forcePrimaryVoice(
  orderedSlots: KeySlot[],
  primary: KeySlot | null | undefined,
  resolveLive?: (provider: string) => KeySlot | null,
): KeySlot[] {
  if (!primary?.provider) return orderedSlots;
  const fromList =
    orderedSlots.find(s => s.provider === primary.provider) ??
    resolveLive?.(primary.provider) ??
    null;
  const forced: KeySlot = {
    provider: primary.provider as ProviderId,
    key: primary.key || fromList?.key || '',
    model: primary.model || fromList?.model,
    baseUrl: primary.baseUrl || fromList?.baseUrl,
  };
  return [forced, ...orderedSlots.filter(s => s.provider !== forced.provider)];
}

/**
 * For normal conversation (fast/creative, no capability preferred override),
 * collapse the race to Primary + user-configured fallbacks only.
 */
export function limitSimpleChatSlots(
  orderedSlots: KeySlot[],
  opts: {
    cap: string | QueryCapability;
    hasPreferredProvider: boolean;
    primary: KeySlot | null | undefined;
    fallbacks: Array<KeySlot | null | undefined>;
    resolveLive?: (provider: string) => KeySlot | null;
  },
): KeySlot[] {
  const { cap, hasPreferredProvider, primary, fallbacks, resolveLive } = opts;
  const isSimpleChat =
    (cap === 'fast' || cap === 'creative') && !hasPreferredProvider;
  if (!isSimpleChat || !primary?.provider || orderedSlots.length === 0) {
    return orderedSlots;
  }

  const extras = fallbacks
    .filter((s): s is KeySlot => !!s?.provider)
    .map(s => {
      const live = resolveLive?.(s.provider) ?? s;
      return {
        provider: s.provider,
        key: s.key || live.key || '',
        model: s.model || live.model,
        baseUrl: s.baseUrl || live.baseUrl,
      } as KeySlot;
    });

  const seen = new Set<string>();
  const out: KeySlot[] = [];
  for (const s of [orderedSlots[0], ...extras]) {
    if (!s?.provider || seen.has(s.provider)) continue;
    seen.add(s.provider);
    out.push(s);
  }
  return out.length ? out : orderedSlots.slice(0, 1);
}
