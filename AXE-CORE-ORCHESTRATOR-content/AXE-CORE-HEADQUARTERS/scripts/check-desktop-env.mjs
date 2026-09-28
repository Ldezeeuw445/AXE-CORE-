/**
 * Weigert een desktopbuild zonder de instellingen die AXE CORE zonder kan
 * niet functioneren.
 *
 * Gevonden 20 sep 2026: een verse git-worktree had geen .env (terecht niet
 * git-tracked, dus `git worktree add` kopieert hem nooit mee), Vite bakte dus
 * lege VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY in, en de app draaide
 * uren zonder Supabase-verbinding met alleen "Saved on this device only" als
 * signaal -- pas zichtbaar toen iemand er expliciet naar ging zoeken. Dit
 * bestand bestaat zodat een volgende ontbrekende .env een build laat FALEN,
 * niet een stil kapotte app oplevert.
 *
 * Print NOOIT een waarde, alleen namen -- ook niet in een foutmelding.
 *
 * AXE CORE/Companion en NorthSea staan hier bewust los: NorthSea's eigen
 * Supabase-project (kbimnuepbecbyezedvih) en zijn sleutels leven in
 * backend/northsea_mcp's eigen .env op de VPS, nooit in de frontend van
 * AXE CORE. Deze lijst controleert alleen wat DEZE build nodig heeft.
 *
 *   node scripts/check-desktop-env.mjs
 *
 * Sluit af met 1 als een VERPLICHTE variabele ontbreekt of leeg is.
 */
import { readFileSync, existsSync } from 'node:fs';

/**
 * Zonder deze is de app niet stuk in de zin van "start niet" -- hij start
 * prima en toont overal "Supabase is not configured in this build" of faalt
 * stil op elke backend-aanroep. Precies dat stille, halve-kapot-zijn is
 * waarom ze hier verplicht zijn: een build die er zonder start, start met
 * een ontbrekende poot die niemand meldt totdat iets concreets breekt.
 */
const VERPLICHT = [
  { naam: 'VITE_SUPABASE_URL', reden: 'AXE Companion Supabase-project (auth, user_settings, memory, alle Supabase-data)' },
  { naam: 'VITE_SUPABASE_ANON_KEY', reden: 'zelfde project -- de publieke anon-sleutel, hoort in een frontend-bundel' },
  { naam: 'VITE_AXE_CORE_API_KEY', reden: 'auth voor de axe_api-backend (lokale agent + VPS-proxy); zonder deze faalt elke backend-aanroep' },
];

/** Ontbreken mag; het schakelt precies één losse functie uit, niet de app. */
const OPTIONEEL = [
  { naam: 'VITE_FISH_AUDIO_API_KEY', reden: 'Fish Audio-stem (optioneel pad; cedar via OpenAI is de standaardstem)' },
  { naam: 'VITE_ELEVENLABS_API_KEY', reden: 'ElevenLabs-stem (optioneel pad, alleen als expliciet gekozen in Settings)' },
  { naam: 'VITE_TAVILY_API_KEY', reden: 'eerste stap van de zoekketen (Tavily → Zenserp → Perplexity); zonder deze valt hij door' },
  { naam: 'VITE_GOOGLE_MAPS_API_KEY', reden: 'Google Maps-laag op de Live Map' },
  { naam: 'VITE_GOOGLE_MAPS_MAP_ID', reden: 'zelfde kaart, het stijl-ID' },
  { naam: 'VITE_AXE_BRIDGE_TOKEN', reden: 'lokale bridge-service (127.0.0.1) voor telefoon-koppeling' },
  { naam: 'VITE_AXE_COMPANION_TOOLS_SECRET', reden: 'lokale Companion-sidecar (127.0.0.1)' },
];

function leesEnv() {
  const waarden = new Map();
  // Zelfde volgorde als Vite: latere bestanden overschrijven eerdere.
  for (const bestand of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    if (!existsSync(bestand)) continue;
    for (const regel of readFileSync(bestand, 'utf8').split('\n')) {
      const m = regel.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const waarde = m[2].trim().replace(/^["']|["']$/g, '');
      waarden.set(m[1], waarde);
    }
  }
  return waarden;
}

const env = leesEnv();
const ontbrekendVerplicht = VERPLICHT.filter(v => !(env.get(v.naam) ?? '').trim());
const ontbrekendOptioneel = OPTIONEEL.filter(v => !(env.get(v.naam) ?? '').trim());

if (ontbrekendOptioneel.length > 0) {
  console.warn('\ncheck-desktop-env: optionele instellingen ontbreken (build gaat door):');
  for (const { naam, reden } of ontbrekendOptioneel) console.warn(`  - ${naam}  (${reden})`);
}

if (ontbrekendVerplicht.length === 0) {
  console.log('check-desktop-env: alle verplichte instellingen aanwezig — build gaat door');
  process.exit(0);
}

console.error('\ncheck-desktop-env: VERPLICHTE instellingen ontbreken of zijn leeg — build geweigerd\n');
for (const { naam, reden } of ontbrekendVerplicht) console.error(`  - ${naam}  (${reden})`);
console.error(
  '\nDit is meestal een .env die niet meegekomen is naar deze checkout/worktree\n' +
  '(.env is terecht niet git-tracked, dus git worktree add kopieert hem nooit).\n' +
  'Kopieer het bestaande, werkende .env hierheen en bouw opnieuw. Waarden staan\n' +
  'nooit in deze foutmelding.\n',
);
process.exit(1);
