import { describe, expect, it } from 'vitest';
import {
  filterItems,
  hoeLang,
  kenmerkVanNorthsea,
  samen,
  splitsOpBeleid,
  vanAxe,
  vanNorthsea,
  zonderUuid,
} from './wachtOpJou';

describe('wacht op jou', () => {
  it('haalt UUIDs en "Yes needed" weg', () => {
    expect(zonderUuid('Yes needed: 2356eac9-dc0e-4a3f-8986-3d86f3ee7db3 — Copper Cathode')).toBe('Copper Cathode');
  });

  it('zet AXE- en NorthSea-vragen in één lijst, oudste eerst, met wat/waarom/wie/doet', () => {
    const axe = vanAxe([{ id: 'a1', task_id: 't1', title: 'Sleutel vernieuwen', detail: 'Login verlopen',
      created_at: '2026-11-16T10:00:00Z' }], { t1: 'projectsmgr' });
    const ns = vanNorthsea([{ approval_id: 'd1', kind: 'reply_draft', subject: 'Copper — supply qualification',
      created_at: '2026-11-01T10:00:00Z', generic_template: true, generated_by: 'northsea-mcp' }]);
    const lijst = samen(axe, ns);
    expect(lijst.map((i) => i.bron)).toEqual(['northsea', 'axe']);
    expect(lijst[0].wat).toBe('Mail ready to send: Copper — supply qualification');
    expect(lijst[0].kanHierBeslissen).toBe(true);
    expect(lijst[0].doet).toMatch(/draft/i);
    expect(lijst[1]).toMatchObject({ wie: 'Projects Manager', wat: 'Sleutel vernieuwen', waarom: 'Login verlopen', kanHierBeslissen: true });
  });

  it('dubbelen tellen één keer', () => {
    const a = vanAxe([{ id: 'a1', task_id: 't1', created_at: '2026-11-16T10:00:00Z' }]);
    expect(samen(a, a)).toHaveLength(1);
  });

  it('zegt hoe lang iets wacht', () => {
    const nu = new Date('2026-11-16T12:00:00Z');
    expect(hoeLang('2026-11-16T11:30:00Z', nu)).toBe('30 min');
    expect(hoeLang('2026-11-13T12:00:00Z', nu)).toBe('3 dagen');
  });

  it('filtert op manager en categorie', () => {
    const axe = vanAxe([{ id: 'a1', task_id: 't1', title: 'Key', created_at: '2026-11-16T10:00:00Z' }], { t1: 'projectsmgr' });
    const ns = vanNorthsea([{
      approval_id: 'd1', kind: 'reply_draft', subject: 'Follow up', created_at: '2026-11-01T10:00:00Z',
      has_thread: true, named_recipient: true, address_verified: true, body: 'Hi Chanda, following up on the COA.',
    }]);
    const alle = samen(axe, ns);
    expect(filterItems(alle, { manager: 'northseamgr' })).toHaveLength(1);
    expect(filterItems(alle, { category: 'chase' })[0].category).toBe('chase');
    expect(filterItems(alle, { bron: 'axe' })).toHaveLength(1);
  });

  it('haalt routine NorthSea-mails uit pending via het beleid, zonder human', () => {
    const ns = vanNorthsea([{
      approval_id: 'd1', kind: 'reply_draft', subject: 'COA', created_at: '2026-11-01T10:00:00Z',
      has_thread: true, named_recipient: true, address_verified: true, body: 'Hi Chanda, following up on the COA.',
    }]);
    const { pending, auto } = splitsOpBeleid(ns);
    expect(pending).toEqual([]);
    expect(auto[0].beleid?.actorType).toBe('axe_policy');
    expect(auto[0].beleid?.marksHumanApproved).toBe(false);
  });

  it('knop op mail, taak en ingekomen mail; niet op een dealbeslissing (20 nov)', () => {
    const ns = vanNorthsea([
      { approval_id: 'd1', kind: 'reply_draft', subject: 'Follow up', created_at: '2026-11-01T10:00:00Z' },
      { approval_id: 'd2', kind: 'deal_decision', subject: 'Move to negotiation', created_at: '2026-11-02T10:00:00Z' },
      { approval_id: 'd3', kind: 'inbound_needs_human_review', subject: 'Inbound offer', created_at: '2026-11-03T10:00:00Z' },
    ]);
    expect(ns.find((i) => i.approvalId === 'd1')?.kanHierBeslissen).toBe(true);
    expect(ns.find((i) => i.approvalId === 'd2')?.kanHierBeslissen).toBe(false);
    expect(ns.find((i) => i.approvalId === 'd3')?.kanHierBeslissen).toBe(true);
    expect(ns.find((i) => i.approvalId === 'd3')?.kanVersturen).toBe(false);
  });

  it('houdt threadId en messageId bij zodat fase-2 dezelfde record sluit', () => {
    // Inbox, emoji en in-thread Approve zoeken op deze id, niet op een kopie.
    const ns = vanNorthsea([{
      approval_id: 'd1', kind: 'reply_draft', subject: 'Price 8400 USD per MT',
      created_at: '2026-11-01T10:00:00Z', thread_id: 'thr-1', message_id: 'msg-9',
    }]);
    expect(ns[0]).toMatchObject({ threadId: 'thr-1', messageId: 'msg-9', approvalId: 'd1' });
    expect(ns[0].id).toBe('northsea:reply_draft:d1');
  });

  it('zet NorthSea-signalen om naar een kenmerk voor het beleid', () => {
    const k = kenmerkVanNorthsea({
      approval_id: 'x', kind: 'reply_draft', has_thread: true, named_recipient: true,
      address_verified: true, body: 'Hi', chases_14d: 1,
    });
    expect(k.hasThread).toBe(true);
    expect(k.chases14dForContact).toBe(1);
  });
});
