import { describe, expect, it } from 'vitest';
import { EXIT } from './catalog';
import { envelope, printEnvelope, redact, redactArgs } from './envelope';

describe('axe JSON-uitvoer', () => {
  it('elke status heeft een vast exitcode', () => {
    expect(envelope({ command: 'status', status: 'ok' }).exit).toBe(EXIT.ok);
    expect(envelope({ command: 'x', status: 'blocked', error: 'no' }).exit).toBe(EXIT.blocked);
    expect(envelope({ command: 'x', status: 'pending_approval' }).exit).toBe(EXIT.pending);
    expect(envelope({ command: 'x', status: 'not_found' }).exit).toBe(EXIT.notFound);
    expect(envelope({ command: 'x', status: 'usage' }).exit).toBe(EXIT.usage);
    expect(envelope({ command: 'x', status: 'config' }).exit).toBe(EXIT.config);
    expect(envelope({ command: 'x', status: 'error' }).exit).toBe(EXIT.error);
  });

  it('stript geheimen uit resultaat en args', () => {
    const hidden = redact({
      apiKey: 'sk-live-secret',
      token: 'abc',
      nested: { Authorization: 'Bearer x', ok: 1 },
    }) as Record<string, unknown>;
    expect(hidden.apiKey).toBe('[REDACTED]');
    expect(hidden.token).toBe('[REDACTED]');
    expect((hidden.nested as Record<string, unknown>).Authorization).toBe('[REDACTED]');
    expect((hidden.nested as Record<string, unknown>).ok).toBe(1);

    const args = redactArgs(['--api-key', 'sk-abc', 'ghp_xxx', 'status']);
    expect(args.join(' ')).not.toContain('sk-abc');
    expect(args.join(' ')).not.toContain('ghp_xxx');
    expect(JSON.stringify(args)).toContain('[REDACTED]');
  });

  it('--json is één object, geen geheimen', () => {
    const env = envelope({
      command: 'status',
      status: 'ok',
      result: { api_key: 'secret', health: 'ok' },
    });
    const tekst = printEnvelope(env, true);
    const parsed = JSON.parse(tekst) as { ok: boolean; result: { api_key: string; health: string } };
    expect(parsed.ok).toBe(true);
    expect(parsed.result.api_key).toBe('[REDACTED]');
    expect(parsed.result.health).toBe('ok');
  });
});
