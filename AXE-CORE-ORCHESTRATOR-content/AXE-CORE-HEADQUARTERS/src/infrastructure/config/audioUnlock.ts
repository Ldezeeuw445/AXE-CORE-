/**
 * iOS/Safari audio unlock.
 *
 * Browsers (especially iOS Safari) only allow audio playback that starts
 * within a user gesture. Our TTS plays AFTER an await (fetch the clip), so by
 * the time .play() runs the gesture is over and the browser blocks it with
 * "The request is not allowed by the user agent…" — which is why AXE fell back
 * to the browser voice even when ElevenLabs returned real audio.
 *
 * Fix: keep ONE shared <audio> element and unlock it on the first real user
 * gesture (a tiny silent clip). Once unlocked, later programmatic .play()
 * calls on that same element are allowed. All TTS routes through it.
 */

// Minimal valid silent WAV (44 bytes) — enough to satisfy the unlock play().
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

let sharedAudio: HTMLAudioElement | null = null;
let unlocked = false;

/** The single shared audio element every TTS path should play through. */
export function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) sharedAudio = new Audio();
  return sharedAudio;
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

function unlock(): void {
  if (unlocked) return;
  unlocked = true;
  try {
    const a = getSharedAudio();
    a.src = SILENT_WAV;
    a.muted = true;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
    }
  } catch { /* best effort */ }
}

// Register once, on the first gesture of any kind.
if (typeof window !== 'undefined') {
  const handler = () => {
    unlock();
    window.removeEventListener('touchend', handler);
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('click', handler);
    window.removeEventListener('keydown', handler);
  };
  window.addEventListener('touchend', handler, { passive: true });
  window.addEventListener('pointerdown', handler, { passive: true });
  window.addEventListener('click', handler);
  window.addEventListener('keydown', handler);
}
