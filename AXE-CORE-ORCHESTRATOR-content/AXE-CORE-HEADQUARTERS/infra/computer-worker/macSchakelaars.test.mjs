import { describe, expect, it } from 'vitest';
import { SCHAKELAARS, schakel } from './macSchakelaars.mjs';

describe('mac.schakel', () => {
  it('kent alleen vaste woorden', async () => {
    expect(SCHAKELAARS).toContain('wakker');
    await expect(schakel('do shell script "rm -rf ~"')).rejects.toThrow(/kent alleen/);
    await expect(schakel('')).rejects.toThrow(/kent alleen/);
  });
});
