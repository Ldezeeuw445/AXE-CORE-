import { describe, expect, it } from 'vitest';
import { kiesOkStrook } from './notchPeeks';

const g = (id: string, gevaarlijk = false) => ({ id, titel: `Run ${id}`, detail: 'device:mini claude_code.run', gevaarlijk });

describe('kiesOkStrook', () => {
  it('toont de bovenste goedkeuring als de notch dicht is', () => {
    const s = kiesOkStrook([g('a'), g('b'), g('c')], false, false);
    expect(s).toMatchObject({ id: 'a', titel: 'Waiting on you', meer: 2, gevaarlijk: false });
    expect(s?.tekst).toContain('claude_code.run');
  });
  it('niets als open, als een peek loopt, of als er niets wacht', () => {
    expect(kiesOkStrook([g('a')], true, false)).toBeNull();
    expect(kiesOkStrook([g('a')], false, true)).toBeNull();
    expect(kiesOkStrook([], false, false)).toBeNull();
  });
  it('trade of betaling: alleen openen, nooit hier goedkeuren', () => {
    expect(kiesOkStrook([g('t', true)], false, false)).toMatchObject({ gevaarlijk: true, titel: 'Open in AXE CORE' });
  });
});
