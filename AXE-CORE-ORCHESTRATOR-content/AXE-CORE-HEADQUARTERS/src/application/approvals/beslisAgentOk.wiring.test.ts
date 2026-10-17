import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bron = readFileSync(join(__dirname, 'beslisAgentOk.ts'), 'utf8');

describe('beslisAgentOk praat met de bestaande approvals-API', () => {
  it('beslist via decideDurableTaskApproval, nooit via een LLM-run', () => {
    expect(bron).toContain('decideDurableTaskApproval');
    expect(bron).toContain('listPendingApprovals');
    expect(bron).not.toContain('startAxeJobs');
  });
});
