/**
 * Meldingen op dit apparaat aan- of uitzetten.
 *
 * Eén knop, en als hij niet kan: de reden. Drie van de vier redenen kan Luka
 * zelf oplossen (de app installeren op iOS, een eerdere weigering terugdraaien,
 * de sleutel in de bouw zetten), dus een grijze knop zonder uitleg zou hier het
 * slechtste antwoord zijn. De regel staat in `domain/pushMogelijk.ts`, met een
 * test per geval.
 *
 * Toestemming vragen gebeurt binnen de klik: iOS weigert het stilletjes als het
 * buiten een gebaar gebeurt, en dan "doet de knop niets".
 */
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { meldingStand, isAangemeld, meldAan, meldAf } from '@/infrastructure/persistence/pushAanmelding';

export function MeldingenSection() {
  const [stand] = useState(() => meldingStand());
  const [aan, setAan] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => { void isAangemeld().then(setAan); }, []);

  const wissel = useCallback(() => {
    setFout(null);
    setBezig(true);
    void (async () => {
      try {
        if (aan) { await meldAf(); setAan(false); return; }
        const uit = await meldAan();
        if (uit.ok) setAan(true);
        else setFout(uit.reden);
      } finally {
        setBezig(false);
      }
    })();
  }, [aan]);

  return (
    <div className="widget-card" style={{ borderRadius: 'var(--radius)', padding: 16 }}>
      <h3
        className="text-[11px] font-semibold uppercase tracking-[.1em]"
        style={{ color: 'var(--text-muted)' }}
      >
        Notifications
      </h3>

      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        AXE's notifications reach your lock screen on this device, also when the
        app is closed. Per device: turn it on wherever you want them.
      </p>

      {stand.kan ? (
        <button
          onClick={wissel}
          disabled={bezig}
          aria-pressed={aan}
          className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium"
          style={{
            background: aan ? 'var(--bg-active)' : 'var(--bg-surface)',
            border: `1px solid ${aan ? 'var(--border-active)' : 'var(--border-subtle)'}`,
            color: aan ? 'var(--accent-cyan)' : 'var(--text-primary)',
            opacity: bezig ? 0.6 : 1,
          }}
        >
          {aan ? <Bell size={14} /> : <BellOff size={14} />}
          {aan ? 'On for this device' : 'Turn on for this device'}
        </button>
      ) : (
        <p
          className="mt-3 text-[12px] leading-relaxed"
          style={{ color: stand.herstelbaar ? 'var(--warning)' : 'var(--text-muted)' }}
        >
          {stand.reden}
        </p>
      )}

      {fout && (
        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--error)' }}>
          {fout}
        </p>
      )}
    </div>
  );
}
