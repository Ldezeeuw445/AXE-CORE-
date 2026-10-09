/**
 * De poort waarlangs een tool iets op Home zet, zonder te weten wat Home is.
 *
 * Application mag de UI niet importeren (architecture.test.ts), maar "zoek een restaurant en laat het op
 * Home zien" begint in een tool. De presentatielaag meldt hier bij het laden een ontvanger aan (zie
 * sphereProjectionStore); is er geen -- een test, een werker, een venster zonder Home -- dan zegt
 * `toonOpHome` dat eerlijk (false) en weet de tool dat er niets getoond is.
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

type Ontvanger = (p: ProjectionPayload) => void;
let ontvanger: Ontvanger | null = null;

export function setProjectionSink(o: Ontvanger | null): void {
  ontvanger = o;
}

/** True als Home het kreeg; false als er niemand luistert. */
export function toonOpHome(p: ProjectionPayload): boolean {
  if (!ontvanger) return false;
  ontvanger(p);
  return true;
}
