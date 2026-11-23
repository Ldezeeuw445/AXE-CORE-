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
import { FixKaart, KpiRij, PaginaKop } from '@/presentation/components/settings/StatusKaart';
import { sleutelFixes, sleutelKpis, sleutelPil, verbruikTekst } from '@/domain/sleutelOverzicht';
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

function AppTabel({ app }: { app: KeysPerApp }) {
  const rijen = [...app.keys].sort(
    (a, b) => VOLGORDE.indexOf(a.status) - VOLGORDE.indexOf(b.status) || a.name.localeCompare(b.name),
  );
  const max = Math.max(1, ...rijen.map((k) => k.usage?.calls_today ?? 0));
  return (
    <section className="axe-set-tabel" aria-label={`Keys ${app.app}`}>
      <table>
        <thead>
          <tr><th>Key</th><th>Used for</th><th>Where</th><th>Usage</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rijen.map((k) => {
            const pil = sleutelPil(k);
            const pct = k.usage?.calls_today ? Math.max(4, (k.usage.calls_today / max) * 100) : 0;
            const kleur = pil.toon === 'bad' ? '#f87171' : pil.toon === 'warn' ? '#fbbf24' : '#34d399';
            return (
              <tr key={k.name}>
                <td><code>{k.name}</code></td>
                <td>
                  {k.purpose}
                  {k.need && k.need !== 'required' && <span className="axe-set-dim"> · {NODIG[k.need] ?? k.need}</span>}
                  {k.warning && <div className="axe-set-waarschuwing">{k.warning}</div>}
                </td>
                <td className="axe-set-dim" title={k.detail}>{k.where}</td>
                <td className="axe-set-verbruik">
                  <span>{verbruikTekst(k)}</span>
                  {pct > 0 && <i><em style={{ width: `${pct}%`, background: kleur }} /></i>}
                </td>
                <td><span className={`axe-set-pil is-${pil.toon}`}>{pil.tekst}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function KeysPerAppSection() {
  const [apps, setApps] = useState<KeysPerApp[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [gekozen, setGekozen] = useState<string | null>(null);

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

  const lijst = apps ?? [];
  const kp = sleutelKpis(lijst);
  const fixes = sleutelFixes(lijst);
  const actief = lijst.find((a) => a.app === gekozen) ?? lijst[0];
  const verschil = kp.gisteren ? Math.round(((kp.vandaag - kp.gisteren) / kp.gisteren) * 100) : null;

  return (
    <div id="keys" data-axe-sectie="keys">
      <PaginaKop
        titel="Keys per app"
        uitleg="Every key an app uses, where it lives, how much it was used today and whether it works. Names only — never values."
        pillen={apps ? [
          { tekst: `${kp.werkt} work`, toon: 'ok' },
          ...(kp.stuk ? [{ tekst: `${kp.stuk} broken`, toon: 'bad' as const }] : []),
          ...(kp.limiet ? [{ tekst: `${kp.limiet} rate limited`, toon: 'warn' as const }] : []),
        ] : []}
      />
      {apps && (
        <KpiRij tegels={[
          { label: 'Keys', waarde: String(kp.totaal), sub: `${kp.werkt} proven working` },
          { label: 'Not working', waarde: String(kp.stuk + kp.limiet), toon: kp.stuk ? 'bad' : kp.limiet ? 'warn' : undefined,
            sub: `${kp.stuk} broken · ${kp.limiet} limited` },
          { label: 'Calls today', waarde: String(kp.vandaag),
            sub: verschil == null ? 'counting since 23 Nov' : `${verschil >= 0 ? '+' : ''}${verschil}% vs yesterday` },
          { label: 'Tokens today', waarde: kp.tokens >= 1000 ? `${Math.round(kp.tokens / 1000)}k` : String(kp.tokens), sub: 'all apps together' },
        ]} />
      )}
      <FixKaart regels={fixes.map((f) => ({ id: f.naam, wat: f.naam, waarom: f.waarom }))} />
      {fout && <p className="axe-agentkaart-melding">{fout}</p>}
      {!apps && !fout && <p className="axe-set-stil">Checking keys…</p>}
      {lijst.length > 1 && (
        <div className="axe-set-tabs" role="tablist" aria-label="Apps">
          {lijst.map((a) => {
            const slecht = a.keys.filter((k) => sleutelPil(k).toon === 'bad').length;
            return (
              <button key={a.app} type="button" role="tab" aria-selected={a.app === actief?.app}
                className={a.app === actief?.app ? 'is-actief' : undefined} onClick={() => setGekozen(a.app)}>
                {a.app}<span>{a.keys.length}</span>{slecht ? <b>{slecht}</b> : null}
              </button>
            );
          })}
        </div>
      )}
      {actief && <AppTabel app={actief} />}
      <p className="axe-set-stil">
        Works = a real call succeeded (or a feed / Models & Tests proved it). Set = on the VPS, not proven yet.
        Not visible = lives where the VPS cannot look. Usage is counted on the VPS per key since 23 Nov.
      </p>
    </div>
  );
}

const SERVER_SLOT_TEST_EVENT = 'axe:server-slot-test';
const serverSlotTests: Record<string, string> = {};

const SERVER_SLOTS = [
  ['Cerebras (VPS)', 'CEREBRAS_API_KEY'],
  ['Groq 2', 'GROQ_AGENTS_API_KEY'],
  ['Groq 3', 'GROQ_LIGHT_API_KEY'],
  ['Groq 4', 'GROQ_RESERVE_API_KEY'],
  ['OpenRouter 3', 'OPENROUTER3_API_KEY'],
  ['OpenRouter 4', 'OPENROUTER4_API_KEY'],
  ['OpenRouter 5', 'OPENROUTER5_API_KEY'],
] as const;
const SLOT_CACHE = 'axe.serverSlotTests';
const SLOT_VERS_MS = 30 * 60_000;

function leesSlotCache(): Record<string, string> {
  try {
    const ruw = JSON.parse(localStorage.getItem(SLOT_CACHE) || '{}') as Record<string, { s: string; t: number }>;
    return Object.fromEntries(Object.entries(ruw).filter(([, v]) => Date.now() - v.t < SLOT_VERS_MS).map(([k, v]) => [k, v.s]));
  } catch { return {}; }
}

function bewaarSlotCache(key: string, status: string): void {
  try {
    const ruw = JSON.parse(localStorage.getItem(SLOT_CACHE) || '{}') as Record<string, { s: string; t: number }>;
    ruw[key] = { s: status, t: Date.now() };
    localStorage.setItem(SLOT_CACHE, JSON.stringify(ruw));
  } catch { /* geen opslag: dan volgende keer opnieuw testen */ }
}

/** Een 402 is geen kapotte sleutel maar geen tegoed: dat moet er zo staan. */
function slotTekst(result: string | undefined): string {
  if (result === 'Works') return 'Connected';
  if (result === 'Rate limited') return 'Rate limited';
  if (result?.includes('402')) return 'No credits';
  if (result === 'Broken' || result?.startsWith('Test failed')) return 'Failed';
  if (result === 'Testing…') return 'Testing…';
  if (result === 'Set') return 'Testing…';
  return result ?? 'Not checked';
}

export function ServerProviderSlots({ compact = false }: { compact?: boolean } = {}) {
  const slots = SERVER_SLOTS;
  const [status, setStatus] = useState<Record<string, string>>(() => ({ ...serverSlotTests }));
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
    const sync = () => setStatus(previous => ({ ...previous, ...serverSlotTests }));
    window.addEventListener(SERVER_SLOT_TEST_EVENT, sync);
    // 22 nov (Luka: "ik heb ze opnieuw op de VPS gezet en ze werkten, maar er staat Not
    // tested"): de zijbalk toonde alleen dát een sleutel er stond. Nu test hij ze zelf,
    // één voor één, hoogstens eens per half uur per Mac -- een test is een echte
    // modelaanroep van één woord.
    if (compact) {
      const vers = leesSlotCache();
      Object.assign(serverSlotTests, vers);
      sync();
      void (async () => {
        for (const [, key] of SERVER_SLOTS) {
          if (!active) return;
          if (vers[key]) continue;
          const uit = await testServerProviderKey(key).catch(() => ({ status: 'Test unavailable' }));
          if (uit.status === 'Test unavailable') continue;
          serverSlotTests[key] = uit.status;
          bewaarSlotCache(key, uit.status);
          window.dispatchEvent(new Event(SERVER_SLOT_TEST_EVENT));
        }
      })();
    }
    return () => {
      active = false;
      window.removeEventListener(SERVER_SLOT_TEST_EVENT, sync);
    };
  }, []);
  async function test(key: string) {
    setStatus(previous => ({ ...previous, [key]: 'Testing…' }));
    const result = await testServerProviderKey(key).catch(() => ({ status: 'Test unavailable' }));
    serverSlotTests[key] = result.status;
    window.dispatchEvent(new Event(SERVER_SLOT_TEST_EVENT));
  }
  if (compact) return <>{slots.map(([label, key]) => {
    const result = status[key];
    const failed = result === 'Broken' || result === 'Rate limited' || result?.startsWith('Test failed');
    return <CompactStatusRow key={key} label={label}
      icon={key.startsWith('OPENROUTER') ? 'Router' : key.startsWith('GROQ') ? 'Rocket' : 'Zap'}
      accent={key.startsWith('GROQ') ? '#ec4899' : '#f59e0b'}
      status={slotTekst(result)}
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
