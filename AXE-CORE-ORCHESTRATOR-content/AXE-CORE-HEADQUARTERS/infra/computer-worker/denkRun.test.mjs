import { describe, expect, it } from 'vitest';
import { denkArgv } from './denkRun.mjs';

describe('denk-run', () => {
  it('codex: alleen lezen, lege map, alleen het laatste antwoord', () => {
    const [bin, argv, uit] = denkArgv('codex.run', 'kies', '/tmp/x');
    expect(bin).toBe('codex');
    expect(argv).toEqual(expect.arrayContaining(['-s', 'read-only', '-C', '/tmp/x', '--skip-git-repo-check']));
    expect(argv).not.toContain('workspace-write');
    expect(uit).toBe('/tmp/x/antwoord.txt');
  });

  it('claude: geen schrijf- of shellrechten', () => {
    const [, argv] = denkArgv('claude_code.run', 'kies', '/tmp/x');
    expect(argv).not.toContain('--allowedTools');
    expect(argv).not.toContain('acceptEdits');
  });

  it('cursor: zonder --force', () => {
    const [, argv] = denkArgv('cursor.run', 'kies', '/tmp/x');
    expect(argv).not.toContain('--force');
  });
});
