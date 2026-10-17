/**
 * GET /agent-tiers: agent → tier → model → stoel. De VPS leest agent_tiers.json.
 */
export type AgentTierRij = {
  kind?: string;
  tier: number;
  model: string;
  seat_family?: string | null;
  cadence?: string;
};

export type AgentTierKaart = {
  agents?: Record<string, AgentTierRij | undefined>;
  crews?: Record<string, AgentTierRij | undefined>;
  northsea?: Record<string, AgentTierRij | undefined>;
};

export function agentTierRij(kaart: AgentTierKaart | null | undefined, id: string): AgentTierRij | null {
  if (!kaart || !id) return null;
  const rij = kaart.agents?.[id] ?? kaart.crews?.[id] ?? kaart.northsea?.[id];
  if (!rij || typeof rij.tier !== 'number') return null;
  return {
    kind: rij.kind,
    tier: rij.tier,
    model: typeof rij.model === 'string' ? rij.model : '',
    seat_family: rij.seat_family ?? null,
    cadence: rij.cadence,
  };
}

/** Korte regel voor de Home-rail: "T1 · opus/sonnet". */
export function agentTierRegel(kaart: AgentTierKaart | null | undefined, id: string): string {
  const rij = agentTierRij(kaart, id);
  if (!rij) return '';
  const model = (rij.model || '').replace(/\s+/g, ' ').trim();
  const kort = model.length > 36 ? `${model.slice(0, 35)}…` : model;
  return kort ? `T${rij.tier} · ${kort}` : `T${rij.tier}`;
}
