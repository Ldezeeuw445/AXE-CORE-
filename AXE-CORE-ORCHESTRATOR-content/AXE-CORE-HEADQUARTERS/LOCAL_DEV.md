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
npm run plaat:dev           # AXE CORE Plaat -- ontwikkelen
npm run plaat:build         # AXE CORE Plaat -- bouwen  ← deze wil je bijna altijd
```

De rest, zodat je ze uit elkaar houdt:

| commando | config | productName |
|---|---|---|
| `tauri:dev` / `tauri:build` | `tauri.conf.json` | AXE CORE |
| `plaat:dev` / `plaat:build` | `tauri.coreplaat*.conf.json` | **AXE CORE Plaat** |
| `tauri:plaat` / `tauri:plaat:build` | `tauri.plaat.conf.json` | AXE **Lege** Plaat (demo) |
| `tauri:stage` | `tauri.stage.conf.json` | AXE CORE Stage |

Let op de val: `tauri:plaat` klinkt alsof het de Plaat bouwt, maar dat is de
Lege Plaat-demo. En `npm run tauri:build` bouwt de gewone AXE CORE, niet de
Plaat -- dat is precies waar een sessie op 7 september in trapte, waarna er een
app werd opgeleverd zonder het glas.

**Het verschil tussen AXE CORE en AXE CORE Plaat is klein maar bepalend.**
Zelfde code, zelfde `dist/public`, zelfde functies. Alleen:

- `transparent: true` -- het venster laat door
- `macOSPrivateApi: true` -- geeft Tauri toegang tot `NSVisualEffectView`

Samen maken die twee het glas waar het bureaublad doorheen vervaagt. Zonder ze
is het een zwart vlak. De aparte identifier (`com.axe.core.plaatapp`) zorgt dat
macOS ze als losse apps ziet, met eigen vensterposities.

Er bestond lang geen `plaat:build`; die is op 7 september toegevoegd, nadat de
app die iedereen gebruikt met de hand gebouwd moest worden.

`tauri:dev` loads the same `localhost:5000` dev server, so it has the exact same
parity + proxy as the web app.

`tauri:build` is different: it packages the **static** production build (no dev
server, no proxy, running from your Mac with no server behind it at all). Every
`/api/*` call in the app is routed through a small helper
(`src/infrastructure/config/apiUrl.ts`) that detects it's running inside a
packaged Tauri app and points those calls at the deployed Vercel host instead
of a relative path — so the installed Mac app has the same live data and keys
as the web app, with zero secrets bundled into it. Nothing to configure; it's
automatic based on where the app is running.

## 3. Ship to Vercel (once, when it's ready)

Production deploys from the `orchestrator` branch. Merge your work there and
Vercel builds it — a single build instead of one per experiment.
