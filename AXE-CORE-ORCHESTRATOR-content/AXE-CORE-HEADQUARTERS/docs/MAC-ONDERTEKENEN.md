# De app ondertekenen, zodat macOS niet elke build opnieuw vraagt

## Wat er nu gebeurt

Gemeten 16 september 2026 op de Mac mini:

```
$ codesign -dv "/Applications/AXE CORE.app"
Signature=adhoc, linker-signed
TeamIdentifier=not set
$ security find-identity -v -p codesigning
0 valid identities found
```

De app wordt **ad hoc** ondertekend: geen vaste identiteit, alleen een hash van
de binary. macOS hangt toestemmingen (TCC) aan die identiteit. Een nieuwe build
is dus letterlijk een andere app, en de vraag "AXE CORE wil toegang tot bestanden
op een verwijderbaar volume" komt opnieuw — elke keer.

Wie die vraag niet beantwoordt, krijgt 502 op alles wat de kluis nodig heeft
(`mcp_hub.py` leest `/Volumes/EagetSSD/AXE-VAULT/secrets.env`), en de NorthSea-
tabbladen staan leeg met precies die uitleg erin.

## De oplossing: één eigen certificaat

Een zelfondertekend certificaat voor code signing geeft élke build dezelfde
identiteit. Je keurt de vraag dan nog één keer goed, en daarna nooit meer.

### Stap 1 — het certificaat maken (eenmalig, handmatig)

Dit is een wijziging in je sleutelhanger; die maak je zelf, niet een agent.

1. Open **Sleutelhangertoegang** (Keychain Access).
2. Menu **Certificaatassistent → Maak een certificaat…**
3. Naam: `AXE Core Dev`
4. Identiteitstype: **Zelfondertekend basiscertificaat**
5. Certificaattype: **Codeondertekening**
6. Aanmaken, en klaar.

Controleren:

```bash
security find-identity -v -p codesigning     # moet 'AXE Core Dev' tonen
```

### Stap 2 — ermee bouwen

```bash
APPLE_SIGNING_IDENTITY="AXE Core Dev" npm run tauri:build
```

Tauri 2 leest die variabele en ondertekent het bundeltje ermee. Wil je hem
permanent: zet `bundle.macOS.signingIdentity` in `src-tauri/tauri.conf.json` op
dezelfde naam. Dat staat hier NIET standaard aan, want zonder certificaat faalt
elke build dan met een fout die niets met je wijziging te maken heeft.

### Stap 3 — één keer goedkeuren

De eerste ondertekende build vraagt nog één keer om de verwijderbare schijf.
Klik **Sta toe**. Elke volgende build heeft dezelfde identiteit en erft die
toestemming.

## Wat dit NIET oplost

- **De schijf moet nog steeds aanhangen.** Ligt de EagetSSD eruit, dan is er
  geen kluis om te lezen, hoe netjes de app ook ondertekend is.
- **De telefoon.** Dit gaat alleen over macOS-toestemmingen op deze Mac. Wat de
  telefoon van deze Mac nodig heeft, staat hieronder.

## Wat er via deze Mac loopt (en dus van de kluis afhangt)

`basisVoor()` in `axeCoreApiService.ts` stuurt deze paden naar de agent-host
(deze Mac): `/claude/`, `/preview/`, `/planner/`, `/mcp/hub`, `/northsea/`.
Al het andere gaat naar de VPS, die zijn eigen sleutels heeft.

Een telefoon die NorthSea-data, de MCP-hub of de planner wil, hangt dus aan
deze Mac: die moet aanstaan, met de schijf erin en de toestemming gegeven. De
rest (chat, marktdata, geheugen) komt van de VPS en werkt los van deze Mac.
