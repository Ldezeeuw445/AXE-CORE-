import { describe, it, expect } from 'vitest';
import { isLoopbackUrl, loopbackVerdict } from './loopback';

describe('isLoopbackUrl', () => {
  it('knows the names for "this machine"', () => {
    for (const u of [
      'http://127.0.0.1:11434/api/chat',
      'http://localhost:4599/run',
      'http://LOCALHOST:5000',
      'http://127.1:8080',
      'http://0.0.0.0:3000',
      'http://[::1]:9000',
    ]) expect(isLoopbackUrl(u), u).toBe(true);
  });

  it('leaves real hosts alone', () => {
    for (const u of [
      'https://ollama.axecompanion.com',
      'https://api.openai.com/v1/chat/completions',
      // The interesting near-miss: a hostname that merely starts the same way.
      'http://localhost.evil.example.com/steal',
      'http://127.0.0.1.evil.example.com/steal',
    ]) expect(isLoopbackUrl(u), u).toBe(false);
  });

  it('says no to something that is not a URL, rather than throwing', () => {
    expect(isLoopbackUrl('/proxy/ollama')).toBe(false);
    expect(isLoopbackUrl('')).toBe(false);
  });
});

describe('loopbackVerdict', () => {
  it('lets a remote address through from anywhere', () => {
    expect(loopbackVerdict('https://ollama.axecompanion.com', 'android-shell', 'Ollama'))
      .toEqual({ reachable: true, because: null });
  });

  it('lets loopback through on the machine the services run on', () => {
    expect(loopbackVerdict('http://127.0.0.1:4599', 'this-machine', 'the local bridge').reachable).toBe(true);
  });

  it('explains the phone case in terms of the setup, not the socket', () => {
    // "Connection refused" is true and useless. The reader needs to know the
    // address means a different computer here.
    const v = loopbackVerdict('http://127.0.0.1:8790/tools', 'android-shell', 'AXE Companion');
    expect(v.reachable).toBe(false);
    expect(v.because).toContain('AXE Companion');
    expect(v.because).toContain('phone');
  });

  it('names the service in the remote case too', () => {
    const v = loopbackVerdict('http://localhost:4599', 'remote', 'the local bridge');
    expect(v.reachable).toBe(false);
    expect(v.because).toContain('the local bridge');
  });
});
