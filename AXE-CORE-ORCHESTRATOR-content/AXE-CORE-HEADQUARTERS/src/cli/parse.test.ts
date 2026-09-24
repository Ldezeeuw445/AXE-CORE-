import { describe, expect, it } from 'vitest';
import { COMMANDS, helpText } from './catalog';
import { parseArgv, UsageError } from './parse';

describe('axe parse', () => {
  it('leest elk gedocumenteerd commando', () => {
    const voorbeelden: Record<string, string[]> = {
      help: ['help'],
      status: ['status', '--json'],
      'tasks list': ['tasks', 'list', '--status', 'queued'],
      'tasks create': ['tasks', 'create', '--title', 'T', '--goal', 'G', '--write'],
      'tasks show': ['tasks', 'show', 'abc'],
      'tasks update': ['tasks', 'update', 'abc', '--title', 'N', '--write'],
      'task wait': ['task', 'wait', 'abc'],
      'agents list': ['agents', 'list'],
      'agent run': ['agent', 'run', 'developer', 'fix the login'],
      'memory search': ['memory', 'search', 'copper'],
      'memory add': ['memory', 'add', '--text', 'note', '--write'],
      'northsea status': ['northsea', 'status'],
      'northsea deals': ['northsea', 'deals'],
      'northsea journal': ['northsea', 'journal'],
      'trading status': ['trading', 'status'],
      'cron list': ['cron', 'list'],
      'mcp list': ['mcp', 'list'],
      notify: ['notify', 'done'],
      report: ['report', 'Title', '--file', 'r.md'],
      'approvals list': ['approvals', 'list'],
      'node list': ['node', 'list'],
    };
    for (const spec of COMMANDS) {
      const argv = voorbeelden[spec.path];
      expect(argv, spec.path).toBeTruthy();
      const p = parseArgv(argv);
      expect(p.path).toBe(spec.path);
    }
  });

  it('accepteert --json op elk commando', () => {
    for (const spec of COMMANDS) {
      const p = parseArgv([...spec.path.split(' '), 'x', '--json']);
      expect(p.json, spec.path).toBe(true);
    }
  });

  it('tasks wait en agents run zijn aliassen', () => {
    expect(parseArgv(['tasks', 'wait', 'id-1']).path).toBe('task wait');
    expect(parseArgv(['agents', 'run', 'trading', 'scan gold']).path).toBe('agent run');
  });

  it('zet --write en --confirm', () => {
    expect(parseArgv(['notify', 'hi', '--write']).write).toBe(true);
    expect(parseArgv(['notify', 'hi', '--confirm']).write).toBe(true);
    expect(parseArgv(['notify', 'hi']).write).toBe(false);
  });

  it('weigert een onbekend commando', () => {
    expect(() => parseArgv(['explode'])).toThrow(UsageError);
  });

  it('help somt elk commando op', () => {
    const tekst = helpText();
    for (const spec of COMMANDS) {
      expect(tekst).toContain(spec.path.split(' ')[0]);
    }
  });
});
