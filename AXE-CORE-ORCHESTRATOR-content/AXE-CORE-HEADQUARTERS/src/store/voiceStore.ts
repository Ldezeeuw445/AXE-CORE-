/**
 * Speak text using the best available TTS engine:
 * 1. ElevenLabs (if API key configured) — natural, human-like voice
 * 2. VPS axe_api TTS (if configured)
 * 3. Browser speechSynthesis (fallback)
 */
function speakSafely(text: string, onDone?: () => void) {
  // Priority 1: ElevenLabs — best quality, natural voice
  speakWithElevenLabs(text, onDone, () => {
    // Priority 2: VPS axe_api TTS
    if (isAxeApiConfigured) {
      void tts(text).then((blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { URL.revokeObjectURL(url); onDone?.(); };
        audio.onerror = () => { URL.revokeObjectURL(url); onDone?.(); };
        audio.play().catch(() => onDone?.());
      }).catch(() => {
        // Priority 3: Browser fallback
        speakWithBrowser(text, onDone);
      });
      return;
    }
    // Priority 3: Browser fallback
    speakWithBrowser(text, onDone);
  });
}
