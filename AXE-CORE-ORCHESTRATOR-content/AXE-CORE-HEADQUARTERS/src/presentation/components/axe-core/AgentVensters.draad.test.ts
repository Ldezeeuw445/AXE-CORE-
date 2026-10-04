import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const vensters = readFileSync(join(__dirname, 'AgentVensters.tsx'), 'utf8');
const chat = readFileSync(join(__dirname, 'ManagerChat.tsx'), 'utf8');

describe('Home-agentvenster is een live draad', () => {
  it('de kolom-chrome blijft dezelfde plek; het venster krijgt de draad', () => {
    expect(vensters).toMatch(/left: 'clamp\(24px, 3\.5vw, 64px\)'/);
    expect(vensters).toMatch(/top: '40%'/);
    expect(vensters).toMatch(/jobs=\{jobs\.filter/);
    expect(vensters).toMatch(/onOpvolging/);
    expect(vensters).toMatch(/bron: 'followup'/);
  });

  it('het bestaande kaartvenster toont opdracht, goedkeuring en opvolging', () => {
    expect(chat).toMatch(/data-axe-agent-draad/);
    expect(chat).toMatch(/Follow-up/);
    expect(chat).toMatch(/Approve/);
    expect(chat).toMatch(/draadVoorAgent/);
  });
});
