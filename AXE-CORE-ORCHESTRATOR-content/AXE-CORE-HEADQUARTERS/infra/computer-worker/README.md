# axe-computer-worker

AXE's hands op deze Mac. Niet op de VPS — hier, naast de vault en de SSH-sleutel,
met jouw rechten. Daarom is de allowlist geen gemak maar de grens zelf.

## Starten

```bash
node infra/computer-worker/worker.mjs
```

Hij leest `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` uit je omgeving — dezelfde
twee die de app gebruikt. Geen service-sleutel, geen open poort, niets op het LAN.

```
AXE Core  →  core_tasks(capability='computer_use', target_device='<deze mac>')
worker    ←  claimt de rij, voert uit, schrijft het resultaat terug
AXE Core  ←  leest status='completed'
```

## Werkmappen

Standaard zoekt hij naar de bekende checkouts en slaat over wat er niet is.
Afwijkend pad? Zet de bijbehorende variabele:

| werkmap | variabele |
|---|---|
| AXE Core | `AXE_WS_AXE_CORE` |
| AXE Companion | `AXE_WS_AXE_COMPANION` |
| Trading OS | `AXE_WS_TRADING_OS` |

Wat er niet op deze machine staat, verschijnt bij het opstarten als
`– <naam>: not on this machine`. Dat is informatie, geen fout: een taak voor een
werkmap die hier niet bestaat wordt niet geclaimd.

## Waarom een taak aan één machine is geadresseerd

Draaien er twee workers (Mac Mini én iMac), dan racen ze om elke rij en wint wie
het laatst peilde. "AXE Core" is op elke machine een andere checkout op een
andere tak, dus de verkeerde winnaar geeft een zelfverzekerd **fout** antwoord in
plaats van een fout. `target_device` voorkomt dat: een taak voor elders wordt
niet eens geclaimd.

## De risicoladder

Vier sporten, in `src/domain/tools/riskTiers.ts`. Het model kiest ze nooit — de
tool-id bepaalt de sport aan onze kant, ná het parsen. Een webpagina die AXE
overhaalt om `git.push` als "observe" te bestempelen krijgt gewoon een
push-goedkeuringskaart.

| sport | gedrag |
|---|---|
| observe | draait meteen, verandert niets |
| safe_execute | automatisch per werkmap, als jij dat hebt onthouden |
| write | plan tonen, dan goedkeuren |
| consequential | altijd vragen, nooit te onthouden |

`terminal.free` (een willekeurig commando) staat op consequential, en dat is
precies waarom die ladder bestaat.

## Stoppen

Ctrl-C. Een taak die op dat moment loopt verliest zijn lease en wordt opnieuw
aangeboden — niet half uitgevoerd achtergelaten.
