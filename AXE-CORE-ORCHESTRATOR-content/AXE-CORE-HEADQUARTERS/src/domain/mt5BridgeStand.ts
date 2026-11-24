/**
 * MT5-bridge-server (Strato, 24 nov) als één regel voor de UI.
 *
 * De VPS meet hem (backend/axe_api/mt5_bridge_status.py): `reachable` = de machine
 * antwoordt; `bridge` = alleen 'ok' als er een health-adres is dat 2xx geeft.
 * Groen alleen bij 'works' -- verbonden zonder meting van de bridge is oranje,
 * want "de server staat aan" is niet "de bridge werkt".
 */
export interface Mt5BridgeMeting {
  reachable?: boolean;
  latency_ms?: number | null;
  bridge?: 'ok' | 'down' | 'unmeasured';
  stand?: 'works' | 'connected' | 'bridge_down' | 'offline';
  detail?: string;
}

export interface Mt5BridgeRegel {
  status: 'online' | 'degraded' | 'offline';
  label: string;
  detail: string;
  latencyMs: number | null;
}

export function mt5BridgeRegel(m: Mt5BridgeMeting | null | undefined): Mt5BridgeRegel {
  const ms = m?.latency_ms ?? null;
  if (!m || m.stand === 'offline' || !m.reachable) {
    return { status: 'offline', label: 'Offline', detail: m?.detail || 'server does not answer', latencyMs: null };
  }
  if (m.stand === 'works') return { status: 'online', label: 'Connected · works', detail: m.detail || 'bridge healthy', latencyMs: ms };
  if (m.stand === 'bridge_down') return { status: 'degraded', label: 'Connected · bridge down', detail: m.detail || 'bridge health failed', latencyMs: ms };
  return { status: 'degraded', label: 'Connected · bridge not measured', detail: 'server answers; the bridge has no health check yet', latencyMs: ms };
}
