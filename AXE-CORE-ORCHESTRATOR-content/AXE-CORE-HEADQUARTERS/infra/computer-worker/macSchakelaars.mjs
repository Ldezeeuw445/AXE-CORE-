/**
 * Kleine Mac-schakelaars voor AXE (BOUWLIJST "De Mac zelf", 20 nov):
 * "AXE, hou de Mac wakker", "zet donker aan", "verberg de bureaublad-iconen".
 *
 * Alleen deze woorden, met vaste commando's: het model kiest een woord, nooit
 * een commando. De notch (Rust, notchknoppen.rs) doet hetzelfde en deelt het
 * pid-bestand van "wakker", zodat notch en stem van elkaar weten.
 */
import { execFile, spawn } from 'node:child_process';
import { readFile, unlink, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const SCHAKELAARS = ['donker', 'licht', 'iconen-weg', 'iconen-terug', 'wakker', 'slapen-mag', 'scherm-uit'];

const WAKKER_PID = () => join(homedir(), '.axe', 'wakker.pid');

function draai(cmd, args) {
  return new Promise((res, rej) => {
    execFile(cmd, args, { timeout: 20_000 }, (err, out, fout) => (err ? rej(new Error(String(fout || err.message).slice(0, 200))) : res(String(out).trim())));
  });
}

async function wakkerPid() {
  try {
    const pid = Number((await readFile(WAKKER_PID(), 'utf8')).trim());
    if (!pid) return null;
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

export async function stand() {
  const donker = await draai('/usr/bin/defaults', ['read', '-g', 'AppleInterfaceStyle']).then((x) => x === 'Dark').catch(() => false);
  const iconen = await draai('/usr/bin/defaults', ['read', 'com.apple.finder', 'CreateDesktop']).then((x) => x !== '0' && x !== 'false').catch(() => true);
  return { donker, iconen, wakker: (await wakkerPid()) !== null };
}

/** Voert één schakelaar uit en geeft de nieuwe stand terug. */
export async function schakel(woord) {
  if (!SCHAKELAARS.includes(woord)) throw new Error(`mac.schakel kent alleen: ${SCHAKELAARS.join(', ')}`);
  switch (woord) {
    case 'donker':
    case 'licht':
      await draai('/usr/bin/osascript', ['-e', `tell application "System Events" to tell appearance preferences to set dark mode to ${woord === 'donker'}`]);
      break;
    case 'iconen-weg':
    case 'iconen-terug':
      await draai('/usr/bin/defaults', ['write', 'com.apple.finder', 'CreateDesktop', '-bool', woord === 'iconen-terug' ? 'true' : 'false']);
      await draai('/usr/bin/killall', ['Finder']).catch(() => undefined);
      break;
    case 'wakker': {
      if (await wakkerPid()) break;
      // 8 uur; daarna mag hij vanzelf weer slapen. -d scherm, -i systeem, -s op stroom.
      const kind = spawn('/usr/bin/caffeinate', ['-dis', '-t', String(8 * 3600)], { detached: true, stdio: 'ignore' });
      kind.unref();
      await mkdir(join(homedir(), '.axe'), { recursive: true });
      await writeFile(WAKKER_PID(), String(kind.pid));
      break;
    }
    case 'slapen-mag': {
      const pid = await wakkerPid();
      if (pid) { try { process.kill(pid); } catch { /* al weg */ } }
      await unlink(WAKKER_PID()).catch(() => undefined);
      break;
    }
    case 'scherm-uit':
      await draai('/usr/bin/pmset', ['displaysleepnow']);
      break;
  }
  return stand();
}
