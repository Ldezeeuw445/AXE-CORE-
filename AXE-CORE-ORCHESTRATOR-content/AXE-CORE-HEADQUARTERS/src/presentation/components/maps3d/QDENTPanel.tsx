import React, { useState, useEffect } from "react";
import { Radio, Cpu, Terminal, RefreshCw, FlaskConical } from "lucide-react";

interface QDENTPanelProps {
  cityName: string;
  lat: number;
  lng: number;
}

interface SignalIntercept {
  frequency: string;
  source: string;
  encryption: "AES-256" | "Q-CRYPTO" | "ROT-13" | "UNENCRYPTED";
  strength: number;
  status: "DECRYPTED" | "BROKEN" | "BREACHING" | "SECURE";
  payload: string;
  timestamp: string;
}

export function QDENTPanel({ cityName, lat, lng }: QDENTPanelProps) {
  const [signals, setSignals] = useState<SignalIntercept[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<SignalIntercept | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  const generateSignalsForCity = (city: string) => {
    const cityBaseFreq = (Math.random() * 200 + 100).toFixed(3);
    return [
      {
        frequency: `${cityBaseFreq} MHz`,
        source: `${city.toUpperCase()}_MUNICIPAL_INFRA`,
        encryption: "AES-256" as const,
        strength: Math.floor(Math.random() * 30 + 65),
        status: "DECRYPTED" as const,
        payload: "Telemetry packet: Grid water-pressure regulators reporting nominal levels. Pump stations operating in standard cycle.",
        timestamp: "Active"
      },
      {
        frequency: `${(parseFloat(cityBaseFreq) + 12.405).toFixed(3)} MHz`,
        source: `${city.toUpperCase()}_EMERGENCY_DISPATCH`,
        encryption: "Q-CRYPTO" as const,
        strength: Math.floor(Math.random() * 25 + 70),
        status: "BREACHING" as const,
        payload: "SECURE CHANNEL BREACHED: Intercepted voice payload: 'A-Units dispatched to target zone. Estimated arrival in 12 minutes.'",
        timestamp: "Scanning..."
      },
      {
        frequency: `${(parseFloat(cityBaseFreq) - 8.921).toFixed(3)} MHz`,
        source: `SAT_LINK_UP_UNREG`,
        encryption: "UNENCRYPTED" as const,
        strength: Math.floor(Math.random() * 40 + 45),
        status: "DECRYPTED" as const,
        payload: "Commercial ADS-B Transponder output: Speed 482kts, Alt 31000ft. Transiting sector flight path corridor.",
        timestamp: "2 mins ago"
      },
      {
        frequency: `${(parseFloat(cityBaseFreq) + 42.115).toFixed(3)} MHz`,
        source: "COMM_TACTICAL_CELL",
        encryption: "Q-CRYPTO" as const,
        strength: Math.floor(Math.random() * 20 + 30),
        status: "SECURE" as const,
        payload: "ERROR: Encrypted with Quantum-Resistant Grid key. Initiate deep compute brute-force to decode payload.",
        timestamp: "Offline"
      }
    ];
  };

  useEffect(() => {
    setSignals(generateSignalsForCity(cityName));
    setSelectedSignal(null);
    setTerminalLogs([
      `[SIM] QDENT is a simulated module — no real intercept hardware exists.`,
      `[SIM] Generating illustrative signal data for Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`,
      `[SIM] Simulated RF spectrum sweep near ${cityName}...`
    ]);
  }, [cityName, lat, lng]);

  const handleScan = () => {
    setIsScanning(true);
    setTerminalLogs(prev => [...prev, `[SCAN] Re-sweeping spectrum 100MHz - 900MHz...`]);
    setTimeout(() => {
      setIsScanning(false);
      setSignals(generateSignalsForCity(cityName));
      setTerminalLogs(prev => [
        ...prev,
        `[SCAN] Sweep completed. 4 distinct active transponder carriers isolated.`,
        `[SYS] Running decryption algorithms...`
      ]);
    }, 1500);
  };

  const attemptDecrypt = (sig: SignalIntercept) => {
    if (sig.status === "SECURE") {
      setTerminalLogs(prev => [
        ...prev,
        `[DECRYPT] Attempting high-compute breach of ${sig.frequency}...`,
        `[DECRYPT] WARNING: Encryption strength matches Military grade.`,
        `[DECRYPT] FAILED: Keyspace depth too high. Upgrade satellite decryption nodes.`
      ]);
    } else {
      setSelectedSignal(sig);
      setTerminalLogs(prev => [
        ...prev,
        `[DECRYPT] Decryption successful. Reading decoded stream from ${sig.source}...`
      ]);
    }
  };

  return (
    <div className="space-y-4 font-mono text-xs text-slate-300">
      <div className="flex items-start gap-2 p-2.5 bg-amber-950/15 border border-amber-900/40 text-amber-300 rounded-lg text-[10px] font-sans">
        <FlaskConical className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
        <p className="leading-normal">
          <strong>Simulated Module:</strong> There is no real SIGINT/radio-intercept backend — a browser app
          cannot legitimately intercept RF signals. Every frequency, payload, and decrypt result below is
          randomly generated for illustration, not live data.
        </p>
      </div>

      <div className="flex items-center justify-between border-b border-cyan-950/80 pb-3">
        <div>
          <h3 className="text-xs uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" /> QDENT SIGINT Signal Interceptor (Simulated)
          </h3>
          <p className="text-[10px] text-slate-500 font-sans">
            Simulated radio/telemetry intercept demo for {cityName} — not connected to any real sensor.
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="bg-black hover:bg-cyan-950/20 border border-cyan-850 text-[10px] uppercase tracking-wider text-cyan-400 px-2.5 py-1 rounded cursor-pointer disabled:opacity-40 transition-all flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3 h-3 ${isScanning ? "animate-spin" : ""}`} />
          {isScanning ? "Sweeping..." : "Re-roll Simulation"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {signals.map((sig, index) => (
          <div
            key={index}
            className={`p-3 bg-[#050608] border rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 transition-all ${
              selectedSignal?.frequency === sig.frequency
                ? "border-cyan-500 shadow-md shadow-cyan-500/5 bg-cyan-950/10"
                : "border-[#1e293b] hover:border-cyan-900"
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 font-bold">{sig.frequency}</span>
                <span className="text-[10px] text-slate-500">[{sig.source}]</span>
              </div>
              <div className="flex gap-2 items-center text-[10px] text-slate-400 mt-1">
                <span>ENC: <strong className="text-slate-300">{sig.encryption}</strong></span>
                <span>•</span>
                <span>RSSI: <strong className="text-emerald-400">{sig.strength}%</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-bold tracking-wide ${
                sig.status === "DECRYPTED"
                  ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
                  : sig.status === "BREACHING"
                  ? "bg-amber-950/40 border-amber-500/30 text-amber-400"
                  : "bg-rose-950/40 border-rose-500/30 text-rose-400"
              }`}>
                {sig.status}
              </span>
              <button
                onClick={() => attemptDecrypt(sig)}
                className="bg-slate-900 border border-slate-800 text-[10px] px-2 py-1 rounded text-slate-300 hover:text-cyan-400 hover:border-cyan-500/50 cursor-pointer"
              >
                {sig.status === "DECRYPTED" ? "Read Log" : sig.status === "BREACHING" ? "Crack Key" : "Analyze"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedSignal && (
        <div className="bg-[#030406] border border-cyan-950 p-3 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-[10px] text-cyan-400 border-b border-cyan-950/60 pb-1.5 font-bold">
            <span className="flex items-center gap-1"><Terminal className="w-3.5 h-3.5" /> DECRYPTED STREAM</span>
            <span>FREQ: {selectedSignal.frequency}</span>
          </div>
          <div className="text-[11px] text-slate-300 leading-relaxed bg-[#050608] p-2 rounded border border-slate-900 font-mono text-cyan-300/90 whitespace-pre-wrap">
            {selectedSignal.payload}
          </div>
        </div>
      )}

      <div className="bg-black/90 rounded-lg p-3 border border-[#1e293b] space-y-1">
        <div className="text-[10px] text-slate-500 font-bold tracking-wider flex items-center gap-1.5">
          <Cpu className="w-3 h-3 text-cyan-500 animate-pulse" /> LOCAL SIGINT TERMINAL
        </div>
        <div className="h-24 overflow-y-auto font-mono text-[10px] text-slate-400 space-y-1.5 custom-scrollbar bg-black p-2 rounded">
          {terminalLogs.map((log, index) => (
            <div key={index} className={log.includes("FAILED") ? "text-rose-400" : log.includes("completed") ? "text-emerald-400" : "text-cyan-500/80"}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
