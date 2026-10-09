/**
 * Waar is Luka? Voor "de dichtstbijzijnde ..." moet AXE dat weten, en eerlijk zeggen hoe hij het weet.
 *
 * 1. De locatie van het toestel (navigator.geolocation): nauwkeurig, maar alleen met toestemming.
 * 2. Het IP-adres: een stad, geen straat. Genoeg voor "in de buurt", niet voor "om de hoek".
 * 3. Amsterdam: Luka's stad, als beide niets geven. De bron staat erbij, zodat AXE kan zeggen "ik ga uit
 *    van Amsterdam" in plaats van te doen alsof hij het weet.
 */
export interface Locatie { lat: number; lng: number; bron: 'toestel' | 'ip' | 'standaard'; naam?: string }

const STANDAARD: Locatie = { lat: 52.3676, lng: 4.9041, bron: 'standaard', naam: 'Amsterdam' };

function vanToestel(timeoutMs: number): Promise<Locatie | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    const klaar = window.setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      p => { window.clearTimeout(klaar); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, bron: 'toestel' }); },
      () => { window.clearTimeout(klaar); resolve(null); },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60_000 },
    );
  });
}

async function vanIp(): Promise<Locatie | null> {
  try {
    const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = await res.json() as { success?: boolean; latitude?: number; longitude?: number; city?: string };
    if (j.success === false || typeof j.latitude !== 'number' || typeof j.longitude !== 'number') return null;
    return { lat: j.latitude, lng: j.longitude, bron: 'ip', naam: j.city };
  } catch { return null; }
}

let onthouden: { t: number; l: Locatie } | null = null;

export async function huidigeLocatie(): Promise<Locatie> {
  if (onthouden && Date.now() - onthouden.t < 5 * 60_000) return onthouden.l;
  const l = (await vanToestel(4000)) ?? (await vanIp()) ?? STANDAARD;
  onthouden = { t: Date.now(), l };
  return l;
}
