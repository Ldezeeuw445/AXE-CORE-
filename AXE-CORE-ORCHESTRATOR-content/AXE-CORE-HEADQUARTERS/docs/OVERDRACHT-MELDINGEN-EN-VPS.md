# Overdracht: meldingen afmaken, de nieuwe VPS, en de twee Macs

Kopieer alles onder de streep naar een Claude Code-sessie die lokaal draait met
volledige toegang (Mac mini, of `claude remote-control` in een terminal daar).

Geschreven 4 okt 2026 door de cloud-sessie die de meldingen heeft gebouwd. Die
sessie kan niet bij de VPS'en of de Macs: de netwerkpolicy van die container
blokkeert alle hosts behalve een vaste lijst. Vandaar deze overdracht.

---

## STAND 5 okt 2026 — lees dit eerst

Tussen het schrijven van dit document en nu hebben andere sessies doorgewerkt.
Drie van de vijf taken hieronder zijn daardoor geheel of deels achterhaald.
Nagemeten op 5 okt:

| taak | stand |
|---|---|
| 1. VAPID op de API-VPS | **nog te doen.** `core_push_subscriptions` heeft 0 rijen: er is nog geen enkel apparaat aangemeld. De val uit taak 1 is inmiddels wél in code afgevangen (commit `90aa75d5`, #200), maar het sleutelpaar moet nog gemaakt. |
| 2. Cloudflare `VITE_VAPID_PUBLIC_KEY` | **nog te doen**, volgt op taak 1. |
| 2b. `deploy.sh` | **nog te doen**, de waarschuwing over stap 6 geldt onverkort. |
| 3. Nieuwe VPS als modelbox | **grotendeels gedaan.** De bootstrap is echt gedraaid; `e41e96b6` en `d141409d` repareren drie fouten die daarbij bovenkwamen. Controleer alleen nog de twee CONTROLEER-punten (MEETMODUS, en wie er een shell mag). |
| 4. iMac-build | **nog te doen.** |
| 5. Android-schil in git | **gedaan** — hij heeft een eigen repo, zie `ECOSYSTEM.md` (`850ff481`). |

Twee dingen die daarbij opvielen en die niemand heeft gevraagd:

- **Twee meldingen zijn stilletjes opgegeten.** `core_notifications` heeft 2
  rijen met `pushed_at` gezet terwijl er nul apparaten aangemeld zijn. Dat was
  het oude gedrag; #200 zet `pushed_at` nu alleen nog bij een geaccepteerde
  push. Terugzetten heeft geen zin -- ze zijn ouder dan het uur dat de zender
  terugkijkt. Het is alleen een bevestiging dat die fix nodig was.
- **`core_notifications` staat nu dicht voor anon** (`6cdac2f4`, migratie 004,
  toegepast). Die tabel voedt je slotscherm en stond open.

---

Je draait lokaal op Luka's Mac met volledige toegang tot de machine, het netwerk
en de repo. Er ligt afgerond werk dat alleen nog **aangezet** moet worden op
machines waar de vorige sessie niet bij kon.

Repo: `~/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS`,
branch `orchestrator`. Begin met `git pull`.

## De regel die boven alles gaat

**Bewijs, geen aanname.** Dit project gaat zelden stuk op een manier die eruit
ziet als stuk. Een service worker die maandenlang de oude app serveerde, stderr
die op 24 tekens werd afgekapt, terminals die "traag" waren maar gewoon hun
uitvoer per 4 KB-blok doorgaven. Elke stap hieronder eindigt daarom met een
commando dat je echt hebt gedraaid, en waarvan je de uitvoer in je verslag
plakt. Geen uitvoer = niet af.

Werkt iets niet, zeg dat met de foutmelding erbij. Een half werkende stap die
als "klaar" gerapporteerd wordt kost hier meer tijd dan een eerlijke "dit lukt
niet".

## Vier dingen die niet onderhandelbaar zijn

1. **Vraag nooit om sleutelwaardes in de chat, en zet ze nergens in git.**
   Namen van variabelen wel, waardes niet. Controleer alleen of iets *gevuld*
   is: `[ -n "$X" ] && echo gevuld`. De VAPID-privésleutel blijft op de VPS.
2. **Schrijf nooit in `public.push_subscriptions` of `public.messages`.** Die
   horen bij AXE Companion, dat hetzelfde Supabase-project deelt. AXE CORE
   heeft zijn eigen `core_push_subscriptions` en `axe_messages`. In andermans
   tabel schrijven heeft hier al maanden gekost (zie de kop van
   `src/infrastructure/persistence/chatPersistence.ts`).
3. **`AXE_TERMINAL_ALLOWED_USER_IDS` mag nooit leeg blijven.** Leeg betekent:
   elk account op dat gedeelde Supabase-project krijgt een shell op de VPS.
4. **Ollama hoort achter de nginx-Bearer-sleutel.** Zonder die sleutel staat de
   modelbox open op het internet — dat is op 13 sept echt gebeurd.

Commits en commentaar in het Nederlands, de UI in het Engels.

## Git: hoe je dit terugduwt zonder bestaand werk om te gooien

Er draait mogelijk nog een cloud-sessie in dezelfde repo. Op het moment van
schrijven staan **beide** takken op dezelfde commit: `0d19804d`.

- Werk op `orchestrator`. Push naar **allebei**, anders lopen ze uit elkaar en
  moet de volgende sessie gaan mergen:
  ```bash
  git push origin HEAD:orchestrator
  git push origin HEAD:claude/dazzling-ptolemy-k3ekn1
  ```
- **Nooit `--force` of `--force-with-lease`, nooit rebasen, nooit amenden** op
  commits die al gepusht zijn. Is er iets fout, maak een nieuwe commit die het
  terugdraait.
- Haal eerst binnen met `git pull --ff-only origin orchestrator`. Weigert dat,
  dan is er elders gepusht: mergen (geen rebase), dan pas pushen.
- Cloudflare Pages bouwt `axeheadquarters.com` vanaf `orchestrator`. Elke push
  daarheen is dus meteen live op zijn telefoon — na ~2 minuten. Push geen half
  werk.
- Canonical Tauri-builds komen ALLEEN uit `orchestrator`; de guard in
  `scripts/tauri-build-guard.sh` blokkeert de rest met opzet.
- Voor je pusht, de volle meetlat vanuit de app-map:
  ```bash
  npx tsc --noEmit && npx vitest run && npx eslint src && npm run build:web
  ```
  IJklijn op 4 okt 2026: **282 bestanden / 2428 tests groen, eslint 457 errors /
  34 warnings**. Die 457 zijn bestaande schuld, geen regressie — ze moeten
  precies 457 blijven. Loopt het op, dan komt dat door jou.
- `.env`-bestanden en sleutels horen nooit in een commit.
  `scripts/check-no-secrets.mjs` draait mee in `build:web`.

---

# Taak 1 — De meldingen aanzetten (API-VPS)

## Wat er al staat

Alle code is gebouwd, gecommit en gepusht (`74d8b788`, `0d19804d`): de domein-
regel `src/domain/pushBericht.ts`, de service worker `public/axe-push-sw.js`,
het aan-/afmelden in `src/infrastructure/persistence/pushAanmelding.ts`, de knop
in `src/presentation/components/settings/MeldingenSection.tsx`, en de zender
`backend/axe_api/push_meldingen.py` die vanuit `/cron/tick` draait.

De databasekant is ook af en nagemeten: `core_push_subscriptions` met policy
`core_push_subscriptions_eigen` en een index op `user_id`, plus
`core_notifications.pushed_at` en een partiële index op de ongepushte rijen.

**Wat ontbreekt is alleen het VAPID-sleutelpaar.** Zonder dat zegt de zender
elke minuut `[push] VAPID_PRIVATE_KEY niet gezet` en doet de knop in de app
niets, want `VITE_VAPID_PUBLIC_KEY` is leeg.

## De val waar de vorige poging in liep

`vapid --gen` schrijft `private_key.pem` + `public_key.pem` in de huidige map.
`vapid --applicationServerKey` leest ze daar weer. Hernoem je het privébestand
tussendoor, dan vindt het tweede commando niets, vraagt "zal ik er een maken?",
maakt een **nieuw paar** en print de publieke helft van dát paar. Je houdt dan
een privésleutel van paar 1 en een publieke van paar 2 over. Gevolg: de knop
werkt, de rij wordt netjes opgeslagen, en er komt nooit een melding aan — de
pushdienst weigert stil.

Daarom hieronder: niets hernoemen, en de publieke helft **afleiden uit precies
het bestand waar `.env` naar wijst**. Dan kan het paar niet uit elkaar lopen.

## Doen (op de API-VPS, 212.227.91.79 — niet de nieuwe box)

Controleer eerst dat je op de goede machine zit:

```bash
hostname -I; systemctl is-active axe-core-api
```

`active` = goed. Dan:

```bash
set -e
mkdir -p /etc/axe-vapid && cd /etc/axe-vapid
rm -f /opt/axe-core-api/vapid_private.pem \
      /opt/axe-core-api/private_key.pem \
      /opt/axe-core-api/public_key.pem
/opt/axe-core-api/venv/bin/pip install -q pywebpush==2.5.0
/opt/axe-core-api/venv/bin/vapid --gen
chmod 600 /etc/axe-vapid/private_key.pem

touch /opt/axe-core-api/.env
sed -i '/^VAPID_PRIVATE_KEY=/d;/^VAPID_CONTACT=/d' /opt/axe-core-api/.env
printf 'VAPID_PRIVATE_KEY=/etc/axe-vapid/private_key.pem\nVAPID_CONTACT=mailto:lukadezeeuw@gmail.com\n' >> /opt/axe-core-api/.env
systemctl restart axe-core-api

echo
echo "=== VITE_VAPID_PUBLIC_KEY voor Cloudflare Pages ==="
/opt/axe-core-api/venv/bin/python - <<'PY'
import base64
from cryptography.hazmat.primitives import serialization
priv = serialization.load_pem_private_key(
    open('/etc/axe-vapid/private_key.pem','rb').read(), password=None)
pub = priv.public_key().public_bytes(
    serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
print(base64.urlsafe_b64encode(pub).decode().rstrip("="))
PY
```

Een pad in `.env` werkt: pywebpush doet `os.path.isfile()` op die waarde en
leest dan de PEM (nagekeken in de bron van 2.5.0, niet aangenomen).
`/etc/axe-vapid` en niet `/opt/axe-core-api`, omdat dat laatste een
git-checkout is — losse sleutelbestanden daarin duiken op in `git status`.

**Bewijs dat dit gelukt is:**

```bash
# de sleutel moet 87 tekens zijn, 65 bytes, eerste byte 0x04
systemctl restart axe-core-api
journalctl -u axe-core-api -n 30 --no-pager | grep -i push || echo "(geen pushregel = goed: hij heeft de sleutel)"
```

Staat er `[push] VAPID_PRIVATE_KEY niet gezet`, dan leest de dienst `.env` niet —
kijk dan naar `EnvironmentFile=` in de systemd-unit.

# Taak 2 — De publieke helft in Cloudflare Pages

Zet de sleutel uit taak 1 in de bouwomgeving van het Pages-project
(axeheadquarters.com) als `VITE_VAPID_PUBLIC_KEY`, en laat één keer opnieuw
bouwen. Hij hóórt publiek te zijn; `scripts/check-no-secrets.mjs` kent hem al
als publiek-van-ontwerp.

**Bewijs:**

```bash
curl -s "https://axeheadquarters.com/?x=$RANDOM" | grep -o '/assets/index-[^"]*\.js' | head -1
# en dan die bundle ophalen en erin zoeken:
curl -s "https://axeheadquarters.com/assets/index-XXXX.js" | grep -c 'B[A-Za-z0-9_-]\{86\}'
```

Nul treffers = de variabele stond niet in de bouwomgeving toen hij bouwde.

Daarna drukt Luka één keer op de knop in **Instellingen → Meldingen**, per
apparaat. Op iPhone/iPad moet dat in de PWA van het beginscherm; in Safari zelf
staat Web Push uit en zegt de knop dat ook.

**Het echte eindbewijs** (vraag Luka hierom, jij kunt het niet zien): een rij in
`core_notifications` moet binnen een minuut een melding op zijn slotscherm geven
met de app dicht. De zender stuurt alleen meldingen van het laatste uur, max 20
per tik — de 449 oude rijen gaan dus niet alsnog af.

# Taak 2b — `deploy.sh` op de API-VPS, met één waarschuwing

`pywebpush==2.5.0` staat in `backend/axe_api/requirements.txt`. Taak 1
installeert hem met de hand zodat je meteen verder kunt, maar bij de volgende
deploy hoort hij uit dat bestand te komen. Draai `backend/axe_api/deploy.sh`
dus een keer.

**Kijk eerst naar stap 6 van dat script.** Die is deze week herschreven en
schrijft de systemd-unit van de terminalserver opnieuw. De terminalserver op
Strato *werkt vandaag* — bewezen met `journalctl`, die op 4 okt een echte
`client connected` liet zien. Een deploy die die unit overschrijft zonder dat
`/etc/axe-terminal.env` klopt, maakt iets stuk dat het nu doet. Lees de unit
voor en na:

```bash
systemctl cat axe-terminal > /tmp/unit-voor.txt
bash backend/axe_api/deploy.sh
systemctl cat axe-terminal > /tmp/unit-na.txt
diff /tmp/unit-voor.txt /tmp/unit-na.txt || true
systemctl is-active axe-terminal
```

Verschil in `EnvironmentFile=`? Dan eerst dat bestand controleren voor je
herstart.

# Taak 3 — De nieuwe VPS als modelbox (217.160.135.111)

8 cores, 16 GB, Ubuntu 24.04. Het A-record `ollama.axecompanion.com` wijst er al
heen en staat op **DNS only** (grijs) — op 4 okt geverifieerd: de hostnaam lost
op naar 217.160.135.111 en niet naar Cloudflare-IP's. Grijs is goed: oranje zit
de ACME-controle en de lange streaming-antwoorden van het model in de weg.

Draaien als root op die box:

```bash
git clone -b orchestrator https://github.com/Ldezeeuw445/AXE-CORE-.git /tmp/axe
cd /tmp/axe/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS
OLLAMA_PROXY_KEY=<sleutel uit AXE-VAULT> API_IP=212.227.91.79 ROL=ollama \
  bash infra/vps-bootstrap.sh
```

`ROL=ollama` heeft met opzet geen standaardwaarde: een verkeerde gok zet of een
tweede Ollama naast de API (de RAM-strijd die deze splitsing juist beëindigt) of
de API op de modelbox. `API_IP` zorgt dat de API-box er zonder sleutel bij mag,
want `agent_loop.py` stuurt er geen.

Het script doet daarna zelf nginx + certbot voor `ollama.axecompanion.com` en
zet de terminalserver op `/terminal`.

**Twee dingen die het script expres aan jou overlaat** (het zegt ze ook zelf aan
het eind, onder "CONTROLEER"):

1. **Het slot staat standaard op `MEETMODUS=1`:** alles komt er nog door,
   geweigerde verzoeken worden alleen gelogd. Kijk een dag later in
   `/var/log/nginx/ollama-geweigerd.log` wie er langskwam, en zet hem dan dicht
   zoals het script voordoet. Staat er alleen ruis van buiten in, dan kan hij
   meteen dicht.
2. **`/etc/axe-terminal.env` invullen.** `SUPABASE_URL` en `SUPABASE_ANON_KEY`
   zijn verplicht (zonder weigert de terminalserver te starten, met opzet), en
   `AXE_TERMINAL_ALLOWED_USER_IDS` moet Luka's user-id bevatten. Leeg = iedereen
   op dat gedeelde project. Zijn id staat in Supabase → Authentication → Users.
   Daarna `systemctl restart axe-terminal`.

**Bewijs:**

```bash
curl -s https://ollama.axecompanion.com/api/tags | head -40   # moet de gepulde modellen tonen
curl -s -o /dev/null -w '%{http_code}\n' https://ollama.axecompanion.com/api/tags   # zonder sleutel: 401 zodra het slot dicht is
free -h                                                        # 2 modellen resident is een aanname, geen meting
```

In de app staat die URL al hard in `infrastructure/config/ollamaSleutel.ts` —
er hoeft geen regel code veranderd te worden. Dezelfde sleutel hoort in de app
bij **Instellingen → Ollama**, veld `key`.

# Taak 4 — De Tauri-app op de iMac

De Mac mini is al bijgewerkt. Op de iMac liep het stuk op:

```
✖ Canonical AXE CORE wordt ALLEEN uit 'orchestrator' gebouwd. Je staat op 'HEAD'
```

Dat is een losse HEAD in een worktree. Doe:

```bash
git worktree list          # zoek de regel met [orchestrator]
cd <die map>
git pull
npm run bijwerken
```

`npm run bijwerken` (= `scripts/axe-bijwerken.sh`) haalt binnen, bouwt, ruimt de
oude bundels op en start de nieuwe app. Het stopt met opzet als er gewijzigd of
onbekend werk staat — het gooit nooit iets van je weg. Ruim dat dan eerst op
zoals het script voordoet.

Verwacht de stop op het ondertekencertificaat; `docs/MAC-ONDERTEKENEN.md` staat
erin (Keychain Access → Certificate Assistant → certificaat `AXE Core dev`,
zelfondertekend, gebruik "code signing").

# Taak 5 — De Android-schil in git

Op de Samsung A17 staat nu AXE CORE als device manager, maar de Kotlin-schil
staat alleen in `~/Downloads/AxeCore` op de Mac. **Zolang die niet in git staat,
kan niemand eraan verder werken en is één schijf het enige exemplaar.** Zet hem
in de repo (of een eigen repo, maar wel ergens), met een korte README over hoe
je hem bouwt. Dit blokkeert al het andere A17-werk.

---

## Optioneel, als er tijd over is

Twee dingen die de vorige sessie heeft aangeboden maar niet gedaan, omdat Luka
er niet om had gevraagd:

1. **De CSS-waarschuwing bij `deskDecisions.ts`** (Tailwind) is een fix van één
   teken. Klein, maar hij staat elke build in de uitvoer.
2. **Een privacy-schakelaar voor het slotscherm:** nu staat de volledige titel
   van een melding op het vergrendelde scherm. Een stand "toon alleen *AXE has
   something*" is een kleine toevoeging in `pushBericht.ts` plus een keuze in
   `MeldingenSection.tsx`. Vraag Luka of hij dat wil voor je het bouwt.

---

## Verslag

Sluit af met per taak: wat je draaide, wat eruit kwam, en wat er nog openstaat.
Noem expliciet wat je **niet** hebt kunnen doen en waarom — dat is bruikbaarder
dan een lijst met vinkjes.
