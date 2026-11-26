/**
 * Geld achter een PIN (Life OS, 26 nov): de Finance-tab vraagt een PIN voordat
 * hij bedragen laat zien. Een privacyscherm tegen meekijken, geen bankslot:
 * de PIN staat alleen als PBKDF2-hash op dit apparaat. Na ontgrendelen blijft
 * het 10 minuten open in dit venster.
 */

export const MIN_CIJFERS = 4;
export const MAX_CIJFERS = 8;
export const OPEN_MS = 10 * 60_000;
const ITERATIES = 120_000;

export interface PinRecord {
  zout: string;
  hash: string;
  iteraties: number;
}

export function geldigePin(pin: string): boolean {
  return new RegExp(`^\\d{${MIN_CIJFERS},${MAX_CIJFERS}}$`).test(pin);
}

function hex(b: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function afleiden(pin: string, zout: string, iteraties: number): Promise<string> {
  const sleutel = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(zout), iterations: iteraties, hash: 'SHA-256' },
    sleutel, 256,
  );
  return hex(bits);
}

export async function maakPinRecord(pin: string, iteraties = ITERATIES): Promise<PinRecord> {
  if (!geldigePin(pin)) throw new Error(`PIN is ${MIN_CIJFERS} to ${MAX_CIJFERS} digits`);
  const zout = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { zout, hash: await afleiden(pin, zout, iteraties), iteraties };
}

export async function pinKlopt(pin: string, r: PinRecord): Promise<boolean> {
  if (!geldigePin(pin)) return false;
  return (await afleiden(pin, r.zout, r.iteraties)) === r.hash;
}

export function leesPinRecord(ruw: string | null): PinRecord | null {
  if (!ruw) return null;
  try {
    const o = JSON.parse(ruw) as Partial<PinRecord>;
    return typeof o.zout === 'string' && typeof o.hash === 'string' && typeof o.iteraties === 'number'
      ? { zout: o.zout, hash: o.hash, iteraties: o.iteraties }
      : null;
  } catch {
    return null;
  }
}

export function nogOpen(openTot: number | null, nu: number): boolean {
  return !!openTot && nu < openTot;
}
