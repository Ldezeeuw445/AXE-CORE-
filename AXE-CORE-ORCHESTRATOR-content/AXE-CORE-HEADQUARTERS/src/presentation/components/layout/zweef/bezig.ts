/** Eén definitie van "AXE werkt", gedeeld door de vlag en de HUD-chip. */
export function isBezig(status: string): boolean {
  return status === 'processing';
}
