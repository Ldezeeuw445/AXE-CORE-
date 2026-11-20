import { test } from 'vitest';
import assert from 'node:assert/strict';
import { maakLeesWeigering } from './leesRegels.mjs';

const nee = maakLeesWeigering({
  home: '/Users/luka',
  denyPaths: ['/Volumes/EagetSSD/AXE-VAULT'],
  denyNames: /(^|\/)(\.env(\..*)?|id_rsa|.*\.key)$/i,
});

test('gewone plekken mag hij lezen', () => {
  for (const p of ['/Applications', '/Applications/AXE Overlay.app', '/Users/luka/Documents/plan.md',
    '/Users/luka/Library/LaunchAgents', '/Volumes/EagetSSD/TRADING-OS/README.md']) {
    assert.equal(nee(p), null, p);
  }
});

test('sleutels, logins en wachtwoorden nooit', () => {
  for (const p of ['/Users/luka/.ssh/id_ed25519', '/Users/luka/.claude/settings.json', '/Users/luka/.axe/x',
    '/Users/luka/Library/Keychains/login.keychain-db', '/Users/luka/Library/Application Support/Google/Chrome/Default/Login Data',
    '/Users/luka/Library/Cookies/Cookies.binarycookies', '/Volumes/EagetSSD/AXE-VAULT/a.md',
    '/Users/luka/Projects/x/.env', '/Users/luka/Documents/api.key']) {
    assert.notEqual(nee(p), null, p);
  }
});

test('buiten thuismap, Programma\'s en schijven niet', () => {
  for (const p of ['/etc/hosts', '/private/var/db', '/Users/andere/Documents', '/']) {
    assert.notEqual(nee(p), null, p);
  }
});

import { naarDezeMac } from './leesRegels.mjs';

test('pad van de andere Mac wordt geldig op deze', () => {
  const root = '/Users/luka/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS';
  assert.equal(naarDezeMac(root, '/Users/lukadezeeuw/Library/LaunchAgents', '/Users/luka'), '/Users/luka/Library/LaunchAgents');
  assert.equal(naarDezeMac(root, '/Users/luka/x', '/Users/luka'), '/Users/luka/x');
  assert.equal(naarDezeMac(root, 'AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/AGENTS.md', '/Users/luka'), 'AGENTS.md');
  assert.equal(naarDezeMac(root, 'AXE-CORE-HEADQUARTERS', '/Users/luka'), '.');
  assert.equal(naarDezeMac(root, 'src/app.ts', '/Users/luka'), 'src/app.ts');
  assert.equal(naarDezeMac(root, '/Applications', '/Users/luka'), '/Applications');
});
