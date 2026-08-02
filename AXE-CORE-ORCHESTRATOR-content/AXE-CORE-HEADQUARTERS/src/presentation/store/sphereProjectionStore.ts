/**
 * sphereProjectionStore — presentation view-state only.
 * Queue holds up to 3 payloads; active is rendered by SphereStage on Home.
 *
 * project() also fires window event `axe-living-display` so Home can force
 * Core view even when chat came from BottomBar / sidebar / voice.
 */
import { create } from 'zustand';
import type { ProjectionPayload, SpherePhase } from '@/domain/sphere/projectionTypes';
import { moodForMode } from '@/domain/sphere/projectionTypes';
import { emitAxeEvent } from '@/infrastructure/events/eventBus';

const MAX_QUEUE = 3;

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
  try {
    console.info('[sphere] living-display', phase, payload.mode, payload.title, payload.data);
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
    const prev = get().queue.filter(q => q.id !== payload.id);
    const queue = [payload, ...prev].slice(0, MAX_QUEUE);

    // Opening immediately so any mounted SphereStage paints on this frame
    set({ phase: 'opening', payload, queue });
    broadcastLivingDisplay(payload, 'opening');

    if (lastEmitId !== payload.id) {
      lastEmitId = payload.id;
      emitAxeEvent('axe:sphere-project', payload);
    }

    // Fast path to projecting — UI must not stay invisible on 'opening' only
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
    broadcastLivingDisplay(item, 'opening');
    setTimeout(() => {
      if (get().payload?.id === id) {
        set({ phase: 'projecting' });
        broadcastLivingDisplay(item, 'projecting');
      }
    }, 120);
  },

  dismiss: () => {
    if (get().phase === 'idle' && !get().payload) return;
    set({ phase: 'closing' });
    emitAxeEvent('axe:sphere-dismiss', {});
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      const cur = get().payload;
      const queue = get().queue.filter(q => q.id !== cur?.id);
      const next = queue[0] ?? null;
      lastEmitId = null;
      if (next) {
        set({ phase: 'opening', payload: next, queue });
        broadcastLivingDisplay(next, 'opening');
        setTimeout(() => {
          if (get().payload?.id === next.id) {
            set({ phase: 'projecting' });
            broadcastLivingDisplay(next, 'projecting');
          }
        }, 120);
      } else {
        set({ phase: 'idle', payload: null, queue: [] });
      }
      closeTimer = null;
    }, 280);
  },

  dismissAll: () => {
    set({ phase: 'closing' });
    emitAxeEvent('axe:sphere-dismiss', { reason: 'all' });
    lastEmitId = null;
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      set({ phase: 'idle', payload: null, queue: [] });
      closeTimer = null;
    }, 280);
  },

  markProjecting: () => {
    if (get().phase === 'opening') {
      const p = get().payload;
      set({ phase: 'projecting' });
      if (p) broadcastLivingDisplay(p, 'projecting');
    }
  },

  markIdle: () => set({ phase: 'idle', payload: null }),
}));

export function selectSphereMood() {
  const { payload, phase } = useSphereProjectionStore.getState();
  if (!payload || phase === 'idle' || phase === 'closing') return moodForMode('none');
  return moodForMode(payload.mode);
}
