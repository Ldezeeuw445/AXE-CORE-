# AXE Overlay — install on Luka’s iMac

Run these on the **iMac** (macOS 12+). The Linux build box cannot emit a macOS app.

## 0) One-time prerequisites

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# reopen terminal, then:
rustup default stable
```

Node 20+ / npm must be available (`brew install node` if needed).

## 1) Get the code

```bash
cd ~/Projects   # of waar AXE-CORE staat
git fetch origin
git checkout orchestrator
git pull --ff-only origin orchestrator
cd apps/axe-overlay
```

## 2) Build .app + .dmg

```bash
npm run build:macos
```

Artifacts:

- `src-tauri/target/release/bundle/macos/AXE Overlay.app`
- `src-tauri/target/release/bundle/dmg/AXE Overlay_0.1.0_*.dmg`

## 3) Install to /Applications

```bash
npm run install:macos
```

## 4) API key (local only)

```bash
mkdir -p "$HOME/Library/Application Support/nl.axe.overlay"
cat > "$HOME/Library/Application Support/nl.axe.overlay/config.json" <<'JSON'
{
  "apiOrigin": "https://api.axecompanion.com",
  "apiKey": "PLAK_HIER_AXE_CORE_API_KEY"
}
JSON
```

Do **not** commit this file. Do not paste the key into chat.

## 5) Launch

```bash
open -a "AXE Overlay"
```

In the expanded chat: check **Start bij inloggen** for Login Items (LaunchAgent).

## All-in-one (after repo is on orchestrator)

```bash
cd /pad/naar/AXE-CORE/apps/axe-overlay && \
  npm run build:macos && \
  npm run install:macos && \
  open -a "AXE Overlay"
```

Then edit `~/Library/Application Support/nl.axe.overlay/config.json` and set `apiKey`.
