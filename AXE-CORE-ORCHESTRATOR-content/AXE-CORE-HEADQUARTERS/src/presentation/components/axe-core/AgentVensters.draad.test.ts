import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const vensters = readFileSync(join(__dirname, 'AgentVensters.tsx'), 'utf8');
const chat = readFileSync(join(__dirname, 'ManagerChat.tsx'), 'utf8');
const knoppen = readFileSync(join(__dirname, 'GoedkeuringActie.tsx'), 'utf8');

describe('Home-agentvenster is een live draad', () => {
  it('de kolom-chrome blijft dezelfde plek; het venster krijgt de draad', () => {
    expect(vensters).toMatch(/left: 'clamp\(16px, 2\.4vw, 48px\)'/);
    expect(vensters).toMatch(/jobs=\{jobs\.filter/);
    expect(vensters).toMatch(/onOpvolging/);
    expect(vensters).toMatch(/bron: 'followup'/);
    expect(vensters).toMatch(/agentRegel/);
    expect(vensters).toMatch(/goedkeuringVanJob/);
  });

  it('het bestaande kaartvenster toont opdracht, goedkeuring en opvolging', () => {
    expect(chat).toMatch(/data-axe-agent-draad/);
    expect(chat).toMatch(/Follow-up/);
    expect(knoppen).toMatch(/Approve/);
    expect(knoppen).toMatch(/Decline/);
    expect(chat).toMatch(/pendingApproval|rijenVoorAgent/);
    expect(chat).toMatch(/GoedkeuringActie/);
    expect(chat).toMatch(/followupIsAkkoord/);
    expect(chat).toMatch(/extraGoedkeuringen/);
    expect(chat).toMatch(/draadVoorAgent/);
  });

  it('server-OK is ter plekke te beslissen zonder de Home-kolom te verzetten', () => {
    expect(vensters).toMatch(/left: 'clamp\(16px, 2\.4vw, 48px\)'/);
    expect(vensters).toMatch(/beslisAgentOk/);
    expect(vensters).toMatch(/GoedkeuringActie/);
    expect(vensters).toMatch(/followupIsAkkoord/);
    expect(vensters).toMatch(/railRijen/);
    expect(vensters).toMatch(/extraRegel/);
    expect(vensters).toMatch(/next \$\{eventTijd/);
  });
});
