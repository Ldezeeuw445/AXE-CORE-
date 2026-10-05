import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/supabase/supabaseClient', () => ({ getSupabase: vi.fn() }));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ apparaatId: () => 'test-apparaat' }));

import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import {
  herstelAanmelding,
  normaliseerVapid,
  vapidPubliekVanBytes,
  vapidSleutelWijktAf,
  vernieuwAbonnementAlsSleutelWijkt,
  VAPID_PUBLIEK,
} from './pushAanmelding';

function bytesVanVapid(s: string): Uint8Array {
  const vulling = '='.repeat((4 - (s.length % 4)) % 4);
  const base64 = (s + vulling).replace(/-/g, '+').replace(/\//g, '_').replace(/_/g, '/');
  const ruw = typeof Buffer !== 'undefined'
    ? Buffer.from(base64, 'base64')
    : Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Uint8Array(ruw);
}

const ANDERE = 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('vapid-sleutel van het opgeslagen abonnement', () => {
  it('ziet dezelfde sleutel in base64 en base64url als gelijk', () => {
    const metPlus = VAPID_PUBLIEK.replace(/-/g, '+').replace(/_/g, '/') + '==';
    expect(vapidSleutelWijktAf(VAPID_PUBLIEK, VAPID_PUBLIEK)).toBe(false);
    expect(vapidSleutelWijktAf(metPlus, VAPID_PUBLIEK)).toBe(false);
    expect(normaliseerVapid(metPlus)).toBe(normaliseerVapid(VAPID_PUBLIEK));
  });

  it('ziet een andere applicationServerKey als afwijkend', () => {
    expect(vapidSleutelWijktAf(ANDERE, VAPID_PUBLIEK)).toBe(true);
    expect(vapidSleutelWijktAf(bytesVanVapid(ANDERE), VAPID_PUBLIEK)).toBe(true);
    expect(vapidSleutelWijktAf(bytesVanVapid(VAPID_PUBLIEK), VAPID_PUBLIEK)).toBe(false);
  });

  it('raadt niet als de opgeslagen sleutel ontbreekt', () => {
    expect(vapidSleutelWijktAf(null, VAPID_PUBLIEK)).toBe(false);
    expect(vapidSleutelWijktAf('', VAPID_PUBLIEK)).toBe(false);
    expect(vapidPubliekVanBytes(new Uint8Array())).toBe('');
  });
});

describe('vernieuwAbonnementAlsSleutelWijkt', () => {
  it('houdt het abonnement als de sleutel klopt', async () => {
    const unsub = vi.fn();
    const sub = {
      endpoint: 'https://push/oud',
      options: { applicationServerKey: bytesVanVapid(VAPID_PUBLIEK) },
      unsubscribe: unsub,
    } as unknown as PushSubscription;
    const subscribe = vi.fn();
    const uit = await vernieuwAbonnementAlsSleutelWijkt(sub, { pushManager: { subscribe } } as unknown as ServiceWorkerRegistration);
    expect(uit).toBe(sub);
    expect(unsub).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('unsubscribet en maakt een nieuw abonnement bij een andere sleutel', async () => {
    const unsub = vi.fn().mockResolvedValue(true);
    const nieuw = { endpoint: 'https://push/nieuw' };
    const sub = {
      endpoint: 'https://push/oud',
      options: { applicationServerKey: bytesVanVapid(ANDERE) },
      unsubscribe: unsub,
    } as unknown as PushSubscription;
    const subscribe = vi.fn().mockResolvedValue(nieuw);
    const uit = await vernieuwAbonnementAlsSleutelWijkt(
      sub,
      { pushManager: { subscribe } } as unknown as ServiceWorkerRegistration,
    );
    expect(unsub).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();
    expect(uit).toBe(nieuw);
  });
});

describe('herstelAanmelding', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset();
  });

  it('schrijft het vernieuwde endpoint in core_push_subscriptions', async () => {
    const unsub = vi.fn().mockResolvedValue(true);
    const nieuw = {
      endpoint: 'https://push/nieuw',
      options: { applicationServerKey: bytesVanVapid(VAPID_PUBLIEK) },
      getKey: (naam: string) => (naam === 'p256dh' ? new Uint8Array([1]) : new Uint8Array([2])),
    };
    const oud = {
      endpoint: 'https://push/oud',
      options: { applicationServerKey: bytesVanVapid(ANDERE) },
      unsubscribe: unsub,
      getKey: () => new Uint8Array([9]),
    };
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getSupabase).mockReturnValue({
      auth: { getSession: async () => ({ data: { session: { user: { id: 'acff7a12-1111-481d-a7a9-cc07583b8069' } } } }) },
      from: () => ({ upsert }),
    } as unknown as ReturnType<typeof getSupabase>);

    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => oud,
            subscribe: async () => nieuw,
          },
        }),
      },
      userAgent: 'Mozilla/5.0',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    const PushManager = function PushManager() { /* aanwezig */ };
    vi.stubGlobal('PushManager', PushManager);
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      Notification: { permission: 'granted' },
      PushManager,
    });

    await herstelAanmelding();
    expect(unsub).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push/nieuw', failed_at: null }),
      { onConflict: 'endpoint' },
    );
  });
});
