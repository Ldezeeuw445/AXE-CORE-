import { useEffect } from 'react';

/**
 * Zet `data-axe-dash` op <html> zolang een dashboardtab open is. De composer
 * en het dok lezen dat en worden compact (één rij), zodat het raster ~150px
 * meer hoogte krijgt (Luka, 25 nov). Eén attribuut, de rest is CSS in
 * axe-dashboard.css; weg zodra de tab sluit.
 */
export function useDashModus(tab: string, aan = true) {
  useEffect(() => {
    if (!aan) return;
    const wortel = document.documentElement;
    wortel.dataset.axeDash = tab;
    return () => {
      if (wortel.dataset.axeDash === tab) delete wortel.dataset.axeDash;
    };
  }, [tab, aan]);
}

