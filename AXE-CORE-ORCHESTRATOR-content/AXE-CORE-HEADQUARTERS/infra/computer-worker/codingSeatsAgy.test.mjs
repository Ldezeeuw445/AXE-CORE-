import { test } from 'vitest';
import assert from 'node:assert/strict';
import { AGY_VERIFIEER, agyEmailUitLog } from './codingSeats.mjs';
import { moetAccountVerifieren } from '../../src/domain/codingSeats';

test('leest het laatste Google-account uit de Antigravity-log', () => {
  const log = [
    'I1120 server_oauth.go:226] OAuth: authenticated successfully as oud@gmail.com',
    'I1121 server_oauth.go:226] OAuth: authenticated successfully as nieuw@gmail.com',
  ].join('\n');
  assert.equal(agyEmailUitLog(log), 'nieuw@gmail.com');
  assert.equal(agyEmailUitLog('niets hier'), null);
});

test('de verificatie-melding van de worker wordt op de kaart herkend', () => {
  assert.equal(moetAccountVerifieren({ logged_in: false, login_command: AGY_VERIFIEER }), true);
  assert.equal(moetAccountVerifieren({ logged_in: false, login_command: 'agy' }), false);
  assert.equal(moetAccountVerifieren({ logged_in: true, login_command: AGY_VERIFIEER }), false);
});
