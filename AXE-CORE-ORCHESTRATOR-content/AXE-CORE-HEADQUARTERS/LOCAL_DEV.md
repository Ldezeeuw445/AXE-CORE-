# Running AXE CORE locally (= exactly like Vercel)

The goal: build and finish everything on `localhost` — as a desktop app if you
want — and push to Vercel **once**, so you're not racking up build/usage costs
while iterating.

## How parity works

`vite.config.ts` proxies **every `/api/*` request to the deployed Vercel host**
(`https://www.axeheadquarters.com`). So when you run locally, all the
serverless functions — the AXE API proxy, the AI proxy, ElevenLabs TTS, Exa
search, the in-app browser fetch — run on Vercel with the **same server-side
keys already configured there**. You don't copy those secrets to your machine,
and because you're only *invoking* the functions (not deploying), there are **no
build minutes** burned while you work.

The only things the browser needs directly are the public client keys in
`.env` (Supabase + Google Maps). LLM provider keys are entered in
**Settings → Keys** and live in the browser.

## 1. Web app on localhost

```bash
cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
cp .env.example .env        # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (+ Maps)
npm install
npm run dev                 # → http://localhost:5000
```

That's a full-parity AXE CORE: same data, same APIs, same behaviour as
production.

## 2. Desktop app (Tauri)

Needs the Rust toolchain once: <https://www.rust-lang.org/tools/install> (plus
each OS's webview build deps — see <https://v2.tauri.app/start/prerequisites/>).

```bash
npm run tauri:dev           # opens AXE CORE in its own native window (dev, hot-reload)
npm run tauri:build         # produces a distributable .app / .exe / .deb in src-tauri/target
```

### Welke van de vijf apps bouw je?

`src-tauri/` bevat vijf configuraties, en de namen liggen dicht bij elkaar. Dit
is de app die dagelijks gebruikt wordt:

```bash
npm run bijwerken           # binnenhalen, bouwen, opruimen, starten
npm run tauri:dev           # ontwikkelen
npm run tauri:build         # alleen bouwen
```

## Er is één app, en dat was hij niet altijd

Er stonden vijf tauri-configs en acht npm-scripts, die vier verschillende
`.app`-bundels in dezelfde map afleverden — twee daarvan allebei "AXE CORE"
genoemd, met alleen een ander icoon om ze uit elkaar te houden. In Spotlight
zag je dus twee keer dezelfde naam en wist je niet welke de echte was.

De reden dat die varianten ooit bestonden, staat hieronder omdat hij leerzaam
is: `tauri.coreplaat.conf.json` was de versie mét glas, toen `tauri.conf.json`
dat nog niet had. Op een gegeven moment kreeg de gewone config `transparent`,
`macOSPrivateApi` en `titleBarStyle: Overlay` er ook bij — en vanaf dat moment
bouwden de twee configs letterlijk dezelfde app, alleen onder een andere
bundle-id.

Nagemeten op 11 september 2026: de twee configs verschilden nog op precies twee
dingen, `identifier` en `targets`. Verder niets.

Deze tekst beschreef dat verschil ondertussen nog wél, inclusief een waarschuwing
"let op de val" dat `tauri:build` de app zonder glas zou opleveren. Dat klopte
niet meer, en een doc die een verschil beschrijft dat niet bestaat is erger dan
geen doc: hij laat je een probleem oplossen dat er niet is. Vandaar dat de
varianten weg zijn en dit stukje blijft staan — zodat niemand ze opnieuw
aanmaakt om een verschil te herstellen dat er al is.

Weg zijn: `tauri.coreplaat.conf.json`, `tauri.coreplaat.dev.conf.json`,
`tauri.plaat.conf.json`, `tauri.stage.conf.json` en de scripts `plaat:dev`,
`plaat:build`, `tauri:plaat`, `tauri:plaat:build`, `tauri:stage`.

De ontwerpingangen zelf blijven: `stage.html` en `demo/plaat/index.html` draaien
gewoon in een browser via `vite.stage.config.ts`. Alleen het inpakken tot een
losse Mac-app is eruit — dát was wat er bundels bij maakte.

## 3. Ship to Vercel (once, when it's ready)

Production deploys from the `orchestrator` branch. Merge your work there and
Vercel builds it — a single build instead of one per experiment.
