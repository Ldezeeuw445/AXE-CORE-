import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  budgetLabel,
  budgetPct,
  seatStand,
  spreadBalken,
  vensterTekst,
  type UsageSpread,
} from './usageCredits';

describe('usageCredits weergave', () => {
  it('zet under/met/over om in letters, niet in een vlak', () => {
    expect(budgetLabel('met')).toEqual({ toon: 'ok', tekst: 'On budget' });
    expect(budgetLabel('under')).toEqual({ toon: 'warn', tekst: 'Under budget' });
    expect(budgetLabel('over')).toEqual({ toon: 'bad', tekst: 'Over budget' });
    expect(budgetPct(3, 3, 3)).toBe(100);
    expect(budgetPct(1, 2, 3)).toBeCloseTo(100 / 3);
    expect(budgetPct(5, 2, 3)).toBe(100);
  });

  it('zegt wanneer het 5-uursvenster vrijkomt', () => {
    const nu = Date.parse('2026-10-28T12:00:00Z');
    expect(vensterTekst(null, true, nu)).toBe('Free');
    expect(vensterTekst('2026-10-28T14:00:00Z', false, nu)).toBe('Frees in 2h');
    expect(vensterTekst('2026-10-28T12:20:00Z', false, nu)).toBe('Frees in 20m');
  });

  it('houdt een logged-out stoel en een vrije VPS uit elkaar', () => {
    expect(seatStand({ window_open: true, rate_limited: false, logged_in: false, seen: true, kind: 'paid' }))
      .toEqual({ toon: 'bad', tekst: 'Logged out' });
    expect(seatStand({ window_open: false, rate_limited: true, logged_in: true, seen: true, kind: 'paid' }))
      .toEqual({ toon: 'warn', tekst: 'In window' });
    expect(seatStand({ window_open: true, rate_limited: false, logged_in: null, seen: false, kind: 'grok' }))
      .toEqual({ toon: 'muted', tekst: 'Not seen' });
    expect(seatStand({ window_open: true, rate_limited: false, logged_in: true, seen: true, kind: 'free-vps' }))
      .toEqual({ toon: 'info', tekst: 'Free capacity' });
  });

  it('verdeelt de spreidingsbalk over de betaalde stoelen', () => {
    const spread: UsageSpread = {
      even: false,
      delta: 4,
      paid_today: 5,
      target_each: 1,
      note: 'Uneven',
      seats: [
        { id: 'claude2', sessions_today: 5, share: 1 },
        { id: 'claude3', sessions_today: 0, share: 0 },
      ],
    };
    const balken = spreadBalken(spread);
    expect(balken[0]).toEqual({ id: 'claude2', sessions: 5, pct: 100 });
    expect(balken[1]?.pct).toBe(0);
  });
});

describe('Settings houdt Subscriptions én Usage & Credits', () => {
  it('zet Usage & Credits naast Subscriptions, zonder die te vervangen', () => {
    const settings = readFileSync(new URL('../presentation/pages/SettingsPage.tsx', import.meta.url), 'utf8');
    expect(settings).toMatch(/id: 'accounts'/);
    expect(settings).toMatch(/label: 'Subscriptions'/);
    expect(settings).toMatch(/CodingSeatsSection/);
    expect(settings).toMatch(/id: 'usage'/);
    expect(settings).toMatch(/label: 'Usage & Credits'/);
    expect(settings).toMatch(/UsageCreditsSection/);
    expect(settings).toMatch(/useState\('accounts'\)/);
  });

  it('de view gebruikt SectieBlok en KaartRaster, geen 1fr-rek', () => {
    const view = readFileSync(new URL('../presentation/components/settings/UsageCreditsSection.tsx', import.meta.url), 'utf8');
    expect(view).toMatch(/SectieBlok/);
    expect(view).toMatch(/KaartRaster/);
    expect(view).toMatch(/<Kaart/);
    expect(view).not.toMatch(/1fr/);
    expect(view).not.toMatch(/STAT_ROW/);
    expect(view).toMatch(/usageCreditsSnapshot/);
  });
});

describe('migratie core_usage_config', () => {
  it('zet RLS, core_owner, geen anon, en past niets live toe', () => {
    const sql = readFileSync(resolve('supabase/migrations/20261028133000_core_usage_config.sql'), 'utf8');
    expect(sql).toMatch(/create table if not exists public\.core_usage_config/i);
    expect(sql).toMatch(/alter table public\.core_usage_config enable row level security/i);
    expect(sql).toMatch(/public\.core_owner\(\)/);
    expect(sql).toContain('acff7a12-1111-481d-a7a9-cc07583b8069');
    expect(sql).toMatch(/revoke all on table public\.core_usage_config from anon/i);
    expect(sql).not.toMatch(/grant [^;]*on table public\.core_usage_config[^;]*to anon/i);
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.core_usage_config to authenticated/i);
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.core_usage_config to service_role/i);
    expect(sql).toMatch(/NIET toepassen op live/i);
  });
});
