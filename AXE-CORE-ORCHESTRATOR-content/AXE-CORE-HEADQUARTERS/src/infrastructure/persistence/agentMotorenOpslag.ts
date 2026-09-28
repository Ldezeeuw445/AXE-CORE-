/**
 * Waar de verdeling van de abonnementen blijft staan.
 *
 * localStorage, net als de ★ Primary en de slots: het is een keuze van dit
 * apparaat. Lezen gaat altijd door normaliseer(), zodat een oude of kapotte
 * waarde nooit een abonnement bij twee agents zet. Zie domain/agentMotoren.ts.
 */
import {
  normaliseer, wijsToe, MOTOREN_SLEUTEL,
  type HoofdAgent, type HoofdMotor, type MotorToewijzing,
} from '@/domain/agentMotoren';

export function leesToewijzing(): MotorToewijzing {
  try {
    const rauw = localStorage.getItem(MOTOREN_SLEUTEL);
    return normaliseer(rauw ? JSON.parse(rauw) : null);
  } catch {
    return normaliseer(null);
  }
}

export function kiesMotor(agent: HoofdAgent, motor: HoofdMotor): MotorToewijzing {
  const volgende = wijsToe(leesToewijzing(), agent, motor);
  try {
    localStorage.setItem(MOTOREN_SLEUTEL, JSON.stringify(volgende));
    window.dispatchEvent(new CustomEvent('axe:agent-motoren', { detail: volgende }));
  } catch { /* privémodus: dan geldt de keuze alleen voor deze sessie niet */ }
  return volgende;
}
