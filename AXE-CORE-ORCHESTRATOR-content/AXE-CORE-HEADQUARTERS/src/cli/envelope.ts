/**
 * Machine-vriendelijke JSON-uitvoer. Geheimen worden gestript, nooit gedrukt.
 */

import { EXIT, type ExitCode } from './catalog';

const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|apikey|credential|private[_-]?key|authorization|^key$|bearer|cookie|srk)/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

export function redactArgs(args: string[]): string[] {
  const out = [...args];
  for (let i = 0; i < out.length; i += 1) {
    const a = out[i];
    if (a === '--config' || a.startsWith('--config=')) {
      /* pad mag blijven; inhoud van het bestand niet */
    }
    if (/^(--api-key|--token|--secret|--password)/i.test(a)) {
      out[i] = `${a.split('=')[0]}=[REDACTED]`;
      if (!a.includes('=') && out[i + 1]) out[i + 1] = '[REDACTED]';
    }
    if (/^(sk-|ghp_|xox|sbp_|eyJ)/.test(a)) out[i] = '[REDACTED]';
  }
  return out;
}

export interface CliEnvelope {
  ok: boolean;
  command: string;
  status: 'ok' | 'error' | 'blocked' | 'pending_approval' | 'not_found' | 'usage' | 'config';
  exit: ExitCode;
  result?: unknown;
  error?: string;
  approval?: { id: string; status: string; title?: string };
}

export function envelope(partial: Omit<CliEnvelope, 'ok' | 'exit'> & { exit?: ExitCode }): CliEnvelope {
  const status = partial.status;
  const exit = partial.exit ?? (
    status === 'ok' ? EXIT.ok
      : status === 'blocked' ? EXIT.blocked
        : status === 'pending_approval' ? EXIT.pending
          : status === 'not_found' ? EXIT.notFound
            : status === 'usage' ? EXIT.usage
              : status === 'config' ? EXIT.config
                : EXIT.error
  );
  return {
    ok: status === 'ok',
    command: partial.command,
    status,
    exit,
    result: partial.result === undefined ? undefined : redact(partial.result),
    error: partial.error,
    approval: partial.approval,
  };
}

export function printEnvelope(env: CliEnvelope, asJson: boolean, textLine?: string): string {
  if (asJson) return `${JSON.stringify(env)}\n`;
  if (env.status === 'ok') return `${textLine ?? 'ok'}\n`;
  return `${env.status}: ${env.error ?? env.command}\n`;
}
