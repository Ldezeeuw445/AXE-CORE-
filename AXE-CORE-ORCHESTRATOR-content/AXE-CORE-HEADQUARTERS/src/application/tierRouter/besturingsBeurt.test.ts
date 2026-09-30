/**
 * De hele keten herkennen -> uitvoeren -> tekst, zonder store en zonder DOM.
 *
 * Dit is de test die telt, want de code die hier gedraaid wordt is precies de
 * code die de app aanroept. Voor deze ronde bestond `herkenBesturing` al met
 * vijftien groene tests, en werd hij door niemand aangeroepen: groen zei dus
 * niets over of "stop de northsea taak" ook echt iets stopte.
 *
 * De deps zijn spionnen. Dat een `cancel` NIET wordt aangeroepen is hier net
 * zo vaak het bewijs als dat hij wel wordt aangeroepen.
 */
import { describe, it, expect, vi } from 'vitest';
import { besturingsBeurt, controlBeurt, type BesturingDeps } from './besturingsBeurt';
import { jobStatusTekst, sessieSamenvatting, type AxeJob } from '@/domain/tierRouter/axeJobRegels';

const NU = 1_000_000;

const job = (over: Partial<AxeJob> = {}): AxeJob => ({
  id: 'j1',
  title: 'scan the market',
  agent: 'trading',
  state: 'running',
  startedAt: NU - 180_000,
  taskId: 'task-1',
  sourceText: 'scan the market',
  ...over,
});

const trading = job({ id: 't1', taskId: 'task-t1' });
const northsea = job({
  id: 'n1',
  agent: 'northsea',
  title: 'check the northsea deals',
  taskId: 'task-n1',
  sourceText: 'check the northsea deals',
});

/** Geen enkele goedkeuring open, tenzij een test iets anders geeft. */
function deps(over: Partial<BesturingDeps> = {}): BesturingDeps {
  return {
    cancel: vi.fn(async () => ({ ok: true })),
    snapshot: vi.fn(async () => ({ approvals: [] })),
    beslis: vi.fn(async () => ({ ok: true })),
    nu: () => NU,
    ...over,
  };
}

describe('besturingsBeurt — stoppen', () => {
  it('stopt de taak die Luka noemt, en alleen die', async () => {
    const d = deps();
    const uit = await besturingsBeurt('stop de northsea taak', [trading, northsea], d);

    expect(d.cancel).toHaveBeenCalledTimes(1);
    expect(d.cancel).toHaveBeenCalledWith('task-n1', 'Stopped by Luka.');
    expect(uit?.patches).toEqual([
      { id: 'n1', over: { state: 'failed', summary: 'Stopped by you.', finishedAt: NU } },
    ]);
    expect(uit?.tekst).toMatch(/^Stopping /);
  });

  /* Een job zonder taskId bestaat alleen in de browser: het aanmaken is nog
     onderweg. Doen alsof het stoppen lukte laat een taak draaien die Luka net
     heeft afgezegd — dat is erger dan zeggen dat het nog niet kan. */
  it('raakt niets aan als de taak nog geen taskId heeft', async () => {
    const d = deps();
    const uit = await besturingsBeurt('stop', [job({ id: 'q1', state: 'queued', taskId: undefined })], d);

    expect(d.cancel).not.toHaveBeenCalled();
    expect(uit?.patches).toEqual([]);
    expect(uit?.tekst).toMatch(/still starting/);
  });

  it('zegt het als de backend het stoppen weigert, en laat de job met rust', async () => {
    const d = deps({ cancel: vi.fn(async () => { throw new Error('AXE API 502'); }) });
    const uit = await besturingsBeurt('stop de northsea taak', [northsea], d);

    expect(uit?.patches).toEqual([]);
    expect(uit?.tekst).toMatch(/couldn't stop/i);
  });

  /* Twee kandidaten, één "stop": herkenBesturing zet `twijfel` en laat jobIds
     leeg. De uitvoerder mag dan niets aanraken — niet de eerste pakken. */
  it('vraagt na bij twee lopende taken en stopt er geen', async () => {
    const d = deps();
    const uit = await besturingsBeurt('stop', [trading, northsea], d);

    expect(d.cancel).not.toHaveBeenCalled();
    expect(uit?.patches).toEqual([]);
    expect(uit?.tekst).toMatch(/\?$/);
  });
});

describe('besturingsBeurt — vragen', () => {
  it('vertelt wat er loopt zonder iets te starten of te stoppen', async () => {
    const d = deps();
    const uit = await besturingsBeurt('wat doet de northsea agent?', [trading, northsea], d);

    expect(uit?.actie).toBe('status');
    expect(uit?.tekst).toBe(jobStatusTekst(northsea, NU));
    expect(d.cancel).not.toHaveBeenCalled();
    expect(d.beslis).not.toHaveBeenCalled();
    expect(uit?.starts).toEqual([]);
  });

  it('"wat loopt er?" geeft de sessiesamenvatting', async () => {
    const d = deps();
    const alle = [trading, northsea];
    const uit = await besturingsBeurt('wat loopt er?', alle, d);

    expect(uit?.actie).toBe('overview');
    expect(uit?.tekst).toBe(sessieSamenvatting(alle));
  });

  /* De reden dat dit pad vóór het plan staat: een gewone zin mag er niet in
     blijven hangen, anders verdwijnt normaal praten in de besturing. */
  it('laat een gewone zin door naar de gewone route', async () => {
    const d = deps();
    const uit = await besturingsBeurt('lekker weer vandaag', [trading], d);

    expect(uit).toBeNull();
    expect(d.cancel).not.toHaveBeenCalled();
    expect(d.snapshot).not.toHaveBeenCalled();
    expect(d.beslis).not.toHaveBeenCalled();
  });

  it('"stop loss op 1.05" is handelstaal, geen annulering', async () => {
    const d = deps();
    expect(await besturingsBeurt('stop loss op 1.05 zetten', [trading], d)).toBeNull();
    expect(d.cancel).not.toHaveBeenCalled();
  });
});

describe('besturingsBeurt — goedkeuren', () => {
  const wachtend = job({ id: 'w1', state: 'waiting', taskId: 'task-w1' });

  const metGoedkeuring = (metadata: Record<string, unknown>) => deps({
    snapshot: vi.fn(async () => ({
      approvals: [{
        id: 'a1', task_id: 'task-w1', status: 'pending', kind: 'shell_command',
        metadata,
      }],
    })),
  });

  it('keurt een gewoon shell-commando goed', async () => {
    const d = metGoedkeuring({ command: 'ls -la /tmp', reason: 'reads a directory' });
    const uit = await besturingsBeurt('ja doe maar', [wachtend], d);

    expect(d.beslis).toHaveBeenCalledWith('task-w1', 'a1', true, 'Approved by Luka in chat.');
    expect(uit?.patches).toEqual([{ id: 'w1', over: { state: 'running' } }]);
  });

  /* Luka's regel: typen krijgt dezelfde grens als stem. Een git push is te
     duur om met één woord te laten passeren, hoe je dat woord ook invoert. */
  it('weigert een goedkeuring die te zwaar is, en beslist dus niets', async () => {
    const d = metGoedkeuring({ command: 'git push origin main', reason: 'sends something out' });
    const uit = await besturingsBeurt('ja doe maar', [wachtend], d);

    expect(d.beslis).not.toHaveBeenCalled();
    expect(uit?.patches).toEqual([]);
    expect(uit?.tekst).toMatch(/Approvals control/);
  });

  it('wijst af en sluit de job af', async () => {
    const d = metGoedkeuring({ command: 'ls', reason: 'reads a directory' });
    const uit = await besturingsBeurt('nee', [wachtend], d);

    expect(d.beslis).toHaveBeenCalledWith('task-w1', 'a1', false, 'Rejected by Luka in chat.');
    expect(uit?.patches[0].over.state).toBe('failed');
  });

  it('zegt het eerlijk als er intussen niets meer te beslissen valt', async () => {
    const d = deps();
    const uit = await besturingsBeurt('ja doe maar', [wachtend], d);

    expect(d.beslis).not.toHaveBeenCalled();
    expect(uit?.tekst).toMatch(/isn't waiting on anything/);
  });
});

describe('besturingsBeurt — bijsturen', () => {
  it('stopt de taak en levert de herstart aan', async () => {
    const d = deps();
    const uit = await besturingsBeurt('doe het toch op de iMac in plaats daarvan', [trading], d);

    expect(d.cancel).toHaveBeenCalledTimes(1);
    expect(uit?.starts).toHaveLength(1);
    expect(uit?.starts[0].text).toMatch(/iMac/i);
    expect(uit?.starts[0].route.agent).toBe('trading');
    expect(uit?.patches[0].over.state).toBe('failed');
  });
});

/* Het modelpad. Dit is het bewijs dat de twee herkenners in ÉÉN uitvoerder
   uitkomen: dezelfde deps, dezelfde patches, dezelfde tekst. Zonder deze test
   kunnen ze weer uit elkaar gaan lopen, en dat is precies hoe de vorige twee
   paden zijn ontstaan. */
describe('controlBeurt — het plan gebruikt dezelfde uitvoerder', () => {
  it('"j2" stopt de tweede lopende taak', async () => {
    const d = deps();
    const lopend = [trading, northsea];
    const uit = await controlBeurt([{ action: 'cancel', job: 'j2' }], lopend, lopend, d);

    expect(d.cancel).toHaveBeenCalledWith('task-n1', 'Stopped by Luka.');
    expect(uit[0].patches[0].id).toBe('n1');
  });

  it('een id die niet bestaat doet niets', async () => {
    const d = deps();
    const uit = await controlBeurt([{ action: 'cancel', job: 'j9' }], [trading], [trading], d);

    expect(uit).toEqual([]);
    expect(d.cancel).not.toHaveBeenCalled();
  });

  it('status via het plan geeft dezelfde regel als via de regels', async () => {
    const d = deps();
    const uit = await controlBeurt([{ action: 'status', job: 'j1' }], [northsea], [northsea], d);

    expect(uit[0].tekst).toBe(jobStatusTekst(northsea, NU));
  });
});
