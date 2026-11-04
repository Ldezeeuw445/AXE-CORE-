import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'shots');
const twin = '/workspace/twin';

type AxeOntwerp = {
  __axeZetServerAgents?: (s: Record<string, unknown>) => void;
};

async function openOntwerp(page: Page, hash: string, w = 1440, h = 900) {
  mkdirSync(shots, { recursive: true });
  mkdirSync(twin, { recursive: true });
  await page.addInitScript(() => {
    try { localStorage.setItem('axe_look', 'black'); } catch { /* */ }
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`/?ontwerp=1${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.axe-shell', { timeout: 60_000 });
}

function saveTwin(localName: string, twinName: string) {
  copyFileSync(join(shots, localName), join(twin, twinName));
}

function daxStand() {
  const now = Date.now();
  const hb = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
  const next = new Date(now + 5 * 60_000).toISOString();
  const computers: Array<{
    id: string; computer: string; always: boolean; status: string;
    action: string; task: string; minAgo: number; err?: string;
  }> = [
    { id: 'northsea', computer: 'dax-northsea-01', always: true, status: 'WORKING', action: 'Chase copper PO', task: 'Copper PO follow-up', minAgo: 2 },
    { id: 'trading', computer: 'dax-trading-01', always: true, status: 'MONITORING', action: 'Watch gold orb', task: 'ORB 1am NY watch', minAgo: 1 },
    { id: 'developer', computer: 'dax-developer-01', always: true, status: 'QUEUED', action: 'Waiting for seat', task: 'Ship nav PR', minAgo: 4 },
    { id: 'thinktank', computer: 'dax-thinktank-01', always: true, status: 'BLOCKED', action: 'Needs API key', task: 'Growth digest', minAgo: 20, err: 'missing Tavily key' },
    { id: 'browser', computer: 'dax-browser-01', always: true, status: 'MONITORING', action: 'Idle browser pool', task: '—', minAgo: 3 },
  ];
  const agents: Record<string, unknown> = {};
  for (const c of computers) {
    agents[c.id] = {
      agent: c.id,
      status: c.status,
      reason: c.err || c.action,
      current_action: c.action,
      dax_computer: c.computer,
      dax_always_on: c.always,
      dax_heartbeat_at: hb(c.minAgo),
      dax_status: c.status === 'BLOCKED' ? 'error' : 'running',
      dax_error: c.err || null,
      dax_blockers: c.err ? [c.err] : [],
      dax_routine: c.action,
      task: c.task === '—' ? null : { id: `t-${c.id}`, title: c.task, status: 'running' },
      events: [
        { at: hb(c.minAgo + 1), kind: 'task', event_type: 'heartbeat', message: `heartbeat ok · ${c.computer}`, task_id: null, mission_id: null, source: 'dax' },
        { at: hb(c.minAgo + 10), kind: 'task', event_type: 'task.completed', message: `last: ${c.action}`, task_id: null, mission_id: null, source: 'task' },
      ],
      routines: [{
        name: 'dax_wacht',
        last_run_at: hb(c.minAgo),
        last_status: c.err ? 'error' : 'ok',
        next_run_at: next,
        running: !c.err,
        failures: c.err ? 1 : 0,
        summary: c.action,
      }],
    };
  }
  return { ok: true, agents, approvals: [], tiers: null };
}

async function zetDax(page: Page) {
  await page.waitForFunction(() => typeof (window as unknown as AxeOntwerp).__axeZetServerAgents === 'function');
  await page.evaluate((stand) => {
    (window as unknown as AxeOntwerp).__axeZetServerAgents?.(stand);
  }, daxStand());
}

test('BottomNav: Home NorthSea Trading Managers | Taken Code Calendar Settings + Meer', async ({ page }) => {
  await openOntwerp(page, '#/', 1280, 800);
  for (const label of ['Home', 'NorthSea', 'Trading', 'Managers', 'Taken', 'Code', 'Calendar', 'Settings', 'Meer']) {
    await expect(page.getByRole('button', { name: label }).first()).toBeVisible({ timeout: 20_000 });
  }
  await page.screenshot({ path: join(shots, 'nav-1280x800.png') });
  saveTwin('nav-1280x800.png', 'nav-1280x800.png');

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, 'nav-1920x1080.png') });
  saveTwin('nav-1920x1080.png', 'nav-1920x1080.png');
});

test('Managers tab is a Grok-style chat room with real manager list', async ({ page }) => {
  await openOntwerp(page, '#/managers', 1440, 900);
  await expect(page.locator('.axe-managers-room')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.axe-managers-room-lijst')).toBeVisible();
  await expect(page.locator('.axe-managers-room-draad')).toBeVisible();
  await expect(page.locator('.axe-managers-room-rij')).toHaveCount(7);
  await expect(page.locator('[data-axe-boss="ja"]')).toHaveCount(1);
  await expect(page.getByText('Boss', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('DAX', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: join(shots, 'managers-chat.png') });
  saveTwin('managers-chat.png', 'managers-chat.png');
  await page.screenshot({ path: join(shots, 'managers-boss.png') });
  saveTwin('managers-boss.png', 'managers-boss.png');
});

test('DAX bots overview page from /dax', async ({ page }) => {
  await openOntwerp(page, '#/dax', 1440, 900);
  await expect(page.locator('[data-axe-dax-page]')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('heading', { name: 'DAX bots' })).toBeVisible();
  await zetDax(page);
  await expect(page.locator('.axe-dax-kaart')).toHaveCount(5, { timeout: 15_000 });
  await expect(page.getByText('24/7').first()).toBeVisible();
  await expect(page.getByText('dax_wacht').first()).toBeVisible();
  await page.screenshot({ path: join(shots, 'dax-overzicht.png') });
  saveTwin('dax-overzicht.png', 'dax-overzicht.png');
});
