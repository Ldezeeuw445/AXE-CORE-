import { describe, it, expect, beforeEach } from 'vitest';
import { flushAxeSpraakRij, kiesSpraakPad, neemSpraakRij, spraakRijLengte, stemlusVanVoice, zetSpraakSpreker } from './axeSpraakRij';

describe('axeSpraakRij', () => {
  beforeEach(() => { neemSpraakRij(); });

  it('job tijdens luisteren gaat in de rij, ack niet', () => {
    expect(kiesSpraakPad('On it.', 'listening', 'ack')).toBe('now');
    expect(spraakRijLengte()).toBe(0);
    expect(kiesSpraakPad('Deals done.', 'listening', 'job')).toBe('queue');
    expect(neemSpraakRij()).toEqual(['Deals done.']);
    expect(spraakRijLengte()).toBe(0);
  });

  it('job in rust praat nu', () => {
    expect(kiesSpraakPad('Done.', 'idle', 'job')).toBe('now');
    expect(spraakRijLengte()).toBe(0);
  });

  it('leest voiceStatus naar de stemlus', () => {
    expect(stemlusVanVoice('listening')).toBe('listening');
    expect(stemlusVanVoice('processing')).toBe('thinking');
    expect(stemlusVanVoice('idle', 'mic failed')).toBe('error');
  });

  it('flush praat de rij in één keer, daarna is hij leeg', () => {
    const gehoord: string[] = [];
    zetSpraakSpreker((t) => { gehoord.push(t); });
    expect(kiesSpraakPad('Eén.', 'listening', 'job')).toBe('queue');
    expect(kiesSpraakPad('Twee.', 'speaking', 'job')).toBe('queue');
    flushAxeSpraakRij();
    expect(gehoord).toEqual(['Eén. Twee.']);
    expect(spraakRijLengte()).toBe(0);
  });
});
