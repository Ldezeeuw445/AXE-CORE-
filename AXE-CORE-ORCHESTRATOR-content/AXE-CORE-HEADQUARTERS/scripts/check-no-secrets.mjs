/**
 * Weigert een webbundel die geheimen bevat.
 *
 * Op 2 sep 2026 is `dist/public` -- gebouwd op een Mac met de Tauri-.env
 * ernaast -- als website gepubliceerd. Alles met een VITE_-voorvoegsel wordt
 * letterlijk in de JavaScript gebakken, dus VITE_AXE_CORE_API_KEY (Supabase
 * service_role, GitHub write, /internal/exec) stond publiek leesbaar online.
 *
 * De code waarschuwde er al voor in apiUrl.ts: die sleutel hoort alleen in
 * een Tauri-build, nooit in een webbuild. Maar een waarschuwing in een
 * commentaarblok houdt niets tegen. Dit wel.
 *
 * Draait tegen de bestanden zelf, niet tegen de configuratie -- want de vraag
 * is niet wat er had moeten gebeuren maar wat er daadwerkelijk in de bundel
 * staat.
 *
 *   node scripts/check-no-secrets.mjs [map]     (standaard: dist/public)
 *
 * Sluit af met 1 als er iets gevonden is, zodat een deploy erop stukloopt.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist/public';

/**
 * De variabelen die nooit in een webbundel mogen staan.
 *
 * Bewust NIET in deze lijst:
 *   VITE_SUPABASE_ANON_KEY          hoort publiek te zijn, RLS beschermt de data
 *   VITE_AXE_BRIDGE_TOKEN           bridge luistert alleen op 127.0.0.1
 *   VITE_AXE_COMPANION_TOOLS_SECRET sidecar luistert alleen op 127.0.0.1
 *   VITE_GOOGLE_MAPS_API_KEY        hoort vastgezet op het domein
 *
 * Een lijst die alles verbiedt wordt genegeerd. Deze verbiedt wat schaadt.
 */
const FORBIDDEN = [
  'VITE_AXE_CORE_API_KEY',
  'VITE_ELEVENLABS_API_KEY',
  'VITE_FISH_AUDIO_API_KEY',
  'VITE_TAVILY_API_KEY',
  'VITE_ANTHROPIC_API_KEY',
  'VITE_OPENAI_API_KEY',
  'VITE_OPENROUTER_API_KEY',
  'VITE_GROQ_API_KEY',
  'VITE_GEMINI_API_KEY',
  'VITE_XAI_API_KEY',
  'VITE_SMARTTHINGS_TOKEN',
  'VITE_SMARTHINGS_PAT',
];

function envValues() {
  const out = new Map();
  for (const file of ['.env', '.env.local', '.env.production']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      // Korte waarden geven vals alarm: "1", "true", een poortnummer komen
      // overal in een bundel voor.
      if (FORBIDDEN.includes(m[1]) && value.length >= 16) out.set(m[1], value);
    }
  }
  return out;
}

function* files(root) {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|mjs|css|html|map)$/.test(name)) yield path;
  }
}

if (!existsSync(dir)) {
  console.error(`check-no-secrets: ${dir} bestaat niet — eerst bouwen`);
  process.exit(1);
}

const secrets = envValues();
if (secrets.size === 0) {
  console.log('check-no-secrets: geen gevoelige VITE_-variabelen in .env — niets te lekken');
  process.exit(0);
}

const found = [];
for (const path of files(dir)) {
  const text = readFileSync(path, 'utf8');
  for (const [name, value] of secrets) {
    if (text.includes(value)) found.push({ name, path });
  }
}

if (found.length === 0) {
  console.log(`check-no-secrets: ${dir} is schoon (${secrets.size} sleutels gecontroleerd)`);
  process.exit(0);
}

console.error('\ncheck-no-secrets: GEHEIMEN IN DE BUNDEL — niet publiceren\n');
for (const { name, path } of found) console.error(`  ${name}  in  ${path}`);
console.error(
  '\nEen webbuild hoort zonder deze variabelen gebouwd te worden. Laat Cloudflare\n' +
  'bouwen vanuit GitHub (daar staat geen .env), of bouw lokaal met een schone\n' +
  'omgeving. De VITE_-varianten horen alleen in een Tauri-build.\n',
);
process.exit(1);
