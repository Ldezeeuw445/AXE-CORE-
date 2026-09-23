"""AXE's stem: Kokoro-82M, lokaal, gratis.

Een eigen kleine dienst naast axe_api, niet erin. Kokoro houdt ~650 MB vast;
als de stem vastloopt mag dat het brein van AXE niet meenemen. Alleen de
standaardbibliotheek plus kokoro-onnx/soundfile, zodat er geen tweede
webframework in een tweede venv hoeft.

    GET  /health            -> {"ok": true, "voice": "bm_george", ...}
    POST /tts  {"text": ..., "voice"?: ..., "speed"?: ...}  -> audio/wav

Eén zin per aanvraag, één synthese tegelijk (lock): de app vraagt zin n+1 op
terwijl zin n speelt, dus parallel synthetiseren levert niets op behalve
geheugenpieken op een 8 GB Mac mini.

Luistert alleen op 127.0.0.1. Het model staat buiten git in AXE_TTS_HOME
(standaard ~/.axe/tts): kokoro-v1.0.int8.onnx + voices-v1.0.bin.
"""
from __future__ import annotations

import io
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

HOME = Path(os.environ.get("AXE_TTS_HOME", Path.home() / ".axe" / "tts"))
MODEL = HOME / os.environ.get("AXE_TTS_MODEL", "kokoro-v1.0.int8.onnx")
VOICES = HOME / "voices-v1.0.bin"
# Niet 8011: dat is de poort van de lokale northsea-api/axe_api-devserver
# (launch.json "northsea-api", VITE_LOKALE_AGENT_ORIGIN). Op 8011 zou de
# stem die blokkeren, of erger, API-verkeer van northsea-web binnenkrijgen.
PORT = int(os.environ.get("AXE_TTS_PORT", "8766"))

# Luka koos 23 sep 2026 op gehoor uit vijf samples: George (Brits).
DEFAULT_VOICE = "bm_george"
MAX_CHARS = 1200  # één zin, hooguit een korte alinea; langer = de app knipt niet

# De app draait als tauri://localhost (macOS), http://tauri.localhost (Windows)
# of via de Vite-devserver. Alleen die mogen de stem aanroepen vanuit een browser.
ALLOWED_ORIGINS = {
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

_kokoro = Kokoro(str(MODEL), str(VOICES))
_voices = set(_kokoro.get_voices())
_lock = threading.Lock()


def _lang_for(voice: str) -> str:
    # b* = Brits, a* = Amerikaans. Verkeerde taal = verkeerde klinkers.
    return "en-gb" if voice.startswith("b") else "en-us"


class Handler(BaseHTTPRequestHandler):
    server_version = "axe-tts/1"

    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:  # noqa: N802 (http.server-naamgeving)
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?")[0] == "/health":
            self._json(200, {"ok": True, "voice": DEFAULT_VOICE, "model": MODEL.name})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?")[0] != "/tts":
            self._json(404, {"error": "not found"})
            return
        # CORS alleen houdt het ANTWOORD tegen, niet het werk: een willekeurige
        # webpagina in een browser op deze Mac kon de synthese nog steeds laten
        # draaien. Een vreemde Origin krijgt daarom meteen nee. Geen Origin
        # (curl, lokale scripts) mag wel -- die zitten al op deze machine.
        origin = self.headers.get("Origin")
        if origin is not None and origin not in ALLOWED_ORIGINS:
            self._json(403, {"error": "origin not allowed"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(min(length, 64_000)) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"error": "body must be JSON"})
            return
        text = str(req.get("text") or "").strip()
        if not text:
            self._json(400, {"error": "text is empty"})
            return
        if len(text) > MAX_CHARS:
            self._json(413, {"error": f"text longer than {MAX_CHARS} chars; split into sentences"})
            return
        voice = str(req.get("voice") or DEFAULT_VOICE)
        if voice not in _voices:
            # Nooit stil een andere stem kiezen: dat is precies de "vroeg om
            # Man, kreeg iemand anders"-fout die we bij ElevenLabs hadden.
            self._json(400, {"error": f"unknown voice {voice}"})
            return
        try:
            speed = min(1.5, max(0.7, float(req.get("speed") or 1.0)))
        except (TypeError, ValueError):
            speed = 1.0

        t0 = time.monotonic()
        with _lock:
            samples, rate = _kokoro.create(text, voice=voice, speed=speed, lang=_lang_for(voice))
        buf = io.BytesIO()
        sf.write(buf, samples, rate, format="WAV", subtype="PCM_16")
        wav = buf.getvalue()

        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav)))
        self.send_header("X-Audio-Seconds", f"{len(samples) / rate:.3f}")
        self.send_header("X-Synth-Seconds", f"{time.monotonic() - t0:.3f}")
        self.send_header("Access-Control-Expose-Headers", "X-Audio-Seconds, X-Synth-Seconds")
        self.end_headers()
        self.wfile.write(wav)

    def log_message(self, fmt: str, *args) -> None:
        # Nooit de tekst loggen (dat is wat Luka zei of wat AXE antwoordde);
        # alleen pad en status.
        if args and isinstance(args[0], str) and args[0].startswith(("POST", "GET", "OPTIONS")):
            print(f"{self.log_date_time_string()} {args[0].split(' ')[0]} {args[0].split(' ')[1]} {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    print(f"axe-tts: {MODEL.name}, voice {DEFAULT_VOICE}, 127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
