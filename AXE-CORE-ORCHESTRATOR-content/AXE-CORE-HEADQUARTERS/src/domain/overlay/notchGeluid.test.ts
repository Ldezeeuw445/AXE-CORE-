import { describe, expect, it } from 'vitest';
import { geluidVoor, type Peek } from './notchPeeks';

const p = (soort: Peek['soort']): Peek => ({ id: soort, soort, titel: '', tekst: '', tab: 'home' });

describe('geluidVoor', () => {
  it('vraag wint van klaar', () => {
    expect(geluidVoor([p('taak-klaar'), p('claude-wacht')], 5, true)).toBe('vraag');
    expect(geluidVoor([p('claude-klaar')], 5, true)).toBe('klaar');
  });
  it('stil op de Mac waar je niet zit, en als hij uit staat', () => {
    expect(geluidVoor([p('goedkeuring')], 600, true)).toBeNull();
    expect(geluidVoor([p('goedkeuring')], null, true)).toBe('vraag');
    expect(geluidVoor([p('goedkeuring')], 1, false)).toBeNull();
    expect(geluidVoor([], 1, true)).toBeNull();
  });
});
