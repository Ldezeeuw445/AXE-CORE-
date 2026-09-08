# AXE CORE — macOS Code Signing & Notarization

Gatekeeper blocks unsigned apps from the internet. To distribute a double-clickable
`.dmg` / `.app` you need:

1. **Developer ID Application** certificate (sign the binary)
2. **Notarization** (Apple scans the app; removes the quarantine warning)

CI already supports this. Without secrets, builds stay **unsigned** (fine for you
on the same Mac that built them).

Official reference: https://v2.tauri.app/distribute/sign/macos/

---

## 0. Prerequisites (one-time, paid)

- [Apple Developer Program](https://developer.apple.com/programs/) membership (~$99/year)
- A Mac with Xcode Command Line Tools (`xcode-select --install`)

---

## 1. Create a Developer ID Application certificate

1. Open **Xcode → Settings → Accounts** → select your team → **Manage Certificates**
2. **+** → **Developer ID Application**
3. Or create via [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates/list)
   - Type: **Developer ID Application**
   - CSR from Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority

Verify on your Mac:

```bash
security find-identity -v -p codesigning
# look for: Developer ID Application: Your Name (TEAMID)
```

Copy that full string — it becomes `APPLE_SIGNING_IDENTITY`.

---

## 2. Export certificate as `.p12` + base64 (for GitHub)

1. **Keychain Access** → **My Certificates**
2. Expand your **Developer ID Application** cert → select cert + private key
3. Right-click → **Export** → format **.p12** → set a strong password
4. Encode:

```bash
base64 -i ~/Desktop/Certificates.p12 | pbcopy
# paste into GitHub secret APPLE_CERTIFICATE (one long line, no newlines ideally)
```

---

## 3. App-specific password (notarization via Apple ID)

1. https://account.apple.com → Sign-In and Security → **App-Specific Passwords**
2. Generate one named `AXE-CORE-CI`
3. Save it — this is `APPLE_PASSWORD` (not your normal Apple ID password)

**Team ID:** https://developer.apple.com/account → Membership details → Team ID  
(10 characters, e.g. `AB12CD34EF`) → `APPLE_TEAM_ID`

### Alternative (recommended): App Store Connect API key

1. [App Store Connect → Users and Access → Integrations → Team Keys](https://appstoreconnect.apple.com/access/integrations/api)
2. Create key with **Developer** access
3. Download `.p8` **once**
4. Secrets:
   - `APPLE_API_ISSUER` = Issuer ID (UUID at top of keys page)
   - `APPLE_API_KEY` = Key ID (e.g. `A1B2C3D4E5`)
   - Put the `.p8` contents in a secret and point `APPLE_API_KEY_PATH` at a path  
     *or* store the file content and write it in CI (advanced)

If API key secrets are set, you can omit `APPLE_ID` / `APPLE_PASSWORD`.

---

## 4. GitHub Secrets to add

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Required | What it is |
|--------|----------|------------|
| `APPLE_CERTIFICATE` | for signing | base64 of the `.p12` file |
| `APPLE_CERTIFICATE_PASSWORD` | for signing | password used when exporting `.p12` |
| `APPLE_SIGNING_IDENTITY` | for signing | e.g. `Developer ID Application: Luka De Zeeuw (TEAMID)` |
| `APPLE_ID` | notarize (Apple ID path) | your Apple ID email |
| `APPLE_PASSWORD` | notarize (Apple ID path) | **app-specific** password |
| `APPLE_TEAM_ID` | notarize | 10-char Team ID |
| `KEYCHAIN_PASSWORD` | optional | random password for CI keychain |
| `APPLE_API_ISSUER` | optional alt | App Store Connect Issuer ID |
| `APPLE_API_KEY` | optional alt | App Store Connect Key ID |

After secrets are saved, re-run **Actions → Tauri Build (macOS)**.

---

## 5. Local signed build (same Mac that has the cert)

```bash
cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS

export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # app-specific
export APPLE_TEAM_ID="TEAMIDHERE"

npm run tauri:build
```

Tauri signs with Hardened Runtime using `src-tauri/entitlements.plist`, then
notarizes when Apple credentials are present.

`signingIdentity` in `tauri.conf.json` is left `null` so CI/local env vars win.
You can hardcode it if you prefer.

---

## 6. Verify a signed build

```bash
codesign -dv --verbose=4 "/path/to/AXE CORE.app"
spctl -a -vv "/path/to/AXE CORE.app"
# expected: accepted / source=Notarized Developer ID
```

---

## Cost / reality check

| Item | Notes |
|------|--------|
| Apple Developer | ~$99/year |
| Signing without membership | Not possible for distribution |
| Unsigned on *your* Mac | Works if you built it there or right-click → Open |
| CI minutes | macOS runners eat the free quota faster |

If you only run AXE on your own machine, **unsigned is enough**. Signing is for
sharing installers or avoiding Gatekeeper friction after downloads.
