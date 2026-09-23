import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// De terminalserver is Node-CJS en draait buiten Vite; dit is dus met opzet een
// require en geen import. De test hoort wel hier, want dit is de enige plek
// waar tests draaien.
const req = createRequire(import.meta.url);
const { ptyCommando, gezondeMaat, maatCommando } = req('../../../terminalShell.cjs') as {
  ptyCommando: (p: string, s: string) => { cmd: string; args: string[] } | null;
  gezondeMaat: (k: unknown, r: unknown) => { kolommen: number; regels: number };
  maatCommando: (k: unknown, r: unknown) => string;
};

describe('een shell in een echte terminal starten', () => {
  it('gebruikt op macOS geen script, want dat eist een tty op stdin', () => {
    // Gemeten 13 september: BSD-script vanuit Node stopt na 5 ms met
    // "tcgetattr/ioctl: Operation not supported on socket". Wie dit ooit
    // terugzet naar script, zet elk Mac-vak weer op direct-dicht.
    const { cmd, args } = ptyCommando('darwin', '/bin/zsh')!;
    expect(cmd).toBe('python3');
    expect(args[0]).toBe('-c');
    expect(args.slice(2)).toEqual(['/bin/zsh', '-l']);
    expect(args[1]).toContain('pty.fork()');
    // Niet pty.spawn: die blijft in Python 3.9 hangen na exit van de shell.
    expect(args[1]).not.toContain('pty.spawn');
  });

  it('geeft op Linux het commando als één string, mét doorspoelen', () => {
    const { args } = ptyCommando('linux', '/bin/bash')!;
    expect(args[0]).toContain('f'); // -f: anders komt uitvoer alsnog met horten
    expect(args).toContain('/bin/bash -l');
    expect(args[args.length - 1]).toBe('/dev/null');
  });

  it('raadt niets op een onbekend systeem', () => {
    // Terugvallen op pijpen is minder goed; een verkeerd geraden commando is
    // erger, want dan start er iets onvoorspelbaars als login-shell.
    expect(ptyCommando('win32', 'cmd.exe')).toBeNull();
  });
});

describe('de venstermaat', () => {
  it('houdt onzin buiten de deur', () => {
    expect(gezondeMaat(0, 0)).toEqual({ kolommen: 20, regels: 5 });
    expect(gezondeMaat(99999, 99999)).toEqual({ kolommen: 500, regels: 200 });
    expect(gezondeMaat(NaN, undefined)).toEqual({ kolommen: 120, regels: 32 });
  });

  it('zet de maat en veegt zijn eigen echo weg', () => {
    const cmd = maatCommando(132, 40);
    expect(cmd).toContain('stty rows 40 cols 132');
    // Zonder clear begint elke sessie met het huishoudelijk werk van de app in
    // beeld, en dat hoort de gebruiker niet te zien.
    expect(cmd.trimEnd().endsWith('clear')).toBe(true);
  });
});
