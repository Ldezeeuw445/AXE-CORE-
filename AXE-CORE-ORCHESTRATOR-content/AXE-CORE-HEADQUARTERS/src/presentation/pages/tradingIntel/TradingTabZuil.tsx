/**
 * De sub-tabs van de desk, als kale iconen naast de composer.
 *
 * De vorm zit in IcoonZuil -- die deelt hij met de agenda. Hier staat alleen
 * wat dít scherm eraan toevoegt: welk icoon en welke kleur bij welke tab hoort
 * (domain/tradingIntel/tabStijl), met een test die de tabel compleet houdt.
 * Verspringt die koppeling, dan is er geen kleur meer om te onthouden en is het
 * weer twaalf gelijke knopjes.
 */
import * as Lucide from 'lucide-react';
import { IcoonZuil, type ZuilItem } from '@/presentation/components/layout/IcoonZuil';
import { stijlVan } from '@/domain/tradingIntel/tabStijl';

/** Een naam uit de lucide-tabel omzetten naar het component zelf. */
function icoonVan(naam: string) {
  const set = Lucide as unknown as Record<string, React.ComponentType<{ size?: number }>>;
  const C = set[naam] ?? set.Circle;
  return <C size={17} />;
}

export function TradingTabZuil({
  tabs, actief, kies,
}: {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  actief: string;
  kies: (id: string) => void;
}) {
  const items: ZuilItem[] = tabs.map(t => {
    const stijl = stijlVan(t.id);
    return { id: t.id, label: t.label, kleur: stijl.kleur, icoon: icoonVan(stijl.icoon) };
  });
  return <IcoonZuil items={items} actief={actief} kies={kies} />;
}
