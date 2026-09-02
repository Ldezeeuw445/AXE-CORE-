import { describe, it, expect } from 'vitest';
import {
  validatePreset, upsertPreset, removePreset, allPresets, applyPreset,
  BUILT_IN_PRESETS, MAX_RISK_PER_TRADE, type RiskPreset,
} from './riskPresets';

const custom = (id: string, name = id): RiskPreset => ({
  id, name, updatedAt: '2026-08-27T00:00:00.000Z',
  profile: { ...BUILT_IN_PRESETS[0].profile },
});

describe('validatePreset', () => {
  it('passes every built-in — they are the reference', () => {
    for (const p of BUILT_IN_PRESETS) {
      expect(validatePreset(p.profile, p.name), p.name).toEqual([]);
    }
  });

  it('refuses a typo instead of quietly clamping it', () => {
    // 50 where 0.5 was meant. A clamp hides this until the size looks wrong on
    // a live account.
    const bad = validatePreset({ ...BUILT_IN_PRESETS[0].profile, riskPerTradePct: 50 });
    expect(bad.map(p => p.field)).toContain('riskPerTradePct');
    expect(bad[0].reason).toMatch(/typo/i);
  });

  it('refuses zero or negative risk', () => {
    for (const v of [0, -0.01]) {
      expect(validatePreset({ ...BUILT_IN_PRESETS[0].profile, riskPerTradePct: v }).length).toBeGreaterThan(0);
    }
  });

  it('accepts risk right at the ceiling', () => {
    expect(validatePreset({ ...BUILT_IN_PRESETS[0].profile, riskPerTradePct: MAX_RISK_PER_TRADE })).toEqual([]);
  });

  it('catches a daily halt that can never fire', () => {
    // Total drawdown trips first, every time, so the daily limit is decoration.
    const problems = validatePreset({
      ...BUILT_IN_PRESETS[1].profile, maxDailyLossPct: 0.2, maxDrawdownPct: 0.09,
    });
    expect(problems.some(p => /never trigger/i.test(p.reason))).toBe(true);
  });

  it('insists on a name when one is being set', () => {
    expect(validatePreset(BUILT_IN_PRESETS[0].profile, '   ').map(p => p.field)).toContain('name');
    // Not checked when no name is supplied — editing numbers alone is fine.
    expect(validatePreset(BUILT_IN_PRESETS[0].profile).map(p => p.field)).not.toContain('name');
  });

  it('bounds the confidence floor to a fraction', () => {
    expect(validatePreset({ ...BUILT_IN_PRESETS[0].profile, minConfidence: 65 }).length).toBeGreaterThan(0);
  });
});

describe('the preset list', () => {
  it('replaces by id rather than accumulating duplicates', () => {
    const a = custom('p1', 'first');
    const list = upsertPreset([a], { ...a, name: 'renamed' });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('renamed');
  });

  it('puts the newest first', () => {
    const list = upsertPreset([custom('p1')], custom('p2'));
    expect(list[0].id).toBe('p2');
  });

  it('never lets a built-in be deleted', () => {
    const withCustom = [...BUILT_IN_PRESETS, custom('mine')];
    const after = removePreset(withCustom, BUILT_IN_PRESETS[0].id);
    expect(after.some(p => p.id === BUILT_IN_PRESETS[0].id)).toBe(true);
  });

  it('does delete a custom one', () => {
    expect(removePreset([custom('mine')], 'mine')).toEqual([]);
  });

  it('always offers the built-ins, without duplicating them', () => {
    const list = allPresets([...BUILT_IN_PRESETS, custom('mine')]);
    const ids = list.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BUILT_IN_PRESETS) expect(ids).toContain(b.id);
    expect(ids).toContain('mine');
  });
});

describe('applyPreset', () => {
  it('copies the numbers instead of linking to them', () => {
    // A link means editing a preset silently changes risk on every account
    // using it, and finding that out during a drawdown is not the moment.
    const preset = custom('p1');
    const applied = applyPreset(preset);
    applied.riskPerTradePct = 0.99;
    expect(preset.profile.riskPerTradePct).not.toBe(0.99);
  });

  it('stamps when it was applied', () => {
    expect(applyPreset(custom('p1')).updatedAt).toBeTruthy();
  });
});
