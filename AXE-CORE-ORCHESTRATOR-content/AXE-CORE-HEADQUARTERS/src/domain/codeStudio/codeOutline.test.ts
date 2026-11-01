import { describe, it, expect } from 'vitest';
import { extractCodeOutline } from './codeOutline';

describe('extractCodeOutline', () => {
  it('finds exported functions and nested consts', () => {
    const src = `
// comment
import { useMemo } from "react"

export function CalendarWeek({ events }: Props) {
  const days = useMemo(() => groupByDay(events), [events])
  const DayColumn = (day: Day) => null
  return days
}

export class Store {}
const helper = (x: number) => x + 1
`;
    const items = extractCodeOutline(src);
    expect(items.map(i => i.name)).toEqual(
      expect.arrayContaining(['CalendarWeek', 'DayColumn', 'Store', 'helper']),
    );
    expect(items.find(i => i.name === 'CalendarWeek')?.depth).toBe(0);
    expect(items.find(i => i.name === 'helper')?.depth).toBe(1);
  });

  it('returns empty for blank source', () => {
    expect(extractCodeOutline('')).toEqual([]);
  });
});
