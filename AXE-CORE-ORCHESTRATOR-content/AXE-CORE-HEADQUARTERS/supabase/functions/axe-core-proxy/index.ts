import { behandel } from './handler.ts';

/** Luka's Supabase-gebruiker (auth.users); AXE CORE heeft geen andere gebruikers. */
const EIGENAAR = 'acff7a12-1111-481d-a7a9-cc07583b8069';

/**
 * De VPS-sleutel: de kopie in public.app_secrets (axe_core_api_key), anders de
 * secret AXE_CORE_API_KEY.
 *
 * Eerst stond alleen de secret hier. Op 28 sep bleek die een andere sleutel te
 * bevatten dan de VPS verwacht (32 tekens, 401 "Invalid API key"), terwijl de
 * kopie in app_secrets (44 tekens) wel werkte -- die gebruikt de Android-shell
 * ook. Twee kopieën die uit elkaar lopen is precies hoe dat gebeurt, dus deze
 * is de bron. app_secrets is alleen voor Luka leesbaar (RLS); hier leest de
 * service role hem, pas nadat de beller Luka blijkt. Vijf minuten bewaard.
 */
let bewaard: { waarde: string; tot: number } | null = null;

async function vpsSleutel(): Promise<string | undefined> {
  if (bewaard && bewaard.tot > Date.now()) return bewaard.waarde;
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const srk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  try {
    const r = await fetch(`${url}/rest/v1/app_secrets?name=eq.axe_core_api_key&select=value`, {
      headers: { apikey: srk, Authorization: `Bearer ${srk}` },
    });
    const waarde = r.ok ? String((await r.json())?.[0]?.value ?? '').trim() : '';
    if (waarde) {
      bewaard = { waarde, tot: Date.now() + 5 * 60_000 };
      return waarde;
    }
  } catch {
    // Database even niet bereikbaar: dan de secret.
  }
  return Deno.env.get('AXE_CORE_API_KEY')?.trim() || undefined;
}

Deno.serve((req) =>
  behandel(req, {
    sleutel: vpsSleutel,
    vps: (Deno.env.get('AXE_CORE_API_URL') ?? 'https://api.axecompanion.com').replace(/\/$/, ''),
    eigenaren: (Deno.env.get('AXE_CORE_EIGENAREN') ?? EIGENAAR).split(',').map((s) => s.trim()).filter(Boolean),
  }),
);
