/**
 * De Daily Brief: wat er het laatste etmaal gebeurde, over alles.
 *
 * Luka, 29 okt: "een daily brief in AXE Core van wat jij gedaan hebt, mijn
 * andere Claude-account, ChatGPT, 2x Cursor, 2x Grok Bot, en alles in AXE Core
 * zelf, goed gestructureerd, makkelijk te lezen, met kleurcode."
 *
 * Dit bestand maakt van ruwe bronnen (commits, PR's, taken, meldingen, health)
 * secties met één kleur per regel. Geen fetch en geen klok: de pagina geeft de
 * bronnen en "sinds" mee, zodat elke regel hier te testen is.
 *
 * Kleuren betekenen overal hetzelfde:
 *   groen = klaar of live · blauw = loopt / staat klaar · geel = wacht op Luka
 *   rood  = stuk · grijs = ter info
 */

export type BriefKleur = 'groen' | 'blauw' | 'geel' | 'rood' | 'grijs';
export type Wie = 'claude' | 'grok' | 'cursor' | 'chatgpt' | 'bouwlus' | 'dax' | 'luka';

export const WIE_LABEL: Record<Wie, string> = {
  claude: 'Claude (Claude Code sessions)',
  grok: 'Grok Bot',
  cursor: 'Cursor',
  chatgpt: 'ChatGPT / Codex',
  bouwlus: 'AXE build loop (your CLI seats)',
  dax: 'DAX bots (free models)',
  luka: 'You, by hand',
};

export const WIE_VOLGORDE: Wie[] = ['claude', 'grok', 'cursor', 'chatgpt', 'bouwlus', 'dax', 'luka'];

export interface BriefCommit { repo: string; sha: string; titel: string; body: string; auteur: string; datum: string; url: string }
export interface BriefPr {
  repo: string; nummer: number; titel: string; body: string; staat: 'open' | 'merged' | 'closed';
  draft: boolean; head: string; url: string; bijgewerkt: string;
}
export interface BriefTaak { titel: string; status: string; assignee: string | null; requestedBy: string | null; bijgewerkt: string }
export interface BriefMelding { type: string; message: string; createdAt: string }
export interface BriefGezondheid { status: string; degraded: string[] }

export interface BriefInvoer {
  sinds: string;
  commits: BriefCommit[];
  prs: BriefPr[];
  taken: BriefTaak[];
  meldingen: BriefMelding[];
  gezondheid: BriefGezondheid | null;
  /** Bronnen die niet te lezen waren, met waarom. Die staan zelf ook in de brief. */
  bronFouten: string[];
}

export interface BriefRegel { tekst: string; kleur: BriefKleur; link?: string; detail?: string }
export interface BriefSectie { id: string; titel: string; kleur: BriefKleur; samenvatting: string; regels: BriefRegel[] }
export interface Dagbrief { kleur: BriefKleur; kop: string; secties: BriefSectie[] }

/** Wie heeft dit gemaakt? Uit de sporen die elke helper zelf achterlaat. */
export function wieVan(x: { titel: string; body?: string; auteur?: string; head?: string }): Wie {
  const titel = x.titel ?? '';
  const body = x.body ?? '';
  const auteur = x.auteur ?? '';
  const head = x.head ?? '';
  if (/^build next step\b/i.test(titel) || /^AXE build loop\b/i.test(titel) || /AXE build loop, task/i.test(body)) return 'bouwlus';
  if (/^dax\//i.test(head) || /^DAX build\b/i.test(titel)) return 'dax';
  // Op wie het maakte (auteur, trailer, co-author), niet op een naam die in de
  // tekst staat: een Claude-commit die "Grok Bot" noemt is geen Grok-commit.
  if (/claude-session:|co-authored-by: claude|generated with \[claude code\]/i.test(body) || /^claude$/i.test(auteur) || /^claude\//i.test(head)) return 'claude';
  if (/grok bot/i.test(auteur) || /co-authored-by: grok/i.test(body) || /^grok\//i.test(head)) return 'grok';
  if (/cursor agent/i.test(auteur) || /cursoragent@cursor\.com|co-authored-by: cursor|CURSOR_AGENT_PR_BODY/i.test(body) || /^cursor\//i.test(head)) return 'cursor';
  if (/codex|chatgpt/i.test(auteur) || /^(chatgpt|codex)\//i.test(head)) return 'chatgpt';
  return 'luka';
}

const KLEUR_RANG: Record<BriefKleur, number> = { rood: 4, geel: 3, blauw: 2, groen: 1, grijs: 0 };
const ergste = (kleuren: BriefKleur[], anders: BriefKleur = 'grijs'): BriefKleur =>
  kleuren.reduce<BriefKleur>((a, k) => (KLEUR_RANG[k] > KLEUR_RANG[a] ? k : a), kleuren.length ? 'grijs' : anders);

const meervoud = (n: number, een: string, veel: string) => `${n} ${n === 1 ? een : veel}`;

/** "Owner actions: 2 open\n1. ...\n2. ..." -> de genummerde regels. */
export function eigenaarActiesUit(meldingen: BriefMelding[]): string[] {
  const laatste = [...meldingen]
    .filter(m => /^Owner actions: \d+ open/.test(m.message))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (!laatste) return [];
  return laatste.message.split('\n').slice(1).map(r => r.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
}

const WACHT_OP_LUKA = /niet mergen zonder luka|needs (luka|a decision)|wacht op luka|do not merge this pr/i;

function sectieVoorJou(inv: BriefInvoer): BriefSectie {
  const regels: BriefRegel[] = [];
  for (const a of eigenaarActiesUit(inv.meldingen)) regels.push({ tekst: a, kleur: 'geel' });
  for (const pr of inv.prs) {
    if (pr.staat !== 'open' || pr.draft) continue;
    if (WACHT_OP_LUKA.test(`${pr.titel}\n${pr.body}`)) {
      regels.push({ tekst: `Your decision: ${pr.repo} #${pr.nummer} ${pr.titel}`, kleur: 'geel', link: pr.url });
    }
  }
  const gefaald = inv.taken.filter(t => t.status === 'failed');
  if (gefaald.length) regels.push({ tekst: `${meervoud(gefaald.length, 'task', 'tasks')} failed, see Problems below`, kleur: 'rood' });
  return {
    id: 'voor-jou',
    titel: 'Needs you',
    kleur: regels.length ? ergste(regels.map(r => r.kleur)) : 'groen',
    samenvatting: regels.length ? meervoud(regels.length, 'thing waits on you', 'things wait on you') : 'Nothing waits on you.',
    regels: regels.length ? regels : [{ tekst: 'Nothing waits on you right now.', kleur: 'groen' }],
  };
}

function sectiesPerHelper(inv: BriefInvoer): BriefSectie[] {
  const uit: BriefSectie[] = [];
  for (const wie of WIE_VOLGORDE) {
    const commits = inv.commits.filter(c => wieVan(c) === wie);
    const prs = inv.prs.filter(p => wieVan({ titel: p.titel, body: p.body, head: p.head }) === wie);
    if (!commits.length && !prs.length) continue;
    const regels: BriefRegel[] = [];
    const perRepo = new Map<string, BriefCommit[]>();
    for (const c of commits) perRepo.set(c.repo, [...(perRepo.get(c.repo) ?? []), c]);
    for (const [repo, lijst] of perRepo) {
      regels.push({
        tekst: `${repo}: ${meervoud(lijst.length, 'change landed', 'changes landed')}`,
        kleur: 'groen',
        detail: lijst.slice(0, 5).map(c => c.titel).join(' · ') + (lijst.length > 5 ? ` · +${lijst.length - 5} more` : ''),
      });
    }
    for (const pr of prs) {
      const kleur: BriefKleur = pr.staat === 'merged' ? 'groen' : pr.staat === 'closed' ? 'grijs' : pr.draft ? 'blauw' : 'geel';
      const staat = pr.staat === 'merged' ? 'merged' : pr.staat === 'closed' ? 'closed' : pr.draft ? 'draft PR' : 'open PR';
      regels.push({ tekst: `${pr.repo} #${pr.nummer} (${staat}): ${pr.titel}`, kleur, link: pr.url });
    }
    const samen = [
      commits.length ? meervoud(commits.length, 'change', 'changes') : '',
      prs.length ? meervoud(prs.length, 'PR', 'PRs') : '',
    ].filter(Boolean).join(', ');
    uit.push({ id: `wie-${wie}`, titel: WIE_LABEL[wie], kleur: ergste(regels.map(r => r.kleur)), samenvatting: samen, regels });
  }
  return uit;
}

function kleurVanMelding(m: BriefMelding): BriefKleur {
  const t = m.message;
  if (m.type === 'error' || /rolled back|failed|outage|down\b/i.test(t)) return 'rood';
  if (/^Owner actions:/.test(t)) return 'geel';
  if (m.type === 'warning' || /waits|wacht/i.test(t)) return 'geel';
  if (m.type === 'success' || /updated on the VPS|deployed|cleanup:/i.test(t)) return 'groen';
  return 'grijs';
}

const LIVE = /updated on the VPS|deployed|rolled back|cleanup:|update waits|went live|is live/i;

function sectieLive(inv: BriefInvoer): BriefSectie {
  const regels: BriefRegel[] = inv.meldingen
    .filter(m => LIVE.test(m.message))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12)
    .map(m => ({ tekst: m.message.split('\n')[0].slice(0, 220), kleur: kleurVanMelding(m), detail: tijd(m.createdAt) }));
  return {
    id: 'live',
    titel: 'Live and deployed',
    kleur: regels.length ? ergste(regels.map(r => r.kleur)) : 'grijs',
    samenvatting: regels.length ? meervoud(regels.length, 'deploy or upkeep event', 'deploy or upkeep events') : 'No deploys in this window.',
    regels: regels.length ? regels : [{ tekst: 'No deploys or upkeep in this window.', kleur: 'grijs' }],
  };
}

function sectieAxeCore(inv: BriefInvoer): BriefSectie {
  const tel = (s: string) => inv.taken.filter(t => t.status === s).length;
  const klaar = tel('completed');
  const bezig = tel('running') + tel('queued') + tel('pending') + tel('retrying');
  const gefaald = inv.taken.filter(t => t.status === 'failed');
  const regels: BriefRegel[] = [
    { tekst: `${meervoud(klaar, 'task', 'tasks')} completed by AXE agents`, kleur: klaar ? 'groen' : 'grijs' },
    { tekst: `${meervoud(bezig, 'task', 'tasks')} running or waiting in the queue`, kleur: bezig ? 'blauw' : 'grijs' },
  ];
  const perAgent = new Map<string, number>();
  for (const t of inv.taken.filter(x => x.status === 'completed')) {
    const a = t.assignee || t.requestedBy || 'axe';
    perAgent.set(a, (perAgent.get(a) ?? 0) + 1);
  }
  const top = [...perAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (top.length) regels.push({ tekst: 'Busiest: ' + top.map(([a, n]) => `${a} ${n}`).join(', '), kleur: 'grijs' });
  return {
    id: 'axe-core',
    titel: 'AXE Core agents',
    kleur: gefaald.length ? 'rood' : bezig ? 'blauw' : klaar ? 'groen' : 'grijs',
    samenvatting: `${klaar} done, ${bezig} in progress, ${gefaald.length} failed`,
    regels,
  };
}

function sectieProblemen(inv: BriefInvoer): BriefSectie {
  const regels: BriefRegel[] = [];
  const gefaald = inv.taken.filter(t => t.status === 'failed');
  const perTitel = new Map<string, number>();
  for (const t of gefaald) perTitel.set(t.titel, (perTitel.get(t.titel) ?? 0) + 1);
  for (const [titel, n] of perTitel) regels.push({ tekst: n > 1 ? `${titel} (${n}x)` : titel, kleur: 'rood' });
  for (const d of inv.gezondheid?.degraded ?? []) regels.push({ tekst: `System check failing: ${d}`, kleur: 'rood' });
  for (const m of inv.meldingen) {
    if (kleurVanMelding(m) === 'rood' && !LIVE.test(m.message)) regels.push({ tekst: m.message.split('\n')[0].slice(0, 200), kleur: 'rood', detail: tijd(m.createdAt) });
  }
  for (const f of inv.bronFouten) regels.push({ tekst: `Not readable: ${f}`, kleur: 'geel' });
  return {
    id: 'problemen',
    titel: 'Problems',
    kleur: regels.length ? ergste(regels.map(r => r.kleur)) : 'groen',
    samenvatting: regels.length ? meervoud(regels.length, 'item', 'items') : 'Nothing broken.',
    regels: regels.length ? regels.slice(0, 15) : [{ tekst: 'Nothing broken in this window.', kleur: 'groen' }],
  };
}

function tijd(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(5, 16).replace('T', ' ') + ' UTC';
}

/** De hele brief. De volgorde is de leesvolgorde: eerst wat jou nodig heeft. */
export function maakDagbrief(inv: BriefInvoer): Dagbrief {
  const secties = [
    sectieVoorJou(inv),
    sectieProblemen(inv),
    ...sectiesPerHelper(inv),
    sectieLive(inv),
    sectieAxeCore(inv),
  ];
  const helpers = sectiesPerHelper(inv).length;
  const kleur = ergste([secties[0].kleur, secties[1].kleur]);
  const kop = kleur === 'rood'
    ? 'Something is broken. Start with Problems.'
    : kleur === 'geel'
      ? 'All running. A few things wait on you.'
      : 'All green. Nothing waits on you.';
  return { kleur, kop: `${kop} ${meervoud(inv.commits.length, 'change', 'changes')} by ${meervoud(helpers, 'helper', 'helpers')}.`, secties };
}
