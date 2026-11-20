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
