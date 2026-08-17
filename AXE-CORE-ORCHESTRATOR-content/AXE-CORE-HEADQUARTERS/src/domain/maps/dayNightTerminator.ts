/**
 * Day/night terminator — pure astronomical calculation from the real
 * current clock, zero network calls. Solar declination uses the standard
 * simplified formula (accurate to ~1°); subsolar longitude ignores the
 * equation of time (±16min) — both are the standard precision level for a
 * visual terminator overlay, not a claim of arc-second ephemeris accuracy.
 */

function solarDeclinationDeg(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86_400_000);
  return -23.44 * Math.cos((2 * Math.PI) / 365 * (dayOfYear + 10));
}

function subsolarLongitudeDeg(date: Date): number {
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = (12 - utcHours) * 15;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

/** Ring of [lon, lat] points tracing the terminator, closed over whichever
 *  pole is currently on the night side, ready to use as a GeoJSON Polygon
 *  covering the night hemisphere. */
export function nightHemisphereRing(date: Date = new Date(), stepDeg = 4): [number, number][] {
  const decDeg = solarDeclinationDeg(date);
  const subsolarLon = subsolarLongitudeDeg(date);
  const decRad = (decDeg * Math.PI) / 180;

  const curve: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += stepDeg) {
    const dLon = ((lon - subsolarLon) * Math.PI) / 180;
    const latRad = Math.atan2(-Math.cos(dLon), Math.tan(decRad));
    curve.push([lon, (latRad * 180) / Math.PI]);
  }

  // North pole altitude ≈ declination; south pole ≈ -declination. Close the
  // ring over whichever pole is in darkness so the polygon covers night, not day.
  const closingPoleLat = decDeg > 0 ? -90 : 90;
  return [
    [-180, closingPoleLat],
    ...curve,
    [180, closingPoleLat],
    [-180, closingPoleLat],
  ];
}
