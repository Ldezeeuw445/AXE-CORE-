/**
 * webcamCaptureService.ts — one-shot camera frame for AXE vision.
 *
 * Privacy contract:
 *  - Camera opens only on explicit user action (button / "kijk" intent).
 *  - Stream is stopped immediately after one JPEG frame is captured.
 *  - No continuous recording, no background capture, no auto-upload logs.
 */

export interface WebcamCaptureResult {
  /** data:image/jpeg;base64,... */
  dataUrl: string;
  /** raw base64 without data-url prefix (for Gemini/OpenAI APIs) */
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

export type WebcamCaptureErrorCode =
  | 'unsupported' | 'permission' | 'device' | 'timeout' | 'unknown';

export class WebcamCaptureError extends Error {
  // Declared and assigned rather than a `public readonly` constructor
  // parameter: this project sets erasableSyntaxOnly, so parameter properties
  // are a compile error -- they are the one class feature that cannot be
  // erased, because it emits an assignment that has no other source.
  readonly code: WebcamCaptureErrorCode;

  constructor(message: string, code: WebcamCaptureErrorCode) {
    super(message);
    this.code = code;
    this.name = 'WebcamCaptureError';
  }
}

/** True when the browser/runtime can request a camera. */
export function isWebcamSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

/**
 * Capture a single JPEG frame from the user-facing (or default) camera.
 * Resolves after the track is fully stopped.
 */
export async function captureWebcamFrame(opts?: {
  facingMode?: 'user' | 'environment';
  maxWidth?: number;
  quality?: number;
  timeoutMs?: number;
}): Promise<WebcamCaptureResult> {
  if (!isWebcamSupported()) {
    throw new WebcamCaptureError('Camera API not available in this browser.', 'unsupported');
  }

  const maxWidth = opts?.maxWidth ?? 1280;
  const quality = opts?.quality ?? 0.82;
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const facingMode = opts?.facingMode ?? 'user';

  let stream: MediaStream | null = null;

  try {
    stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode,
          width: { ideal: maxWidth },
          height: { ideal: Math.round(maxWidth * 0.75) },
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new WebcamCaptureError('Camera permission timed out.', 'timeout')),
          timeoutMs,
        ),
      ),
    ]);

    const track = stream.getVideoTracks()[0];
    if (!track) {
      throw new WebcamCaptureError('No video track from camera.', 'device');
    }

    // Prefer ImageCapture when available (cleaner still)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ImageCaptureCtor = (window as any).ImageCapture as
      | (new (track: MediaStreamTrack) => { takePhoto: () => Promise<Blob> })
      | undefined;

    if (ImageCaptureCtor) {
      try {
        const ic = new ImageCaptureCtor(track);
        const blob = await ic.takePhoto();
        const dataUrl = await blobToDataUrl(blob);
        const { width, height } = await readImageSize(dataUrl);
        const base64 = dataUrl.split(',')[1] ?? '';
        return { dataUrl, base64, mimeType: 'image/jpeg', width, height };
      } catch {
        // Fall through to canvas path
      }
    }

    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    // Wait one frame so dimensions are real
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) {
        resolve();
        return;
      }
      video.onloadeddata = () => resolve();
    });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    let w = video.videoWidth || 640;
    let h = video.videoHeight || 480;
    if (w > maxWidth) {
      h = Math.round((h * maxWidth) / w);
      w = maxWidth;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new WebcamCaptureError('Canvas not available.', 'unsupported');
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.split(',')[1] ?? '';
    return { dataUrl, base64, mimeType: 'image/jpeg', width: w, height: h };
  } catch (e) {
    if (e instanceof WebcamCaptureError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/NotAllowed|Permission|denied/i.test(msg)) {
      throw new WebcamCaptureError('Camera permission denied.', 'permission');
    }
    if (/NotFound|DevicesNotFound/i.test(msg)) {
      throw new WebcamCaptureError('No camera found.', 'device');
    }
    throw new WebcamCaptureError(msg || 'Camera capture failed.', 'unknown');
  } finally {
    stream?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read photo blob'));
    reader.readAsDataURL(blob);
  });
}

function readImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}
