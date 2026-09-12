/**
 * Wat de device manager naar de Mac en de browser stuurt.
 *
 * De UI typt een zin; hier wordt daar een ComputerCall of een browser-taak
 * van. Zo blijft de ladder (observe vs consequential) in één functie, en
 * is hij te testen zonder React.
 */
import { RISK_TIERS, tierFor, type RiskTier } from '@/domain/tools/riskTiers';
import type { ComputerCall } from '@/infrastructure/gateways/computerRelay';

export function macKijk(device: string, workspace = 'AXE Core'): ComputerCall {
  return maakCall('system.info', device, workspace, {});
}

export function macOpdracht(device: string, opdracht: string, workspace = 'AXE Core'): ComputerCall {
  return maakCall('terminal.free', device, workspace, { command: opdracht });
}

/**
 * Of de telefoon eerst moet vragen. Observe loopt vanzelf; consequential
 * (een vrije opdracht op de Mac) altijd vragen — dat is de ladder, niet
 * een per-knop-vlag.
 */
export function macVraagtToestemming(call: ComputerCall): boolean {
  return RISK_TIERS[call.tier].behaviour === 'always_ask';
}

/** Wat op een chip of regel staat. Lege host (zaaddata) mag geen komma-rij worden. */
export function machineNaam(d: { id: string; label: string }): string {
  return (d.label || d.id).trim() || 'Mac';
}

function maakCall(
  tool: string,
  device: string,
  workspace: string,
  args: Record<string, unknown>,
): ComputerCall {
  return {
    tool,
    tier: tierFor(tool) as RiskTier,
    workspace,
    device,
    args,
  };
}
