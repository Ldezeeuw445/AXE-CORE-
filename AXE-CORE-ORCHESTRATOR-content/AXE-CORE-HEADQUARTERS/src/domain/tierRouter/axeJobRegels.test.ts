import { describe, it, expect } from 'vitest';
import {
  balkLabel,
  bouwMultiAck,
  jobAgentVan,
  jobResultaatTekst,
  jobStatusTekst,
  jobWachtTekst,
  gesprokenGoedkeuringsBesluit,
  magMetStemGoedkeuren,
  moetSpraakWachtrij,
  northseaJobModus,
  sessieSamenvatting,
  stemlusOvergang,
  type AxeGoedkeuring,
  type AxeJob,
} from './axeJobRegels';
import { classifyAxeTier } from './axeRoute';

const job = (over: Partial<AxeJob> = {}): AxeJob => ({
  id: 'j1',
  title: 'check deals',
  agent: 'northsea',
  state: 'running',
  startedAt: 1,
  sourceText: 'check NorthSea deals',
  ...over,
});

describe('stemlusOvergang', () => {
  it('barge-in stopt TTS en gaat terug naar luisteren', () => {
    const k = stemlusOvergang('speaking', { type: 'barge-in' });
    expect(k.stand).toBe('listening');
    expect(k.stopTts).toBe(true);
    expect(k.speakNow).toBe(false);
  });

  it('Esc stopt alles', () => {
    const k = stemlusOvergang('listening', { type: 'esc' });
    expect(k.stand).toBe('idle');
    expect(k.stopTts).toBe(true);
    expect(k.cancelListen).toBe(true);
  });

  it('job-resultaat tijdens luisteren gaat in de wachtrij', () => {
    const k = stemlusOvergang('listening', { type: 'job-result' });
    expect(k.queueSpeech).toBe(true);
    expect(k.speakNow).toBe(false);
    expect(k.stopTts).toBe(false);
    expect(k.stand).toBe('listening');
  });

  it('job-resultaat in rust mag nu', () => {
    const k = stemlusOvergang('idle', { type: 'job-result' });
    expect(k.speakNow).toBe(true);
    expect(k.queueSpeech).toBe(false);
  });

  it('foutstand', () => {
    expect(stemlusOvergang('thinking', { type: 'fail' }).stand).toBe('error');
  });
});

describe('moetSpraakWachtrij', () => {
  it('ack praat meteen, job wacht op de gebruiker', () => {
    expect(moetSpraakWachtrij('listening', 'ack')).toBe(false);
    expect(moetSpraakWachtrij('listening', 'job')).toBe(true);
    expect(moetSpraakWachtrij('idle', 'job')).toBe(false);
  });
});

describe('sessie-samenvatting', () => {
  it('leeg en gevuld', () => {
    expect(sessieSamenvatting([])).toMatch(/Nothing running/);
    const tekst = sessieSamenvatting([
      job(),
      job({ id: 'j2', agent: 'task', state: 'done', title: 'tomorrow', summary: 'Task created' }),
    ]);
    expect(tekst).toMatch(/1 agent running/);
    expect(tekst).toMatch(/Task created/);
  });

  it('ack en balk', () => {
    expect(bouwMultiAck([
      { text: 'a', agent: 'northsea' },
      { text: 'b', agent: 'task' },
    ])).toMatch(/2 jobs/);
    expect(balkLabel(3)).toBe('3 agents running');
    expect(jobResultaatTekst(job({ state: 'done', summary: '3 open deals' }))).toMatch(/3 open deals/);
    expect(northseaJobModus('northsea')).toBe('read');
    expect(northseaJobModus('trading')).toBe('execute');
  });
});

describe('jobAgentVan', () => {
  it('houdt NorthSea en nieuws uit de fallback-agent', () => {
    expect(jobAgentVan(classifyAxeTier('check NorthSea deals'), 'check NorthSea deals')).toBe('northsea');
    expect(jobAgentVan(classifyAxeTier('vat het AI-nieuws samen'), 'vat het AI-nieuws samen')).toBe('intel');
    expect(jobAgentVan(classifyAxeTier('zet een taak voor morgen'), 'zet een taak voor morgen')).toBe('task');
  });
});

describe('jobWachtTekst', () => {
  it('zegt welke agent op je ok wacht en wat hij wil draaien', () => {
    const job = { id: 'j', title: 't', agent: 'northsea' as const, state: 'waiting' as const, startedAt: 0, sourceText: 's' };
    const tekst = jobWachtTekst(job, 'AXE wants to run: systemctl restart northsea');
    expect(tekst).toMatch(/needs your OK/);
    expect(tekst).toMatch(/systemctl restart northsea/);
    expect(tekst).not.toMatch(/AXE wants to run/);
  });
});

// ── W4b: waar staat de taak, in gewone taal ────────────────────────────────

describe('jobStatusTekst', () => {
  const nu = 1_000_000;

  it('noemt de laatste stap, de duur en de staat', () => {
    const tekst = jobStatusTekst(
      job({ agent: 'developer', title: 'fix the build', startedAt: nu - 125_000, stappen: ['reading vite.config.ts', 'running the typecheck'] }),
      nu,
    );
    expect(tekst).toMatch(/running for 2m/);
    expect(tekst).toMatch(/Last step: running the typecheck/);
    expect(tekst).not.toMatch(/reading vite\.config/);
  });

  it('een taak zonder stappen levert geen losse "Last step:" op', () => {
    const tekst = jobStatusTekst(job({ agent: 'developer', startedAt: nu - 5_000 }), nu);
    expect(tekst).toMatch(/running for 5s/);
    expect(tekst).not.toMatch(/Last step/);
  });

  it('elke staat krijgt zijn eigen woorden', () => {
    const basis = { agent: 'developer' as const, startedAt: nu - 60_000 };
    expect(jobStatusTekst(job({ ...basis, state: 'queued' }), nu)).toMatch(/hasn't started/);
    expect(jobStatusTekst(job({ ...basis, state: 'waiting' }), nu)).toMatch(/waiting for your OK/);
    expect(jobStatusTekst(job({ ...basis, state: 'done', summary: '3 tests green' }), nu)).toMatch(/finished .* in 1m: 3 tests green/);
    expect(jobStatusTekst(job({ ...basis, state: 'failed', summary: 'typecheck broke' }), nu)).toMatch(/gave up .* after 1m: typecheck broke/);
  });

  it('een klaar-taak blijft op zijn eigen duur staan, ook als de klok doortikt', () => {
    const klaar = job({ agent: 'developer', state: 'done', startedAt: nu - 600_000, finishedAt: nu - 540_000, summary: 'ok' });
    expect(jobStatusTekst(klaar, nu)).toMatch(/in 1m/);
    expect(jobStatusTekst(klaar, nu + 3_600_000)).toMatch(/in 1m/);
  });
});

describe('sessieSamenvatting telt wachten mee', () => {
  it('een taak die op je ok wacht is niet klaar, dus hij loopt', () => {
    // Regressie: de balk (lopendeJobs) telde 'waiting' mee en deze regel niet,
    // dus hetzelfde scherm gaf twee verschillende aantallen.
    const tekst = sessieSamenvatting([job({ state: 'waiting' })]);
    expect(tekst).toMatch(/1 agent running/);
    expect(tekst).not.toMatch(/No agents running/);
  });

  it('wachten plus lopen telt op', () => {
    const tekst = sessieSamenvatting([
      job({ id: 'a', state: 'running' }),
      job({ id: 'b', state: 'waiting' }),
      job({ id: 'c', state: 'done', summary: 'klaar' }),
    ]);
    expect(tekst).toMatch(/2 agents running/);
  });
});

// ── W5: wat mag je met je stem goedkeuren ──────────────────────────────────

const vraag = (over: Partial<AxeGoedkeuring> & { command?: string; reason?: string } = {}): AxeGoedkeuring => ({
  kind: 'shell_command',
  title: `AXE wants to run: ${over.command ?? 'sudo apt-get install jq'}`,
  detail: 'This command touches the system, so it is outside what AXE may do unattended.',
  metadata: { command: over.command ?? 'sudo apt-get install jq', reason: over.reason ?? 'touches the system (apt-get)' },
  ...(over.kind !== undefined ? { kind: over.kind } : {}),
  ...(over.title !== undefined ? { title: over.title } : {}),
  ...(over.detail !== undefined ? { detail: over.detail } : {}),
});

describe('gesprokenGoedkeuringsBesluit', () => {
  it('pakt alleen een kort, ondubbelzinnig ja of nee', () => {
    expect(gesprokenGoedkeuringsBesluit('ja')).toBe('approve');
    expect(gesprokenGoedkeuringsBesluit('Yes, go ahead.')).toBe('approve');
    expect(gesprokenGoedkeuringsBesluit('doe maar')).toBe('approve');
    expect(gesprokenGoedkeuringsBesluit('nee')).toBe('reject');
    expect(gesprokenGoedkeuringsBesluit('laat maar')).toBe('reject');
  });

  it('maakt van gewoon gesprek geen goedkeuring', () => {
    expect(gesprokenGoedkeuringsBesluit('ja maar ik bedoel iets anders')).toBeNull();
    expect(gesprokenGoedkeuringsBesluit('yes, what was that again?')).toBeNull();
    expect(gesprokenGoedkeuringsBesluit('ga door met je verhaal')).toBeNull();
  });
});

describe('magMetStemGoedkeuren', () => {
  it('het saaie midden mag: een systeemcommando dat op deze machine blijft', () => {
    expect(magMetStemGoedkeuren(vraag())).toBe(true);
  });

  it('niets is ook nee', () => {
    expect(magMetStemGoedkeuren(undefined)).toBe(false);
    expect(magMetStemGoedkeuren(null)).toBe(false);
  });

  it('alleen shell-vragen: een andere soort goedkeuring nooit', () => {
    expect(magMetStemGoedkeuren(vraag({ kind: 'device_action' }))).toBe(false);
    expect(magMetStemGoedkeuren(vraag({ kind: 'northsea_send' }))).toBe(false);
    expect(magMetStemGoedkeuren(vraag({ kind: null }))).toBe(false);
  });

  it('mail en berichten: nooit met je stem', () => {
    expect(magMetStemGoedkeuren(vraag({
      command: 'python3 -c "import smtplib; ..."',
      reason: 'sends something out (smtplib)',
    }))).toBe(false);
    expect(magMetStemGoedkeuren(vraag({
      command: 'curl https://api.resend.com/emails -d @body.json',
      reason: 'sends something out (resend)',
    }))).toBe(false);
    // Ook als de reden ontbreekt en alleen het commando het verraadt.
    expect(magMetStemGoedkeuren(vraag({ command: 'send_email --to klant@x.nl', reason: '' }))).toBe(false);
  });

  it('geld de deur uit: een order is ook uitgaand', () => {
    expect(magMetStemGoedkeuren(vraag({
      command: 'curl -X POST https://mt-client-api-v1.agiliumtrade.ai/.../trade',
      reason: 'places or changes an order (place_order)',
    }))).toBe(false);
  });

  it('NorthSea: altijd een klik, ook als het commando onschuldig oogt', () => {
    expect(magMetStemGoedkeuren(vraag({
      command: 'systemctl restart northsea',
      reason: 'touches the system (systemctl)',
    }))).toBe(false);
    expect(magMetStemGoedkeuren(vraag({
      command: 'psql -c "select * from north sea deals"',
      reason: 'touches the system (psql)',
    }))).toBe(false);
  });

  it('ingrijpend: git push, git merge, db.migrate, files.delete, terminal.free', () => {
    expect(magMetStemGoedkeuren(vraag({ command: 'git push origin orchestrator', reason: 'touches the system (git push)' }))).toBe(false);
    expect(magMetStemGoedkeuren(vraag({ command: 'git merge main', reason: 'touches the system (git)' }))).toBe(false);
    expect(magMetStemGoedkeuren(vraag({ command: 'device:mac-mini-van-luka-5 db.migrate {"file":"0031.sql"}', reason: 'changes something on Mac mini (db.migrate)' }))).toBe(false);
    expect(magMetStemGoedkeuren(vraag({ command: 'device:main-imac-luka files.delete {"path":"/tmp/x"}', reason: 'changes something on iMac (files.delete)' }))).toBe(false);
    expect(magMetStemGoedkeuren(vraag({ command: 'device:mac-mini-van-luka-5 terminal.free {"cmd":"rm -rf /"}', reason: 'changes something on Mac mini (terminal.free)' }))).toBe(false);
  });

  it('apparaat-tier: een sleutel zonder argumenten is schrijf-tier en mag', () => {
    expect(magMetStemGoedkeuren(vraag({
      command: 'device:main-imac-luka pointer.click',
      reason: 'changes something on iMac (pointer.click)',
    }))).toBe(true);
    expect(magMetStemGoedkeuren(vraag({
      command: 'device:main-imac-luka keyboard.type',
      reason: 'changes something on iMac (keyboard.type)',
    }))).toBe(true);
  });

  it('apparaat-tier: dezelfde tool mét JSON-argumenten is ingrijpend', () => {
    expect(magMetStemGoedkeuren(vraag({
      command: 'device:main-imac-luka pointer.click {"x": 40, "y": 900}',
      reason: 'changes something on iMac (pointer.click)',
    }))).toBe(false);
  });
});

describe('jobWachtTekst kiest zijn slotzin', () => {
  const wacht = job({ agent: 'developer', state: 'waiting' });

  it('mag het met je stem, dan vraagt hij het ook met je stem', () => {
    const tekst = jobWachtTekst(wacht, vraag({ command: 'sudo apt-get install jq' }));
    expect(tekst).toMatch(/needs your OK/);
    expect(tekst).toMatch(/sudo apt-get install jq/);
    expect(tekst.endsWith("Say 'yes, go ahead' or 'no' — or open Approvals.")).toBe(true);
  });

  it('mag het niet, dan stuurt hij je naar de knop', () => {
    const tekst = jobWachtTekst(wacht, vraag({
      command: 'git push origin orchestrator',
      reason: 'touches the system (git push)',
    }));
    expect(tekst.endsWith('This one needs a click in Approvals.')).toBe(true);
    expect(tekst).not.toMatch(/yes, go ahead/);
  });

  it('alleen een titel, zonder de rest van de vraag, blijft een klik', () => {
    const tekst = jobWachtTekst(wacht, 'AXE wants to run: sudo apt-get install jq');
    expect(tekst).toMatch(/sudo apt-get install jq/);
    expect(tekst).not.toMatch(/AXE wants to run/);
    expect(tekst.endsWith('This one needs a click in Approvals.')).toBe(true);
  });
});
