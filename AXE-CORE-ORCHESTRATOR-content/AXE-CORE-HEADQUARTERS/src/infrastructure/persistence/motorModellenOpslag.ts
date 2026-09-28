/**
 * Waar de modelkeuze per motor blijft staan.
 *
 * Zelfde plek en zelfde vorm als de verdeling van de abonnementen
 * (agentMotorenOpslag.ts): localStorage, altijd door normaliseer heen, en een
 * event zodat een tweede venster meteen meekijkt.
 */
import {
  kiesModel, normaliseerModellen, MODELLEN_SLEUTEL, type MotorModellen,
} from '@/domain/motorModellen';
import type { AgentEngine } from '@/domain/abonnementChat';

export function leesModellen(): MotorModellen {
  try {
    const rauw = localStorage.getItem(MODELLEN_SLEUTEL);
    return normaliseerModellen(rauw ? JSON.parse(rauw) : null);
  } catch {
    return {};
  }
}

export function zetModel(motor: AgentEngine, model: string): MotorModellen {
  const volgende = kiesModel(leesModellen(), motor, model);
  try {
    localStorage.setItem(MODELLEN_SLEUTEL, JSON.stringify(volgende));
    window.dispatchEvent(new CustomEvent('axe:motor-modellen', { detail: volgende }));
  } catch { /* privémodus: dan geldt de keuze alleen deze sessie */ }
  return volgende;
}
