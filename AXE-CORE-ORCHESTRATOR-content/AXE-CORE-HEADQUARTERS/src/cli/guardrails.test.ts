import { describe, expect, it } from 'vitest';
import { decideGuard, inspectApproval, inspectBlocked } from './guardrails';

describe('axe guardrails', () => {
  it('blokkeert e-mail en outbound zonder override', () => {
    for (const raw of [
      'agent run northsea verstuur dit naar de koper',
      'notify please send email to buyer@x.com',
      'resend the outbound message',
    ]) {
      const d = decideGuard({ path: 'agent run', raw, write: true });
      expect(d.kind, raw).toBe('blocked');
      if (d.kind === 'blocked') expect(d.code).toBe('email');
    }
  });

  it('blokkeert de drie NorthSea auto-send vlaggen', () => {
    for (const flag of ['auto_send_qualification', 'auto_reply_nonbinding', 'auto_send_followups']) {
      const d = inspectBlocked(`set ${flag}=true`);
      expect(d?.kind, flag).toBe('blocked');
      if (d?.kind === 'blocked') expect(d.code).toBe('northsea_flag');
      const again = decideGuard({ path: 'northsea status', raw: flag, write: true });
      expect(again.kind).toBe('blocked');
    }
  });

  it('blokkeert mergen naar orchestrator', () => {
    const d = decideGuard({ path: 'agent run', raw: 'git push origin HEAD:orchestrator', write: true });
    expect(d.kind).toBe('blocked');
    if (d.kind === 'blocked') expect(d.code).toBe('merge');
  });

  it('blokkeert wissen', () => {
    const d = decideGuard({ path: 'agent run', raw: 'delete all core_tasks', write: true });
    expect(d.kind).toBe('blocked');
    if (d.kind === 'blocked') expect(d.code).toBe('delete');
  });

  it('--write is geen override voor een blokkade', () => {
    const d = decideGuard({
      path: 'notify',
      raw: 'notify send email now --write',
      write: true,
    });
    expect(d.kind).toBe('blocked');
  });

  it('schrijfcommando zonder --write wordt geweigerd', () => {
    const d = decideGuard({ path: 'notify', raw: 'notify hello', write: false });
    expect(d.kind).toBe('need_write');
  });

  it('lezen mag zonder vlag', () => {
    expect(decideGuard({ path: 'status', raw: 'status', write: false }).kind).toBe('allow');
    expect(decideGuard({ path: 'northsea deals', raw: 'northsea deals', write: false }).kind).toBe('allow');
  });

  it('agent run die het systeem raakt vraagt goedkeuring', () => {
    expect(inspectApproval('git push the feature branch')).toMatch(/system/);
    const d = decideGuard({
      path: 'agent run',
      raw: 'agent run developer git push the feature branch',
      write: true,
    });
    expect(d.kind).toBe('need_approval');
  });
});
