import { describe, it, expect } from 'vitest';
import { resolveLook, isLook, otherLook, DEFAULT_LOOK } from './look';

describe('resolveLook', () => {
  it('laat de cloud winnen van dit apparaat', () => {
    // Wat je op je Mac koos hoort ook op je telefoon te gelden.
    expect(resolveLook({ cloud: 'glass', local: 'black' })).toBe('glass');
  });

  it('valt terug op dit apparaat als de cloud niets weet', () => {
    expect(resolveLook({ cloud: undefined, local: 'glass' })).toBe('glass');
  });

  it('negeert een onbekende waarde in plaats van hem door te geven', () => {
    // Een oude naam of een typefout mag geen stand opleveren waar geen stijl
    // bij hoort -- dat geeft een scherm zonder achtergrond en geen enkele
    // aanwijzing waarom.
    expect(resolveLook({ cloud: 'neon', local: 'glass' })).toBe('glass');
    expect(resolveLook({ cloud: 'neon', local: 'ook-niet' })).toBe(DEFAULT_LOOK);
  });

  it('kiest glas als niemand iets zegt', () => {
    // Allebei de standen zijn dezelfde plaat, alleen ander materiaal. Er valt
    // dus niets te beschermen met een behoudende standaard, en dan hoort het
    // te zijn wat er het beste uitziet.
    expect(resolveLook({})).toBe('glass');
  });

  it('trapt niet in waarden die geen string zijn', () => {
    expect(resolveLook({ cloud: true, local: 0 })).toBe(DEFAULT_LOOK);
    expect(resolveLook({ cloud: { look: 'glass' } })).toBe(DEFAULT_LOOK);
  });
});

describe('isLook', () => {
  it('kent precies de twee standen', () => {
    expect(isLook('black')).toBe(true);
    expect(isLook('glass')).toBe(true);
    expect(isLook('Glass')).toBe(false);
    expect(isLook(null)).toBe(false);
  });
});

describe('otherLook', () => {
  it('schakelt heen en weer', () => {
    expect(otherLook('black')).toBe('glass');
    expect(otherLook('glass')).toBe('black');
  });
});
