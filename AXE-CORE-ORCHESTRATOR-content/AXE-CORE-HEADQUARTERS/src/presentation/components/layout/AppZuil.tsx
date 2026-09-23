/**
 * Kies een app: Alle, of een van de vijf. Gedeeld door de agenda en het grootboek,
 * zodat dezelfde app overal hetzelfde icoon en dezelfde kleur heeft.
 */
import { Brain, Cpu, Globe2, Layers, LineChart, Smartphone } from 'lucide-react';
import { APPS, type AppId } from '@/domain/apps';
import type { AppFilter } from '@/domain/grootboek';
import { IcoonZuil, type ZuilItem } from './IcoonZuil';

const ICOON: Record<AppId, typeof Cpu> = {
  axe_core: Cpu,
  axe_companion: Smartphone,
  trading_os: LineChart,
  axon_memory: Brain,
  northsea: Globe2,
};

const APP_ZUIL: ZuilItem[] = [
  { id: 'alle', label: 'Alle apps', kleur: 'var(--text-primary)', icoon: <Layers size={17} /> },
  ...APPS.map(a => {
    const Icoon = ICOON[a.id];
    return { id: a.id, label: a.label, kleur: a.kleur, icoon: <Icoon size={17} /> };
  }),
];

export function AppZuil({ actief, kies, kant = 'rechts' }: { actief: AppFilter; kies: (app: AppFilter) => void; kant?: 'links' | 'rechts' }) {
  return <IcoonZuil items={APP_ZUIL} actief={actief} kies={id => kies(id as AppFilter)} kant={kant} rijen={2} />;
}
