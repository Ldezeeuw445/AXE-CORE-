import { describe, it, expect } from 'vitest';
import { alleenImac, alleenMacMini, blijvendDraaiend, snelactiesVoor } from './terminalSnelacties';

/**
 * Welke vensters open moeten blijven staan.
 *
 * Dit is geen stijlregel maar de vraag die Luka stelde: "welke moeten blijven
 * lopen". Het antwoord stond nergens, en een dienst die je per ongeluk
 * afsluit valt om -- waarna je een 404 krijgt of een terminal die niet
 * verbindt, zonder dat iets zegt waarom.
 */
describe('wat blijft draaien', () => {
  it('houdt het bouw-vak vrij van commando\u2019s die het venster bezetten', () => {
    // Dit vak is om te bouwen. Een commando dat de prompt niet teruggeeft
    // blokkeert precies dat, en hoort dus in het API-vak.
    expect(blijvendDraaiend('deze-mac')).toEqual([]);
  });

  it('markeert in het API-vak wat de prompt niet teruggeeft', () => {
    // `tail -f` en run-local.sh komen niet terug. Dat is geen storing, maar je
    // moet het weten vóór je klikt.
    const labels = blijvendDraaiend('mac-api').map(a => a.label).sort();
    expect(labels).toEqual(['Follow logs', 'Start it yourself']);
  });

  it('markeert op een VPS alleen de agents-sessie, want de diensten draaien onder systemd', () => {
    // `systemctl restart` komt terug; de dienst draait daarna zonder dit
    // venster. Alleen tmux houdt het venster vast (en de agents erin lopen door
    // als je het sluit).
    expect(blijvendDraaiend('vps-strato').map(a => a.label)).toEqual(['Agents session']);
  });

  it('geeft nooit een blijvende dienst door als leesactie', () => {
    // leestAlleen betekent "mag meteen draaien". Een commando dat het venster
    // bezet houdt hoort je altijd eerst te zien.
    for (const id of ['deze-mac', 'mac-api', 'mac-agents', 'mac-git', 'imac', 'vps-strato', 'vps-hetzner', 'onbekend']) {
      for (const a of blijvendDraaiend(id)) {
        expect(a.leestAlleen, `${id}: ${a.label}`).not.toBe(true);
      }
    }
  });
});

describe('elke actie is te begrijpen voor je hem uitvoert', () => {
  it('heeft overal een label, een commando en uitleg', () => {
    for (const id of ['deze-mac', 'mac-api', 'mac-agents', 'mac-git', 'vps-strato', 'onbekend']) {
      for (const a of snelactiesVoor(id)) {
        expect(a.label.trim(), id).not.toBe('');
        expect(a.cmd.trim(), `${id}: ${a.label}`).not.toBe('');
        // Zonder uitleg is het een knop waarvan je moet raden wat hij doet, op
        // een machine waar raden duur is.
        expect(a.uitleg.trim(), `${id}: ${a.label}`).not.toBe('');
      }
    }
  });
});

/**
 * Een agent-CLI weigert buiten een checkout.
 *
 * Gemeten 13 september 2026: `codex exec` vanuit ~ antwoordt met "Not inside a
 * trusted directory and --skip-git-repo-check was not specified" en stopt.
 * Een diagnoseknop die dat uitlokt bewijst niets over de chat, want die draait
 * wél in een repo -- hij stelt alleen een andere vraag dan je dacht.
 */
describe('agent-acties draaien in de checkout', () => {
  it('zet elke agent-proef eerst in de repo', () => {
    const proeven = snelactiesVoor('mac-agents')
      .filter(a => a.groep === 'agents' && /\b(codex exec|claude -p)\b/.test(a.cmd));
    expect(proeven.length).toBeGreaterThan(0);
    for (const a of proeven) {
      expect(a.cmd, a.label).toMatch(/^cd \S+ && /);
    }
  });
});


/**
 * Luka, 21 nov: "de juiste sneltoets onder de juiste terminal, zodat het niet
 * fout kan gaan". Eén account op één machine.
 */
describe('elk account onder zijn eigen machine', () => {
  const logins = (id: string) => snelactiesVoor(id).filter(a => /login \d|OpenCode login|Cursor 2|Antigravity|OpenCode|Kilo/.test(a.label)).map(a => a.label);

  it('zet elk login-label in precies één vak', () => {
    const ids = ['deze-mac', 'mac-api', 'mac-agents', 'mac-git', 'imac', 'vps-strato', 'vps-hetzner', 'onbekend'];
    const waar = new Map<string, string[]>();
    for (const id of ids) for (const l of logins(id)) waar.set(l, [...(waar.get(l) ?? []), id]);
    for (const [label, vakken] of waar) expect(vakken, label).toHaveLength(1);
  });

  it('verdeelt de accounts zoals afgesproken', () => {
    expect(logins('vps-strato')).toEqual(['Claude login 1', 'Codex login 1', 'Cursor login 1', 'OpenCode login', 'OpenCode Free', 'Kilo Auto Free']);
    expect(logins('mac-agents')).toEqual(['Claude login 2', 'Cursor 2', 'Install Antigravity', 'Google Antigravity']);
    expect(logins('imac')).toEqual(['Claude login 3', 'Codex login 2']);
    for (const id of ['deze-mac', 'mac-api', 'mac-git']) expect(logins(id), id).toEqual([]);
  });

  it('laat een Mac-knop op de verkeerde Mac niets doen', () => {
    // De "Mac · ..."-vakken zijn de Mac waarop de app draait; op de iMac is dat de iMac.
    for (const a of snelactiesVoor('mac-agents').filter(a => /login \d|Cursor 2|Antigravity/.test(a.label))) {
      expect(a.cmd, a.label).toMatch(/^if hostname \| grep -qi imac; then echo "This is the iMac/);
    }
    for (const a of snelactiesVoor('imac').filter(a => /login \d/.test(a.label))) {
      expect(a.cmd, a.label).toMatch(/^if hostname \| grep -qi imac; then (?!echo)/);
    }
    expect(alleenMacMini('x')).toContain('else x; fi');
    expect(alleenImac('x')).toContain('then x; else');
  });

  it('logt op de VPS zonder browser in, alleen met accounts die bestaan', () => {
    const vps = snelactiesVoor('vps-strato');
    for (const a of vps.filter(a => a.label.startsWith('Codex login'))) expect(a.cmd).toContain('--device-auth');
    // Luka heeft 3 Claude- en 2 ChatGPT-accounts: geen vierde Claude, geen derde Codex.
    expect(vps.map(a => a.label)).not.toContain('Claude login 4');
    expect(vps.map(a => a.label)).not.toContain('Codex login 3');
  });

  it('zet bij elke inlogknop welk account erbij hoort', () => {
    for (const id of ['vps-strato', 'mac-agents', 'imac']) {
      for (const a of snelactiesVoor(id).filter(a => /login \d|Cursor 2/.test(a.label))) {
        expect(a.uitleg, a.label).toMatch(/\((lukadezeeuw\d+@gmail|support@axeheadquarters|hotmail)\)/);
      }
    }
  });
});
