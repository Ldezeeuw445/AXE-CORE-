import { describe, expect, it } from 'vitest';
import {
  DEVICE_SCOPED_TOOLS,
  isDeviceScopedTool,
  needsApproval,
  tierFor,
} from './riskTiers';

describe('Personal Computer Use risk contract', () => {
  it('keeps observation automatic and input-changing actions gated', () => {
    expect(tierFor('screen.observe')).toBe('observe');
    expect(tierFor('screen.displays')).toBe('observe');
    expect(tierFor('pointer.position')).toBe('observe');
    expect(needsApproval('screen.observe')).toBe(false);

    expect(tierFor('pointer.move')).toBe('safe_execute');
    expect(tierFor('app.open')).toBe('safe_execute');
    expect(needsApproval('pointer.move')).toBe(true);

    expect(tierFor('pointer.click')).toBe('write');
    expect(tierFor('pointer.drag')).toBe('write');
    expect(tierFor('keyboard.type')).toBe('write');
    expect(tierFor('keyboard.key')).toBe('write');
    expect(needsApproval('keyboard.type', true)).toBe(true);
  });

  it('treats Mac GUI/file/camera tools as device-scoped, never repo-scoped', () => {
    for (const tool of [
      'personal.files.list',
      'camera.snapshot',
      'computer.permissions',
      'screen.observe',
      'pointer.move',
      'pointer.click',
      'keyboard.type',
      'app.open',
      'window.list',
    ]) {
      expect(DEVICE_SCOPED_TOOLS.has(tool)).toBe(true);
      expect(isDeviceScopedTool(tool)).toBe(true);
    }
    expect(isDeviceScopedTool('git.status')).toBe(false);
    expect(isDeviceScopedTool('files.write')).toBe(false);
  });
});
