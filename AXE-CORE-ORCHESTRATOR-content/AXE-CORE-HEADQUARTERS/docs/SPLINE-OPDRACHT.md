# Opdracht: het 3D-vak van AXE CORE in Spline (voor een nieuwe sessie)

Luka, 26 nov: het 3D-vak op Home moet *echt goed* worden -- realistisch, echte goede
beelden, en wat er staat moet 100% kloppen. Lees eerst `AGENTS.md`.

## Wat er al staat (orchestrator, d338504b)

- Het vak: `src/presentation/components/axe-core/sphere/SphereStage.tsx` (podium),
  stijl in `axePodium.css`. Matzwarte kaarten, dunne gloed, cyaan accent.
- Projectiesoort **`scene3d`** (`src/domain/sphere/scene3d.ts`,
  `projections/Scene3dProjection.tsx`): een gepubliceerde Spline-scène vult het
  toneel. Alleen `https://my.spline.design/<id>/` of
  `https://prod.spline.design/<id>/scene.splinecode`. AXE kondigt aan met
  `[PROJECT: {"mode":"scene3d","title":"...","url":"<spline-adres>"}]`.
- Grafieken zijn echte candlesticks; zonder echte data zet het vak niets neer.

## Spline-MCP

`spline` staat in Luka's user-config (`https://mcp.spline.design/mcp`). Check eerst
met `ToolSearch` (query "spline") dat de tools er zijn. Staat hij op "Needs
authentication": Luka logt in via de terminal (`claude`, dan `/mcp` -> spline ->
Authenticate). Niet zelf om wachtwoorden vragen.

## Wat te maken

1. **De AXE-core als 3D-scène** in Spline: de bol in het midden van het vak
   (vervangt de huidige canvas-bol als die er beter uitziet), op een donkere
   vloer met subtiel raster, zachte studiolichten, cyaan accent (#22D3EE) en
   ademende beweging in rust. Realistisch materiaal (glas/metaal), geen neon-
   vlakken. Publiceer, zet het adres in de code (één constante) en toon hem
   via `scene3d` als achtergrond van het podium in rust.
2. **Een paar vaste scènes** die AXE op verzoek kan tonen (elk gepubliceerd,
   adressen in een kleine tabel in `src/domain/sphere/scene3d.ts`):
   een wereldbol met de NorthSea-routes, de Macs + drie VPS'en als
   3D-opstelling, en een lege "studio" voor productbeelden.
3. AXE leren wanneer hij een scène toont: alleen als de vraag er echt om
   vraagt ("laat de core in 3D zien", "laat de opstelling zien"), anders niet.
   Nooit een scène of grafiek die niet bij de vraag hoort.

## Klaar is

- In de app gezien (preview, `preview_start` "axe-core", Home op >= 1360 px),
  met screenshot: de core-scène in rust, en elke vaste scène op verzoek.
- Tests groen (`npx vitest run`), typecheck schoon, gepusht naar orchestrator.
- BOUWLIJST bijgewerkt ([~] tot Luka het in de gebouwde app gezien heeft).
- Grenzen: niets kopen of een betaald Spline-plan afsluiten zonder Luka's ja.
