/** AXE Vision Client — screen capture and webcam utilities using browser APIs. */

/**
 * Capture the user's screen using getDisplayMedia.
 * Returns a base64-encoded JPEG image string.
 */
export async function captureScreen() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false,
    });

    const track = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(track);
    const bitmap = await imageCapture.grabFrame();

    // Draw to canvas and get base64
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);

    // Compress and resize if too large
    const maxDim = 1280;
    let w = canvas.width;
    let h = canvas.height;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
      const canvas2 = document.createElement("canvas");
      canvas2.width = w;
      canvas2.height = h;
      const ctx2 = canvas2.getContext("2d");
      ctx2.drawImage(canvas, 0, 0, w, h);
      const dataUrl = canvas2.toDataURL("image/jpeg", 0.85);
      track.stop();
      stream.getTracks().forEach((t) => t.stop());
      return dataUrl;
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    track.stop();
    stream.getTracks().forEach((t) => t.stop());
    return dataUrl;
  } catch (e) {
    throw new Error(`Screen capture failed: ${e?.message || e}`);
  }
}

/**
 * Start webcam stream using getUserMedia.
 * Returns the MediaStream.
 */
export async function startWebcam(preferredDeviceId = null) {
  try {
    const constraints = {
      video: preferredDeviceId
        ? { deviceId: { exact: preferredDeviceId } }
        : { facingMode: "user" },
      audio: false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (e) {
    throw new Error(`Webcam failed: ${e?.message || e}`);
  }
}

/**
 * Capture a frame from a MediaStream and return a base64 JPEG.
 */
export function captureFrameFromStream(stream) {
  const track = stream.getVideoTracks()[0];
  const imageCapture = new ImageCapture(track);
  return imageCapture.grabFrame().then((bitmap) => {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);

    // Resize if too large
    const maxDim = 640;
    let w = canvas.width;
    let h = canvas.height;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
      const canvas2 = document.createElement("canvas");
      canvas2.width = w;
      canvas2.height = h;
      const ctx2 = canvas2.getContext("2d");
      ctx2.drawImage(canvas, 0, 0, w, h);
      return canvas2.toDataURL("image/jpeg", 0.85);
    }
    return canvas.toDataURL("image/jpeg", 0.85);
  });
}

/**
 * List available camera devices.
 */
export async function listCameras() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "videoinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${d.deviceId.slice(0, 6)}...`,
      }));
  } catch (e) {
    return [];
  }
}

/**
 * Stop a MediaStream and all its tracks.
 */
export function stopStream(stream) {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
}
