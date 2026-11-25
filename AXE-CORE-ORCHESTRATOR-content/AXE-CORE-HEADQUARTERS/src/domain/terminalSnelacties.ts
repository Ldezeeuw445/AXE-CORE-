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

/**
 * Welk abonnement op welke machine (Luka, 21 nov: "de juiste sneltoets onder de
 * juiste terminal, zodat het niet fout kan gaan").
 *
 * Eén account hoort op één machine: hetzelfde account op twee machines geeft geen
 * extra limiet, ze trekken samen aan dezelfde. De verdeling:
 *
 *   VPS API   Claude 1 (205@gmail), Codex 1 (support@), Cursor 1 (4@gmail), OpenCode, Kilo -- altijd aan
 *   Mac mini  Claude 2 (4@gmail), Cursor 2 (hotmail), Google Antigravity -- wat een Mac met scherm nodig heeft
 *   iMac      Claude 3 (support@), Codex 2 (hotmail) -- voor wat Luka zelf doet
 *
 * Luka heeft 3 Claude-, 2 ChatGPT- en 2 Cursor-accounts (21 nov). Een vierde Claude
 * of derde Codex bestaat niet; die knoppen zijn weg. De mailhint in elke uitleg is
 * het account waarmee die knop echt ingelogd is.
 *
 * De vier "Mac · ..."-vakken zijn de Mac waarop AXE CORE draait. Op de iMac is dat
 * dus de iMac. Daarom controleert elke Mac-knop zelf op welke machine hij staat:
 * op de verkeerde doet hij niets en zegt hij waar hij hoort.
 */
const OP_IMAC = 'hostname | grep -qi imac';

/** Alleen op de Mac mini; op de iMac zegt hij waar hij heen moet. */
export const alleenMacMini = (cmd: string) =>
  `if ${OP_IMAC}; then echo "This is the iMac. This button belongs on the Mac mini: open AXE CORE there, box Mac · agents."; else ${cmd}; fi`;

/** Alleen op de iMac. */
export const alleenImac = (cmd: string) =>
  `if ${OP_IMAC}; then ${cmd}; else echo "This is $(hostname), not the iMac. This button belongs in the iMac box."; fi`;

const WELKE_AGENTS: Snelactie = {
  label: 'Which agents',
  cmd: 'for b in claude codex cursor-agent opencode kilo agy; do printf "%-13s %s\\n" "$b" "$(command -v $b || echo MISSING)"; done',
  uitleg: 'Which code CLIs are on this machine',
  groep: 'agents',
  leestAlleen: true,
};

const SLEUTELS = (cd: string): Snelactie => ({
  label: 'Keys?',
  // De valkuil die in agent_runner.py bovenaan staat: een CLI die een sleutel
  // in zijn omgeving vindt authenticeert daarmee in plaats van met je
  // abonnement -- en dan betaalt de gemeterde API terwijl er in de logs niets
  // verandert. Dit laat zien of dat risico er is.
  cmd: `${cd} && for k in ANTHROPIC_API_KEY OPENAI_API_KEY OPENAI_BASE_URL ANTHROPIC_AUTH_TOKEN; do printf "%-22s %s\\n" "$k" "$([ -n "\${!k}" ] && echo SET || echo empty)"; done`,
  uitleg: 'Is there an API key in the environment? It wins over your subscription',
  groep: 'agents',
  leestAlleen: true,
});

/** Mac mini: Claude 2, Cursor 2, Antigravity. */
const MAC_MINI_LOGINS = (repo: string): Snelactie[] => [
  WELKE_AGENTS,
  {
    label: 'Claude login 2',
    cmd: alleenMacMini(`${repo}/scripts/prive-login.sh claude ~/.claude-tweede`),
    uitleg: 'Claude account 2 (lukadezeeuw4@gmail), on the Mac mini -- private window, pick that account',
    groep: 'agents',
  },
  {
    label: 'Cursor 2',
    cmd: alleenMacMini(`bash ${repo}/scripts/zet_cursor2_sleutel.sh`),
    uitleg: 'Cursor account 2 (hotmail), on the Mac mini: set that account’s key',
    groep: 'agents',
  },
  {
    label: 'Install Antigravity',
    cmd: alleenMacMini('curl -fsSL https://antigravity.google/cli/install.sh | bash'),
    uitleg: 'Put Google Antigravity on the Mac mini',
    groep: 'agents',
  },
  {
    label: 'Google Antigravity',
    cmd: alleenMacMini(`cd ${repo} && agy`),
    uitleg: 'Start Antigravity on the Mac mini; sign in with your Google account',
    groep: 'agents',
  },
  SLEUTELS(`cd ${repo}`),
];

/** iMac: Claude 3, ChatGPT/Codex 2. */
const IMAC_LOGINS = (repo: string): Snelactie[] => [
  WELKE_AGENTS,
  {
    label: 'Claude login 3',
    cmd: alleenImac(`${repo}/scripts/prive-login.sh claude ~/.claude-derde`),
    uitleg: 'Claude account 3 (support@axeheadquarters), on the iMac -- private window, pick that account',
    groep: 'agents',
  },
  {
    label: 'Codex login 2',
    cmd: alleenImac(`${repo}/scripts/prive-login.sh codex ~/.codex`),
    uitleg: 'ChatGPT account 2 (hotmail), on the iMac -- private window, type the code shown here',
    groep: 'agents',
  },
  SLEUTELS(`cd ${repo}`),
];

/**
 * VPS API: de meeste accounts, want die machine staat altijd aan. Er is geen
 * browser: Claude en Cursor geven een link, Codex een link plus code
 * (--device-auth). Een tweede account krijgt een eigen map (CLAUDE_CONFIG_DIR,
 * CODEX_HOME), net als op de Mac.
 */
const VPS_LOGINS = (repo: string): Snelactie[] => [
  WELKE_AGENTS,
  {
    label: 'Install agents',
    cmd: 'npm i -g @anthropic-ai/claude-code @openai/codex opencode-ai @kilocode/cli && curl https://cursor.com/install -fsS | bash',
    uitleg: 'Put Claude Code, Codex, OpenCode, Kilo and Cursor on the VPS',
    groep: 'agents',
  },
  {
    label: 'Agents session',
    // tmux: de agents draaien door als je dit venster of de app sluit. -A: bestaat
    // hij al, dan stap je erin in plaats van een tweede te maken.
    cmd: 'tmux new -A -s agents',
    uitleg: 'Open the fixed agents session (tmux). Ctrl+b c = new window, Ctrl+b d = detach, it keeps running',
    groep: 'agents',
    blijftDraaien: true,
  },
  {
    label: 'Claude login 1',
    cmd: 'claude auth login',
    uitleg: 'Claude account 1 (lukadezeeuw205@gmail) -- open the link on your Mac, pick that account, paste the code here',
    groep: 'agents',
  },
  {
    label: 'Codex login 1',
    cmd: 'codex login --device-auth',
    uitleg: 'ChatGPT account 1 (support@axeheadquarters) -- open the link and type the code shown here',
    groep: 'agents',
  },
  {
    label: 'Cursor login 1',
    cmd: 'cursor-agent login',
    uitleg: 'Cursor account 1 (lukadezeeuw4@gmail) -- open the link and sign in',
    groep: 'agents',
  },
  {
    label: 'OpenCode login',
    cmd: 'opencode auth login',
    uitleg: 'Connect OpenCode; pick the account or provider there',
    groep: 'agents',
  },
  {
    label: 'OpenCode Free',
    cmd: `cd ${repo} && opencode --pure -m opencode/beam-free`,
    uitleg: 'Start OpenCode with the free model',
    groep: 'agents',
  },
  {
    label: 'Kilo Auto Free',
    cmd: `cd ${repo} && kilo -m kilo/kilo-auto/free`,
    uitleg: 'Start Kilo with the free model choice',
    groep: 'agents',
  },
  SLEUTELS(`cd ${repo}`),
];

const GIT_ACTIES = (pad: string): Snelactie[] => [
  {
    label: 'Status',
    cmd: `git -C ${pad} status -sb`,
    uitleg: 'Which branch, and what changed',
    groep: 'git',
    leestAlleen: true,
  },
  {
    label: 'Latest commits',
    cmd: `git -C ${pad} log --oneline -10`,
    uitleg: 'The last ten commits',
    groep: 'git',
    leestAlleen: true,
  },
  {
    label: 'Pull',
    cmd: `git -C ${pad} pull origin $(git -C ${pad} rev-parse --abbrev-ref HEAD)`,
    uitleg: 'Pull on the current branch',
    groep: 'git',
  },
  {
    label: 'What is behind',
    cmd: `git -C ${pad} fetch -q origin && git -C ${pad} log --oneline HEAD..@{u} | head -20`,
    uitleg: 'Which commits are on origin but not here yet',
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
    label: 'Update app',
    cmd: `cd ${REPO_MAC} && npm run bijwerken`,
    uitleg: 'Pull, build, clean up and start the new AXE CORE',
    groep: 'machine',
  },
  {
    label: 'Which build',
    cmd: `cd ${REPO_MAC} && npm run welke`,
    uitleg: 'Which commit is in each AXE CORE.app on this Mac',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Tests',
    cmd: `cd ${REPO_MAC} && npx vitest run`,
    uitleg: 'The whole test suite',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Disk',
    cmd: 'df -h / | tail -1; echo; du -sh ~/AXE-CORE- 2>/dev/null',
    uitleg: 'Free space, and how big the repo is',
    groep: 'machine',
    leestAlleen: true,
  },
];

const MAC_API: Snelactie[] = [
  {
    label: 'Is the API running',
    cmd: 'curl -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:8001/health || echo "no answer"',
    uitleg: 'Does the local API answer on port 8001',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Follow logs',
    cmd: `tail -f ${REPO_MAC}/.axe-logs/api.log`,
    uitleg: 'The output of the API that AXE CORE started itself',
    groep: 'machine',
    blijftDraaien: true,
  },
  {
    label: 'Start it yourself',
    cmd: `cd ${REPO_MAC}/backend/axe_api && ./run-local.sh`,
    uitleg: 'Only needed if AXE CORE could not start it — see the strip at the top',
    groep: 'machine',
    blijftDraaien: true,
  },
  {
    label: 'Free port 8001',
    cmd: 'lsof -ti :8001 | xargs kill',
    uitleg: 'Close whatever listens on 8001 ("address already in use")',
    groep: 'machine',
  },
  {
    label: 'What is running',
    cmd: 'ps aux | grep -E "uvicorn|terminal-server" | grep -v grep; lsof -nP -iTCP:8001 -iTCP:4022 -sTCP:LISTEN 2>/dev/null',
    uitleg: 'The local API, the shell server and their ports',
    groep: 'machine',
    leestAlleen: true,
  },
];

const MAC_AGENTS: Snelactie[] = [
  {
    label: 'Try Codex',
    // MET de cd, en dat is het hele punt. Gemeten 13 september 2026: dezelfde
    // aanroep vanuit ~ geeft "Not inside a trusted directory and
    // --skip-git-repo-check was not specified" -- codex weigert buiten een
    // checkout te draaien. Dat leest als "codex is stuk" terwijl hij prima is
    // ingelogd, dus een diagnose zonder werkmap stelt de verkeerde vraag.
    // De chat draait zelf ook in een checkout (agent_runner geeft cwd=repo mee),
    // dus dit is dezelfde omstandigheid en daarmee een eerlijke proef.
    cmd: `cd ${REPO_MAC} && codex exec "zeg alleen: ok" 2>&1 | tail -5`,
    uitleg: 'Does Codex answer from the repo? If not, the line below says why',
    groep: 'agents',
    leestAlleen: true,
  },
  {
    label: 'Codex-login',
    cmd: 'codex login status 2>&1 | tail -3',
    uitleg: 'Is the ChatGPT subscription behind it, or is it signed out',
    groep: 'agents',
    leestAlleen: true,
  },
  {
    label: 'Try Claude',
    cmd: `cd ${REPO_MAC} && claude -p "zeg alleen: ok" 2>&1 | tail -5`,
    uitleg: 'Does Claude Code answer on your subscription',
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
    uitleg: 'What changed, per file',
    groep: 'git',
    leestAlleen: true,
  },
  {
    label: 'Branches',
    cmd: `git -C ${REPO_MAC} branch -vv`,
    uitleg: 'Which branches exist and where they point',
    groep: 'git',
    leestAlleen: true,
  },
  {
    label: 'Push',
    // -u origin <tak>, zoals afgesproken: nooit naar een andere tak dan waar je
    // op staat, en de tak expliciet in het commando zodat je hem ziet.
    cmd: `git -C ${REPO_MAC} push -u origin $(git -C ${REPO_MAC} rev-parse --abbrev-ref HEAD)`,
    uitleg: 'To origin, on the branch you are on now',
    groep: 'git',
  },
  {
    label: 'Untracked files',
    // De val waar npm run bijwerken op stopte: hij weigert bij ELKE lokale
    // wijziging, en onbekende bestanden zijn er daar één van.
    cmd: `git -C ${REPO_MAC} ls-files --others --exclude-standard`,
    uitleg: 'What git does not know — npm run bijwerken stops on this',
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
    label: 'What runs there',
    cmd: `ls -la ${REPO_VPS} | head -5; echo; git -C ${REPO_VPS} status -sb 2>&1 | head -3`,
    uitleg: 'What is in the deploy folder, and whether it is a git checkout',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Deploy',
    // `&&` en niet `;`: mislukt de pull, dan mag de herstart NIET doorgaan.
    // Met een puntkomma herstart je de oude code en ziet het eruit alsof de
    // deploy lukte -- de faalwijze waar deze codebase een naam voor heeft.
    cmd: `cd ${REPO_VPS} && git pull && systemctl restart axe-core-api && systemctl --no-pager status axe-core-api --lines=5`,
    uitleg: 'Pull, restart, and show right away whether it runs again',
    groep: 'machine',
  },
  {
    label: 'Roll out Companion',
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
    uitleg: 'Pull, build and restart Companion — stops at the first error',
    groep: 'machine',
  },
  {
    label: 'Companion: free memory',
    // Die box zat op 79% met een cap van 3G; een build wordt daar gedood.
    // Zie docs/VPS-RUNBOOK.md — de zwaarste buur even opzij.
    cmd: 'systemctl stop axe-browser-agent && echo "browser-agent off — start it again after the build"',
    uitleg: 'Make room when the Companion build dies on memory',
    groep: 'machine',
  },
  {
    label: 'Companion: live check',
    // Niet "is de dienst gestart" maar "serveert hij de nieuwe code". Een
    // mislukte build laat het oude proces vrolijk doordraaien. tos-chart-dock
    // bleef 1 op oude én nieuwe builds; /api/debug/build noemt commit + age.
    cmd: `curl -fsS https://www.axecompanion.com/api/debug/build | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("shortCommit"), "age_s="+str(d.get("ageSeconds")), "branch="+str(d.get("branch"))); raise SystemExit(0 if d.get("shortCommit") and int(d.get("ageSeconds") or 10**9) < 86400*14 else 1)'`,
    uitleg: 'Shows live shortCommit + age; exit 1 if build info is missing or older than 14 days',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Services',
    cmd: 'systemctl --no-pager status axe-core-api axe-terminal axe-companion axe-task-worker --lines=0',
    uitleg: 'Are the AXE services still running',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Logs API',
    cmd: 'journalctl -u axe-core-api -n 60 --no-pager',
    uitleg: 'The last sixty lines of the API',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Logs terminal',
    cmd: 'journalctl -u axe-terminal -n 40 --no-pager',
    uitleg: 'Who was refused or let in on this terminal',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Restart everything',
    cmd: 'systemctl restart axe-core-api axe-terminal axe-task-worker && systemctl --no-pager status axe-core-api --lines=3',
    uitleg: 'Restart all AXE services',
    groep: 'machine',
  },
  {
    label: 'Disk & memory',
    cmd: 'df -h / | tail -1; echo; free -h | head -2',
    uitleg: 'Space and memory — a full disk makes services fail silently',
    groep: 'machine',
    leestAlleen: true,
  },
  ...VPS_LOGINS(REPO_VPS),
  ...GIT_ACTIES(REPO_VPS),
];

/**
 * De Strato-box met Ollama en de DAX-computers (host-id 'vps-hetzner').
 *
 * Kreeg tot 20 nov de knoppen van de API-VPS (Deploy, Herstart alles --
 * diensten die hier niet bestaan). Nu eigen knoppen: Ollama, de containers, en
 * per DAX-bot inloggen. Zonder login konden de bots hun abonnement niet
 * gebruiken (Keys per app: "dax-…-01 login MISSING"). In een container is er
 * geen browser: Claude geeft een link en vraagt om de code, Codex geeft een
 * link en een code (device-auth). Open de link in een privévenster als je een
 * ander account wilt dan dat van je browser.
 */
const DAX_BOTS = ['developer', 'trading', 'northsea', 'thinktank', 'browser'] as const;

const STRATO: Snelactie[] = [
  {
    label: 'Ollama',
    cmd: 'systemctl --no-pager status ollama --lines=3; echo; curl -s localhost:11434/api/ps | head -c 400; echo',
    uitleg: 'Is Ollama running, and which model is loaded now',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Restart Ollama',
    cmd: 'systemctl restart ollama && sleep 3 && systemctl is-active ollama',
    uitleg: 'Clears the queue when every answer hangs',
    groep: 'machine',
  },
  {
    label: 'DAX-containers',
    cmd: 'docker ps --format "table {{.Names}}\t{{.Status}}"',
    uitleg: 'The agents’ five DAX computers',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'DAX-logins',
    cmd: 'for c in $(docker ps --format "{{.Names}}" | grep ^dax-); do printf "%-18s claude:%s codex:%s\\n" "$c" "$(docker exec $c sh -c \'test -f ~/.claude/.credentials.json && echo yes || echo no\')" "$(docker exec $c sh -c \'test -f ~/.codex/auth.json && echo yes || echo no\')"; done',
    uitleg: 'Per DAX bot: are Claude and Codex signed in',
    groep: 'agents',
    leestAlleen: true,
  },
  ...DAX_BOTS.flatMap((b): Snelactie[] => [
    {
      label: `${b} · Claude`,
      cmd: `docker exec -it dax-${b}-01 claude auth login`,
      uitleg: `DAX ${b}: sign in to Claude -- open the link, pick the account, paste the code here`,
      groep: 'agents',
    },
    {
      label: `${b} · Codex`,
      cmd: `docker exec -it dax-${b}-01 codex login --device-auth`,
      uitleg: `DAX ${b}: sign in to Codex -- open the link and type the code shown here`,
      groep: 'agents',
    },
  ]),
  {
    label: 'Disk & memory',
    cmd: 'df -h / | tail -1; echo; free -h | head -2',
    uitleg: 'Space and memory of the Strato box',
    groep: 'machine',
    leestAlleen: true,
  },
];

/** Wat er op een machine staat die we niet kennen: het minimum dat overal werkt,
 *  plus de agents en git -- die zijn niet machinegebonden. */
const ONBEKEND: Snelactie[] = [
  {
    label: 'Where am I',
    cmd: 'hostname && pwd && whoami && uname -a',
    uitleg: 'Which machine, which folder, which user',
    groep: 'machine',
    leestAlleen: true,
  },
  {
    label: 'Disk',
    cmd: 'df -h . | tail -1',
    uitleg: 'Free space',
    groep: 'machine',
    leestAlleen: true,
  },
  WELKE_AGENTS,
  SLEUTELS('cd ~'),
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
  // Logins staan alleen in het vak van hun machine: in het bouw-, API- of git-vak
  // zou een login-knop het account op een plek zetten waar het niet hoort.
  if (hostId === 'deze-mac') return [...MAC_REPO, ...GIT_ACTIES(REPO_MAC)];
  if (hostId === 'mac-api') return [...MAC_API, ...GIT_ACTIES(REPO_MAC)];
  if (hostId === 'mac-agents') return [...MAC_AGENTS, ...MAC_MINI_LOGINS(REPO_MAC), ...GIT_ACTIES(REPO_MAC)];
  if (hostId === 'mac-git') return [...MAC_GIT, ...GIT_ACTIES(REPO_MAC)];
  if (hostId === 'imac') return [...MAC_REPO, ...IMAC_LOGINS(REPO_MAC), ...GIT_ACTIES(REPO_MAC)];
  if (hostId === 'vps-hetzner') return STRATO;
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
