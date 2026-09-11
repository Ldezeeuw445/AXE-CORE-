import { describe, expect, it } from 'vitest';
import { IPHONE_H, IPHONE_W } from '@/presentation/components/apps/IPhoneFrame';

describe('IPhoneFrame viewport', () => {
  it('matches LiveBrowserView mobile dimensions', () => {
    expect(IPHONE_W).toBe(390);
    expect(IPHONE_H).toBe(844);
  });
});
