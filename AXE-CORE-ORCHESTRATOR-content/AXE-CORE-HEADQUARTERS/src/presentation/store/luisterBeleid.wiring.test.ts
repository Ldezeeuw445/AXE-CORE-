import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const bron = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('geen always-on microfoon', () => {
  it('zet __axeVoiceReady niet meer, zodat Android niet zelf gaat luisteren', () => {
    const tekst = bron('presentation/store/installOpenAIRealtimeVoice.ts');
    expect(tekst).not.toContain('__axeVoiceReady = true');
    expect(tekst).not.toMatch(/__axeVoiceReady\s*=/);
    expect(tekst).toContain('STILTE_MS');
    expect(tekst).toContain('planStilteEinde');
  });

  it('wake-woord is opt-in en hangt aan de setting, niet aan App-mount', () => {
    const hook = bron('presentation/hooks/useWakeWord.ts');
    const settings = bron('presentation/pages/SettingsPage.tsx');
    expect(hook).toContain("if (!aan) return");
    expect(hook).toContain('WAKE_SLEUTEL');
    expect(settings).toContain('Hey AXE wake word');
    expect(settings).toContain("loadSetting(WAKE_SLEUTEL, false)");
  });

  it('mic-knop toont aan/uit op telefoon en desktop', () => {
    expect(bron('presentation/components/layout/MobileComposer.tsx')).toContain("data-axe-mic={activeVoice || voice.liveCall ? 'aan' : 'uit'}");
    expect(bron('presentation/components/layout/PlaatChat.tsx')).toContain("data-axe-mic={voice.liveCall || chatIsListening ? 'aan' : 'uit'}");
  });
});
