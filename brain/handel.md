# Hoe de handel werkt

Alles draait op demo-accounts bij MT5. Er wordt niet met echt geld gehandeld.

## Het ledger is de rechter

Elke afgesloten trade gaat in één ledger, en datzelfde ledger bepaalt daarna
welke strategie er voor een paar gekozen wordt. Er is geen tweede brein dat
meebeslist.

**De sleutel is `(paar, strategie, timeframe)` — er zit geen account in.** Dat
is de val die je moet kennen: alle accounts storten in dezelfde pot, dus wat
eruitziet als drie onafhankelijke beslissingen op drie accounts is één
ledger-regel die zich uitwaaiert. Vier gelijktijdige identieke goud-longs zijn
zo ontstaan.

Het gevolg voor Luka's opzet — bestaande accounts als controlegroep, per ronde
één nieuw account met alleen de verbeteringen — is dat die **niet werkt** zolang
dit zo is. Het nieuwe account stuurt vanaf de eerste trade de oude aan, en
andersom. De oplossing is een `run`-label in de sleutel, en dat moet gebeuren
vóór er nieuwe demo-accounts bijkomen.

## Frameworks

Een framework is geen tweede brein: het levert kandidaten aan hetzelfde ledger,
met een eigen prefix, en de ranking kan niet zien welke engine een getal maakte.

| Prefix | Engine | Waar |
|---|---|---|
| `vbt:` | vectorbt | eigen venv op de VPS |
| `nt:` | NautilusTrader | eigen venv, ongeveer een seconde per run |
| `ta:` | TradingAgents | draait op de **lokale** Ollama van de VPS |

Die laatste met opzet lokaal: er horen geen provider-sleutels op de VPS te
staan. En hij zelftest alleen op dagkoersen — hij redeneert over nieuws en
fundamentals met een horizon in dagen, dus op kwartierkoersen vraag je iets wat
hij niet kan beantwoorden.

## Twee dingen die tijd kosten als je ze vergeet

**Het timeframe-vocabulaire is dat van MT5: `h1`, niet `1h`.** Elke engine
krijgt zijn eigen dialect via een vertaalstap. Toen dat ergens miste, gaf `1h`
naast `h1` twee losse ledger-regels voor hetzelfde ding.

**Een half aangesloten framework ziet er van buiten uit alsof het werkt.**
Controleer of de VPS en de repo hetzelfde draaien voor je gelooft dat iets live
is.
