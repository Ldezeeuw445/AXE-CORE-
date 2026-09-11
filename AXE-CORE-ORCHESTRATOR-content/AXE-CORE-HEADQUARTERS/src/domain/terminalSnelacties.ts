/**
 * De shortlist boven elke terminal: wat je op DEZE machine meestal doet.
 *
 * ## Waarom per host en niet één lijst
 *
 * De oude terminal had één rij knoppen (jarvis, ollama, ps, ls) die op elke
 * machine hetzelfde deed. Met meerdere hosts is dat niet alleen nutteloos maar
 * gevaarlijk: `systemctl restart` hoort op de VPS en nergens anders, en
 * `lsof -ti :8001 | xargs kill` hoort op je Mac. Een knop die op de verkeerde
 * machine landt is erger dan geen knop.
 *
 * Vandaar: de lijst hangt aan de host, niet aan het scherm.
 *
 * ## Waarom ze niet vanzelf uitvoeren
 *
 * Elke actie wordt in de prompt GEZET, niet verstuurd -- op één na, en dat is
 * met opzet de enige die niets verandert. Je ziet dus wat er staat voor je enter
 * drukt. Een knop die meteen een dienst herstart is precies één misklik van een
 * onderbreking af.
 */

export interface Snelactie {
  label: string;
  cmd: string;
  /** Wat het doet, in gewone taal. Verschijnt als tooltip. */
  uitleg: string;
  /** Alleen waar voor acties die niets veranderen; die mogen meteen draaien. */
  leestAlleen?: boolean;
}

const DEZE_MAC: Snelactie[] = [
  {
    label: 'API herstarten',
    cmd: 'cd ~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api && ./run-local.sh',
    uitleg: 'Start de lokale axe_api opnieuw — nodig na een git pull met nieuwe endpoints',
  },
  {
    label: 'Poort 8001 vrij',
    cmd: 'lsof -ti :8001 | xargs kill',
    uitleg: 'Sluit wat er nog op poort 8001 luistert ("address already in use")',
  },
  {
    label: 'App bijwerken',
    cmd: 'cd ~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS && npm run bijwerken',
    uitleg: 'Binnenhalen, bouwen, opruimen en de nieuwe AXE CORE starten',
  },
  {
    label: 'Motoren',
    cmd: 'for b in claude codex cursor; do printf "%-8s %s\\n" "$b" "$(command -v $b || echo ONTBREEKT)"; done',
    uitleg: 'Welke code-CLI\'s op deze Mac staan',
    leestAlleen: true,
  },
  {
    label: 'Wat draait er',
    cmd: 'ps aux | grep -E "uvicorn|terminal-server" | grep -v grep; lsof -nP -iTCP:8001 -iTCP:4022 -sTCP:LISTEN 2>/dev/null',
    uitleg: 'De lokale API en de terminal-server',
    leestAlleen: true,
  },
];

const VPS: Snelactie[] = [
  {
    label: 'Wat draait daar',
    // Éérst kijken wát /opt/axe-core-api is. Ik heb die map nooit gezien; of het
    // een git-checkout is of een gekopieerde map bepaalt of "Deploy" hieronder
    // überhaupt kan werken. Dit commando zegt het, in plaats van dat je het
    // merkt aan een fout.
    cmd: 'ls -la /opt/axe-core-api | head -5; echo; git -C /opt/axe-core-api status -sb 2>&1 | head -3',
    uitleg: 'Wat er in de deploy-map staat, en of het een git-checkout is',
    leestAlleen: true,
  },
  {
    label: 'Deploy',
    // `&&` en niet `;`: mislukt de pull, dan mag de herstart NIET doorgaan.
    // Met een puntkomma herstart je de oude code en ziet het eruit alsof de
    // deploy lukte -- de faalwijze waar deze codebase een naam voor heeft.
    cmd: 'cd /opt/axe-core-api && git pull && systemctl restart axe-core-api && systemctl --no-pager status axe-core-api --lines=5',
    uitleg: 'Binnenhalen, herstarten, en meteen tonen of hij weer draait',
  },
  {
    label: 'Diensten',
    cmd: 'systemctl --no-pager status axe-core-api axe-terminal axe-companion --lines=0',
    uitleg: 'Draaien de AXE-diensten nog',
    leestAlleen: true,
  },
  {
    label: 'API herstarten',
    cmd: 'systemctl restart axe-core-api && systemctl --no-pager status axe-core-api --lines=5',
    uitleg: 'axe-core-api opnieuw starten',
  },
  {
    label: 'Logs',
    cmd: 'journalctl -u axe-core-api -n 60 --no-pager',
    uitleg: 'De laatste zestig regels van de API',
    leestAlleen: true,
  },
  {
    label: 'Terminal-log',
    cmd: 'journalctl -u axe-terminal -n 40 --no-pager',
    uitleg: 'Wie er is geweigerd of toegelaten op deze terminal',
    leestAlleen: true,
  },
  {
    label: 'Schijf',
    cmd: 'df -h / && echo && free -h',
    uitleg: 'Ruimte en geheugen',
    leestAlleen: true,
  },
];

/** Wat er op een host staat die we niet kennen: het minimum dat overal werkt. */
const ONBEKEND: Snelactie[] = [
  { label: 'Waar ben ik', cmd: 'hostname && pwd && whoami', uitleg: 'Welke machine, welke map, welke gebruiker', leestAlleen: true },
  { label: 'Schijf', cmd: 'df -h .', uitleg: 'Vrije ruimte', leestAlleen: true },
];

/**
 * De lijst voor deze host.
 *
 * Op id en niet op het adres: een host kan verhuizen zonder dat zijn rol
 * verandert. Een onbekende host krijgt het veilige minimum in plaats van de
 * lijst van een andere machine.
 */
export function snelactiesVoor(hostId: string): Snelactie[] {
  if (hostId === 'deze-mac') return DEZE_MAC;
  if (hostId.startsWith('vps')) return VPS;
  return ONBEKEND;
}
