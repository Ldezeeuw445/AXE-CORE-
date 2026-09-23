# Hoe AXE onthoudt en leert

## Twee dingen die op elkaar lijken

**Beurten** en **episodes** zijn allebei "wat er gebeurde nadat ik iets
opzocht", maar ze bestaan om verschillende redenen naast elkaar.

Een **beurt** hoort bij een gesprek. Je vraagt iets, AXE haalt geheugen op,
geeft antwoord, en binnen een minuut weet je of het goed was. Beurten leven in
de browseropslag met een korte houdbaarheid.

Een **episode** hoort bij een agent die iets doet waarvan de uitkomst pas veel
later bekend is. Een trade opent nu en sluit over drie dagen; pas dán weet je of
de gebruikte kennis deugde. Episodes staan daarom in Supabase en verlopen niet.

Dat verschil is opzet, geen rommel. Wie ze samenvoegt tot één mechanisme sloopt
een van de twee.

## De keten heet nergens "RAG"

Zoeken op "RAG" of "semantic" geeft nul treffers en de valse conclusie dat er
geen leerlus is. Die is er wel, en hij heet zo:

```
buildGlobalMemoryContext → buildDurableMemoryContext → searchGlobalBrain
  → searchRagMemories  (embeddings)
  → noteRetrieval      ← hier ontstaat de beurt
```

Daarna sluit `noteTurnOutcome` of `noteOwnerOutcome` hem af met 'good' of
'poor'. `noteRetrieval` opent tegelijk een episode in Supabase, zodat de
versterking (`applyAgentReinforcement`) dezelfde beurt ziet. Het episode-id
komt later binnen — ophalen is synchroon, `openEpisode` niet — en hangt dan
aan de beurt. Was het oordeel er al, dan wordt de episode alsnog gesloten.

Handel loopt via zijn eigen episodes: `buildTradingAgentContextWithEpisode` →
`openEpisode` → `closeTradingEpisodeForTrade` (zoekt terug op symbool plus
openingstijd, dus het episode-id hoeft niet meegedragen te worden) →
`applyAgentReinforcement`, dat het gewicht van een herinnering verhoogt.
**Alleen omhoog, nooit omlaag.**

## Wat er nog niet klopt

De koppeling staat er. Wat nog openstaat is gebruik, niet de brug: browser,
code-editor en research hebben (gemeten 23 september) nul rijen, en van de
twee chat-episodes die er wél waren was er tot de race-fix geen enkele
gesloten. Zonder sluiten leert de versterking nog steeds niets van chat.

## Waar het staat

`memory` is de gewone opslag, verdeeld in naamruimtes (`axe_trader`,
`axe_intel`, `axe_companion`, `axe_research`, `global`). Een agent die zijn
eigen ruimte leest krijgt `global` er met opzet bij — dat is hoe iets dat je één
keer vertelt overal doorwerkt.

`rag_memories` houdt de embeddings en het gewicht per herinnering.
`agent_learning_episodes` is de lus zelf.
