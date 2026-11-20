/**
 * Is een transcriptie van de live stem ruis in plaats van iets wat Luka zei?
 *
 * 20 nov gezien in de chat: "umuyoruz.", "Zadnji.", "Mhm." als berichten van
 * Luka -- achtergrondgeluid dat de spraakherkenning als een woord in een
 * willekeurige taal teruggaf, en waar AXE dan ook nog op antwoordde.
 *
 * De regel is bewust smal: alleen een bericht van één woord kan ruis zijn.
 * Eén woord telt als echt als het een gewoon kort antwoord is (ja, nee, oké,
 * stop ...) of een woord uit AXE zelf (trading, agenda, managers ...). Alles
 * wat langer is dan één woord gaat altijd door: liever een keer ruis dan een
 * echte zin die verdwijnt.
 */
const BROM = /^(m+h*m*|h+m+|u+h+m*|u+m+|e+h*m*|a+h+|o+h+|hm+|mm+|huh|uh-huh|mhm+)$/;

const KORT_ANTWOORD = new Set([
  'ja', 'nee', 'neen', 'yes', 'no', 'nope', 'yep', 'yeah', 'ok', 'oke', 'oké', 'okay', 'okee',
  'stop', 'top', 'thanks', 'thx', 'bedankt', 'dankje', 'dankjewel', 'merci', 'hallo', 'hey', 'hoi', 'hi', 'hello',
  'axe', 'klaar', 'door', 'verder', 'doorgaan', 'sure', 'prima', 'goed', 'cool', 'nice', 'wacht', 'wait',
  'annuleer', 'annuleren', 'cancel', 'sorry', 'precies', 'exact', 'zeker', 'altijd', 'nooit', 'later', 'nu', 'now',
]);

const AXE_WOORD = new Set([
  'home', 'trading', 'northsea', 'agenda', 'calendar', 'kalender', 'managers', 'taken', 'tasks', 'settings',
  'instellingen', 'code', 'browser', 'notch', 'terrain', 'terrein', 'neural', 'runtime', 'memory', 'geheugen',
  'portal', 'kaart', 'map', 'chart', 'grafiek', 'nieuws', 'news', 'mail', 'inbox', 'weer', 'weather',
]);

export function isRuis(tekst: string): boolean {
  const schoon = (tekst || '').toLowerCase().replace(/[.,!?¿¡…"'“”‘’()\-–—:;]/g, ' ').trim();
  if (!schoon) return true;
  const woorden = schoon.split(/\s+/);
  if (woorden.length > 1) return false;
  const w = woorden[0];
  if (BROM.test(w)) return true;
  if (/^\d+$/.test(w)) return false;
  return !(KORT_ANTWOORD.has(w) || AXE_WOORD.has(w));
}
