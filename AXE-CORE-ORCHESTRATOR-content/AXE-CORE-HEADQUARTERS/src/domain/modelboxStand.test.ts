import { describe, expect, it } from 'vitest';
import { modelboxUitHealth } from './modelboxStand';

describe('Ollama box in VPS Health', () => {
  it('de meting van de VPS is de waarheid', () => {
    expect(modelboxUitHealth({ state: 'ok', models: 12 })).toEqual({ status: 'online', detail: 'ollama · 12 models · via VPS' });
    expect(modelboxUitHealth({ state: 'fail', detail: 'HTTP 502' })).toEqual({ status: 'offline', detail: 'HTTP 502 · measured by VPS' });
  });

  it('een oude API zonder ollama_box geeft niets, dan meet de browser', () => {
    expect(modelboxUitHealth(undefined)).toBeNull();
    expect(modelboxUitHealth('ok')).toBeNull();
  });
});
