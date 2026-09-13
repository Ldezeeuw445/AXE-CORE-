/**
 * Een rij kale iconen in de band naast de composer, met de naam eronder.
 *
 * ## Waarom dit gedeeld is
 *
 * De trading-desk had hem eerst voor zichzelf. Toen de agenda hetzelfde nodig
 * had (maand of week) stond ik op het punt hem over te tikken -- en dat is de
 * fout waar deze codebase al 295 gevallen van heeft. Eén component, twee
 * gebruikers.
 *
 * ## Hoe hij leest
 *
 * De namen zijn weg: twaalf labels in die strook is een tweede navigatie. Je
 * ziet de naam pas als je erover gaat, en dan in de kleur van dat item, op één
 * vaste regel zodat er niets opspringt terwijl je met je muis over de rij gaat.
 *
 * De keuze wordt gedragen door kleur ÉN dekking -- 0.28 in rust, vol als je
 * erop staat. Kleur alleen is te zwak, en dat staat zo in de designpack.
 */
import { useState, type ReactNode } from 'react';

export interface ZuilItem {
  id: string;
  label: string;
  icoon: ReactNode;
  /** De eigen kleur van dit item, als hex of css-kleur. */
  kleur: string;
}

export function IcoonZuil({
  items, actief, kies, rijen = 3,
}: {
  items: ReadonlyArray<ZuilItem>;
  actief: string;
  kies: (id: string) => void;
  /** Hoeveel rijen hoog het rooster mag worden voordat het een kolom erbij krijgt. */
  rijen?: number;
}) {
  const [zweeft, setZweeft] = useState<string | null>(null);
  // De naam die je leest: waar je overheen gaat, en anders waar je op staat.
  const toon = items.find(i => i.id === (zweeft ?? actief));

  return (
    <div className="axe-tabzuil">
      <div
        className="axe-tabzuil-rooster"
        style={{ gridTemplateRows: `repeat(${Math.min(rijen, items.length)}, auto)` }}
        onMouseLeave={() => setZweeft(null)}
      >
        {items.map(item => {
          const aan = actief === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => kies(item.id)}
              onMouseEnter={() => setZweeft(item.id)}
              onFocus={() => setZweeft(item.id)}
              className="axe-tabzuil-knop"
              data-aan={aan ? 'ja' : undefined}
              // Ook als title: op een smal venster valt de regel eronder weg,
              // en een icoon zonder enige naam is een raadsel.
              title={item.label}
              aria-label={item.label}
              aria-current={aan ? 'page' : undefined}
              style={{ color: aan || zweeft === item.id ? item.kleur : undefined }}
            >
              {item.icoon}
            </button>
          );
        })}
      </div>
      <div className="axe-tabzuil-naam" style={{ color: toon ? toon.kleur : undefined }}>
        {toon?.label ?? ' '}
      </div>
    </div>
  );
}
