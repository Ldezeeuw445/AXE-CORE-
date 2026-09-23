import { describe, it, expect } from 'vitest';
import { deltaUitSseBlok, deltaUitJson, isEventStream, leesTokenStream } from './llmStream';

describe('SSE-parser voor first-token', () => {
  it('leest onze VPS-delta en een OpenAI-chunk', () => {
    expect(deltaUitSseBlok('data: {"delta":"Hel"}')).toBe('Hel');
    expect(deltaUitSseBlok('data: {"choices":[{"delta":{"content":"lo"}}]}')).toBe('lo');
    expect(deltaUitSseBlok('data: [DONE]')).toBe('');
  });

  it('leest Gemini-delen en negeert kapotte JSON', () => {
    expect(deltaUitJson('{"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}')).toBe('Hi');
    expect(deltaUitJson('niet-json')).toBe('');
  });

  it('herkent event-stream, niet gewone JSON', () => {
    expect(isEventStream('text/event-stream; charset=utf-8')).toBe(true);
    expect(isEventStream('application/json')).toBe(false);
  });

  it('roept onToken aan vóór de stream belofte klaar is', async () => {
    const enc = new TextEncoder();
    let geefRest: (() => void) | undefined;
    const wacht = new Promise<void>(r => { geefRest = r; });
    let stuk = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        if (stuk === 0) {
          stuk = 1;
          ctrl.enqueue(enc.encode('data: {"delta":"Hel"}\n\n'));
          return;
        }
        if (stuk === 1) {
          stuk = 2;
          await wacht;
          ctrl.enqueue(enc.encode('data: {"delta":"lo"}\n\n'));
          return;
        }
        ctrl.close();
      },
    });

    const seen: string[] = [];
    let streamKlaar = false;
    const p = leesTokenStream(body, (_d, full) => { seen.push(full); }).then(t => {
      streamKlaar = true;
      return t;
    });

    for (let i = 0; i < 30 && seen.length === 0; i++) {
      await new Promise(r => setTimeout(r, 5));
    }
    expect(streamKlaar).toBe(false);
    expect(seen[0]).toBe('Hel');

    geefRest?.();
    expect(await p).toBe('Hello');
    expect(seen).toEqual(['Hel', 'Hello']);
  });
});
