import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagina = readFileSync(join(__dirname, 'WachtOpJou.tsx'), 'utf8');
const migratie = readFileSync(
  join(__dirname, '../../../supabase/migrations/20261118120000_axe_approval_inbox.sql'),
  'utf8',
);
const api = readFileSync(
  join(__dirname, '../../infrastructure/gateways/axeCoreApiService.ts'),
  'utf8',
);

describe('Wacht op jou — één inbox, aangesloten', () => {
  it('gebruikt de schil-primitieven, niet een eigen raster', () => {
    expect(pagina).toContain('TabRuimte');
    expect(pagina).toContain('Kaart');
    expect(pagina).toContain('SectieBlok');
    expect(pagina).toContain('SchuifBalk');
  });

  it('keurt goed zonder op Resend te wachten, en logt thread/message', () => {
    expect(api).toContain('northseaMensGoedkeuren');
    expect(api).toContain('northseaMensBeslis');
    expect(pagina).toContain('northseaMensBeslis');
    expect(pagina).toContain("via: 'inbox'");
    expect(pagina).toContain('threadId: i.threadId');
    expect(pagina).toContain('messageId: i.messageId');
    expect(pagina).toContain('klik(');
    expect(pagina).toContain('Bulk approve');
    expect(pagina).toContain('Approved, but send failed');
    expect(pagina).not.toContain(".catch(() => undefined)");
    expect(pagina).toContain('i.kanHierBeslissen');
  });

  it('migratie koppelt item aan thread/message en via reaction/thread', () => {
    expect(migratie).toContain('thread_id text');
    expect(migratie).toContain('message_id text');
    expect(migratie).toContain("via in ('inbox', 'bulk', 'reaction', 'thread', 'policy')");
    expect(migratie).toContain('axe_approval_items_draad');
    expect(migratie).toContain('enable row level security');
    expect(migratie).toContain('grant select, insert, update, delete on table public.axe_approval_items to service_role');
    expect(migratie).toMatch(/NIET toepassen op productie/i);
  });
});
