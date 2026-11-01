import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const checks: Array<[string, string]> = [
  ['MCPCenter.tsx', 'data-axe-mcp="v3"'],
  ['Infrastructure.tsx', 'data-axe-infrastructure="v3"'],
  ['TerminalsPage.tsx', 'data-axe-terminals="v3"'],
  ['TableEditor.tsx', 'data-axe-table-editor="v3"'],
  ['CronManager.tsx', 'data-axe-cron-manager="v3"'],
  ['ControlPlane.tsx', 'data-axe-control-plane="v3"'],
];

describe('MCP / Infra / Terminals / Table / Cron / Control v3', () => {
  it('all tagged', () => {
    for (const [file, needle] of checks) {
      expect(readFileSync(resolve(__dirname, file), 'utf8'), file).toContain(needle);
    }
  });
});
