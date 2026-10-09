/**
 * De versie van het gesprek tussen de AXE-app en de computer-worker op dezelfde Mac.
 *
 * Tot 9 okt eiste de worker dat de commit waaruit de app gebouwd is GELIJK was aan de commit waaruit hij
 * zelf gestart is. Die twee veranderen los van elkaar: de autosync haalt nieuwe commits binnen minuten
 * vóór hij de app bouwt, en elke herstart van de worker in dat gat (launchd, een crash, een update)
 * pakt de nieuwste commit. Resultaat: "AXE native runtime mismatch" op elke computer-actie, terwijl de
 * twee elkaar prima verstaan. Computer use deed het dus "soms niet" -- precies wanneer er net gewerkt was.
 *
 * Wat echt moet kloppen is het protocol: welke tools bestaan, hoe argumenten en uitkomsten eruitzien.
 * Dat is dit nummer. Verander je dat gesprek (een tool hernoemd, een veld anders), verhoog het dan hier
 * én in infra/computer-worker/worker.mjs (WORKER_PROTOCOL); een test houdt die twee gelijk.
 */
export const COMPUTER_PROTOCOL = 1;
