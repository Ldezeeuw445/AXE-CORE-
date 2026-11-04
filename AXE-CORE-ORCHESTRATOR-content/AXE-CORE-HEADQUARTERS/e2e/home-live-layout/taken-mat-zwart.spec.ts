/**
 * Taken-tab (PR C): secties Wacht op jou / Bezig / Klaar vandaag, ingeklapt
 * planner-log met gegroepeerde herhalingen, en matzwarte kaarten.
 *
 * De API wordt in de test onderschept met een vaste stand (zelfde vorm als de
 * echte /tasks en /planner/* antwoorden); de UI zelf verzint niets.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const twin = '/workspace/twin';
const SHOT = process.env.TAKEN_SHOT || 'taken-na.png';

function iso(minAgo: number) { return new Date(Date.now() - minAgo * 60_000).toISOString(); }

function durable(id: string, title: string, status: string, uiStatus: string, app: string, minAgo: number) {
  return {
    id, title, goal: title, description: null, status, priority: 'medium', assignee: 'code-agent',
    requested_by: 'luka', capability: 'task_manage', checkpoint: {}, attempt: 0, max_attempts: 3, revision: 1,
    metadata: { uiStatus, app, agent: 'code-agent', routedBy: 'user' },
    created_at: iso(minAgo), updated_at: iso(minAgo),
  };
}

function planner(id: string, title: string, status: string, app: string, minAgo: number, extra: Record<string, unknown> = {}) {
  return {
    id, title, goal: title, description: null, status, priority: 'medium', assignee: 'code-agent',
    metadata: { agent: 'code-agent', motor: 'cursor', risico: 'schrijven', goedkeuring: 'niet_nodig', oorsprong: 'vervolg', app, ...extra },
    result: null, error: null, created_at: iso(minAgo), completed_at: status === 'completed' ? iso(minAgo - 5) : null,
  };
}

const TASKS = [
  durable('d1', 'DAX build: next task in AXE-CORE-', 'running', 'in-progress', 'axe_core', 30),
  durable('d2', 'DAX build: next task in axon-memory', 'pending', 'blocked', 'axon_memory', 40),
  durable('d3', 'provider-fallback-ping', 'pending', 'blocked', 'axe_core', 50),
  durable('d4', 'Build next step: AXE Companion', 'completed', 'done', 'companion', 20),
];

const PLANNER = [
  planner('p1', 'Build next step: AXON Memory', 'pending', 'axon_memory', 10),
  planner('p2', 'Build next step: AXON Memory', 'pending', 'axon_memory', 70),
  planner('p3', 'Build next step: AXON Memory', 'pending', 'axon_memory', 130),
  planner('p4', 'Build next step: AXE Companion', 'pending', 'companion', 15),
  planner('p5', 'Build next step: AXE Companion', 'pending', 'companion', 75),
  planner('p6', 'Build next step: Trading OS', 'pending', 'trading', 20),
  planner('p7', 'Build next step: Trading OS', 'pending', 'trading', 80),
  planner('p8', 'Continue DAX build: next task in AXE-CORE-', 'running', 'axe_core', 5),
  planner('p9', 'Continue: Claude: controle of de versie AXE Core op de Mac mini klopt', 'pending', 'axe_core', 25, { goedkeuring: 'nodig', risico: 'schrijven' }),
];

const STATUS = {
  host_kan: true, aan: true, bezig: false, interval_s: 300, dagbudget: 40, gebruik_vandaag: {}, koeling: {}, motoren: {},
  laatste_ronde: { begon: iso(3), klaar: iso(2), agents: {
    'axe-core': { motor: 'claude', plan_motor: 'claude', voorstellen: [] },
    'code-agent': { motor: 'cursor', plan_motor: 'claude', voorstellen: [] },
  } },
};

async function mock(page: Page) {
  await page.route(/\/(proxy|api\/proxy)\/axecore\//, async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname.replace(/^.*\/axecore/, '');
    if (p.startsWith('/planner/taken')) return route.fulfill({ json: { taken: PLANNER } });
    if (p.startsWith('/planner/status')) return route.fulfill({ json: STATUS });
    if (p === '/tasks' || p.startsWith('/tasks?')) return route.fulfill({ json: { tasks: TASKS } });
    return route.fallback();
  });
}

test('taken-tab: secties, planner-log, matzwarte kaarten', async ({ page }) => {
  mkdirSync(twin, { recursive: true });
  await page.addInitScript(() => { try { localStorage.setItem('axe_look', 'black'); } catch { /* */ } });
  await mock(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/?ontwerp=1#/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.axe-shell', { timeout: 60_000 });
  await page.waitForSelector('[data-axe-doel="planner"]', { timeout: 60_000 });
  await page.waitForTimeout(1500);

  if (SHOT === 'taken-na.png') {
    const secties = page.locator('[data-axe-taken-secties]');
    await expect(secties).toBeVisible();
    await expect(secties.getByText('Wacht op jou')).toBeVisible();
    await expect(secties.getByText(/^Bezig/)).toBeVisible();
    await expect(secties.getByText('Klaar vandaag')).toBeVisible();
    // Groepering: drie keer AXON Memory wordt één regel met ×3.
    const log = page.locator('[data-axe-doel="planner"]');
    await log.getByRole('button', { name: /Planner-log/ }).click();
    await expect(log.locator('[data-axe-planner-groep]').filter({ hasText: 'Build next step: AXON Memory' })).toHaveCount(1);
    await expect(log.locator('[data-axe-planner-groep]').filter({ hasText: 'Build next step: AXON Memory' })).toContainText('×3');
    // Kaarten: allemaal even breed en matzwart.
    const kaarten = page.locator('.axe-appvijf .axe-app');
    const n = await kaarten.count();
    expect(n).toBeGreaterThan(1);
    const maten = await kaarten.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().width)));
    expect(new Set(maten).size).toBe(1);
    const bg = await kaarten.first().evaluate(e => getComputedStyle(e).backgroundImage);
    expect(bg).toContain('rgba(23, 23, 23, 0.94)');
  }
  // Bovenaan beginnen, zodat 'na' hetzelfde kader heeft als 'voor'.
  await page.evaluate(() => document.querySelectorAll('[data-axe-taken-schuif]').forEach(e => { e.scrollTop = 0; }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${twin}/${SHOT}`, fullPage: false });
  if (SHOT === 'taken-na.png') {
    await page.locator('.axe-appvijf').evaluate(e => e.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${twin}/kaarten-na.png` });
  }
});
