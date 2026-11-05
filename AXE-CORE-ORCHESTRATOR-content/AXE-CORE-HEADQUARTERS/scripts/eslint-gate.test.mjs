import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findingsFromEslintJson, loadBaseline, nieuweVondsten, normBericht, normBestand,
  poortTekst, serializeBaseline, vinger, vondstRegel,
} from './eslint-gate.mjs';

describe('eslint-gate', () => {
  it('normt absolute paden naar src/...', () => {
    assert.equal(
      normBestand('/Users/luka/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src/foo.ts'),
      'src/foo.ts',
    );
    assert.equal(normBestand('src/foo.ts'), 'src/foo.ts');
  });

  it('neemt een tweede identieke vondst in hetzelfde bestand mee als nieuw', () => {
    const huidig = [
      { file: 'src/a.ts', rule: 'no-empty', message: 'Empty block statement.', line: 4 },
      { file: 'src/a.ts', rule: 'no-empty', message: 'Empty block statement.', line: 9 },
    ];
    const basis = loadBaseline(serializeBaseline([huidig[0]]));
    const nieuw = nieuweVondsten(huidig, basis);
    assert.equal(nieuw.length, 1);
    assert.equal(nieuw[0].line, 9);
  });

  it('laat bekende schuld door en houdt regel+bestand in de regeltekst', () => {
    const huidig = [
      { file: 'src/voiceStore.ts', rule: '@typescript-eslint/no-unused-vars', message: "'foo' is defined but never used.", line: 12, column: 5, severity: 'error' },
    ];
    const basis = loadBaseline(serializeBaseline(huidig));
    assert.equal(nieuweVondsten(huidig, basis).length, 0);
    assert.match(vondstRegel(huidig[0]), /src\/voiceStore\.ts:12:5/);
    assert.match(vondstRegel(huidig[0]), /@typescript-eslint\/no-unused-vars/);
    assert.equal(poortTekst([], 445), 'eslint-gate: OK 445 known, 0 new');
  });

  it('faalt op een nieuwe regel in een bekend bestand', () => {
    const bekend = { file: 'src/a.ts', rule: 'no-empty', message: 'Empty block statement.', line: 4 };
    const extra = { file: 'src/a.ts', rule: 'no-unused-vars', message: "'x' is defined but never used.", line: 8, severity: 'error' };
    const nieuw = nieuweVondsten([bekend, extra], loadBaseline(serializeBaseline([bekend])));
    assert.equal(nieuw.length, 1);
    assert.equal(vinger(nieuw[0]), vinger(extra));
    assert.match(poortTekst(nieuw, 1), /FAIL 1 new/);
  });

  it('negeert code-frames met absolute paden in de vingerafdruk', () => {
    const lang = "Error: Calling setState synchronously within an effect can trigger cascading renders\n\n/Users/luka/AXE-CORE-/src/app/App.tsx:207:18\n  useEffect(() => {";
    const kort = 'Error: Calling setState synchronously within an effect can trigger cascading renders';
    assert.equal(normBericht(lang), kort);
    const a = { file: 'src/app/App.tsx', rule: 'react-hooks/set-state-in-effect', message: lang };
    const b = { file: 'src/app/App.tsx', rule: 'react-hooks/set-state-in-effect', message: kort + '\n/agent/repos/other/src/app/App.tsx:1' };
    assert.equal(vinger(a), vinger(b));
    assert.equal(nieuweVondsten([b], loadBaseline(serializeBaseline([a]))).length, 0);
  });

  it('leest eslint-JSON inclusief warnings zonder ruleId als eslint', () => {
    const uit = findingsFromEslintJson([
      {
        filePath: '/tmp/hq/src/a.ts',
        messages: [
          { ruleId: 'no-empty', severity: 2, message: 'Empty block statement.', line: 1, column: 1 },
          { ruleId: null, severity: 1, message: 'Parse error', line: 2, column: 1 },
        ],
      },
    ], '/tmp/hq');
    assert.equal(uit[0].file, 'src/a.ts');
    assert.equal(uit[0].severity, 'error');
    assert.equal(uit[1].rule, 'eslint');
    assert.equal(uit[1].severity, 'warning');
  });
});
