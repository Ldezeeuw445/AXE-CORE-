# AXE CORE — lees dit eerst

Je werkt aan AXE CORE: Luka's desktop-app (Tauri + React) met een Python-backend
op een VPS. Dit bestand is bewust kort. Het vertelt je waar je bent, wat je NIET
moet aannemen, en waar de rest staat.

Luka werkt met meerdere assistenten tegelijk — Claude Code, Cursor, Cowork. Als
jullie verschillende dingen aannemen, bouwen jullie langs elkaar heen. Vandaar
dit bestand.

---

## Waar je bent

| | |
|---|---|
| Repo | `/Users/luka/AXE-CORE-` |
| App-code | `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/` |
| Tak | `orchestrator` — dit is main, er is geen andere |
| App op de Mac | `/Applications/AXE CORE.app` |
| VPS | `api.axecompanion.com` (212.227.91.79) |

## Zes vallen die vandaag geld hebben gekost

**1. Er zijn drie bestanden die `main.py` heten. Eén draait.**
De backend die draait komt uit `backend/axe_api/main.py`. Bewerk je een andere,
dan verandert er niets en lijkt je werk verdwenen. Controleer altijd met
`python3 scripts/vps_sync.py check` — die zegt IN SYNC of hij noemt het bestand.

**2. Een grep op `src/` bewijst niet dat iets draait.**
Vijf keer op één dag bleek code te bestaan, getest te zijn, en door niemand te
worden aangeroepen. Groene tests bewijzen dat een functie werkt, niet dat iemand
hem gebruikt. Zoek de aanroeper, of doorzoek de gebouwde bundel in `dist/`.

**3. Dezelfde regel staat vaak twee keer.**
`axe-look.css` is 2300 regels; tokens staan er soms drie keer, honderden regels
uit elkaar. Verander je de bovenste en zie je geen verschil, zoek dan naar een
tweede. Er staan tests op (`plaatTint.test.ts`, `railBreedte.test.ts`).

**4. De VPS valt om als ollama te veel geheugen pakt.**
7,7 GB, en OpenHands laadde er een model van 4,9 GB in. Nu begrensd met swap en
een cgroup-limiet. Valt hij tóch om: `cat /sys/fs/cgroup/system.slice/ollama.service/memory.events`.

**5. In de gebouwde app gaat élke provideraanroep via de VPS.**
Niet rechtstreeks naar OpenAI of Anthropic. Een fout als "Proxy HTTP 502" komt
dus van jouw VPS, niet van de provider.

**6. Werk in je eigen worktree, niet in de gedeelde map.**
`WERKVERDELING.md` verdeelt bestanden, en dat werkt: niemand zit in andermans
code. Maar het verdeelt niet de git-index, en dáár ging het vier keer mis op
één dag. Een half afgemaakte `git am` hield drie sessies tegelijk op; een
`index.lock` blokkeerde een commit; iemands `git commit -a` veegde de
wijzigingen van een andere sessie mee; en een `git stash` pakte bijna
andermans bestand op. Bestandseigendom voorkomt bewerkingsconflicten, geen
git-conflicten.

Eigen map, eigen index, eigen sloten — op de externe SSD, want intern is maar
4 GB vrij en `node_modules` is 1,1 GB per worktree:

```bash
git worktree add /Volumes/EagetSSD/axe-worktrees/<sessie> -b sessie/<naam> origin/orchestrator
```

**Push altijd met `HEAD:orchestrator`.** Dit is de regel die miste. Een
worktree dwingt een eigen tak af, en dat is precies wat vandaag misging toen
een sessie op `fix/research-report-save` zat: `git push origin orchestrator`
duwde een tak die achterliep en meldde "up-to-date" terwijl er niets aankwam.

```bash
git fetch origin orchestrator && git rebase origin/orchestrator
git push origin HEAD:orchestrator
```

Het pushdoel staat daarmee vast, ongeacht hoe je lokale tak heet. De sessietak
is een wachtkamer en gaat nooit als zichzelf naar de remote, dus werk kan er
niet in blijven staan.

## Wat je moet draaien voor je zegt dat iets klaar is

```bash
cd AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
npx tsc --noEmit          # typecheck
npx vitest run            # 733 tests, allemaal groen
npx eslint src            # 427 fouten, 28 waarschuwingen — voeg er geen toe
python3 scripts/vps_sync.py check   # box en repo eens
```

Bouwen en installeren:
```bash
npm run tauri:build
cp -R src-tauri/target/release/bundle/macos/"AXE CORE.app" /Applications/
```

Systeemstatus, van overal:
```bash
axe-status
```

## De regels waar Luka op let

**Bewijs, geen aanname.** "Het staat in de code" is geen bewijs dat het draait.
Meet het: een test die faalt zonder je wijziging, een meting, een screenshot.

**Zeg wat je niet weet.** Een eerlijk "geblokkeerd, want X" is bruikbaar. Een
onterecht vinkje is erger dan geen vinkje.

**Nederlands in commits en commentaar.** Engels in de UI.

**Kleur zit in letters, niet in vlakken.** Zie `UI-MAATSTAF.md`.

## Waar de rest staat

| Bestand | Waarvoor |
|---|---|
| `BOUWLIJST.md` | wat af is, wat niet, in welke volgorde |
| `UI-MAATSTAF.md` | hoe een tab eruit hoort te zien — de browser-tab is de meetlat |
| `SLEUTELS.md` | waar elke sleutel woont |
| `ECOSYSTEM.md` | alle apps, repo's, VPS'en, hoe ze uitrollen |
| `ARCHITECTURE.md` | de lagen en waarom |
| `WERKVERDELING.md` | wie waaraan werkt, en welke bestanden van wie zijn |
| `docs/CREWAI-REFERENCE.md` | CrewAI-naslag (stond hier, hoorde er niet) |

Dit bestand staat in de hoofdmap omdat elke assistent het daar als eerste leest.
Klopt er iets niet meer, verander het hier — niet in je eigen sessie-geheugen.
