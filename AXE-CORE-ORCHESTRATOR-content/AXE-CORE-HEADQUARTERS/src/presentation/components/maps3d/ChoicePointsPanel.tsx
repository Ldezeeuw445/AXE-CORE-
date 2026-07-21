import { useState } from "react";
import { Sliders, AlertCircle, ArrowRight, FlaskConical } from "lucide-react";

interface Scenario {
  title: string;
  triggerEvent: string;
  threatLevel: "CRITICAL" | "HIGH" | "MEDIUM";
  choices: {
    action: string;
    resourceLoad: string;
    probability: number;
    pros: string;
    cons: string;
    protocolId: string;
  }[];
}

const STRATEGIC_SCENARIOS: Scenario[] = [
  {
    title: "Regional Grid Surge Anomaly",
    triggerEvent: "Unregulated power fluctuation detected across primary step-down substations.",
    threatLevel: "CRITICAL",
    choices: [
      {
        action: "Initiate Islanding (Grid Isolation)",
        resourceLoad: "MEDIUM (Local Backup Relays)",
        probability: 92,
        pros: "Instantly preserves city core, blocks cascading blackouts.",
        cons: "Disconnects outer suburbs; raises load strain on backup generator units.",
        protocolId: "AXE-PROTOCOL-ISO_GRID",
      },
      {
        action: "Execute Soft-Shed Load Balancing",
        resourceLoad: "LOW (Remote Terminal Units)",
        probability: 68,
        pros: "Avoids total power loss; rotates brownouts every 15 minutes.",
        cons: "High probability of breaker trips if localized surges are sustained.",
        protocolId: "AXE-PROTOCOL-SOFT_SHED",
      },
      {
        action: "Deploy High-Capacity Cryo-Batteries",
        resourceLoad: "CRITICAL (Emergency Reserves)",
        probability: 85,
        pros: "Provides pure clean buffer power with zero service disruptions.",
        cons: "Reserves exhausted in 4 hours; no secondary failsafes remaining.",
        protocolId: "AXE-PROTOCOL-CRYO_CAP",
      },
    ],
  },
  {
    title: "Localized GPS Telemetry Jamming",
    triggerEvent: "GPS transponder anomalies logged over main seaport shipping vector.",
    threatLevel: "HIGH",
    choices: [
      {
        action: "Deploy Autonomous Visual UAVs",
        resourceLoad: "MEDIUM (Scout Drone Fleet)",
        probability: 88,
        pros: "Provides real-time HD optical verification independent of GPS/SAT.",
        cons: "Limited range and high vulnerability to wind shears or heavy rain.",
        protocolId: "AXE-PROTOCOL-DRONE_RECON",
      },
      {
        action: "Switch to LORAN Ground-Beacon Backup",
        resourceLoad: "HIGH (Ground Radar Station)",
        probability: 75,
        pros: "Interference-resistant low-frequency backup navigation.",
        cons: "Slow lock times; requires manual recalibration on cargo ships.",
        protocolId: "AXE-PROTOCOL-LORAN_NAV",
      },
    ],
  },
  {
    title: "Severe Tectonic Fault Shift Alarm",
    triggerEvent: "High-frequency ground acceleration logged near structural bridge columns.",
    threatLevel: "CRITICAL",
    choices: [
      {
        action: "Automated Transit Interlocking Halt",
        resourceLoad: "LOW (Digital Signalling System)",
        probability: 99,
        pros: "Halts all transit trains prior to bridge crossings instantly.",
        cons: "Causes immediate massive public transport gridlock and delays.",
        protocolId: "AXE-PROTOCOL-AUTO_HALT",
      },
      {
        action: "Mobilize Rapid Response Engineer Teams",
        resourceLoad: "CRITICAL (Field Operations)",
        probability: 82,
        pros: "In-person structural assessment with real-time laser rangefinding.",
        cons: "Exposes specialist crews to active aftershock hazards.",
        protocolId: "AXE-PROTOCOL-ENG_DEPLOY",
      },
    ],
  },
];

export function ChoicePointsPanel() {
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);
  const [activeProtocol, setActiveProtocol] = useState<string | null>(null);
  const [protocolLog, setProtocolLog] = useState<string[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);

  const scenario = STRATEGIC_SCENARIOS[activeScenarioIdx];

  const handleExecuteProtocol = (protocolId: string, actionName: string) => {
    setIsDeploying(true);
    setActiveProtocol(protocolId);
    setProtocolLog([
      `[SIM] Hypothetical choice recorded: ${actionName}`,
      `[SIM] Modeling downstream effects for ${protocolId}...`,
    ]);

    setTimeout(() => {
      setProtocolLog((prev) => [...prev, `[SIM] No real system was contacted — this is a planning exercise only.`]);
    }, 500);

    setTimeout(() => {
      setProtocolLog((prev) => [
        ...prev,
        `[SIM] SCENARIO OUTCOME MODELED for ${protocolId}.`,
        `[SIM] Success chance shown reflects the fixed scenario data below, not a live system.`,
      ]);
      setIsDeploying(false);
    }, 1200);
  };

  return (
    <div className="space-y-4 font-mono text-xs text-slate-300">
      <div className="border-b border-cyan-950/80 pb-3">
        <h3 className="text-xs uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
          <Sliders className="w-4 h-4 text-cyan-400" /> Strategic Choice Points Planner
        </h3>
        <p className="text-[10px] text-slate-500 font-sans">
          Tabletop planning exercise: fixed hypothetical crisis scenarios for evaluating response tradeoffs. Not live data.
        </p>
      </div>

      <div className="flex items-start gap-2 p-2.5 bg-amber-950/15 border border-amber-900/40 text-amber-300 rounded-lg text-[10px] font-sans">
        <FlaskConical className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
        <p className="leading-normal">
          <strong>Simulation Only:</strong> Scenarios, probabilities, and "protocol" outcomes below are fixed
          fictional planning content for decision-support practice — nothing here reflects a real incident or
          system.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1.5 custom-scrollbar">
        {STRATEGIC_SCENARIOS.map((sc, idx) => (
          <button
            key={sc.title}
            onClick={() => {
              setActiveScenarioIdx(idx);
              setActiveProtocol(null);
              setProtocolLog([]);
            }}
            className={`px-2.5 py-1 text-[10px] rounded uppercase font-bold shrink-0 transition-all border cursor-pointer ${
              activeScenarioIdx === idx
                ? "bg-cyan-950/20 border-cyan-500 text-cyan-400"
                : "bg-black border-slate-900 text-slate-500 hover:text-slate-300"
            }`}
          >
            {sc.title.split(" ")[0]} CRISIS
          </button>
        ))}
      </div>

      <div className="bg-[#050608] border border-cyan-950/60 p-3 rounded-lg space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="text-slate-200 uppercase">{scenario.title}</span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded border uppercase ${
              scenario.threatLevel === "CRITICAL"
                ? "bg-rose-950/40 border-rose-500/30 text-rose-400"
                : "bg-amber-950/40 border-amber-500/30 text-amber-400"
            }`}
          >
            {scenario.threatLevel} THREAT
          </span>
        </div>
        <p className="text-[10px] text-slate-400 font-sans leading-relaxed">{scenario.triggerEvent}</p>
      </div>

      <div className="space-y-3">
        {scenario.choices.map((ch) => {
          const isSelected = activeProtocol === ch.protocolId;
          return (
            <div
              key={ch.protocolId}
              className={`p-3 rounded-lg border transition-all flex flex-col justify-between gap-2.5 bg-[#050608] ${
                isSelected ? "border-cyan-500 bg-cyan-950/10" : "border-slate-800 hover:border-slate-700"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-200 text-xs flex items-center gap-1">
                    <ArrowRight className="w-3 h-3 text-cyan-400 shrink-0" />
                    {ch.action}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-950/40">
                    SCS: {ch.probability}%
                  </span>
                </div>

                <div className="mt-1.5 space-y-1 text-[10px] font-sans">
                  <div>
                    <span className="text-emerald-500 font-bold font-mono text-[9px] uppercase tracking-wider block">PROS:</span>
                    <span className="text-slate-300 leading-normal">{ch.pros}</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-rose-400 font-bold font-mono text-[9px] uppercase tracking-wider block">CONS:</span>
                    <span className="text-slate-400 leading-normal">{ch.cons}</span>
                  </div>
                </div>

                <div className="mt-2 text-[9px] font-mono text-slate-500 flex items-center justify-between pt-1.5 border-t border-slate-900">
                  <span>
                    LOAD: <strong className="text-slate-400">{ch.resourceLoad}</strong>
                  </span>
                  <span>
                    ID: <strong className="text-cyan-500/80">{ch.protocolId}</strong>
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  disabled={isDeploying}
                  onClick={() => handleExecuteProtocol(ch.protocolId, ch.action)}
                  className={`px-3 py-1 text-[10px] rounded font-mono uppercase cursor-pointer tracking-wider border font-bold transition-all ${
                    isSelected
                      ? "bg-cyan-500 text-black border-cyan-400"
                      : "bg-slate-900 text-cyan-400 border-cyan-900/60 hover:bg-cyan-950/30 hover:border-cyan-500"
                  }`}
                >
                  {isSelected ? "MODELED" : "MODEL OUTCOME"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {protocolLog.length > 0 && (
        <div className="bg-black border border-cyan-950 p-2.5 rounded-lg space-y-1">
          <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3 text-cyan-400" /> SIMULATION LOG
          </div>
          <div className="space-y-1 font-mono text-[10px] text-cyan-300">
            {protocolLog.map((log, index) => (
              <div key={index} className={log.includes("MODELED") ? "text-emerald-400 font-bold" : "text-cyan-400/80"}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
