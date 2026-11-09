import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findingsFromEslintJson, loadBaseline, main, nieuweVondsten, normBericht, normBestand,
  poortTekst, serializeBaseline, vinger, vondstRegel,
} from './eslint-gate.mjs';

const tmpDirs = [];

function stubHq({ eslint = 'json', baseline } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'eslint-gate-'));
  tmpDirs.push(dir);
  mkdirSync(join(dir, 'node_modules/eslint/bin'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/a.ts'), 'const x = 1;\n');
  const stub = `#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixture = join(root, 'eslint-stub.out');
if (!existsSync(fixture)) {
  console.error('eslint crashed: cannot find config');
  process.exit(2);
}
const raw = readFileSync(fixture, 'utf8');
process.stdout.write(raw);
process.exit(raw.includes('"messages"') ? 1 : 1);
`;
  writeFileSync(join(dir, 'node_modules/eslint/bin/eslint.js'), stub);
  if (eslint === 'missing-bin') {
    rmSync(join(dir, 'node_modules/eslint/bin/eslint.js'));
  } else if (eslint === 'crash') {
    // no fixture → stub prints crash
  } else if (eslint === 'garbage') {
    writeFileSync(join(dir, 'eslint-stub.out'), 'eslint exploded\nnot json\n');
  } else {
    const results = Array.isArray(eslint) ? eslint : [];
    writeFileSync(join(dir, 'eslint-stub.out'), JSON.stringify(results));
  }
  if (baseline !== undefined) {
    writeFileSync(join(dir, 'eslint-baseline.json'),
      typeof baseline === 'string' ? baseline : `${JSON.stringify(baseline)}\n`);
  }
  return dir;
}

function capture(fn) {
  const logs = [];
  const errs = [];
  const ol = console.log;
  const oe = console.error;
  const ow = console.warn;
  console.log = (...a) => { logs.push(a.map(String).join(' ')); };
  console.error = (...a) => { errs.push(a.map(String).join(' ')); };
  console.warn = (...a) => { errs.push(a.map(String).join(' ')); };
  try {
    return { code: fn(), logs, errs, text: [...logs, ...errs].join('\n') };
  } finally {
    console.log = ol;
    console.error = oe;
    console.warn = ow;
  }
}

const bekendFinding = {
  filePath: '/tmp/hq/src/a.ts',
  messages: [{
    ruleId: 'no-empty',
    severity: 2,
    message: 'Empty block statement.',
    line: 4,
    column: 1,
  }],
};

const extraFinding = {
  filePath: '/tmp/hq/src/a.ts',
  messages: [
    ...bekendFinding.messages,
    {
      ruleId: 'no-unused-vars',
      severity: 2,
      message: "'x' is defined but never used.",
      line: 8,
      column: 1,
    },
  ],
};

after(() => {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* tmp */ }
  }
});

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

  it('laat bekende eslint-vondsten door op een stub-hq', () => {
    const dir = stubHq({
      eslint: [bekendFinding],
      baseline: serializeBaseline([{
        file: 'src/a.ts', rule: 'no-empty', message: 'Empty block statement.',
      }]),
    });
    const uit = capture(() => main([], dir));
    assert.equal(uit.code, 0);
    assert.match(uit.text, /eslint-gate: OK 1 known, 0 new/);
  });

  it('faalt op een nieuwe vondst en groeit de basis niet', () => {
    const dir = stubHq({
      eslint: [extraFinding],
      baseline: serializeBaseline([{
        file: 'src/a.ts', rule: 'no-empty', message: 'Empty block statement.',
      }]),
    });
    const uit = capture(() => main([], dir));
    assert.equal(uit.code, 1);
    assert.match(uit.text, /FAIL 1 new/);
    assert.match(uit.text, /no-unused-vars/);
    assert.match(uit.text, /Do not grow/);
  });

  it('faalt als de baseline ontbreekt', () => {
    const dir = stubHq({ eslint: [bekendFinding] });
    const uit = capture(() => main([], dir));
    assert.equal(uit.code, 1);
    assert.match(uit.text, /missing eslint-baseline\.json/);
  });

  it('faalt als eslint crasht zonder JSON', () => {
    const dir = stubHq({
      eslint: 'crash',
      baseline: serializeBaseline([]),
    });
    const uit = capture(() => main([], dir));
    assert.equal(uit.code, 1);
    assert.match(uit.text, /eslint-gate: /);
    assert.match(uit.text, /cannot find config|unavailable|exploded|eslint/);
  });

  it('faalt als eslint geen parseerbare JSON geeft', () => {
    const dir = stubHq({
      eslint: 'garbage',
      baseline: serializeBaseline([]),
    });
    const uit = capture(() => main([], dir));
    assert.equal(uit.code, 1);
    assert.match(uit.text, /eslint-gate: /);
    assert.doesNotMatch(uit.text, /OK \d+ known/);
  });

  it('faalt als de baseline geen JSON is', () => {
    const dir = stubHq({
      eslint: [bekendFinding],
      baseline: 'dit is geen json{',
    });
    const uit = capture(() => main([], dir));
    assert.equal(uit.code, 1);
    assert.match(uit.text, /could not read eslint-baseline\.json/);
  });

  it('faalt als eslint zelf ontbreekt', () => {
    const dir = stubHq({
      eslint: 'missing-bin',
      baseline: serializeBaseline([]),
    });
    const uit = capture(() => main([], dir));
    assert.equal(uit.code, 1);
    assert.match(uit.text, /eslint is unavailable/);
  });
});
