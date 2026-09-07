/**
 * Het verschil tussen "stuk" en "niet aangesloten".
 *
 * Acht van de zestien gezondheidscontroles beginnen met een variant van
 * `if (!url || !key) return { ok: false }`. Dat leverde een rood bolletje op
 * voor diensten die nooit ingesteld zijn -- n8n, xai, groq, smartthings. Zeven
 * lampjes die altijd rood staan maken de andere drie waardeloos: je went eraan
 * en dan mis je de storing die er wél toe doet.
 *
 * Een dienst zonder adres of sleutel is niet offline. Er is geen meting
 * gedaan, en dat is een derde antwoord.
 */

/** De vier standen die een dienst kan hebben. Dit type woonde in
 *  application/, maar domain/ mag daar niet uit importeren -- en de regel die
 *  de stand bepaalt hoort in domain/. Dus staat het type hier, en leest
 *  application/ het van deze kant. */
export type ServiceStatus = 'online' | 'degraded' | 'offline' | 'unknown';

export interface Uitkomst {
  ok: boolean;
  /** Waar als de controle niet kón draaien: geen adres, geen sleutel. */
  nietIngesteld?: boolean;
}

export function statusVan(u: Uitkomst): ServiceStatus {
  if (u.nietIngesteld) return 'unknown';
  return u.ok ? 'online' : 'offline';
}

/** Wat een controle teruggeeft als ze niet kan draaien. Eén plek, zodat de
 *  acht controles niet ieder hun eigen variant verzinnen. */
export const NIET_INGESTELD = { ok: false, latency: 0, nietIngesteld: true } as const;

/**
 * Verdeelt een reeks gemeten diensten in drie hopen. Bewust hier en niet in de
 * weergave: dezelfde verdeling wordt op drie plekken getoond (de app, de
 * statuscheck, de meldingen) en die moeten het niet oneens kunnen zijn.
 */
export function verdeel<T extends { status: ServiceStatus }>(diensten: readonly T[]) {
  return {
    draaien: diensten.filter((d) => d.status === 'online'),
    stuk: diensten.filter((d) => d.status === 'offline' || d.status === 'degraded'),
    nietAangesloten: diensten.filter((d) => d.status === 'unknown'),
  };
}
