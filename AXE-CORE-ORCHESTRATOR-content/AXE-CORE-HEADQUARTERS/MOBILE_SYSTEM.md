# AXE Mobile System

The first executable Samsung surface lives at `/#/mobile`. It is part of the
existing React/PWA runtime so it uses the same Supabase session, settings,
Trading Desk state, CrewAI gateway and AXE Core API as the Tauri desktop app.

## Included now

- Trading desk summary with real Trading Desk state.
- AXE Algo status, explicit arm/stop confirmation, run-now and crew research.
- Trading crew calling the real `/crew/run` endpoint with AXE Core, Dollar Bill
  and Intel. AXE Companion is the conversation/approval layer.
- Mobile Code Studio entry to the existing responsive editor, Git panels,
  patch review and trusted Mac/VPS execution.
- Live infrastructure checks for Supabase, GitHub, CrewAI, AXE Core API,
  terminal and MetaAPI.
- AXON uses 3D Memory Terrain as the default lens on mobile and desktop.

## Samsung install

1. Deploy the branch to the same HTTPS origin used by desktop.
2. Open `https://<origin>/#/mobile` in Chrome on the Galaxy A17.
3. Choose **Install app** / **Add to Home screen**.
4. Sign in with the same AXE/Supabase account as Tauri.

This is a PWA foundation, not yet a native Android launcher or secure
lock-screen replacement. Android-native widgets, Quick Settings tiles,
notification access and biometric approval require a later Capacitor/native
shell. Never expose the localhost-only Mac bridge directly to the internet;
mobile execution must go through authenticated AXE TaskRuns on the VPS.
