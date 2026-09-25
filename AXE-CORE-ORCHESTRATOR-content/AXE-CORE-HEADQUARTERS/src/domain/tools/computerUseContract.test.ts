import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEVICE_SCOPED_TOOLS, tierFor } from './riskTiers';
import '@/domain/tools/registerComputerCatalog';
import { toolDefs } from './toolSchemas';

describe('Personal Computer Use end-to-end contract', () => {
  it('every device-scoped tool is risk-classified and implemented by the Mac worker', () => {
    const worker = readFileSync(
      path.resolve(new URL('.', import.meta.url).pathname, '../../../infra/computer-worker/worker.mjs'),
      'utf8',
    );
    expect(DEVICE_SCOPED_TOOLS.size).toBeGreaterThanOrEqual(15);
    for (const tool of DEVICE_SCOPED_TOOLS) {
      expect(() => tierFor(tool)).not.toThrow();
      expect(worker).toContain(`'${tool}'`);
    }
  });

  it('OS execution worker implements the critical write/developer tools it advertises', () => {
    const worker = readFileSync(
      path.resolve(new URL('.', import.meta.url).pathname, '../../../infra/computer-worker/worker.mjs'),
      'utf8',
    );
    for (const tool of [
      'files.write',
      'files.delete',
      'git.create_branch',
      'git.commit',
      'git.push',
      'git.merge',
      'git.pr_open',
      'terminal.free',
      'claude_code.run',
      'codex.run',
      'cursor.run',
    ]) {
      expect(worker).toContain(`case '${tool}'`);
    }
    expect(worker).toMatch(/mayLeaveProtected\s*=\s*tool === 'git\.create_branch'/);
    expect(worker).toMatch(/git\.commit needs explicit paths/);
  });

  it('native computer tool schemas expose device and GUI arguments', () => {
    const defs = toolDefs();
    const read = defs.find(d => d.name === 'computer_read');
    const run = defs.find(d => d.name === 'computer_run');
    expect(read).toBeTruthy();
    expect(run).toBeTruthy();

    const rp = read!.parameters.properties;
    expect(rp).toHaveProperty('device');
    expect(rp).toHaveProperty('prompt');
    expect(rp).toHaveProperty('display_index');

    const wp = run!.parameters.properties;
    for (const key of ['device', 'x', 'y', 'image_x', 'image_y', 'from_x', 'from_y', 'to_x', 'to_y', 'from_image_x', 'from_image_y', 'to_image_x', 'to_image_y', 'display_index', 'text', 'key', 'modifiers', 'app']) {
      expect(wp).toHaveProperty(key);
    }
  });
});
