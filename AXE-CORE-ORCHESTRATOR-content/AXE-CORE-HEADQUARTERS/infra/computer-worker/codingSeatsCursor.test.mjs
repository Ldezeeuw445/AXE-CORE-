import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cursorStatusFromText } from './codingSeats.mjs';

// Wat cursor-agent schreef met de CURSOR2_API_KEY op de Mac mini (21-22 nov).
const GEWEIGERD = [
  '\u001b[33m⚠ Warning: The provided API key is invalid.\u001b[0m',
  'The API key was loaded from the CURSOR_API_KEY environment variable.',
  'Please check you have the right key, create a new one, or authenticate without it.',
].join('\n');

test('een sleutel die Cursor weigert is geen login, ook niet met hasApiKey', () => {
  assert.deepEqual(cursorStatusFromText(GEWEIGERD, { hasApiKey: true }), { loggedIn: false, email: null });
  assert.deepEqual(cursorStatusFromText(`${GEWEIGERD}\n{"loggedIn":true}`, { hasApiKey: true }), { loggedIn: false, email: null });
});

test('een werkende sleutel of login blijft ingelogd', () => {
  assert.deepEqual(cursorStatusFromText('{"authenticated":true,"email":"a@b.nl"}'), { loggedIn: true, email: 'a@b.nl' });
  assert.deepEqual(cursorStatusFromText('', { hasApiKey: true }), { loggedIn: true, email: null });
});
