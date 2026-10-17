import { describe, expect, it } from 'vitest';
import {
  agentDisplayName,
  agentEventsFromRecords,
  collectHubRecords,
  filterHubMemories,
  recordsForHub,
  typeLabelFor,
} from './hubMemoryRecord';

const SAMPLE = collectHubRecords({
  global: [
    {
      id: '1',
      category: 'user_preference',
      key: 'tone',
      value: '{"style":"direct"}',
      created_at: '2026-10-01T10:00:00Z',
    },
    {
      id: '2',
      category: 'system_event',
      key: 'ta:AUDJPY:score',
      value: 'AUDJPY strategy scorecard',
      metadata: { agentId: 'axe_trader' },
      created_at: '2026-10-02T10:00:00Z',
    },
    {
      id: '3',
      category: 'provider_performance',
      key: 'feed:natgas',
      value: 'NATGAS data vendor',
      created_at: '2026-10-03T10:00:00Z',
    },
  ],
  rag: [
    { id: 'r1', category: 'user', content: 'Luka prefers concise answers', importance: 9, created_at: '2026-09-01T00:00:00Z' },
  ],
  notes: [
    { path: 'AXE/Resources/natgas.md', title: 'NATGAS feed', content: 'Vendor list', updated_at: '2026-10-04T00:00:00Z' },
  ],
});

describe('hubMemoryRecord', () => {
  it('zet echte rijen in de hub die de classifier al gebruikt', () => {
    expect(recordsForHub(SAMPLE, 'hub-trading')[0]?.title).toBe('ta:AUDJPY:score');
    expect(recordsForHub(SAMPLE, 'preferences')[0]?.type).toBe('Preference');
    expect(recordsForHub(SAMPLE, 'knowledge')).toHaveLength(1);
    expect(recordsForHub(SAMPLE, 'resources').map((r) => r.title)).toEqual(['NATGAS feed']);
    expect(recordsForHub(SAMPLE, 'insights')[0]?.title).toBe('feed:natgas');
  });

  it('zoekt en filtert binnen een hub', () => {
    const resources = recordsForHub(SAMPLE, 'resources');
    expect(filterHubMemories(resources, 'natgas')).toHaveLength(1);
    expect(filterHubMemories(resources, '', 'Note')).toHaveLength(1);
    expect(filterHubMemories(resources, 'niet-bestaand')).toHaveLength(0);
  });

  it('maakt agentactiviteit van wie schreef', () => {
    const events = agentEventsFromRecords(SAMPLE);
    expect(events[0]?.agentName).toBe('Trader');
    expect(events[0]?.action).toBe('wrote');
    expect(agentDisplayName('axe_intel')).toBe('Intel');
    expect(typeLabelFor('conversation_context')).toBe('Conversation');
  });
});
