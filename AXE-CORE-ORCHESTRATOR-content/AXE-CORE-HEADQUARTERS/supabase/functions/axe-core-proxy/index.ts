import { behandel } from './handler.ts';

/** Luka's Supabase-gebruiker (auth.users); AXE CORE heeft geen andere gebruikers. */
const EIGENAAR = 'acff7a12-1111-481d-a7a9-cc07583b8069';

Deno.serve((req) =>
  behandel(req, {
    sleutel: Deno.env.get('AXE_CORE_API_KEY'),
    vps: (Deno.env.get('AXE_CORE_API_URL') ?? 'https://api.axecompanion.com').replace(/\/$/, ''),
    eigenaren: (Deno.env.get('AXE_CORE_EIGENAREN') ?? EIGENAAR).split(',').map((s) => s.trim()).filter(Boolean),
  }),
);
