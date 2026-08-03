/**
 * AXE Chart Theme System
 */
export type ChartThemeKey = "midnight" | "charcoal" | "slate" | "paper";
export type ChartGridStyle = "solid" | "grid";

export interface ChartThemeConfig {
  key: ChartThemeKey;
  label: string;
  background: string;
  chartCanvasBackground: string;
  textColor: string;
  grid: string;
  crosshair: string;
  axisSeparator: string;
  borderColor: string;
  bull: string;
  bear: string;
  bullWick: string;
  bearWick: string;
  bullBorder: string;
  bearBorder: string;
  borderVisible: boolean;
  crosshairLabelBg: string;
  entryLine: string;
  stopLine: string;
  takeLine: string;
  pendingLine: string;
  alertLine: string;
  positiveText: string;
  negativeText: string;
  neutralText: string;
  cyanAccent: string;
  frameGlow: string;
  isDark: boolean;
}

const MIDNIGHT: ChartThemeConfig = {
  key: "midnight",
  label: "Midnight",
  background: "#000000",
  chartCanvasBackground: "#000000",
  textColor: "rgba(220,230,245,0.90)",
  grid: "rgba(255,255,255,0.03)",
  crosshair: "rgba(0,224,255,0.35)",
  axisSeparator: "rgba(255,255,255,0.08)",
  borderColor: "rgba(255,255,255,0.06)",
  bull: "#1F9C7B",
  bear: "#C95450",
  bullWick: "rgba(31,156,123,0.95)",
  bearWick: "rgba(201,84,80,0.95)",
  bullBorder: "#1F9C7B",
  bearBorder: "#C95450",
  borderVisible: false,
  crosshairLabelBg: "#0a0a0a",
  entryLine: "rgba(110,178,252,0.7)",
  stopLine: "rgba(201,84,80,0.7)",
  takeLine: "rgba(31,156,123,0.7)",
  pendingLine: "rgba(110,178,252,0.45)",
  alertLine: "rgba(244,191,99,0.6)",
  positiveText: "rgba(31,156,123,0.95)",
  negativeText: "rgba(201,84,80,0.95)",
  neutralText: "rgba(220,230,245,0.70)",
  cyanAccent: "rgba(0,224,255,0.85)",
  frameGlow: "none",
  isDark: true,
};

export const CHART_THEMES: Record<ChartThemeKey, ChartThemeConfig> = {
  midnight: MIDNIGHT,
  charcoal: { ...MIDNIGHT, key: "charcoal", label: "Charcoal", background: "#121212", chartCanvasBackground: "#121212" },
  slate: { ...MIDNIGHT, key: "slate", label: "Slate", background: "#131722", chartCanvasBackground: "#131722" },
  paper: {
    ...MIDNIGHT,
    key: "paper",
    label: "Paper",
    background: "#f5f5f5",
    chartCanvasBackground: "#ffffff",
    textColor: "rgba(20,20,20,0.85)",
    grid: "rgba(0,0,0,0.06)",
    isDark: false,
  },
};

export function getChartTheme(key?: string | null): ChartThemeConfig {
  if (key && key in CHART_THEMES) return CHART_THEMES[key as ChartThemeKey];
  return MIDNIGHT;
}

export const CHART_THEME = MIDNIGHT;
export const CHART_THEME_KEYS: ChartThemeKey[] = ["midnight", "paper"];
export const CHART_ORDER_BUY_COLOR = "#1A729E";
export const CHART_ORDER_SELL_COLOR = "#E13947";

export function readChartThemeKey(): ChartThemeKey {
  if (typeof window === "undefined") return "midnight";
  try {
    const stored = localStorage.getItem("axe.chart.theme");
    if (stored && stored in CHART_THEMES) return stored as ChartThemeKey;
  } catch { /* ignore */ }
  return "midnight";
}

export function writeChartThemeKey(key: ChartThemeKey): void {
  try { localStorage.setItem("axe.chart.theme", key); } catch { /* ignore */ }
}

export function readGridStyle(): ChartGridStyle {
  if (typeof window === "undefined") return "grid";
  try {
    const stored = localStorage.getItem("axe.chart.grid");
    if (stored === "solid" || stored === "grid") return stored;
  } catch { /* ignore */ }
  return "grid";
}

export function writeGridStyle(style: ChartGridStyle): void {
  try { localStorage.setItem("axe.chart.grid", style); } catch { /* ignore */ }
}
