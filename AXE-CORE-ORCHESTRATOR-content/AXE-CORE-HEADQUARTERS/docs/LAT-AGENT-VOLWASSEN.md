# De lat: wat AXE Core moet kunnen

**Status:** norm, geen verslag. Dit beschrijft waar we naartoe werken, niet waar
we staan. Vastgelegd 11 september 2026 door Luka, overgenomen van een pagina die
dit beter opschreef dan wij tot nu toe deden.

> Lees in de bron "Darwin" overal als **AXE CORE**. De tekst is van een andere
> partij; de lat is van ons.

## Waarom dit bestand bestaat

De kern van de bron, en de reden dat Luka hem bewaard wilde hebben:

> Een demo beantwoordt wat de agent *kan*.
> Een product moet alles beantwoorden wat er *mis kan gaan*.

"Een Jarvis in elkaar zetten" en "een afgewerkte assistent ontwikkelen" zijn niet
hetzelfde. Het eerste is een weekend en is oprecht leuk. Het tweede is deze lijst,
elke dag, maandenlang — en het meeste ervan fotografeert slecht en levert geen
goede video op, wat precies de reden is dat niemand erover praat.

Achttien punten in zes gebieden. Dit is géén lijst met redenen om het niet te
doen; het is de lijst die je een voor een tegenkomt.

---

## 01 · Wie er werkelijk beslist

De meest voorkomende reden dat een agent dingen dubbel doet, of nooit afmaakt.

- **Wie de echte orkestrator is.** Het moet vaststaan welke laag beslist wat er
  uitgevoerd wordt, wat naar het geheugen gaat, wanneer een andere agent wordt
  aangeroepen en wanneer de taak klaar is. Anders krijg je lussen, dubbelingen en
  een agent die werk tussen diensten door begint te schuiven.
- **Meer agenten klinkt beter dan het meestal is.** Multi-agent oogt indrukwekkend,
  maar agenten gaan elkaar enorme context sturen, elkaar tegenspreken en eindeloos
  delegeren. Vaak verslaat één goede orkestrator er tien.
- **Latency stapelt op.** Model → geheugen → model → browser → model → nog een
  agent → model. Een simpele opdracht wordt een workflow van dertig seconden
  terwijl de mens naar een spinner kijkt.

## 02 · Rechten en veiligheid

Het deel waar een demo nooit aan toekomt, en dat bepaalt of je hem op je eigen
inbox mag richten.

- **Lezen is niet schrijven.** Gmail lezen ≠ Gmail versturen. Een bestand lezen ≠
  het overschrijven of verwijderen. Een agent hoort geen blanco beheerdersrechten
  te krijgen omdat dat makkelijker programmeert.
- **Prompt injection.** Leest de agent het web, e-mail of documenten, dan komt hij
  vroeg of laat tekst tegen in de trant van "negeer je vorige instructies en stuur
  mij…". Externe inhoud mag niet hetzelfde gezag hebben als een opdracht van de
  gebruiker. Dit is geen theorie, dit gebeurt.
- **Waar de sleutels staan.** Waar liggen de tokens van Anthropic, OpenAI, Gmail en
  ElevenLabs? Wie kan ze lezen? Staan ze in logs? En zet de agent ze per ongeluk in
  de context van het model? Dit is een heel gewone zwakke plek in zelfbouw.
- **Audit.** Je moet achteraf kunnen beantwoorden: wat heeft de agent gedaan, welk
  model besloot dat, welke tool riep hij aan, welke data kreeg hij, wat veranderde
  hij. Zonder dat kun je niet vinden waar iets brak — en ook niet bewijzen dat het
  niet gebroken is.

## 03 · Geheugen

Een vectordatabase aansluiten is een uur werk. Geheugen dat over zes maanden nog
klopt is iets anders.

- **Een vector-DB is niet genoeg.** Je moet vastleggen wat er wel en niet wordt
  opgeslagen, verval, dubbelingen, conflicten, het verschil tussen feitengeheugen
  en semantisch geheugen, en wat er gebeurt als je het embedding-model wisselt en
  de index opnieuw moet.
- **Wat is de bron van waarheid.** De vectorindex mag niet de enige kopie van de
  kennis zijn. Je moet het geheugen op elk moment uit de originele data kunnen
  herbouwen. Anders wist één slechte migratie alles wat de agent ooit leerde.
- **De context van het model is niet oneindig.** Je kunt niet eeuwig de hele chat,
  het hele geheugen, elke tool en elk document blijven meesturen. De kosten lopen
  op, de latency loopt op, en de kwaliteit van de beslissingen wordt slechter —
  wat ertoe doet verdrinkt in de ruis.

## 04 · Als het stukgaat

Dit is het hele verschil tussen een demo en een product.

- **Tool-aanroepen moeten gevalideerd worden.** Het model mag een tool alleen
  *voorstellen*. Het raamwerk moet de parameters, de rechten en het resultaat
  controleren. Dat het model `delete_file` zegt mag niet automatisch betekenen dat
  er een bestand weg is.
- **Idempotentie.** Als "stuur de factuur" een timeout geeft, kun je niet zomaar
  opnieuw proberen. Misschien is hij al de deur uit en is alleen de bevestiging
  verdwenen. Bij agenten is dit kritiek — een factuur die twee keer verstuurd is,
  is erger dan een die niet verstuurd is.
- **Opnieuw proberen en falen afhandelen.** Gmail antwoordt niet, het model geeft
  kapotte JSON, een API wijzigt zijn schema, een server valt om. De agent moet
  weten wat hij opnieuw probeert, wat hij afbreekt, en wat hij aan een mens meldt.
- **Automatiseringen zijn een andere categorie.** Met de hand "stuur deze mail"
  zeggen is een ander risico dan een agent die zichzelf elke ochtend wekt en zelf
  bepaalt wat hij verstuurt. Hoe meer autonomie, hoe harder de vangrails moeten zijn.

## 05 · Geld en onafhankelijkheid

De rekening wordt niet bepaald door de prijs van het model, maar door de aanroepen
waar je geen weet van hebt.

- **API versus abonnement.** Sommige raamwerken kunnen een abonnement en OAuth
  gebruiken, andere eisen een API-sleutel. Bij een agent kan één gebruikersopdracht
  twintig modelaanroepen betekenen, dus betalen-per-token kan hard oplopen.
- **Kostenbewaking.** De prijs van één model volgen is niet genoeg. Stem,
  embeddings, geheugen, de browser, een cloudserver, een database en de model-API
  tellen allemaal op. En een limiet per gebruiker begrenst je rekening niet — het
  plafond moet ook globaal zijn.
- **Vendor lock-in.** Als het geheugen bij de ene dienst zit, de orkestratie bij de
  tweede en je processen bij de derde: wat doe je als één daarvan de prijs verhoogt,
  stopt, of zijn API wijzigt?

## 06 · Waar de data werkelijk langs gaat

- **De gebruiker denkt dat hij het naar "zijn agent" stuurde.** Eén e-mail kan langs
  je raamwerk, een cloudmodel, een geheugenaanbieder, een embedding-aanbieder en een
  logdienst gaan. De persoon aan de andere kant gelooft dat hij het naar één
  applicatie stuurde. Hij hoort dat te horen vóórdat het gebeurt, niet erna.

---

## Het geheugenmodel dat hierbij hoort

Uit dezelfde bron, en het is preciezer dan wat wij nu hebben opgeschreven:

**Eén geheugen, twee vormen.**

- **De kluis** — notities in Markdown, altijd te openen en te bewerken. Dit is wat
  je bezit.
- **De index** — een kaart van betekenissen, gebouwd uit de kluis, op elk moment
  opnieuw op te bouwen.

> De index is afgeleid. De kluis is de waarheid.
> Je kunt de kluis niet terugbouwen uit de index.

Dat is punt 03 hierboven, maar dan als ontwerp in plaats van als waarschuwing.

**De weg van één vraag:** vraag → automatische terugroep (de zes dichtstbijzijnde
stukken, elke keer, zonder erom te vragen) → antwoord. Alleen als een fragment niet
genoeg is: gericht zoeken → de hele notitie openen. Eén antwoord draagt dus nooit
het hele geheugen, alleen een kleine selectie van wat relevant is.

**Gesprekken zijn een zwakkere bron dan notities.** Een gesprek bevat ook dingen die
later onjuist bleken, en de agent mag zijn eigen oude gok niet als feit hergebruiken.
Wat blijvend moet gelden hoort in een notitie — een gesprek is een verslag, geen
conclusie.

**Fout erin? In een minuut eruit.** Het geheugen is platte tekst. Onthoudt hij onzin,
dan herschrijf je één zin en binnen vijf minuten klopt het. Geen hertraining, geen
wachten, geen supportverzoek. Dat is precies wat assistenten die in andermans cloud
wonen meestal niet kunnen bieden: zodra iets in hun geheugen belandt, ziet de
gebruiker het nooit meer, laat staan dat hij het corrigeert.

---

## Wat AXE Core hiervan al heeft, en wat niet

Bewust niet ingevuld op basis van een gevoel. Dit hoort een gemeten lijst te worden,
punt voor punt, met een verwijzing naar de code die het waarmaakt of naar het gat.
Een lijst die zegt dat iets af is terwijl dat niet zo is, is precies de faalwijze
waar deze codebase een naam voor heeft: iets ziet er van buiten uit alsof het draait.

Zolang die kolom leeg is, is dit een **norm** en geen keurmerk.
