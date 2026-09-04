/**
 * De dev-proxy, één keer.
 *
 * Deze tabel stond in vite.config.ts en is eruit gehaald toen er een tweede
 * entry bij kwam (stage.html). Kopiëren zou een tweede bron van waarheid maken:
 * een nieuwe upstream of een gewijzigde poort zou dan in het ene venster wél en
 * in het andere niet werken, en dat merk je pas als iets stil 404't — precies
 * hoe de stage-entry begon.
 *
 * Het laden van .env hoort hier ook thuis. Alles wat `process.env` leest is
 * server-side config (bearer tokens, poorten, upstreams); zonder deze regels
 * zijn die alleen gezet als iemand ze toevallig in zijn shell had staan. De
 * lege prefix laadt élke variabele, niet alleen VITE_. Echte shell-variabelen
 * winnen van .env, zodat CI en eenmalige overrides blijven werken.
 */
import { loadEnv, type ProxyOptions } from 'vite';

const envMode =
  process.env.NODE_ENV || (process.argv.includes('build') ? 'production' : 'development');
for (const [k, v] of Object.entries(loadEnv(envMode, process.cwd(), ''))) {
  if (process.env[k] === undefined) process.env[k] = v;
}

/** Wordt bij elke aanroep opnieuw opgebouwd, zodat late .env-waarden meetellen. */
export function devProxy(): Record<string, ProxyOptions> {
  return {
    '/proxy/anthropic': {
      target: 'https://api.anthropic.com',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/proxy\/anthropic/, ''),
    },
    '/proxy/openai': {
      target: 'https://api.openai.com',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/proxy\/openai/, ''),
    },
    '/proxy/google': {
      target: 'https://generativelanguage.googleapis.com',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/proxy\/google/, ''),
    },
    '/proxy/xai': {
      target: 'https://api.x.ai',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/proxy\/xai/, ''),
    },
    '/proxy/groq': {
      target: 'https://api.groq.com',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/proxy\/groq/, ''),
    },
    '/proxy/openrouter': {
      target: 'https://openrouter.ai',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/proxy\/openrouter/, ''),
    },
    '/proxy/krater': {
      target: 'https://api.krater.ai',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/proxy\/krater/, ''),
    },
    '/proxy/ollama': {
      target: process.env.OLLAMA_PROXY_TARGET || 'https://ollama.axecompanion.com',
      changeOrigin: true,
      secure: false,
      rewrite: (p) => p.replace(/^\/proxy\/ollama/, ''),
    },
    '/proxy/n8n': {
      target: process.env.N8N_PROXY_TARGET || 'http://212.227.91.79:5678',
      changeOrigin: true,
      secure: false,
      rewrite: (p) => p.replace(/^\/proxy\/n8n/, ''),
    },
    '/proxy/openhands': {
      // 3000, not 3001. Measured on the box 2-9-2026: openhands runs as a
      // Docker container publishing 3000, and nothing has ever listened on
      // 3001. The self-heal report called it "reachable" anyway, which is
      // how a wrong port survived — the check was not checking this.
      target: process.env.OPENHANDS_PROXY_TARGET || 'http://212.227.91.79:3000',
      changeOrigin: true,
      secure: false,
      rewrite: (p) => p.replace(/^\/proxy\/openhands/, ''),
    },
    '/proxy/openjarvis': {
      // NOT RUNNING as of 2-9-2026: nothing listens on 2025 and there is no
      // openjarvis service or container on the box. Left pointing here so the day it
      // is started again this works, but do not read a failure as a bug in the app.
      target: process.env.OPENJARVIS_PROXY_TARGET || 'http://212.227.91.79:2025',
      changeOrigin: true,
      secure: false,
      rewrite: (p) => p.replace(/^\/proxy\/openjarvis/, ''),
    },
    '/proxy/openclaw': {
      // NOT RUNNING as of 2-9-2026: nothing listens on 5001 and there is no
      // openclaw service or container on the box. Left pointing here so the day it
      // is started again this works, but do not read a failure as a bug in the app.
      target: process.env.OPENCLAW_PROXY_TARGET || 'http://212.227.91.79:5001',
      changeOrigin: true,
      secure: false,
      rewrite: (p) => p.replace(/^\/proxy\/openclaw/, ''),
    },
    '/proxy/kilocode': {
      // NOT RUNNING as of 2-9-2026: nothing listens on 5002 and there is no
      // kilocode service or container on the box. Left pointing here so the day it
      // is started again this works, but do not read a failure as a bug in the app.
      target: process.env.KILOCODE_PROXY_TARGET || 'http://212.227.91.79:5002',
      changeOrigin: true,
      secure: false,
      rewrite: (p) => p.replace(/^\/proxy\/kilocode/, ''),
    },
    '/proxy/crewai': {
      // NOT RUNNING as of 2-9-2026: nothing listens on 5003 and there is no
      // crewai service or container on the box. Left pointing here so the day it
      // is started again this works, but do not read a failure as a bug in the app.
      target: process.env.CREWAI_PROXY_TARGET || 'http://212.227.91.79:5003',
      changeOrigin: true,
      secure: false,
      rewrite: (p) => p.replace(/^\/proxy\/crewai/, ''),
    },
    '/proxy/hermes': {
      target: process.env.HERMES_PROXY_TARGET || 'http://212.227.91.79:3010',
      changeOrigin: true,
      secure: false,
      rewrite: (p) => p.replace(/^\/proxy\/hermes/, ''),
    },
    // LOCAL = VERCEL PARITY: every `/api/*` serverless function (proxy/axecore,
    // ai, tts, exa, browse) is proxied to the deployed Vercel host, so running
    // locally (npm run dev / Tauri) behaves EXACTLY like production and uses
    // the same server-side keys already configured on Vercel — no local
    // secrets, and it only INVOKES the functions, so you're not redeploying
    // (no build minutes) while you finish everything on localhost. Override
    // the target with LOCAL_API_TARGET if your prod domain differs.
    '/api': {
      target: process.env.LOCAL_API_TARGET || 'https://www.axeheadquarters.com',
      changeOrigin: true,
      secure: true,
    },
    // Airtop, same shape as /proxy/axecore below: dev talks to Airtop
    // directly with the key attached here, prod goes through
    // api/proxy/airtop.ts. Without this, local dev would only work after a
    // Vercel deploy, because '/api' above points at the deployed host.
    '/proxy/airtop': {
      target: 'https://api.airtop.ai',
      changeOrigin: true,
      secure: true,
      rewrite: (p) => p.replace(/^\/proxy\/airtop/, '/api/v1'),
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          const key = process.env.AIRTOP_API_KEY;
          if (key) proxyReq.setHeader('Authorization', `Bearer ${key}`);
        });
      },
    },
    '/proxy/axecore': {
      target: process.env.AXE_CORE_API_PROXY_TARGET || process.env.AXE_CORE_API_URL || 'https://api.axecompanion.com',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/proxy\/axecore/, ''),
      // Attach the bearer key server-side (from a plain, non-VITE_ .env var)
      // so the browser never needs it — matches the prod Vercel proxy at
      // api/proxy/axecore.ts (via a vercel.json rewrite), which does the same thing.
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          const key = process.env.AXE_CORE_API_KEY;
          if (key) proxyReq.setHeader('Authorization', `Bearer ${key}`);
        });
      },
    },
    '/api/browse': {
      target: 'http://localhost:8080',
      changeOrigin: false,
    },
    '/api/files': {
      target: 'http://localhost:8080',
      changeOrigin: false,
    },
  };
}
