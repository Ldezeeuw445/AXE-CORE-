import { ProviderCard } from './ProviderCard';
import { providerIcoon } from './providerIcoon';
import { CompactStatusRow } from '@/presentation/components/widgets/ModelStatusWidget';
/**
 * Settings → Keys per app: welke sleutel elke app gebruikt, waar hij woont,
 * en of hij werkt. Leest GET /keys/overview (backend/axe_api/sleutels.py).
 *
 * Nooit een waarde: de server stuurt alleen naam, doel, plek en status.
 * "Not visible" is eerlijk: die sleutel staat ergens waar de VPS niet kan kijken.
 */
import { useEffect, useState } from 'react';
import { Kaart, KaartRaster, SectieBlok } from '@/presentation/components/layout/tabMaatstaf';
import { testServerProviderKey, keysOverview, type KeyRow, type KeysPerApp, type KeyStatus } from '@/infrastructure/gateways/axeCoreApiService';
import { leesProviderOpslag } from '@/domain/providers';
import type { ProviderConn } from '@/domain/providerConnections';
import { metModelTest, type ModelTest } from '@/domain/keysMetModellen';

const STAND: Record<KeyStatus, { kleur: string; tekst: string }> = {
  works: { kleur: 'var(--success)', tekst: 'Works' },
  present: { kleur: 'var(--accent-cyan)', tekst: 'Set' },
  missing: { kleur: 'var(--warning)', tekst: 'Missing' },
  broken: { kleur: 'var(--error)', tekst: 'Broken' },
  unseen: { kleur: 'var(--text-muted)', tekst: 'Not visible' },
  optional: { kleur: 'var(--text-muted)', tekst: 'Optional' },
  unused: { kleur: 'var(--text-muted)', tekst: 'Not used' },
};

const VOLGORDE: KeyStatus[] = ['broken', 'missing', 'works', 'present', 'unseen', 'optional', 'unused'];

const NODIG: Record<string, string> = { required: 'Required', optional: 'Optional', unused: 'Not needed' };

/** Models & Tests schrijft zijn uitslag in dezelfde opslag als Instellingen. */
function metModellen(apps: KeysPerApp[]): KeysPerApp[] {
  let conns: Record<string, ProviderConn> = {};
  try { conns = leesProviderOpslag() as Record<string, ProviderConn>; } catch { /* niets bekend */ }
  return apps.map((a) => {
    const keys = a.keys.map((k) => metModelTest(k, k.provider ? (conns[k.provider]?.lastTest as ModelTest) : undefined));
    const counts = Object.fromEntries(VOLGORDE.map((s) => [s, keys.filter((k) => k.status === s).length])) as KeysPerApp['counts'];
    return { ...a, keys, counts };
  });
}

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
      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
        {k.purpose}
        {k.need && <span style={{ color: 'var(--text-muted)' }}> · {NODIG[k.need] ?? k.need}</span>}
      </p>
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
        {c.unseen} not visible · {c.optional ?? 0} optional · {c.unused ?? 0} not used · reported by {app.manager}
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
        .then((d) => { if (alive) { setApps(metModellen(d.apps)); setFout(null); } })
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
      <p className="text-[11.5px] mb-3" style={{ color: 'var(--text-secondary)' }}>
        Works = proven by a feed, a real trade or Models & Tests. Set = on the AXE Core VPS, not proven yet.
        Missing = required and not on the VPS. Not visible = lives somewhere the VPS cannot look (Companion
        server, Supabase, Settings → Keys). Optional and Not used never need action.
      </p>
      {fout && <p className="axe-agentkaart-melding">{fout}</p>}
      {!apps && !fout && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Checking keys…</p>}
      <KaartRaster ruim>
        {(apps ?? []).map((a) => <AppKaart key={a.app} app={a} />)}
      </KaartRaster>
    </SectieBlok>
  );
}

export function ServerProviderSlots({ compact = false }: { compact?: boolean } = {}) {
  const slots = [
    ['Cerebras (VPS)', 'CEREBRAS_API_KEY'],
    ['Groq 2', 'GROQ_AGENTS_API_KEY'],
    ['Groq 3', 'GROQ_LIGHT_API_KEY'],
    ['Groq 4', 'GROQ_RESERVE_API_KEY'],
    ['OpenRouter 3', 'OPENROUTER3_API_KEY'],
    ['OpenRouter 4', 'OPENROUTER4_API_KEY'],
    ['OpenRouter 5', 'OPENROUTER5_API_KEY'],
  ];
  const [status, setStatus] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void keysOverview().then(({ apps }) => {
      if (!active) return;
      const rows = apps.flatMap(app => app.keys);
      setStatus(previous => ({
        ...Object.fromEntries(rows.map(row => [row.name, STAND[row.status].tekst])),
        ...previous,
      }));
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  async function test(key: string) {
    setStatus(previous => ({ ...previous, [key]: 'Testing…' }));
    const result = await testServerProviderKey(key).catch(() => ({ status: 'Test unavailable' }));
    setStatus(previous => ({ ...previous, [key]: result.status }));
  }
  if (compact) return <>{slots.map(([label, key]) => {
    const result = status[key];
    const failed = result === 'Broken' || result === 'Rate limited' || result?.startsWith('Test failed');
    return <CompactStatusRow key={key} label={label}
      icon={key.startsWith('OPENROUTER') ? 'Router' : key.startsWith('GROQ') ? 'Rocket' : 'Zap'}
      accent={key.startsWith('GROQ') ? '#ec4899' : '#f59e0b'}
      status={result === 'Works' ? 'Connected' : failed ? 'Failed' : result ?? 'Not checked'}
      tone={result === 'Works' ? 'ok' : failed ? 'fail' : 'idle'} />;
  })}</>;
  return <>{slots.map(([label, key]) => {
    const result = status[key];
    const router = key.startsWith('OPENROUTER');
    const groq = key.startsWith('GROQ');
    const defaultModel = router ? 'openrouter/free' : groq
      ? (key === 'GROQ_AGENTS_API_KEY' ? 'openai/gpt-oss-120b' : 'openai/gpt-oss-20b')
      : 'gpt-oss-120b';
    const failed = result === 'Broken' || result === 'Rate limited' || result?.startsWith('Test failed');
    const stand = result === 'Works' ? 'ok' : failed ? 'fail' : result === 'Testing…' ? 'testing' : 'idle';
    return <ProviderCard key={key}
      kaart={{ id: key, name: label, icon: providerIcoon(router ? 'Router' : groq ? 'Rocket' : 'Zap'),
        accent: groq ? '#ec4899' : '#f59e0b', defaultModel, placeholder: key,
        docsUrl: router ? 'https://openrouter.ai/keys' : groq ? 'https://console.groq.com/keys' : 'https://cloud.cerebras.ai/',
        needsKey: true }}
      stand={stand} sleutel="" model="" fout={failed ? result : undefined}
      sleutelZichtbaar={false} opServer={Boolean(result && !['Optional', 'Missing', 'Not configured', 'Not visible'].includes(result))}
      modellen={[]} isPrimair={false} aangepast={false} onTest={() => void test(key)} />;
  })}</>;
}
