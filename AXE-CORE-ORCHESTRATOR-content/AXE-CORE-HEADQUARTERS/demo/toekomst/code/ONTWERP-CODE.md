# ONTWERP — de code-tab als studio

Luka: *Cursor, Replit, FlutterFlow en Figma in één, met een preview-stand,
en meteen mocks voor telefoon en tablet als je die ene pagina als demo wilt.*

Dit is de spec bij de maquettes. Open `../code.html` (de studio) en
`preview.html` (de pagina op drie toestellen). `CodeEditorPage.tsx` volgt
deze indeling: drie standen, terminal onder de editor, motoren in de balk,
vragen via de AXE-composer.

---

## Wat het is

Eén tab, drie **standen**. Geen vier producten naast elkaar.

| Stand | Wat hij leent | Wat je ziet |
|---|---|---|
| **Code** | Cursor + Replit | bestanden, editor, inline-diff, terminal, live toestel |
| **Canvas** | Figma + FlutterFlow | lagenboom, artboard, inspecteur; sleep is een diff |
| **Preview** | Replit preview + Figma device frames | dezelfde route op telefoon, tablet en desktop |

Wisselen is één segment in de werkbalk. **Terminal** zit onderin het middelste
vak (de editor; op Canvas het artboard; op Preview het device-vak) — Cursor:
files en preview blijven hun hoogte, de shell klapt onder de bron in en uit.
**Term** in de balk, of **Fold** op de kop, of de smalle balk als hij dicht is.
Run opent hem. `/terminals` blijft de tab voor machines.

**Code-agent** krijgt geen hoek naast de composer. Vragen gaat via de ene
AXE-composer (`Ask anything…` / Ask agent · ⌘K). Welke motor (Native / Hands /
Claude) kies je in de editorbalk — dat is wat Luka in `CodeEditorPage` afmaakt.
De stappen staan als één regel in de editor-tabs; de diff blijft Accept/Reject.

De hoeken naast de composer blijven van Home (camera-pads). Geen tweede
composer, geen `PlaatSlot` links/rechts voor deze tab.

Open `../code.html?look=glass`. Dat is de werkende demo-tab, op de echte plaat:
één composer, het dok, de studio in `.tabruimte`. Files / Preview / Term zijn
knoppen om te kijken wat erin past voordat het naar `CodeEditorPage` gaat.

## Wat er al in de app zit (gemeten, niet aangenomen)

`CodeEditorPage.WIRE.md`: design mode kan al `designAgentBridge.send` naar
de code-agent. PreviewPanel bestaat. Dit ontwerp tekent hoe dat eruitziet
als het dezelfde taal spreekt als de rest van AXE: plaat, kaart, ruit;
kleur in letters; onderglow alleen waar het werkt.

## De drie toestellen

| Toestel | CSS-viewport | Frame |
|---|---|---|
| iPhone 15 Pro | 393 × 852 | `.iphone` in `tokens.css` |
| iPad Pro 11 | 820 × 1180 | `.ipad` in `tokens.css` |
| Desktop | tabruimte | `.deskframe` in `studio.css` — een venster, geen tweede AXE-schil |

De **demo-pagina** in de mocks is `#/mobile`, de device manager. Eén pagina,
drie kaders: zo zie je of een duim, een iPad en de Mac hetzelfde verhaal
vertellen voordat je deployt.

Open met `?stand=code|canvas|preview` en `?device=phone|tablet|desktop`.
`?look=black|glass` blijft de plaat. In Code-stand krijgt tablet/desktop een
breder preview-vak; de inspecteur blijft een ruit over de telefoon — niet
over de iPad.

Een wijziging in design mode is een diff in de bron, niet een tweede waarheid.
Reject blijft mogelijk. Dat is de Cursor-regel, toegepast op FlutterFlow-gebaren.

## Wat het niet is

Geen tweede AXE in het preview-venster (geen TopNav, geen dok van 25).
Geen eigen kleuren voor de editor. Geen gevulde cyaan knoppen. De Kotlin-schil
van de Samsung blijft buiten deze tab. Geen terminal of code-agent in
`PlaatSlot` links/rechts — die hoeken zijn van Home.
