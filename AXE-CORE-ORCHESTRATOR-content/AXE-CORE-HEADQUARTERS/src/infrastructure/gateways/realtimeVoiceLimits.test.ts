import { afterEach, describe, expect, it, vi } from 'vitest';
import { openRealtimeVoice, realtimeSessionUpdate } from './openAiRealtimeVoice';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function open() {
  vi.useFakeTimers();
  const rows = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => rows.get(k) ?? null, setItem: (k: string, v: string) => rows.set(k, v) });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('Audio', class { pause = vi.fn(); autoplay = false; srcObject = null; });
  const channel = { readyState: 'open', send: vi.fn(), close: vi.fn(), onopen: null as null | (() => void), onmessage: null as null | ((e: { data: string }) => void) };
  const track = { enabled: true };
  const peerClose = vi.fn();
  vi.stubGlobal('RTCPeerConnection', class {
    connectionState = 'connected';
    addTrack = vi.fn();
    createDataChannel = () => channel;
    getSenders = () => [{ track }];
    createOffer = async () => ({ sdp: 'offer' });
    setLocalDescription = async () => {};
    setRemoteDescription = async () => {};
    close = peerClose;
  });
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ value: 'ephemeral' }) })
    .mockResolvedValueOnce({ ok: true, text: async () => 'answer' }));
  const onClosed = vi.fn();
  const onResponseDone = vi.fn();
  const session = await openRealtimeVoice({ getAudioTracks: () => [track] } as unknown as MediaStream, { instructions: 'test', tools: [] }, { onClosed, onResponseDone });
  channel.onopen!();
  const emit = (msg: object) => channel.onmessage!({ data: JSON.stringify(msg) });
  return { session, channel, track, peerClose, onClosed, onResponseDone, emit };
}

describe('betaalde realtime-verbinding heeft echte stopgrenzen', () => {
  it('sluit de verbinding en schakelt audio uit na 90 seconden zonder spraak', async () => {
    const s = await open();
    vi.advanceTimersByTime(90_000);
    expect(s.peerClose).toHaveBeenCalledOnce();
    expect(s.track.enabled).toBe(false);
    expect(s.onClosed).toHaveBeenCalledWith(expect.stringContaining('90 seconds'));
    expect(s.session.isOpen()).toBe(false);
  });
  it('nieuwe spraak verlengt inactiviteit, maar modelantwoorden doen dat niet', async () => {
    const s = await open();
    vi.advanceTimersByTime(60_000);
    s.emit({ type: 'input_audio_buffer.speech_stopped' });
    vi.advanceTimersByTime(60_000);
    expect(s.peerClose).not.toHaveBeenCalled();
    s.emit({ type: 'response.done', response: { id: 'r1', usage: { total_tokens: 100 } } });
    vi.advanceTimersByTime(30_000);
    expect(s.peerClose).toHaveBeenCalledOnce();
  });
  it('stopt ook bij voortdurende activiteit na tien minuten', async () => {
    const s = await open();
    for (let i = 0; i < 9; i++) {
      vi.advanceTimersByTime(60_000);
      s.emit({ type: 'input_audio_buffer.speech_started' });
    }
    vi.advanceTimersByTime(60_000);
    expect(s.onClosed).toHaveBeenCalledWith(expect.stringContaining('10-minute'));
  });
  it('sluit bij de tokenlimiet vóór een volgende toolbeurt kan starten', async () => {
    const s = await open();
    s.emit({ type: 'response.done', response: { id: 'r1', usage: { total_tokens: 20_000 } } });
    expect(s.peerClose).toHaveBeenCalledOnce();
    expect(s.onResponseDone).not.toHaveBeenCalled();
    s.channel.send.mockClear();
    s.session.sendFunctionResult('call1', 'done');
    expect(s.channel.send).not.toHaveBeenCalled();
  });
  it('stopt als usage ontbreekt of de sessieconfiguratie wordt geweigerd', async () => {
    const s = await open();
    s.emit({ type: 'error', error: { message: 'Invalid session configuration' } });
    expect(s.peerClose).toHaveBeenCalledOnce();
  });
  it('handmatig ophangen ruimt alle timers op', async () => {
    const s = await open();
    await s.session.close();
    vi.advanceTimersByTime(600_000);
    expect(s.peerClose).toHaveBeenCalledOnce();
    expect(s.onClosed).not.toHaveBeenCalled();
  });
  it('begrensde context en antwoordlengte zitten in de verzonden GA-configuratie', () => {
    const config = realtimeSessionUpdate({ instructions: 'x', tools: [] }) as { session: Record<string, unknown> };
    expect(config.session.max_output_tokens).toBe(512);
    expect(config.session.truncation).toEqual({ type: 'retention_ratio', retention_ratio: 0.8, token_limits: { post_instructions: 8000 } });
  });
});
