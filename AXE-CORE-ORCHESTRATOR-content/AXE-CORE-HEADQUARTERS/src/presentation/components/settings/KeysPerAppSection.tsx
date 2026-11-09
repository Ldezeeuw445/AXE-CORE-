/**
 * Settings → Keys per app: welke sleutel elke app gebruikt, waar hij woont,
 * en of hij werkt. Leest GET /keys/overview (backend/axe_api/sleutels.py).
 *
 * Nooit een waarde: de server stuurt alleen naam, doel, plek en status.
 * "Not visible" is eerlijk: die sleutel staat ergens waar de VPS niet kan kijken.
 */
import { useEffect, useState } from 'react';
import { Kaart, KaartRaster, SectieBlok } from '@/presentation/components/layout/tabMaatstaf';
import { keysOverview, type KeyRow, type KeysPerApp, type KeyStatus } from '@/infrastructure/gateways/axeCoreApiService';

const STAND: Record<KeyStatus, { kleur: string; tekst: string }> = {
  works: { kleur: 'var(--success)', tekst: 'Works' },
  present: { kleur: 'var(--accent-cyan)', tekst: 'Set' },
  missing: { kleur: 'var(--warning)', tekst: 'Missing' },
  broken: { kleur: 'var(--error)', tekst: 'Broken' },
  unseen: { kleur: 'var(--text-muted)', tekst: 'Not visible' },
};

const VOLGORDE: KeyStatus[] = ['broken', 'missing', 'works', 'present', 'unseen'];

function Stand({ status }: { status: KeyStatus }) {
  const s = STAND[status] ?? STAND.unseen;
  return (
    <span style={{ color: s.kleur, fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {s.tekst}
    </span>
  );
}

function Regel({ k }: { k: KeyRow }) {
  return (
    <li className="py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <code className="text-[11.5px] break-all" style={{ color: 'var(--text-primary)' }}>{k.name}</code>
        <Stand status={k.status} />
      </div>
      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{k.purpose}</p>
      <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-muted)' }} title={k.detail}>
        {k.where} · {k.detail}
      </p>
      {k.warning && (
        <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--warning)' }}>{k.warning}</p>
      )}
    </li>
  );
}

function AppKaart({ app }: { app: KeysPerApp }) {
  const rijen = [...app.keys].sort(
    (a, b) => VOLGORDE.indexOf(a.status) - VOLGORDE.indexOf(b.status) || a.name.localeCompare(b.name),
  );
  const c = app.counts;
  const kop = c.broken ? 'broken' : c.missing ? 'missing' : 'works';
  return (
    <Kaart titel={app.app} actie={<Stand status={kop as KeyStatus} />}>
      <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
        {app.keys.length} keys · {c.works} working · {c.present} set · {c.missing} missing · {c.broken} broken ·{' '}
        {c.unseen} not visible · reported by {app.manager}
      </p>
      <ul>
        {rijen.map((k) => <Regel key={k.name} k={k} />)}
      </ul>
    </Kaart>
  );
}

export function KeysPerAppSection() {
  const [apps, setApps] = useState<KeysPerApp[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const laad = () => {
      void keysOverview()
        .then((d) => { if (alive) { setApps(d.apps); setFout(null); } })
        .catch((e: unknown) => { if (alive) setFout(e instanceof Error ? e.message : String(e)); });
    };
    laad();
    const timer = window.setInterval(laad, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  return (
    <SectieBlok
      id="keys"
      titel="KEYS PER APP"
      extra={<span className="font-mono text-[10.5px]" style={{ color: 'var(--text-muted)' }}>names and status only · never values</span>}
    >
      {fout && <p className="axe-agentkaart-melding">{fout}</p>}
      {!apps && !fout && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Checking keys…</p>}
      <KaartRaster ruim>
        {(apps ?? []).map((a) => <AppKaart key={a.app} app={a} />)}
      </KaartRaster>
    </SectieBlok>
  );
}
