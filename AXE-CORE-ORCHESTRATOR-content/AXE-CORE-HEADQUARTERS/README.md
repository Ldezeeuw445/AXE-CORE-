# AXE Command Center

A futuristic AI Operating System inspired by Iron Man JARVIS, built as a premium dark-themed dashboard.

## Features

- **3D Holographic AXE Core** — Realistic HUD-style animated ring system (Canvas 2D)
- **Cyan Triangle Logo** — AXE brand identity in the top navigation
- **Voice Integration** — Web Speech API + Kimi/Moonshot API for speech-to-text and AI responses
- **Composer-Style Chat Input** — iMessage-style input bar with voice record and send buttons
- **14 Modules** — AI Core, Agents, Tasks, Calendar, Memory, Trading, Finance, MCP, Infrastructure, Settings
- **Linear.app Matte Black UI** — Premium dark theme with subtle edge glows
- **Infrastructure Map** — D3.js force-directed graph with Supabase, Cloudflare, Vercel, Railway, Resend
- **Full Month Calendar** — Grid view with navigation

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v3 + shadcn/ui
- Three.js (3D components)
- D3.js (infrastructure map)
- Framer Motion (animations)
- Zustand (state management)

## Getting Started

```bash
npm install
npm run dev
```

## API Key Setup

1. Get your API key from [platform.moonshot.cn](https://platform.moonshot.cn)
2. Go to Settings → AI Configuration
3. Enter your key and click Save
4. Click "Test API Key" to verify

## Deployment

The app is deployed at: https://ak5ixgslpub4w.kimi.page

```bash
npm run build
# Deploy the dist/ folder
```

## License

MIT
