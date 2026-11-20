/**
 * De shortlist onder elke terminal: wat je op DEZE machine meestal doet.
 *
 * ## Waarom per host en niet één lijst
 *
 * De oude terminal had één rij knoppen die op elke machine hetzelfde deed. Met
 * vijf machines naast elkaar is dat niet alleen nutteloos maar gevaarlijk:
 * `systemctl restart` hoort op een VPS en nergens anders, `npm run bijwerken`
 * op een Mac. Een knop die op de verkeerde machine landt is erger dan geen knop.
 *
 * ## Waarom ze niet vanzelf uitvoeren
 *
 * Elke actie wordt in de prompt GEZET, niet verstuurd -- behalve de acties die
 * aantoonbaar niets veranderen. Je ziet dus wat er staat voor je enter drukt.
 * Een knop die meteen een dienst herstart is één misklik van een onderbreking
 * af. Een test bewaakt dat alles met `leestAlleen` ook echt niets muteert.
 *
 * ## De groepen
 *
 * Vijftien knoppen op een rij is een muur. Gegroepeerd zoek je op wat je wilt
 * DOEN -- de machine bedienen, een agent inloggen, iets met git -- in plaats van
 * op een label dat je moet herkennen.
 */

export type Groep = 'machine' | 'agents' | 'git';

export const GROEP_LABEL: Record<Groep, string> = {
  machine: 'machine',
  agents: 'agents',
  git: 'git',
};

export interface Snelactie {
  label: string;
  cmd: string;
  /** Wat het doet, in gewone taal. Staat zichtbaar onder de rij. */
  uitleg: string;
  groep: Groep;
  /** Alleen waar voor acties die niets veranderen; die mogen meteen draaien. */
  leestAlleen?: boolean;
  /**
   * Waar voor een commando dat NIET terugkomt: het blijft in de voorgrond
   * draaien en het venster is daarna bezet.
   *
   * Dit is het verschil dat je moet weten vóór je klikt, en dat nergens stond.
   * Je start `npm run terminal`, de prompt komt niet terug, en dan lijkt het
   * alsof er iets vastloopt -- terwijl dat precies is wat er moet gebeuren.
   * Sluit je het venster, dan valt de dienst om.
   */
  blijftDraaien?: boolean;
}

/** Waar de repo op een Mac staat. Eén plek, want hij komt in vier commando's terug. */
const REPO_MAC = '~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS';

/** Inloggen op de abonnementen. Op elke machine hetzelfde, en op elke machine
 *  apart nodig -- een sessie verhuist niet mee. */
/**
 * Extra abonnementen (Luka 20 nov: "een sneltoets voor allemaal, ook Claude
 * login 2 en 3"). Elk gaat naar zijn eigen map, en de inlogpagina opent in een
 * privévenster -- in je gewone browser keurde hij meteen account 1 goed.
 * Alleen op een Mac: daar staat het script en is er een browser.
 */
const EXTRA_LOGINS = (repo: string): Snelactie[] => [
  { label: 'OpenCode Free', cmd: `cd ${repo} && opencode -m opencode/inkling-2-small-free`, uitleg: 'Start Inkling Free in deze checkout', groep: 'agents' },
  { label: 'Kilo Auto Free', cmd: `cd ${repo} && kilo -m kilo/kilo-auto/free`, uitleg: 'Start Kilo met de gratis modelkeuze', groep: 'agents' },
  { label: 'Google Antigravity', cmd: `cd ${repo} && agy`, uitleg: 'Start de Google-agent en meld je aan met je persoonlijke account', groep: 'agents' },
  { label: 'Gratis agents installeren', cmd: 'npm i -g opencode-ai @kilocode/cli && curl -fsSL https://antigravity.google/cli/install.sh | bash', uitleg: 'Installeer de drie extra agents op deze Mac', groep: 'agents' },
  ...(['tweede', 'derde', 'vierde'] as const).map((n, i) => ({
    label: `Claude login ${i + 2}`,
    cmd: `${repo}/scripts/prive-login.sh claude ~/.claude-${n}`,
    uitleg: `Claude-account ${i + 2} -- privévenster, kies daar het andere account`,
    groep: 'agents' as const,
  })),
  ...(['tweede', 'derde'] as const).map((n, i) => ({
    label: `Codex login ${i + 2}`,
    cmd: `${repo}/scripts/prive-login.sh codex ~/.codex-${n}`,
    uitleg: `ChatGPT-account ${i + 2} -- privévenster, typ daar de code die hier staat`,
    groep: 'agents' as const,
  })),
  {
    label: 'Cursor 2',
    cmd: `bash ${repo}/scripts/zet_cursor2_sleutel.sh`,
    uitleg: 'Tweede Cursor-account: zet de sleutel van dat account',
    groep: 'agents',
  },
];

const AGENT_ACTIES = (cd: string): Snelactie[] => [
  {
    label: 'Welke agents',
    cmd: 'for b in claude codex cursor-agent opencode kilo agy; do printf "%-8s %s\\n" "$b" "$(command -v $b || echo ONTBREEKT)"; done',
    uitleg: 'Welke code-CLI\'s op deze machine staan',
    groep: 'agents',
    leestAlleen: true,
  },
  {
    label: 'Claude login',
    cmd: 'claude auth login',
    uitleg: 'Inloggen met je Claude Pro-abonnement — geen API-sleutel',
    groep: 'agents',
  },
  {
    label: 'Codex login',
    cmd: 'codex login',
    uitleg: 'Inloggen met je ChatGPT Plus-abonnement',
    groep: 'agents',
  },
  {
    label: 'Cursor login',
    cmd: 'cursor-agent login',
    uitleg: 'Inloggen met je Cursor-abonnement',
    groep: 'agents',
  },
  {
    label: 'Agents installeren',
    cmd: 'npm i -g @anthropic-ai/claude-code @openai/codex && curl https://cursor.com/install -fsS | bash',
    uitleg: 'Alle drie de code-CLI\'s installeren',
    groep: 'agents',
  },
  {
    label: 'Sleutels?',
    // De valkuil die in agent_runner.py bovenaan staat: een CLI die een sleutel
    // in zijn omgeving vindt authenticeert daarmee in plaats van met je
    // abonnement -- en dan betaalt de gemeterde API terwijl er in de logs niets
    // verandert. Dit laat zien of dat risico er is.
    cmd: `${cd} && for k in ANTHROPIC_API_KEY OPENAI_API_KEY OPENAI_BASE_URL ANTHROPIC_AUTH_TOKEN; do printf "%-22s %s\\n" "$k" "$([ -n "\${!k}" ] && echo GEZET || echo leeg)"; done`,
    uitleg: 'Staat er een API-sleutel in de omgeving? Die wint van je abonnement',
    groep: 'agents',
    leestAlleen: true,
  },
];

const GIT_ACTIES = (pad: string): Snelactie[] => [
  {
    label: 'Status',
    cmd: `git -C ${pad} status -sb`,
    uitleg: 'Welke branch, en wat er gewijzigd is',
    groep: 'git',
    leestAlleen: true,
  },
  {
    label: 'Laatste commits',
    cmd: `git -C ${pad} log --oneline -10`,
    uitleg: 'De tien laatste commits',
    groep: 'git',
    leestAlleen: true,
  },
  {
    label: 'Pull',
    cmd: `git -C ${pad} pull origin $(git -C ${pad} rev-parse --abbrev-ref HEAD)`,
    uitleg: 'Binnenhalen op de huidige branch',
    groep: 'git',
  },
  {
    label: 'Wat loopt achter',
    cmd: `git -C ${pad} fetch -q origin && git -C ${pad} log --oneline HEAD..@{u} | head -20`,
    uitleg: 'Welke commits er op origin staan die hier nog niet zijn',
    groep: 'git',
    leestAlleen: true,
  },
];

/**
 * De vier Mac-vakken hebben elk hun EIGEN lijst.
 *
 * Ze draaien op dezelfde machine, maar niet voor hetzelfde. Eén lijst met alles
 * erin betekent dat je in het git-vak langs de bouwcommando's scrolt en in het
 * bouw-vak langs de agent-logins -- en dan zoek je elke keer opnieuw. Waar een
 * vak voor is, bepaalt wat erin staat.
 *
 * Agents en git staan wél overal: die zijn niet aan een rol gebonden.
 */
const MAC_REPO: Snelactie[] = [
  {
    label: 'App bijwerken',
    cmd: `cd ${REPO_MAC} && npm run bijwerken`,
    uitleg: 'Binnenhalen, bouwen, opruimen en de nieuwe AXE CORE starten',
    groep: 'machine',
  },
  {
    label: 'Welke bouw',
    cmd: `cd ${REPO_MAC} && npm run welke`,
    uitleg: 'Welke commit zit er in elke AXE CORE.app op deze Mac',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Tests',
    cmd: `cd ${REPO_MAC} && npx vitest run`,
    uitleg: 'De hele testsuite',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Schijf',
    cmd: 'df -h / | tail -1; echo; du -sh ~/AXE-CORE- 2>/dev/null',
    uitleg: 'Vrije ruimte, en hoe groot de repo is',
    groep: 'machine',
    leestAlleen: true,
  },
];

const MAC_API: Snelactie[] = [
  {
    label: 'Draait de API',
    cmd: 'curl -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:8001/health || echo "geen antwoord"',
    uitleg: 'Antwoordt de lokale API op poort 8001',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Logs volgen',
    cmd: `tail -f ${REPO_MAC}/.axe-logs/api.log`,
    uitleg: 'De uitvoer van de API die AXE CORE zelf startte',
    groep: 'machine',
    blijftDraaien: true,
  },
  {
    label: 'Zelf starten',
    cmd: `cd ${REPO_MAC}/backend/axe_api && ./run-local.sh`,
    uitleg: 'Alleen nodig als AXE CORE hem niet kon starten — zie de strip bovenaan',
    groep: 'machine',
    blijftDraaien: true,
  },
  {
    label: 'Poort 8001 vrij',
    cmd: 'lsof -ti :8001 | xargs kill',
    uitleg: 'Sluit wat er op 8001 luistert ("address already in use")',
    groep: 'machine',
  },
  {
    label: 'Wat draait er',
    cmd: 'ps aux | grep -E "uvicorn|terminal-server" | grep -v grep; lsof -nP -iTCP:8001 -iTCP:4022 -sTCP:LISTEN 2>/dev/null',
    uitleg: 'De lokale API, de shell-server en hun poorten',
    groep: 'machine',
    leestAlleen: true,
  },
];

const MAC_AGENTS: Snelactie[] = [
  {
    label: 'Codex proberen',
    // MET de cd, en dat is het hele punt. Gemeten 13 september 2026: dezelfde
    // aanroep vanuit ~ geeft "Not inside a trusted directory and
    // --skip-git-repo-check was not specified" -- codex weigert buiten een
    // checkout te draaien. Dat leest als "codex is stuk" terwijl hij prima is
    // ingelogd, dus een diagnose zonder werkmap stelt de verkeerde vraag.
    // De chat draait zelf ook in een checkout (agent_runner geeft cwd=repo mee),
    // dus dit is dezelfde omstandigheid en daarmee een eerlijke proef.
    cmd: `cd ${REPO_MAC} && codex exec "zeg alleen: ok" 2>&1 | tail -5`,
    uitleg: 'Antwoordt Codex vanuit de repo? Zo niet: de regel eronder zegt waarom',
    groep: 'agents',
    leestAlleen: true,
  },
  {
    label: 'Codex-login',
    cmd: 'codex login status 2>&1 | tail -3',
    uitleg: 'Staat het ChatGPT-abonnement erachter, of is hij uitgelogd',
    groep: 'agents',
    leestAlleen: true,
  },
  {
    label: 'Claude proberen',
    cmd: `cd ${REPO_MAC} && claude -p "zeg alleen: ok" 2>&1 | tail -5`,
    uitleg: 'Antwoordt Claude Code op je abonnement',
    groep: 'agents',
    leestAlleen: true,
  },
];

/**
 * Het git-vak krijgt wat NIET in GIT_ACTIES staat.
 *
 * Die gedeelde lijst is het minimum dat op elke machine klopt: status, log,
 * pull. Dit vak is er om echt met git te werken, en dan wil je ook de dingen
 * die je niet blind op een VPS wilt aanbieden.
 */
const MAC_GIT: Snelactie[] = [
  {
    label: 'Diff',
    cmd: `git -C ${REPO_MAC} diff --stat`,
    uitleg: 'Wat is er gewijzigd, per bestand',
    groep: 'git',
    leestAlleen: true,
  },
  {
    label: 'Takken',
    cmd: `git -C ${REPO_MAC} branch -vv`,
    uitleg: 'Welke takken er zijn en waar ze op staan',
    groep: 'git',
    leestAlleen: true,
  },
  {
    label: 'Pushen',
    // -u origin <tak>, zoals afgesproken: nooit naar een andere tak dan waar je
    // op staat, en de tak expliciet in het commando zodat je hem ziet.
    cmd: `git -C ${REPO_MAC} push -u origin $(git -C ${REPO_MAC} rev-parse --abbrev-ref HEAD)`,
    uitleg: 'Naar origin, op de tak waar je nu op staat',
    groep: 'git',
  },
  {
    label: 'Onbekende bestanden',
    // De val waar npm run bijwerken op stopte: hij weigert bij ELKE lokale
    // wijziging, en onbekende bestanden zijn er daar één van.
    cmd: `git -C ${REPO_MAC} ls-files --others --exclude-standard`,
    uitleg: 'Wat git niet kent — hier stopt npm run bijwerken op',
    groep: 'git',
    leestAlleen: true,
  },
];

/** Waar de deploy-kopie op een VPS staat. */
const REPO_VPS = '/opt/axe-core-api';
/** De Companion-checkout op diezelfde box. Andere repo, andere dienst. */
const REPO_COMPANION = '/root/AXE-COMPANION-OS-';

const VPS: Snelactie[] = [
  {
    label: 'Wat draait daar',
    cmd: `ls -la ${REPO_VPS} | head -5; echo; git -C ${REPO_VPS} status -sb 2>&1 | head -3`,
    uitleg: 'Wat er in de deploy-map staat, en of het een git-checkout is',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Deploy',
    // `&&` en niet `;`: mislukt de pull, dan mag de herstart NIET doorgaan.
    // Met een puntkomma herstart je de oude code en ziet het eruit alsof de
    // deploy lukte -- de faalwijze waar deze codebase een naam voor heeft.
    cmd: `cd ${REPO_VPS} && git pull && systemctl restart axe-core-api && systemctl --no-pager status axe-core-api --lines=5`,
    uitleg: 'Binnenhalen, herstarten, en meteen tonen of hij weer draait',
    groep: 'machine',
  },
  {
    label: 'Companion uitrollen',
    // De hele keten in één regel, met `&&` ertussen: mislukt de merge of de
    // build, dan mag de herstart NIET doorgaan. Met puntkomma's herstart je de
    // oude code en ziet het eruit alsof de deploy lukte.
    //
    // `--ff-only` en geen gewone merge: komt er een commit op deployed die niet
    // op de bronbranch zit, dan hoort dit te stoppen en niet stilletzwijgend te
    // mergen op een machine waar niemand het resultaat nakijkt.
    //
    // Waarom dit hier staat en niet in een document: op een telefoon typ je dit
    // niet. Eén tik is het verschil tussen "ik kan het onderweg" en "het moet
    // wachten tot ik thuis ben".
    cmd: `cd ${REPO_COMPANION} && git fetch origin && git merge --ff-only origin/claude/axe-companion-audit-launch-nz58dg && npm ci && npm run build && systemctl restart axe-companion && systemctl --no-pager status axe-companion --lines=3`,
    uitleg: 'Companion binnenhalen, bouwen en herstarten — stopt bij de eerste fout',
    groep: 'machine',
  },
  {
    label: 'Companion: geheugen vrij',
    // Die box zat op 79% met een cap van 3G; een build wordt daar gedood.
    // Zie docs/VPS-RUNBOOK.md — de zwaarste buur even opzij.
    cmd: 'systemctl stop axe-browser-agent && echo "browser-agent uit — start hem na de build weer"',
    uitleg: 'Ruimte maken als de Companion-build op geheugen sneuvelt',
    groep: 'machine',
  },
  {
    label: 'Companion: live check',
    // Niet "is de dienst gestart" maar "serveert hij de nieuwe code". Een
    // mislukte build laat het oude proces vrolijk doordraaien. tos-chart-dock
    // bleef 1 op oude én nieuwe builds; /api/debug/build noemt commit + age.
    cmd: `curl -fsS https://www.axecompanion.com/api/debug/build | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("shortCommit"), "age_s="+str(d.get("ageSeconds")), "branch="+str(d.get("branch"))); raise SystemExit(0 if d.get("shortCommit") and int(d.get("ageSeconds") or 10**9) < 86400*14 else 1)'`,
    uitleg: 'Toont live shortCommit + leeftijd; exit 1 als build-info ontbreekt of ouder dan 14 dagen',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Diensten',
    cmd: 'systemctl --no-pager status axe-core-api axe-terminal axe-companion axe-task-worker --lines=0',
    uitleg: 'Draaien de AXE-diensten nog',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Logs API',
    cmd: 'journalctl -u axe-core-api -n 60 --no-pager',
    uitleg: 'De laatste zestig regels van de API',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Logs terminal',
    cmd: 'journalctl -u axe-terminal -n 40 --no-pager',
    uitleg: 'Wie er geweigerd of toegelaten is op deze terminal',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Herstart alles',
    cmd: 'systemctl restart axe-core-api axe-terminal axe-task-worker && systemctl --no-pager status axe-core-api --lines=3',
    uitleg: 'Alle AXE-diensten opnieuw starten',
    groep: 'machine',
  },
  {
    label: 'Schijf & geheugen',
    cmd: 'df -h / | tail -1; echo; free -h | head -2',
    uitleg: 'Ruimte en geheugen — een volle schijf laat diensten stil falen',
    groep: 'machine',
    leestAlleen: true,
  },
  ...AGENT_ACTIES(`cd ${REPO_VPS}`),
  ...GIT_ACTIES(REPO_VPS),
];

/** Wat er op een machine staat die we niet kennen: het minimum dat overal werkt,
 *  plus de agents en git -- die zijn niet machinegebonden. */
const ONBEKEND: Snelactie[] = [
  {
    label: 'Waar ben ik',
    cmd: 'hostname && pwd && whoami && uname -a',
    uitleg: 'Welke machine, welke map, welke gebruiker',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Schijf',
    cmd: 'df -h . | tail -1',
    uitleg: 'Vrije ruimte',
    groep: 'machine',
    leestAlleen: true,
  },
  ...AGENT_ACTIES('cd ~'),
  ...GIT_ACTIES('.'),
];

/**
 * De lijst voor deze host.
 *
 * Op id en niet op het adres: een machine kan verhuizen zonder dat zijn rol
 * verandert. Een onbekende host krijgt het veilige minimum in plaats van de
 * lijst van een andere machine.
 */
export function snelactiesVoor(hostId: string): Snelactie[] {
  const metAgentsEnGit = (eigen: Snelactie[], cd: string, pad: string) =>
    [...eigen, ...AGENT_ACTIES(cd), ...EXTRA_LOGINS(pad), ...GIT_ACTIES(pad)];

  if (hostId === 'deze-mac') return metAgentsEnGit(MAC_REPO, `cd ${REPO_MAC}`, REPO_MAC);
  if (hostId === 'mac-api') return metAgentsEnGit(MAC_API, `cd ${REPO_MAC}`, REPO_MAC);
  if (hostId === 'mac-agents') return metAgentsEnGit(MAC_AGENTS, `cd ${REPO_MAC}`, REPO_MAC);
  if (hostId === 'mac-git') return metAgentsEnGit(MAC_GIT, `cd ${REPO_MAC}`, REPO_MAC);
  // De iMac is een Mac zonder eigen rol: de bouwcommando's zijn daar hetzelfde.
  if (hostId === 'imac') return metAgentsEnGit(MAC_REPO, `cd ${REPO_MAC}`, REPO_MAC);
  if (hostId.startsWith('vps')) return VPS;
  return ONBEKEND;
}

/** De acties van één groep, in de volgorde waarin ze gedefinieerd zijn. */
export function actiesVanGroep(acties: Snelactie[], groep: Groep): Snelactie[] {
  return acties.filter(a => a.groep === groep);
}

/**
 * Wat er op deze machine moet BLIJVEN draaien.
 *
 * Voor het lijstje in de app en in docs/TERMINALS.md: welke vensters je open
 * moet laten staan. Een dienst die je per ongeluk afsluit valt om, en dan is
 * het volgende dat je merkt een 404 of een terminal die niet verbindt -- zonder
 * dat iets zegt waarom.
 */
export function blijvendDraaiend(hostId: string): Snelactie[] {
  return snelactiesVoor(hostId).filter(a => a.blijftDraaien);
}
