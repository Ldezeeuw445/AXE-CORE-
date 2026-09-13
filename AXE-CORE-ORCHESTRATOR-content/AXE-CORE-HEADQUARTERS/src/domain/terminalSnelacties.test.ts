import { describe, it, expect } from 'vitest';
import { blijvendDraaiend, snelactiesVoor } from './terminalSnelacties';

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
    expect(labels).toEqual(['Logs volgen', 'Zelf starten']);
  });

  it('markeert op een VPS niets, want daar draait alles onder systemd', () => {
    // `systemctl restart` komt terug; de dienst draait daarna zonder dit
    // venster. Zou hier iets staan, dan klopt de aanname niet meer.
    expect(blijvendDraaiend('vps-strato')).toEqual([]);
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
