/**
 * sphereProjectionStore — presentation view-state only.
 * Queue holds up to 3 payloads; active is rendered by SphereStage on Home.
 *
 * Dedupe: same mode + similar title within 4s replaces instead of stacking
 * (fixes "New York" opening 3 badges).
 */
import { create } from 'zustand';
import type { ProjectionPayload, SpherePhase } from '@/domain/sphere/projectionTypes';
import { emitAxeEvent } from '@/infrastructure/events/eventBus';

const MAX_QUEUE = 3;
const DEDUPE_MS = 4000;

interface SphereProjectionState {
  phase: SpherePhase;
  payload: ProjectionPayload | null;
  queue: ProjectionPayload[];
  project: (payload: ProjectionPayload) => void;
  focus: (id: string) => void;
  dismiss: () => void;
  dismissAll: () => void;
  markProjecting: () => void;
  markIdle: () => void;
}

let closeTimer: ReturnType<typeof setTimeout> | null = null;
let lastEmitId: string | null = null;
let lastProjectKey = '';
let lastProjectAt = 0;

function normKey(p: ProjectionPayload): string {
  const title = (p.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const mode = (p.mode || '').toLowerCase();
  return `${mode}::${title}`;
}

function broadcastLivingDisplay(payload: ProjectionPayload, phase: SpherePhase) {
  try {
    window.dispatchEvent(
      new CustomEvent('axe-living-display', {
        detail: { payload, phase, title: payload.title, mode: payload.mode },
      }),
    );
  } catch {
    /* ignore */
  }
}

export const useSphereProjectionStore = create<SphereProjectionState>((set, get) => ({
  phase: 'idle',
  payload: null,
  queue: [],

  project: (payload) => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    const key = normKey(payload);
    const now = Date.now();
    if (key === lastProjectKey && now - lastProjectAt < DEDUPE_MS) {
      const cur = get().payload;
      if (cur && normKey(cur) === key) {
        set({
          phase: get().phase === 'idle' ? 'opening' : get().phase,
          payload: { ...cur, ...payload, id: cur.id },
        });
        return;
      }
    }
    lastProjectKey = key;
    lastProjectAt = now;

    const prev = get().queue.filter(q => normKey(q) !== key);
    const queue = [payload, ...prev].slice(0, MAX_QUEUE);

    set({ phase: 'opening', payload, queue });
    broadcastLivingDisplay(payload, 'opening');

    if (lastEmitId !== payload.id) {
      lastEmitId = payload.id;
      emitAxeEvent('axe:sphere-project', payload);
    }

    setTimeout(() => {
      if (get().payload?.id === payload.id && get().phase === 'opening') {
        set({ phase: 'projecting' });
        broadcastLivingDisplay(payload, 'projecting');
      }
    }, 120);
  },

  focus: (id) => {
    const item = get().queue.find(q => q.id === id);
    if (!item) return;
    set({ phase: 'opening', payload: item });
    setTimeout(() => {
      if (get().payload?.id === id) set({ phase: 'projecting' });
    }, 80);
  },

  dismiss: () => {
    const { queue, payload } = get();
    const next = queue.filter(q => q.id !== payload?.id);
    if (next.length) {
      set({ phase: 'opening', payload: next[0], queue: next });
      setTimeout(() => {
        if (get().payload?.id === next[0].id) set({ phase: 'projecting' });
      }, 80);
    } else {
      set({ phase: 'closing', payload: null, queue: [] });
      closeTimer = setTimeout(() => set({ phase: 'idle' }), 200);
    }
    emitAxeEvent('axe:sphere-dismiss', {});
  },

  dismissAll: () => {
    set({ phase: 'closing', payload: null, queue: [] });
    lastProjectKey = '';
    lastEmitId = null;
    closeTimer = setTimeout(() => set({ phase: 'idle' }), 200);
    emitAxeEvent('axe:sphere-dismiss', { reason: 'all' });
  },

  markProjecting: () => set({ phase: 'projecting' }),
  markIdle: () => set({ phase: 'idle', payload: null }),
}));
