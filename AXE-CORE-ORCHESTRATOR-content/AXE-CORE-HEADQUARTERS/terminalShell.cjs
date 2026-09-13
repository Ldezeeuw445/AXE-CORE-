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
 * `script` zit standaard op macOS én op Ubuntu en doet precies het stuk dat we
 * nodig hebben: het maakt een pty, hangt de shell eraan als beheersende
 * terminal en kopieert bytes heen en weer. Regeldiscipline, echo, SIGINT,
 * prompt en kleur komen daarmee terug. Nul dependencies.
 *
 * De vlaggen verschillen per systeem, en dat is geen detail: met de verkeerde
 * volgorde start `script` een shell die zijn uitvoer in een BESTAND schrijft
 * in plaats van naar ons. Vandaar dat dit een functie met een test is en geen
 * regel ergens in het midden van de server.
 */

/**
 * Hoe je op dit systeem een shell in een pty start.
 *
 * macOS (BSD): `script -q /dev/null <shell> -l`
 *   -q  geen "Script started/done"-regels
 *   /dev/null  het logbestand dat we niet willen; het commando volgt erna.
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
  if (platform === 'darwin') return { cmd: 'script', args: ['-q', '/dev/null', shell, '-l'] };
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
