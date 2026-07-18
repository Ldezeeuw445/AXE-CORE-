import React, { useState, useRef, useEffect } from "react";
import { Camera, Monitor, Video, VideoOff, X, Loader2 } from "lucide-react";
import { captureScreen, startWebcam, captureFrameFromStream, stopStream, listCameras } from "../../lib/vision";
import { api } from "../../lib/api";

export function ScreenCaptureButton({ onCapture, onError, disabled }) {
  const [capturing, setCapturing] = useState(false);

  const handleCapture = async () => {
    try {
      setCapturing(true);
      const dataUrl = await captureScreen();
      onCapture(dataUrl);
    } catch (e) {
      onError(e?.message || "Screen capture failed");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <button
      onClick={handleCapture}
      disabled={disabled || capturing}
      className="text-[#6F8193] hover:text-[#66E6FF] p-1 transition-colors"
      title="Capture screen"
      aria-label="Capture screen"
    >
      {capturing ? (
        <Loader2 size={14} className="animate-spin text-[#00D4FF]" />
      ) : (
        <Monitor size={14} />
      )}
    </button>
  );
}

export function VisionCapture({ onCapture, onError, onClose }) {
  const [stream, setStream] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    listCameras().then(setCameras);
    return () => {
      if (stream) stopStream(stream);
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const startCamera = async (deviceId = null) => {
    try {
      if (stream) stopStream(stream);
      const newStream = await startWebcam(deviceId);
      setStream(newStream);
      setSelectedCamera(deviceId);
    } catch (e) {
      onError(e?.message || "Webcam failed");
    }
  };

  const captureFrame = async () => {
    if (!stream) return;
    try {
      setCapturing(true);
      const dataUrl = await captureFrameFromStream(stream);
      onCapture(dataUrl);
    } catch (e) {
      onError(e?.message || "Frame capture failed");
    } finally {
      setCapturing(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stopStream(stream);
      setStream(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col gap-3 p-4"
        style={{
          width: "min(90vw, 640px)",
          background: "#0B0C0E",
          border: "1px solid rgba(0,212,255,0.25)",
          borderRadius: 16,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-[#66E6FF]" />
            <span className="text-[11px] font-semibold tracking-[0.10em] text-[#EAF2F7]">WEBCAM VISION</span>
          </div>
          <button onClick={onClose} className="text-[#6F8193] hover:text-[#FF4D6D] p-1">
            <X size={14} />
          </button>
        </div>

        <div className="relative bg-black rounded-lg overflow-hidden"
          style={{ aspectRatio: "16/9", minHeight: 240 }}
        >
          {stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2"
              style={{ minHeight: 240 }}
            >
              <VideoOff size={32} className="text-[#6F8193] opacity-50" />
              <span className="text-[10px] text-[#6F8193]">Camera is off</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stream ? (
            <>
              <button
                onClick={captureFrame}
                disabled={capturing}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#00D4FF] text-black text-[11px] font-semibold hover:bg-[#66E6FF] transition-colors disabled:opacity-60"
              >
                {capturing ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                CAPTURE FRAME
              </button>
              <button
                onClick={stopCamera}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white/5 text-[#9FB0C0] text-[11px] hover:bg-white/10 transition-colors"
              >
                <VideoOff size={12} /> STOP
              </button>
            </>
          ) : (
            <button
              onClick={() => startCamera(selectedCamera)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#00D4FF] text-black text-[11px] font-semibold hover:bg-[#66E6FF] transition-colors"
            >
              <Video size={12} /> START CAMERA
            </button>
          )}

          {cameras.length > 1 && (
            <select
              value={selectedCamera || ""}
              onChange={(e) => {
                setSelectedCamera(e.target.value);
                if (stream) startCamera(e.target.value);
              }}
              className="axe-input text-[10px] py-1"
            >
              {cameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>{cam.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
