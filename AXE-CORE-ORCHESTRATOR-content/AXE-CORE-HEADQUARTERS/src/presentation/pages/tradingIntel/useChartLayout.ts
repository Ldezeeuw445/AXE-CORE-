/** Hoeveel grafieken de Chart-tab toont; per apparaat onthouden (alleen gemak). */
import { useState } from 'react';

export type ChartLayout = 1 | 2 | 4;
const KEY = 'axe_chart_grid_layout';

function readLayout(): ChartLayout {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v === 2 || v === 4 ? v : 1;
  } catch {
    return 1;
  }
}

export function useChartLayout(): [ChartLayout, (l: ChartLayout) => void] {
  const [layout, setLayout] = useState<ChartLayout>(readLayout);
  const set = (l: ChartLayout) => {
    setLayout(l);
    try { localStorage.setItem(KEY, String(l)); } catch { /* alleen gemak */ }
  };
  return [layout, set];
}
