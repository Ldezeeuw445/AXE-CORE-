/**
 * Wat er gebeurde terwijl Luka weg was -- uit echte agent-events op de server.
 *
 * AXE moet bij terugkomst kunnen zeggen "Developer is klaar met de iPad-build,
 * er wacht één akkoord" zonder dat te verzinnen. De VPS telt het na in
 * core_agent_events (GET /axe/since); hier wordt het opgehaald en bewaard voor
 * twee lezers: de begroeting (axeBootstrap) en AXE's systeemprompt
 * (installStableChat), zodat een korte vraag als "hoe gaat het?" er gewoon
 * op kan antwoorden.
 */
import { getAxeSince } from '@/infrastructure/gateways/axeCoreApiService';
import { terugkomstBlok, type SindsSamenvatting } from '@/domain/chat/hoofdgesprek';

const LS_LAATST_GEZIEN = 'axe_laatst_gezien';
const STANDAARD_TERUG_MS = 12 * 60 * 60_000;
const VERS_MS = 5 * 60_000;

let laatste: SindsSamenvatting | null = null;
let opgehaaldOp = 0;

/** Wanneer was Luka er voor het laatst (dit apparaat)? */
export function laatstGezien(nu = Date.now()): number {
  try {
    const v = Number(localStorage.getItem(LS_LAATST_GEZIEN));
    if (Number.isFinite(v) && v > 0 && v < nu) return v;
  } catch { /* geen opslag */ }
  return nu - STANDAARD_TERUG_MS;
}

/** Luka is er (bericht gestuurd, of het venster gaat dicht): de klok loopt vanaf nu. */
export function markeerGezien(nu = Date.now()): void {
  try { localStorage.setItem(LS_LAATST_GEZIEN, String(nu)); } catch { /* geen opslag */ }
}

/** Haal de samenvatting op (hoogstens eens per 5 minuten). Fout = null, nooit verzinnen. */
export async function haalTerugkomst(sindsMs = laatstGezien()): Promise<SindsSamenvatting | null> {
  if (laatste && Date.now() - opgehaaldOp < VERS_MS) return laatste;
  try {
    laatste = await getAxeSince(new Date(sindsMs).toISOString());
    opgehaaldOp = Date.now();
  } catch {
    laatste = null;
  }
  return laatste;
}

/** Het blok voor AXE's systeemprompt, of '' als er niets betekenisvols is. */
export function terugkomstContext(): string {
  return terugkomstBlok(laatste);
}
