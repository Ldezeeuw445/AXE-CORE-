/**
 * Wat AXE op een Mac mag LEZEN buiten zijn werkmap (Luka 20 nov: de hele Mac,
 * behalve wachtwoorden en sleutels). Schrijven valt hier niet onder: dat blijft
 * in de werkmap (safePath in worker.mjs).
 *
 * Alles wat AXE leest gaat naar een model, dus nooit: verborgen mappen en
 * bestanden (~/.ssh, ~/.claude, ~/.aws, ~/.axe -- daar staan sleutels en
 * logins), de sleutelhanger, cookies, browserprofielen, wachtwoordmanagers, en
 * wat de worker al weigert (de vault, .env, *.key).
 */
import { resolve, join, sep } from 'node:path';

export function maakLeesWeigering({ home, denyPaths = [], denyNames = /$^/ }) {
  const wortels = [home, '/Applications', '/Volumes'].map(p => resolve(p));
  const lib = join(home, 'Library');
  const nooit = [
    ...denyPaths,
    join(lib, 'Keychains'),
    join(lib, 'Cookies'),
    join(lib, 'Safari'),
    join(lib, 'Containers', 'com.apple.Safari'),
    join(lib, 'Application Support', 'Google'),
    join(lib, 'Application Support', 'Firefox'),
    join(lib, 'Application Support', 'BraveSoftware'),
    join(lib, 'Application Support', 'Arc'),
    join(lib, 'Application Support', '1Password'),
    join(lib, 'Application Support', 'Bitwarden'),
    join(lib, 'Group Containers', '2BUA8C4S2C.com.1password'),
  ].map(p => resolve(p));
  const binnen = (abs, d) => abs === d || abs.startsWith(d + sep);

  return function leesWeigering(abs) {
    if (!wortels.some(w => binnen(abs, w))) return `outside what AXE may read (home, /Applications, /Volumes): ${abs}`;
    if (nooit.some(d => binnen(abs, d))) return `private, never read: ${abs}`;
    if (/(^|\/)\.[^/]/.test(abs)) return `hidden files and folders hold keys and logins; never read: ${abs}`;
    if (denyNames.test(abs)) return 'refusing to touch a credential file';
    return null;
  };
}
