import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BERICHT_HOVER,
  MEER_MENU,
  REACTIE_BETEKENIS,
  besluitInThread,
  besluitVanReactie,
  magReageren,
  vindOpDraad,
  zelfdeApprovalRecord,
} from './managerChatFase2';
import { vanNorthsea } from '@/domain/approvals/wachtOpJou';

const item = {
  itemId: 'northsea:reply_draft:d1',
  threadId: 'thr-northseamgr',
  messageId: 'msg-kaart-1',
};

describe('fase-2 Grok Bot-haakjes, niet gebouwd', () => {
  it('hover is reactie, reply en ⋯ met Copy / Copy request ID', () => {
    expect(BERICHT_HOVER).toEqual(['react', 'reply', 'meer']);
    expect(MEER_MENU).toEqual(['copy', 'copy_request_id']);
  });

  it('👍 van Luka of van een manager is dezelfde goedkeuring als de inbox', () => {
    const inbox = vanNorthsea([{
      approval_id: 'd1', kind: 'reply_draft', subject: 'Price 8400 USD per MT',
      created_at: '2026-11-01T10:00:00Z', thread_id: item.threadId, message_id: item.messageId,
    }])[0];
    expect(inbox.id).toBe(item.itemId);

    const viaInbox = { itemId: inbox.id, threadId: inbox.threadId, messageId: inbox.messageId };
    const viaKaart = vindOpDraad([viaInbox], item.threadId, item.messageId);
    expect(viaKaart?.itemId).toBe(inbox.id);

    const luka = besluitVanReactie(item, '👍', 'luka', '2026-11-18T12:00:00Z');
    const manager = besluitVanReactie(item, '✅', 'northseamgr', '2026-11-18T12:00:01Z');
    const inThread = besluitInThread(item, 'approve', '2026-11-18T12:00:02Z');
    expect(luka?.itemId).toBe(inbox.id);
    expect(manager?.itemId).toBe(inbox.id);
    expect(inThread.itemId).toBe(inbox.id);
    expect(zelfdeApprovalRecord(viaInbox, { itemId: luka!.itemId, threadId: luka!.threadId, messageId: luka!.messageId })).toBe(true);
    expect(zelfdeApprovalRecord(viaInbox, { itemId: inThread.itemId, threadId: inThread.threadId, messageId: inThread.messageId })).toBe(true);
    expect(luka?.via).toBe('reaction');
    expect(inThread.via).toBe('thread');
  });

  it('👎 wijst af; 👀 is alleen gezien, geen besluit', () => {
    expect(REACTIE_BETEKENIS['👎']).toBe('reject');
    expect(besluitVanReactie(item, '👎', 'luka')?.action).toBe('reject');
    expect(besluitVanReactie(item, '👀', 'luka')).toBeNull();
  });

  it('reacties gaan twee kanten op: Luka op de manager, de manager op Luka', () => {
    expect(magReageren('luka')).toBe(true);
    expect(magReageren('northseamgr')).toBe(true);
    expect(magReageren('')).toBe(false);
  });

  it('ManagerChat bouwt de hover-UI in deze PR nog niet', () => {
    const chat = readFileSync(join(__dirname, '../../presentation/components/axe-core/ManagerChat.tsx'), 'utf8');
    expect(chat).not.toMatch(/copy_request_id/);
    expect(chat).not.toMatch(/BERICHT_HOVER/);
    expect(chat).not.toMatch(/data-axe-bericht-hover/);
  });
});
