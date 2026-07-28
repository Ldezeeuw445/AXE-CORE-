# SmartThings in Settings

## What “token field in Settings” means

A normal input box under **Settings → Provider Keys**, same style as Gemini / Exa:

1. Open **Settings**
2. Find **SmartThings** (🏠) in the provider grid
3. Paste your Personal Access Token from https://account.smartthings.com/tokens
4. Click **Test** — should show how many devices were found

The token is stored in `axe_llm_connections.smartthings.key` (and/or `axe_smartthings_token`).

## Wire into SettingsPage (if not already)

In `PROVIDER_KEY_CATALOGUE` add:

```ts
{ id: 'smartthings', name: 'SmartThings', emoji: '🏠', accent: '#00D2FF', placeholder: 'xxxxxxxx-xxxx-…', defaultModel: '', docsUrl: 'https://account.smartthings.com/tokens', free: true, needsKey: true },
```

In `testProvider`, before the LLM test, add an Exa-style branch:

```ts
if (id === 'smartthings') {
  const { testSmartThingsToken } = await import('@/infrastructure/gateways/smartThingsService');
  const { ok, error, count } = await testSmartThingsToken(conn.key ?? '');
  // set testing UI ok/fail like Exa
  …
  return;
}
```

Also add `{ id: 'smart_home', label: 'Smart home (SmartThings)' }` to `TRUST_CATEGORIES`.
