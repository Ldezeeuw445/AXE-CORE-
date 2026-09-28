import { describe, expect, it } from 'vitest';
import { detectChatAction } from './chatActionService';

describe('chat workspace navigation', () => {
  it('opens the NorthSea desk from a natural show command', async () => {
    await expect(detectChatAction('show me the NorthSea desk')).resolves.toEqual({
      kind: 'navigate',
      path: '/maps-3d',
      label: 'Northsea Desk',
    });
  });

  it('opens NorthSea for deal language too', async () => {
    await expect(detectChatAction('show me the deals')).resolves.toEqual({
      kind: 'navigate',
      path: '/maps-3d',
      label: 'Northsea Desk',
    });
  });

  it('opens Personal Computer Use without involving an LLM', async () => {
    await expect(detectChatAction('show me my computer')).resolves.toEqual({
      kind: 'navigate',
      path: '/computer-use',
      label: 'Computer Use',
    });
  });

  it('opens Browser Use from the same command surface', async () => {
    await expect(detectChatAction('open browser use')).resolves.toEqual({
      kind: 'navigate',
      path: '/browser',
      label: 'Browser',
    });
  });

  it('does not steal map projection language such as New York', async () => {
    await expect(detectChatAction('show me New York')).resolves.toBeNull();
  });
});
