# DESIGN — één plaat, drie lagen

Dit is de maatstaf voor hoe AXE CORE er straks uitziet. `UI-MAATSTAF.md` blijft
de wet voor het raster (bandbreedte, tabruimte, kleur in letters); dit bestand
zegt van welk *materiaal* alles is gemaakt en hoe licht erop valt. De galerij
in `demo/toekomst/` is het bewijs: open `index.html`, wissel met `?look=glass`
of `?look=black`, en de schermen in `demo/toekomst/schermen/` laten zien hoe
elk tabblad in beide looks uitpakt.

Wat AXE Core ís staat in `brain/`. Dit bestand gaat alleen over hoe het eruitziet.

---

## De drie materialen

Er zijn maar drie dingen waar je naar kunt kijken. Alles op het scherm is er
één van.

**Plaat.** De achtergrond. Op de Mac is dat het echte bureaublad, geblurd door
NSVisualEffect; de plaat is een tint daaroverheen. Zij is het enige dat wisselt
tussen de twee looks. Op de plaat staan alleen *scènes*: de bol, het zonnestelsel,
straks een 3D-laag. Geen losse tekst — op licht glas valt die weg.

**Kaart.** Alles wat inhoud draagt: de chatplaat, tabellen, providerkaarten, de
editor. Mat, dicht, Linear-achtig. `#17171C → #0F0F12`, haarlijn `.09`, hoek
18 (klein) of 22 (groot). De kaart wisselt níet mee met de look; op licht glas
krijgt zij alleen een grotere lift. Zo blijft de inkt overal dezelfde.

**Ruit.** Gerookt zwart glas. Uitsluitend voor wat *zweeft of beweegt* over
andere inhoud: de zwevende telefoon op Home, de bolwidget op de browsertab, een
HUD-chip op de bol, een diff-balk boven code, een selectiekader in de
ontwerpmodus. `rgba(12,12,14,.58)`, blur 24 px, saturate 120 %, hoek 28.
Op licht glas iets dichter: `rgba(18,18,22,.66)`. Een ruit die niet zweeft is
een fout; maak er dan een kaart van.

## Tokens

Eén bron: `demo/toekomst/tokens.css`. Wordt in fase 1 overgezet naar
`src/design/axe-look.css`.

| Token | Waarde | Waarvoor |
|---|---|---|
| `--kaart` | `linear-gradient(180deg,#17171C,#121216,#0F0F12)` | kaartvlak |
| `--kaart-rand` | lichtlijn `.09` boven, `.55` zwart onder, ring `.045` | haarlijn, als `box-shadow inset` |
| `--kaart-2` | `linear-gradient(180deg,#1D1D23,#16161B)` | vak ín een kaart (logo, toggle) |
| `--ruit` / `--ruit-filter` | `rgba(12,12,14,.58)` / `blur(24px) saturate(120%)` | zweeflaag |
| `[data-look=glass] .ruit` | `rgba(18,18,22,.66)` | ruit op de lichte plaat |
| `--r-kaart` / `--r-plaat` / `--r-ruit` / `--r-knop` | 18 / 22 / 28 / 10 px | hoeken: wat zweeft mag ronder |
| `--ink` | `#E8ECF5` | koppen, waarden |
| `--ink-2` | `#9AA3B5` | lopende tekst |
| `--ink-3` | `#6F7A90` | labels, meta |
| `--ink-4` | `#4A5366` | uit, placeholder |
| `--accent` | `#22D3EE` | actief, werkend, links |
| `--ok` | `#2EF2C2` | verbonden, live |
| `--warn` | `#FFCC66` | bezig, wacht |
| `--err` | `#FF4D6D` | mislukt, en dan altijd met reden |
| `--violet` | `#A78BFA` | alleen stem |
| `--onderglow` / `--onderglow-actief` | `0 28px 56px -28px rgba(accent,.22)` / `0 32px 64px -26px rgba(accent,.34)` | onderglow, rust en actief |
| `--ui` / `--mono` | Inter / JetBrains Mono | via `@fontsource`, niet van het systeem |
| `--snel` / `--basis` / `--traag` | 140 / 200 / 320 ms | met `--ease: cubic-bezier(.16,1,.3,1)` |

Kleur zit in letters en stippen, nooit in vlakken. Eén uitzondering per merk:
de NorthSea-desk gebruikt koper `#C49B78` als merkkleur, ook alleen in letters
en één inzetlijn.

## Het lichtmodel

Licht komt van onder, en alleen als er iets gebeurt.

| Toestand | Wat je ziet |
|---|---|
| rust | haarlijn, geen gloed |
| hover | haarlijn `.14`, lift 1 px, 140 ms |
| actief | haarlijn `.14` + accentrand `.35` + onderglow |
| werkt | als actief, maar de gloed ademt (`@keyframes adem`, 2,6 s) |

Twee kaarten die tegelijk gloeien zijn er één te veel. De gloed zegt "hier
gebeurt het" — dat kan maar op één plek waar zijn. Bij
`prefers-reduced-motion` staat de adem stil en blijft de gloed.

## Twee regels die uit de schermen kwamen

**De scène staat op de plaat, de rest in een kaart.** De bol op Home en de
bolwidget op de browsertab zijn het enige dat rechtstreeks op de plaat mag
staan. HUD-tekst bij een scène gaat in een ruit-chip.

**Geen losse tekst op de plaat.** Een paginatitel, een sectiekop, een
bijschrift: zet hem in een kaart of een ruit-chip. Kan dat echt niet, dan
`.op-plaat` (tekstschaduw) — dat is het vangnet, niet de regel. Op glass werd
dit drie keer zichtbaar: de tabtitel van Settings, de samenvattingsregel van de
desk, de bijschriften op de materiaalkaart.

## Eén wijziging op UI-MAATSTAF

Regel 4 (*Elke kaart is dicht en heeft dezelfde stijl*) blijft staan. Er komt
één benoemde uitzondering bij:

> Ruit — gerookt glas — is toegestaan voor lagen die zweven over andere inhoud
> en verplaatsbaar zijn: de zwevende telefoon, de bolwidget, HUD-chips bij een
> scène, een diff-balk boven code. Wat inhoud draagt en stilstaat blijft dicht.

## De NorthSea Desk op Home

Bovenin Home, links in de topbalk, staat één koperen knop: **NorthSea Desk**.
Eén klik toont het Deal Desk van NorthSea Commodity Partners op de plaat, met
dezelfde panelen als de site: command-balk, KPI's, verwachte commissie per
route, Next actions, Deals, Correspondence, Matches, Counterparty health,
Commissions, Blockers en de activiteitsregel. Het raster is dat van de site;
het materiaal is dat van AXE (kaart voor alles, koper alleen in letters).
`demo/toekomst/desk.html` is de maquette; in de app wordt het een `/desk`-route
die de topbalkknop opent, met "Back to Home" op dezelfde plek.

De cijfers in de maquette zijn illustratief. In de app komen ze uit dezelfde
bron als de site (Supabase + mail-sync); niets wordt in de app zelf bewaard.

## Wat er na goedkeuring gebeurt

1. **Tokens in de app.** `tokens.css` overzetten naar `src/design/axe-look.css`
   (let op: dezelfde regel staat daar soms drie keer — zoek de tweede);
   `@fontsource/inter` en `@fontsource/jetbrains-mono` importeren in plaats van
   op systeemfonts te leunen. Bewijs: `plaatTint.test.ts` en
   `railBreedte.test.ts` blijven groen, en een screenshot van Settings in beide
   looks naast `schermen/settings-*.webp`.
2. **ZweefLaag.** Eén component `ZweefLaag` met `Zwever`-kinderen: pointer-drag,
   positie in localStorage per sleutel, `?reset=1` vergeet. Eerst de bolwidget
   op de browsertab, dan de telefoon op Home.
3. **DeviceFrame + PreviewPanel.** `DeviceFrame` (iPhone 15 Pro, iPad, desktop)
   als ruit om een iframe; `PreviewPanel` krijgt de toestelwisselaar en de
   ontwerpmodus (selectie, maten, inspector). `CodeEditorPage.tsx` en de
   editor-componenten zijn van Claude-sessie 3 — dit is een overdracht, geen
   Cursor-wijziging.
4. **Scènes op de plaat.** De bol wordt een scène die op elke tab mag staan;
   daarna het zonnestelsel en de 3D-laag op dezelfde canvas.
5. **De desk als route.** `/desk` met de panelen uit `desk.html`, gevoed door de
   bestaande NorthSea-bron; de topbalkknop op Home.

Elke fase eindigt met een screenshot in beide looks naast de maquette. Klopt
het niet, dan is de maquette de maatstaf — niet andersom.
