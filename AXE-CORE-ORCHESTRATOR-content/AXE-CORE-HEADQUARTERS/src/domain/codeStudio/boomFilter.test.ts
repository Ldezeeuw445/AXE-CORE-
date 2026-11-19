import { describe, expect, it } from 'vitest';
import { zichtbaarInBoom } from './boomFilter';

describe('zichtbaarInBoom', () => {
  it('verbergt backup- en rollback-mappen en macOS-ruis', () => {
    expect(zichtbaarInBoom('_backup_20261012')).toBe(false);
    expect(zichtbaarInBoom('_rollback_tauri')).toBe(false);
    expect(zichtbaarInBoom('.DS_Store')).toBe(false);
  });
  it('laat gewone bestanden en mappen staan', () => {
    expect(zichtbaarInBoom('src')).toBe(true);
    expect(zichtbaarInBoom('backup-plan.md')).toBe(true);
    expect(zichtbaarInBoom('.env.example')).toBe(true);
  });
});
