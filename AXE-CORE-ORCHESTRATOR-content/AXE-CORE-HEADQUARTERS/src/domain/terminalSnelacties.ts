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
const AGENT_ACTIES = (cd: string): Snelactie[] => [
  {
    label: 'Welke agents',
    cmd: 'for b in claude codex cursor; do printf "%-8s %s\\n" "$b" "$(command -v $b || echo ONTBREEKT)"; done',
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
    // De faalwijze uit de routeringslog: "codex gaf geen antwoord: Codex
    // eindigde". Dat is wat je ziet als hij niet is ingelogd -- hij stopt
    // zonder uitvoer in plaats van om een login te vragen. Dit laat zien of
    // dat het is.
    cmd: 'codex exec "zeg alleen: ok" 2>&1 | tail -5',
    uitleg: 'Antwoordt Codex? Stil afbreken betekent meestal: niet ingelogd',
    groep: 'agents',
    leestAlleen: true,
  },
  {
    label: 'Claude proberen',
    cmd: 'claude -p "zeg alleen: ok" 2>&1 | tail -5',
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
    [...eigen, ...AGENT_ACTIES(cd), ...GIT_ACTIES(pad)];

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
