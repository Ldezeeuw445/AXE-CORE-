'use strict';
/**
 * Een echte terminal starten, zonder native module.
 *
 * ## Wat er mis was
 *
 * De server startte de shell met `spawn(shell, ['-l'])`. Dat geeft drie pijpen
 * en géén terminal, en een shell zonder terminal is een ander programma:
 *
 * - Geen prompt. Bash tekent PS1 alleen als stdout een tty is, dus je typt in
 *   een leeg scherm en weet nooit of hij klaar is met het vorige commando.
 * - Alles gebufferd. Zonder tty zet de C-bibliotheek stdout op blokbuffering
 *   van 4 KB. `npm run build`, pytest, een lange `git log`: je ziet niets, en
 *   dan ineens alles. Dat is precies wat "mega traag" voelt, terwijl het
 *   commando even snel loopt als altijd.
 * - Geen regeldiscipline. Ctrl+C is dan een letter die de shell negeert, geen
 *   SIGINT. Je kunt niets afbreken.
 * - Geen tab-aanvulling, geen pijltjes, geen `less`, geen `top`, geen kleur.
 *
 * Daarom stond er in de browser een nagebouwde regeleditor: eigen echo, eigen
 * backspace, eigen geschiedenis. Dat is het gat opvullen op de verkeerde plek
 * -- het lost het typen op en niets van de rest.
 *
 * ## Waarom `script` en niet node-pty
 *
 * node-pty is het nette antwoord en kan ook de venstermaat doorgeven. Het is
 * ook een native module die op zijn doelmachine gebouwd moet worden, en als
 * dat misgaat start de terminalserver helemaal niet meer. Dat is een slechtere
 * dag dan vandaag.
 *
 * `script` zit standaard op Ubuntu en doet precies het stuk dat we nodig
 * hebben: het maakt een pty, hangt de shell eraan als beheersende terminal en
 * kopieert bytes heen en weer. Regeldiscipline, echo, SIGINT, prompt en kleur
 * komen daarmee terug. Nul dependencies. Op macOS doet een lusje in de
 * systeem-python3 hetzelfde, want BSD-`script` kan niet vanuit een server
 * starten (zie DARWIN_PTY_PY).
 *
 * De vlaggen verschillen per systeem, en dat is geen detail: met de verkeerde
 * volgorde start `script` een shell die zijn uitvoer in een BESTAND schrijft
 * in plaats van naar ons. Vandaar dat dit een functie met een test is en geen
 * regel ergens in het midden van de server.
 */

/**
 * De pty-starter voor macOS, als Python uit de standaardbibliotheek.
 *
 * ## Waarom niet `script` op macOS
 *
 * Gemeten 13 september op de Mac mini: `script -q /dev/null /bin/zsh -l`
 * vanuit Node stopt na 5 ms met exit 1 en
 * `script: tcgetattr/ioctl: Operation not supported on socket`. BSD-`script`
 * leest de terminalinstellingen van zijn EIGEN stdin en stopt als dat geen tty
 * is -- en vanuit Node is stdin altijd een socket. Dat is geen vlag die
 * ontbreekt; het kan vanuit een server principieel niet. De app kreeg
 * `ready {pty: true}` en direct daarna `exit`: elk Mac-vak ging meteen dicht.
 * Linux-`script` controleert dat eerst en werkt wel.
 *
 * `python3` staat op elke Mac met de Command Line Tools, en `pty` zit in de
 * standaardbibliotheek. Nog steeds geen native module.
 *
 * Niet `pty.spawn()`: in Python 3.9 (de systeemversie) blijft die na `exit`
 * van de shell op stdin wachten, en dan krijgt de app nooit een exit-bericht.
 * Deze lus stopt zodra de pty dicht is en geeft de exitcode van de shell door.
 * Begint op 80x24, net als `script`; de echte maat komt via maatCommando.
 */
const DARWIN_PTY_PY = [
  'import os,pty,select,sys,fcntl,termios,struct',
  'pid,fd=pty.fork()',
  'if pid==0:os.execvp(sys.argv[1],sys.argv[1:])',
  "fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',24,80,0,0))",
  'def alles(f,b):',
  ' while b:b=b[os.write(f,b):]',
  'bron=[fd,0]',
  'while True:',
  ' try:r=select.select(bron,[],[])[0]',
  ' except InterruptedError:continue',
  ' if fd in r:',
  '  try:d=os.read(fd,65536)',
  '  except OSError:d=b""',
  '  if not d:break',
  '  alles(1,d)',
  ' if 0 in r:',
  '  d=os.read(0,65536)',
  '  if d:alles(fd,d)',
  '  else:bron.remove(0)',
  'st=os.waitpid(pid,0)[1]',
  'sys.exit(os.WEXITSTATUS(st) if os.WIFEXITED(st) else 128+os.WTERMSIG(st))',
].join('\n');

/**
 * Hoe je op dit systeem een shell in een pty start.
 *
 * macOS: `python3 -c <DARWIN_PTY_PY> <shell> -l` -- zie hierboven waarom niet
 *   `script`.
 *
 * Linux (util-linux): `script -qfc "<shell> -l" /dev/null`
 *   -c  het commando (als één string, dus hier geen losse argumenten)
 *   -f  na elke schrijf doorspoelen -- zonder dit komt de uitvoer alsnog met
 *       horten en stoten, en dan hebben we de bufferklacht verplaatst in
 *       plaats van opgelost.
 *
 * Onbekend systeem: null. Dan valt de server terug op pijpen, want een
 * verkeerd geraden commando is erger dan de oude situatie.
 */
function ptyCommando(platform, shell) {
  if (platform === 'darwin') return { cmd: 'python3', args: ['-c', DARWIN_PTY_PY, shell, '-l'] };
  if (platform === 'linux') return { cmd: 'script', args: ['-qfc', `${shell} -l`, '/dev/null'] };
  return null;
}

/** Buiten dit bereik is het geen venstermaat maar een typefout. */
function gezondeMaat(kolommen, regels) {
  const k = Math.round(Number(kolommen));
  const r = Math.round(Number(regels));
  return {
    kolommen: Number.isFinite(k) ? Math.min(Math.max(k, 20), 500) : 120,
    regels: Number.isFinite(r) ? Math.min(Math.max(r, 5), 200) : 32,
  };
}

/**
 * De venstermaat aan de pty vertellen.
 *
 * `script` maakt zijn pty op de standaard 80x24, want het heeft zelf geen
 * terminal om de maat van over te nemen. Blijft dat zo, dan breekt `less` af
 * op tachtig tekens en denkt `top` dat er 24 regels zijn -- op een venster dat
 * veel breder is.
 *
 * Er is geen ioctl vanuit Node zonder native module, dus we vragen het de
 * shell zelf: `stty` binnen de pty zet dezelfde waarden die een ioctl zou
 * zetten. `clear` erachteraan veegt de echo van dit commando weg, zodat je
 * begint met een schoon scherm in plaats van met huishoudelijk werk van de app.
 *
 * Alleen bij het starten van de sessie. Dit later opnieuw sturen zou midden in
 * een regel vallen die je aan het typen bent, of in een programma dat draait --
 * en een terminal die uit zichzelf commando's uitvoert terwijl jij bezig bent
 * is erger dan een maat die niet meebeweegt.
 */
function maatCommando(kolommen, regels) {
  const m = gezondeMaat(kolommen, regels);
  return `stty rows ${m.regels} cols ${m.kolommen} 2>/dev/null; clear\n`;
}

module.exports = { ptyCommando, gezondeMaat, maatCommando };
