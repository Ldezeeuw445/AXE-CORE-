# ONTWERP — de code-tab als studio

Luka: *Cursor, Replit, FlutterFlow en Figma in één, met een preview-stand,
en meteen mocks voor telefoon en tablet als je die ene pagina als demo wilt.*

Dit is de spec bij de maquettes. Open `../code.html` (de studio) en
`preview.html` (de pagina op drie toestellen). `CodeEditorPage.tsx` blijft
van Claude-sessie 3; dit is alleen het ontwerp.

---

## Wat het is

Eén tab, drie **standen**. Geen vier producten naast elkaar.

| Stand | Wat hij leent | Wat je ziet |
|---|---|---|
| **Code** | Cursor + Replit | bestanden, editor, inline-diff, terminal, live toestel |
| **Canvas** | Figma + FlutterFlow | lagenboom, artboard, inspecteur; sleep is een diff |
| **Preview** | Replit preview + Figma device frames | dezelfde route op telefoon, tablet en desktop |

Wisselen is één segment in de werkbalk. De agent, de terminal en de composer
blijven. Alleen het middenvak verandert.

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
van de Samsung blijft buiten deze tab.
