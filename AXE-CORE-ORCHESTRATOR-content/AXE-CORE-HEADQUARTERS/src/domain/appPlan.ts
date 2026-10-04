/**
 * Het staande plan per bestaande app. Eén keer, kort: wat het is, wat het
 * wordt, wat het niet mag. Agents kennen het doel al; taken daarbinnen
 * vragen geen akkoord.
 */
import type { AppId } from '@/domain/apps';
import { kluisPadVoorAppPlan } from '@/domain/obsidian/kluisBoom';

export type AppMetPlan = Extract<AppId, 'axe_core' | 'northsea' | 'trading_os'>;

export interface AppPlan {
  app: AppMetPlan;
  label: string;
  mapNaam: string;
  pad: string;
  is: string;
  wordt: string;
  magNiet: string;
}

export const APPS_MET_PLAN: readonly AppMetPlan[] = ['axe_core', 'northsea', 'trading_os'];

const PLANNEN: Record<AppMetPlan, Omit<AppPlan, 'pad'>> = {
  axe_core: {
    app: 'axe_core',
    label: 'AXE Core',
    mapNaam: 'AXE Core',
    is: 'Luka\'s desktop-app: Tauri + React, Python-backend op de VPS. Eén gebruiker.',
    wordt: 'Eén werkplek, één waarheid. Agents doen het werk dat hij al vroeg, zonder opnieuw te vragen.',
    magNiet: 'Geen mail, geen auto_send, geen tweede takenlijst.',
  },
  northsea: {
    app: 'northsea',
    label: 'Northsea Desk',
    mapNaam: 'Northsea Desk',
    is: 'De commodity-desk: deals, contacten, de kaart. Blijft draaien.',
    wordt: 'Een desk die laat zien wat Luka moet zien. Geen zender.',
    magNiet: 'Geen mail, geen auto_send, geen auto_reply, geen deal verzetten zonder ja.',
  },
  trading_os: {
    app: 'trading_os',
    label: 'Trading agent',
    mapNaam: 'Trading',
    is: 'Analyse en intel op demo-accounts. Het ledger is de rechter.',
    wordt: 'Een agent die analyseert en op demo verbetert tot het live-account bevestigd is.',
    magNiet: 'Geen live order tot het account bevestigd is, geen geld uitgeven, geen mail.',
  },
};

export function appPlanVan(app: AppMetPlan): AppPlan {
  const p = PLANNEN[app];
  return { ...p, pad: kluisPadVoorAppPlan(p.mapNaam) };
}

export function staandeAppPlannen(): AppPlan[] {
  return APPS_MET_PLAN.map(appPlanVan);
}

export function appPlanTekst(plan: AppPlan): string {
  return [
    `# ${plan.label}`,
    '',
    `- kind: plan`,
    `- app: ${plan.app}`,
    '',
    `## Wat het is`,
    '',
    plan.is,
    '',
    `## Wat het wordt`,
    '',
    plan.wordt,
    '',
    `## Wat het niet mag`,
    '',
    plan.magNiet,
    '',
  ].join('\n');
}
