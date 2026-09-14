/**
 * Kleuren en labels van de NorthSea-kaart, los van het componentbestand.
 *
 * Los omdat een .tsx die naast een component ook constanten exporteert geen
 * fast refresh meer krijgt (react-refresh/only-export-components): elke
 * wijziging aan de kaart herlaadt dan de hele pagina in plaats van alleen de
 * kaart. En de legenda en de tooltip lezen dezelfde tabel.
 *
 * Tekst op het scherm in het Engels (AGENTS.md).
 */
import type { DealStand, LocatieSoort, Onplaatsbaar } from '@/domain/northsea/kaart';

export const STAND_STIJL: Record<DealStand, { kleur: string; label: string }> = {
  actief: { kleur: '#34D399', label: 'Active Deals' },
  // "In Negotiation" uit het ontwerp bestaat niet als fase in AXE Commodities.
  // Wat er wel is: koper en leverancier gematcht, nog niet in kwalificatie.
  gematcht: { kleur: '#FBBF24', label: 'Matched' },
  geblokkeerd: { kleur: '#F87171', label: 'Blocked / Attention' },
  afgerond: { kleur: '#60A5FA', label: 'Completed' },
  overig: { kleur: '#94A3B8', label: 'Identified' },
};

export const STAND_VOLGORDE: readonly DealStand[] = ['actief', 'gematcht', 'geblokkeerd', 'afgerond', 'overig'];

export const REDEN_LABEL: Record<Onplaatsbaar, string> = {
  meerdere: 'multiple possible locations',
  regio: 'region only',
  onbekend: 'unrecognised place',
  leeg: 'no location in data',
};

export const SOORT_LABEL: Record<LocatieSoort, string> = {
  haven: 'Port / terminal',
  stad: 'City',
  land: 'Country (approximate)',
};
