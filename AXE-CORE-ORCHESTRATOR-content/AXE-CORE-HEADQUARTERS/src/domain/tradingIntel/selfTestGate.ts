/**
 * Wanneer de zelftest weer aan de beurt is.
 *
 * ## Waarom dit een eigen regel is
 *
 * Het slot gaat dicht VOORDAT de sweep begint, en dat hoort ook zo: een zware
 * backtest-ronde die faalt mag niet meteen opnieuw beginnen.
 *
 * Maar een sweep die NIETS oplevert is iets anders dan een sweep die het
 * geprobeerd heeft. Gemeten 10 september 2026: de zelftest liep om 07:17,
 * stempelde zijn slot, en schreef geen enkele ledger-regel. Het ledger stond
 * daardoor sinds 8 september stil terwijl de instelling zei dat hij die ochtend
 * nog gedraaid had — en van buiten is dat niet te onderscheiden van "er viel
 * niets te leren".
 *
 * Twaalf uur stilte is dan geen bescherming maar een blinde vlek. Vandaar een
 * herkansing: snel genoeg om een tijdelijke storing te overleven, traag genoeg
 * om niet te hameren.
 */

/** Twaalf uur tussen twee volledige rondes. */
export const SELFTEST_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** En een uur als er niets uitkwam. */
export const SELFTEST_HERKANSING_MS = 60 * 60 * 1000;

/**
 * De stempel die na een ronde bewaard moet worden.
 *
 * Bij een geslaagde ronde is dat gewoon "nu". Bij een lege ronde een stempel
 * die zo ver in het verleden ligt dat het slot over `herkansingMs` opengaat --
 * zo blijft het slot één getal en hoeft er nergens anders iets van te weten.
 */
export function volgendeZelftestStempel(
  geschreven: number,
  nu = Date.now(),
  intervalMs = SELFTEST_INTERVAL_MS,
  herkansingMs = SELFTEST_HERKANSING_MS,
): string {
  if (geschreven > 0) return new Date(nu).toISOString();
  return new Date(nu - intervalMs + herkansingMs).toISOString();
}

/** Mag de zelftest nu draaien? */
export function magZelftestDraaien(
  laatste: string | null,
  nu = Date.now(),
  intervalMs = SELFTEST_INTERVAL_MS,
): boolean {
  if (!laatste) return true;
  const t = Date.parse(laatste);
  // Een onleesbare stempel mag de zelftest niet voor altijd stilzetten.
  if (!Number.isFinite(t)) return true;
  return nu - t >= intervalMs;
}
