/**
 * Tools + Indicators bottom-sheet drawer — the panel with structure/OB/FVG
 * toggles, drawing tools, indicator panes, and per-side count pickers seen
 * in AXE Companion's chart. That UI lives inline inside Companion's
 * 5470-line ChartScreen.tsx (not a standalone file), so this is a fresh
 * implementation wired to the same indicator engine ported 1:1 in
 * ChartIndicatorLayer.tsx / IndicatorPane.tsx — same toggles, same effect,
 * new code.
 */
import { useState } from "react";
import {
  Spline,
  ArrowUpDown,
  TrendingUp,
  Layers,
  Square,
  GitBranch,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  Sun,
  LineChart as LineChartIcon,
  Square as RectIcon,
  Type as TypeIcon,
  Minus,
  Trash2,
  BarChart3,
  Activity,
  Waves,
  BarChart2,
  Landmark,
  Crosshair as CrosshairIcon,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

export type IndicatorToggles = {
  ma?: boolean;
  bollinger?: boolean;
  vwap?: boolean;
  poc?: boolean;
  structure?: boolean;
  orderBlocks?: boolean;
  fvg?: boolean;
  ifvg?: boolean;
  pdh?: boolean;
  pdl?: boolean;
  pdq?: boolean;
  sessionOpen?: boolean;
  swingPoints?: boolean;
  supplyDemand?: boolean;
};

export type DrawingMode = "fib_retracement" | "trendline" | "rectangle" | "text" | "horizontal_level" | null;
export type FibSource = "auto" | "swing" | "day";
export type IndicatorPane = "vol" | "rsi" | "macd" | "bol";

export type ChartToolsState = {
  active: IndicatorToggles;
  drawingMode: DrawingMode;
  orderBlockCount: 1 | 2 | 3;
  fvgCount: 1 | 2 | 3;
  inverseFvgCount: 1 | 2 | 3;
  projectionCount: 1 | 2 | 3;
  fibSource: FibSource;
  panes: IndicatorPane[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  state: ChartToolsState;
  onChange: (next: ChartToolsState) => void;
};

function toggle<K extends keyof IndicatorToggles>(state: ChartToolsState, key: K): ChartToolsState {
  return { ...state, active: { ...state.active, [key]: !state.active[key] } };
}

function ToolBtn({
  icon: Icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center transition-colors disabled:opacity-35"
      style={{
        borderColor: active ? "rgba(34,211,238,0.35)" : "rgba(255,255,255,0.08)",
        background: active ? "rgba(34,211,238,0.10)" : "rgba(255,255,255,0.03)",
        color: active ? "#67e8f9" : "rgba(255,255,255,0.65)",
      }}
    >
      <Icon className="h-4 w-4" />
      <span className="text-[8px] font-semibold uppercase tracking-wide">{label}</span>
    </button>
  );
}

function CountPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 1 | 2 | 3;
  onChange: (v: 1 | 2 | 3) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <div className="flex gap-1">
        {([1, 2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="h-6 w-6 rounded text-[10px] font-mono"
            style={{
              background: value === n ? "rgba(34,211,238,0.18)" : "rgba(255,255,255,0.04)",
              color: value === n ? "#67e8f9" : "rgba(255,255,255,0.55)",
              border: `1px solid ${value === n ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChartToolsDrawer({ open, onClose, state, onChange }: Props) {
  const [fibSourceLocal, setFibSourceLocal] = useState<FibSource>(state.fibSource);

  if (!open) return null;

  const setFibSource = (s: FibSource) => {
    setFibSourceLocal(s);
    onChange({ ...state, fibSource: s });
  };

  const setDrawingMode = (m: DrawingMode) => onChange({ ...state, drawingMode: state.drawingMode === m ? null : m });

  const togglePane = (p: IndicatorPane) =>
    onChange({
      ...state,
      panes: state.panes.includes(p) ? state.panes.filter((x) => x !== p) : [...state.panes, p],
    });

  return (
    <>
      {/* Invisible full-viewport backdrop, so a click anywhere closes the
          drawer. It must stay below the global nav or it swallows every nav
          click and the Trading tab looks frozen — the only escape being to
          unmount this component by switching sub-tabs.
          Dropping it from z-10050 to 60 was meant to fix that, on the belief
          that the nav sat at 100. It did not: BottomNav had no z-index at
          all, so 60 still covered it. BottomNav is now explicitly z-100
          (see its comment), which is what actually makes this safe. */}
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-transparent"
        aria-label="Close tools drawer"
        onClick={onClose}
      />
      <div
        /* Size only — the portal wrapper in CompanionChart decides WHERE this
         * sits, because it must not be `fixed` inside a `-translate-x-1/2`
         * ancestor: a transformed ancestor becomes the containing block for
         * fixed descendants, so a nested fixed element silently positions
         * against the wrapper instead of the viewport. */
        className="relative z-[70] w-full max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#060608]/97 shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl pb-[env(safe-area-inset-bottom)] sm:w-[min(380px,calc(100vw-20px))] sm:max-h-[70vh] sm:rounded-xl sm:pb-0"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">Tools + Indicators</p>
          <button type="button" onClick={onClose} className="text-[11px] text-white/50">Done</button>
        </div>

        {/* Structure / zones / levels */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <div className="grid grid-cols-4 gap-2">
            <ToolBtn icon={Spline} label="Auto Fib" active={state.drawingMode === "fib_retracement"} onClick={() => setDrawingMode("fib_retracement")} />
            <ToolBtn icon={ArrowUpDown} label="Flip Fib" onClick={() => {}} disabled />
            <ToolBtn icon={TrendingUp} label="Auto Trend" active={state.drawingMode === "trendline"} onClick={() => setDrawingMode("trendline")} />
            <ToolBtn icon={GitBranch} label="Structure" active={state.active.structure} onClick={() => onChange(toggle(state, "structure"))} />
            <ToolBtn icon={Layers} label="OB" active={state.active.orderBlocks} onClick={() => onChange(toggle(state, "orderBlocks"))} />
            <ToolBtn icon={Square} label="FVG" active={state.active.fvg} onClick={() => onChange(toggle(state, "fvg"))} />
            <ToolBtn icon={ArrowUpDown} label="IFVG" active={state.active.ifvg} onClick={() => onChange(toggle(state, "ifvg"))} />
            <ToolBtn icon={ArrowUpRight} label="PDH" active={state.active.pdh} onClick={() => onChange(toggle(state, "pdh"))} />
            <ToolBtn icon={ArrowDownRight} label="PDL" active={state.active.pdl} onClick={() => onChange(toggle(state, "pdl"))} />
            <ToolBtn icon={ArrowLeftRight} label="PDQ" active={state.active.pdq} onClick={() => onChange(toggle(state, "pdq"))} />
            <ToolBtn icon={Sun} label="Open" active={state.active.sessionOpen} onClick={() => onChange(toggle(state, "sessionOpen"))} />
            <ToolBtn icon={Layers} label="S/D" active={state.active.supplyDemand} onClick={() => onChange(toggle(state, "supplyDemand"))} />
            <ToolBtn icon={GitBranch} label="Swings" active={state.active.swingPoints} onClick={() => onChange(toggle(state, "swingPoints"))} />
          </div>
        </div>

        {/* Draw tools */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Draw</p>
          <div className="grid grid-cols-4 gap-2">
            <ToolBtn icon={LineChartIcon} label="Line" active={state.drawingMode === "trendline"} onClick={() => setDrawingMode("trendline")} />
            <ToolBtn icon={RectIcon} label="Rect" active={state.drawingMode === "rectangle"} onClick={() => setDrawingMode("rectangle")} />
            <ToolBtn icon={TypeIcon} label="Text" active={state.drawingMode === "text"} onClick={() => setDrawingMode("text")} />
            <ToolBtn icon={Minus} label="H-Line" active={state.drawingMode === "horizontal_level"} onClick={() => setDrawingMode("horizontal_level")} />
          </div>
          <button
            type="button"
            onClick={() => setDrawingMode(null)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-400/20 bg-red-400/[0.06] py-2 text-[10px] font-semibold text-red-300/85"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        </div>

        {/* Indicator panes + overlays */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Indicators</p>
          <div className="grid grid-cols-4 gap-2">
            <ToolBtn icon={BarChart3} label="Vol" active={state.panes.includes("vol")} onClick={() => togglePane("vol")} />
            <ToolBtn icon={LineChartIcon} label="MA" active={state.active.ma} onClick={() => onChange(toggle(state, "ma"))} />
            <ToolBtn icon={Activity} label="MACD" active={state.panes.includes("macd")} onClick={() => togglePane("macd")} />
            <ToolBtn icon={Waves} label="BOL" active={state.active.bollinger} onClick={() => onChange(toggle(state, "bollinger"))} />
            <ToolBtn icon={BarChart2} label="RSI" active={state.panes.includes("rsi")} onClick={() => togglePane("rsi")} />
            <ToolBtn icon={Landmark} label="VWAP" active={state.active.vwap} onClick={() => onChange(toggle(state, "vwap"))} />
            <ToolBtn icon={CrosshairIcon} label="POC" active={state.active.poc} onClick={() => onChange(toggle(state, "poc"))} />
          </div>
        </div>

        {/* Pane order */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Pane order</p>
          {(["vol", "rsi"] as const).map((p) => (
            <div key={p} className="flex items-center justify-between py-1">
              <span className="text-[10px] uppercase" style={{ color: "rgba(255,255,255,0.5)" }}>{p}</span>
              <div className="flex gap-1">
                <button type="button" className="h-6 w-6 rounded border border-white/10 text-white/50" aria-label={`Move ${p} up`}>
                  <ChevronUp className="h-3.5 w-3.5 mx-auto" />
                </button>
                <button type="button" className="h-6 w-6 rounded border border-white/10 text-white/50" aria-label={`Move ${p} down`}>
                  <ChevronDown className="h-3.5 w-3.5 mx-auto" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Per-side count pickers */}
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <CountPicker label="OB · per side" value={state.orderBlockCount} onChange={(v) => onChange({ ...state, orderBlockCount: v })} />
          <CountPicker label="FVG · per side" value={state.fvgCount} onChange={(v) => onChange({ ...state, fvgCount: v })} />
          <CountPicker label="IFVG · per side" value={state.inverseFvgCount} onChange={(v) => onChange({ ...state, inverseFvgCount: v })} />
          <CountPicker label="Project · per side" value={state.projectionCount} onChange={(v) => onChange({ ...state, projectionCount: v })} />
        </div>

        {/* Fib source / extend */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Fib · Source</span>
            <div className="flex gap-1">
              {(["auto", "swing", "day"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFibSource(s)}
                  className="rounded px-2 py-1 text-[9px] font-semibold uppercase"
                  style={{
                    background: fibSourceLocal === s ? "rgba(34,211,238,0.18)" : "rgba(255,255,255,0.04)",
                    color: fibSourceLocal === s ? "#67e8f9" : "rgba(255,255,255,0.55)",
                    border: `1px solid ${fibSourceLocal === s ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Fib · Extend</span>
            <div className="flex gap-1">
              <button type="button" className="h-6 w-6 rounded border border-white/10 text-white/50" aria-label="Extend left">
                <ArrowLeft className="h-3.5 w-3.5 mx-auto" />
              </button>
              <button type="button" className="h-6 w-6 rounded border border-white/10 text-white/50" aria-label="Extend right">
                <ArrowRight className="h-3.5 w-3.5 mx-auto" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const DEFAULT_CHART_TOOLS_STATE: ChartToolsState = {
  active: {
    structure: true,
    orderBlocks: true,
    fvg: false,
    ifvg: false,
    pdh: false,
    pdl: false,
    pdq: false,
    sessionOpen: false,
    swingPoints: false,
    supplyDemand: false,
    ma: false,
    bollinger: false,
    vwap: false,
    poc: false,
  },
  drawingMode: null,
  orderBlockCount: 1,
  fvgCount: 1,
  inverseFvgCount: 1,
  projectionCount: 1,
  fibSource: "auto",
  panes: ["vol", "rsi"],
};
