/**
 * Settings → Usage & Credits: sessies per stoel, app-budgetten, spreiding.
 *
 * Leest GET /usage-credits. Subscriptions blijft de login-kaarten; dit is de
 * teller ernaast. Matzwarte kaarten, gelijke maat per raster, inhoud bepaalt
 * de hoogte.
 */
import { useEffect, useState } from 'react';
import { Kaart, KaartRaster, SectieBlok } from '@/presentation/components/layout/tabMaatstaf';
import { geleden } from '@/presentation/components/settings/StatusKaart';
import {
  budgetLabel,
  budgetPct,
  seatAccent,
  seatStand,
  spreadBalken,
  vensterTekst,
  type UsageCreditsSnapshot,
  type UsageSeat,
} from '@/domain/usageCredits';
import { usageCreditsSnapshot } from '@/infrastructure/gateways/axeCoreApiService';

const TOON: Record<string, string> = {
  ok: 'var(--success)',
  bad: 'var(--error)',
  warn: 'var(--warning)',
  info: 'var(--accent-cyan)',
  muted: 'var(--text-muted)',
};

function Stand({ toon, tekst }: { toon: string; tekst: string }) {
  const kleur = TOON[toon] || TOON.muted;
  return (
    <span style={{ color: kleur, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {tekst}
    </span>
  );
}

function Cijfer({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>{waarde}</div>
    </div>
  );
}

function Balk({ pct, kleur }: { pct: number; kleur: string }) {
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <i className="mt-2 block h-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <em className="block h-full" style={{ width: `${w}%`, background: kleur }} />
    </i>
  );
}

function stoelRol(stoel: UsageSeat): string {
  const delen = [
    stoel.notes,
    stoel.machine ? `on ${stoel.machine}` : null,
    stoel.email,
    stoel.current_task ? `busy: ${stoel.current_task}` : null,
  ].filter(Boolean);
  return delen.join(' · ') || stoel.family || stoel.id;
}

export function UsageCreditsSection() {
  const [data, setData] = useState<UsageCreditsSnapshot | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const laad = () => {
      void usageCreditsSnapshot()
        .then((snap) => {
          if (!alive) return;
          setData(snap);
          setFout(null);
        })
        .catch((e: unknown) => {
          if (alive) setFout(e instanceof Error ? e.message : String(e));
        });
    };
    laad();
    const timer = window.setInterval(laad, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const spread = data?.spread;
  const balken = spread ? spreadBalken(spread) : [];
  const appsMet = data ? `${data.apps_met}/${data.apps_total}` : '—';

  return (
    <div className="flex flex-col gap-6">
      {fout && <p className="axe-agentkaart-melding">{fout}</p>}

      <KaartRaster>
        <Kaart titel="Paid seats today">
          <p className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {spread ? String(spread.paid_today) : '—'}
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Sessions on Claude / ChatGPT / Cursor
          </p>
        </Kaart>
        <Kaart titel="Spread">
          <Stand toon={spread?.even ? 'ok' : spread ? 'warn' : 'muted'} tekst={spread ? (spread.even ? 'Even' : 'Uneven') : 'Checking'} />
          <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>{spread?.note || 'Waiting for counts.'}</p>
        </Kaart>
        <Kaart titel="App budgets">
          <p className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{appsMet}</p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Apps inside their daily range</p>
        </Kaart>
      </KaartRaster>

      <SectieBlok titel="SEATS" extra={<span className="font-mono text-[10.5px]" style={{ color: 'var(--text-muted)' }}>today / week · 5-hour window</span>}>
        <KaartRaster ruim>
          {(data?.seats ?? []).map((stoel) => {
            const stand = seatStand(stoel);
            const accent = seatAccent(stoel.family);
            const last = stoel.last_failure_at || stoel.last_limit_at;
            return (
              <Kaart key={stoel.id} titel={stoel.label} actie={<Stand toon={stand.toon} tekst={stand.tekst} />}>
                <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }} title={stoelRol(stoel)}>{stoelRol(stoel)}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Cijfer label="Today" waarde={`${stoel.sessions_today}/${stoel.sessions_max || '—'}`} />
                  <Cijfer label="This week" waarde={String(stoel.sessions_week)} />
                  <Cijfer label="Window" waarde={vensterTekst(stoel.window_free_at, stoel.window_open)} />
                  <Cijfer label="Last limit" waarde={last ? geleden(Date.parse(last)) : '—'} />
                </div>
                <Balk pct={budgetPct(stoel.sessions_today, stoel.sessions_min, stoel.sessions_max)} kleur={accent} />
                {stoel.last_failure && (
                  <p className="text-[11px] mt-2" style={{ color: 'var(--warning)' }} title={stoel.last_failure}>
                    {stoel.last_failure}
                  </p>
                )}
              </Kaart>
            );
          })}
        </KaartRaster>
      </SectieBlok>

      <SectieBlok titel="APP BUDGETS" extra={<span className="font-mono text-[10.5px]" style={{ color: 'var(--text-muted)' }}>indicative sessions/day</span>}>
        <KaartRaster>
          {(data?.apps ?? []).map((app) => {
            const stand = budgetLabel(app.stand);
            const range = app.sessions_min === app.sessions_max
              ? String(app.sessions_max)
              : `${app.sessions_min}–${app.sessions_max}`;
            return (
              <Kaart key={app.id} titel={app.label} actie={<Stand toon={stand.toon} tekst={stand.tekst} />}>
                <div className="grid grid-cols-2 gap-3">
                  <Cijfer label="Today" waarde={`${app.sessions_today}/${range}`} />
                  <Cijfer label="This week" waarde={String(app.sessions_week)} />
                </div>
                <Balk
                  pct={budgetPct(app.sessions_today, app.sessions_min, app.sessions_max)}
                  kleur={stand.toon === 'ok' ? 'var(--success)' : stand.toon === 'bad' ? 'var(--error)' : 'var(--warning)'}
                />
              </Kaart>
            );
          })}
        </KaartRaster>
      </SectieBlok>

      <SectieBlok titel="SPREAD" extra={<span className="font-mono text-[10.5px]" style={{ color: 'var(--text-muted)' }}>paid seats only</span>}>
        <Kaart titel="Are the seats sharing the load?">
          <Stand toon={spread?.even ? 'ok' : spread ? 'warn' : 'muted'} tekst={spread ? (spread.even ? 'Even' : 'Uneven') : 'Checking'} />
          <p className="text-[12px] mt-2" style={{ color: 'var(--text-secondary)' }}>{spread?.note}</p>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            {balken.map((b) => (
              <span
                key={b.id}
                title={`${b.id}: ${b.sessions}`}
                style={{
                  width: `${Math.max(b.pct, b.sessions > 0 ? 2 : 0)}%`,
                  background: seatAccent(
                    b.id.startsWith('claude') ? 'claude'
                      : b.id.startsWith('codex') ? 'chatgpt'
                        : b.id.startsWith('cursor') ? 'cursor' : 'vps',
                  ),
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
            {balken.map((b) => (
              <span key={b.id}>{b.id} {b.sessions}</span>
            ))}
          </div>
        </Kaart>
      </SectieBlok>
    </div>
  );
}
