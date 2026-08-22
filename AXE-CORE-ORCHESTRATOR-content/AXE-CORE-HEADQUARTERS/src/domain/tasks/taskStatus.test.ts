/**
 * The regression this file exists for: `status != 'done'` counted every
 * finished task as open, because nothing ever writes `done`.
 */
import { describe, it, expect } from 'vitest';
import { isOpenTask, TERMINAL_TASK_STATUSES } from './taskStatus';

describe('isOpenTask', () => {
  it('does not count what the worker actually writes when it finishes', () => {
    // The exact shape of the lock-screen bug: these three made up all 10 rows.
    expect(isOpenTask('completed')).toBe(false);
    expect(isOpenTask('failed')).toBe(false);
    expect(isOpenTask('cancelled')).toBe(false);
  });

  it('still counts the legal-but-unused done', () => {
    expect(isOpenTask('done')).toBe(false);
  });

  it('counts work that is genuinely waiting', () => {
    for (const s of ['pending', 'queued', 'planning', 'in_progress', 'running',
      'blocked', 'waiting_approval', 'approved', 'verifying', 'retrying']) {
      expect(isOpenTask(s), `${s} should count as open`).toBe(true);
    }
  });

  it('treats a rejected task as finished, not as waiting on Luka', () => {
    expect(isOpenTask('rejected')).toBe(false);
  });

  it('is case-insensitive, so a capitalised write does not resurrect a task', () => {
    expect(isOpenTask('Completed')).toBe(false);
    expect(isOpenTask('WAITING_APPROVAL')).toBe(true);
  });

  it('errs towards showing a row it cannot classify, never towards hiding it', () => {
    expect(isOpenTask(null)).toBe(true);
    expect(isOpenTask('')).toBe(true);
    expect(isOpenTask('some_future_status')).toBe(true);
  });

  it('lists every terminal status exactly once', () => {
    expect(new Set(TERMINAL_TASK_STATUSES).size).toBe(TERMINAL_TASK_STATUSES.length);
  });
});
