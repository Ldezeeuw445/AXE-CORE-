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

Daarna sluit `noteTurnOutcome` hem af met 'good' of 'poor'.

Handel loopt via episodes: `buildTradingAgentContextWithEpisode` → `openEpisode`
→ `closeTradingEpisodeForTrade` (zoekt terug op symbool plus openingstijd, dus
het episode-id hoeft niet meegedragen te worden) → `applyAgentReinforcement`,
dat het gewicht van een herinnering verhoogt. **Alleen omhoog, nooit omlaag.**

## Wat er nog niet klopt

Alleen handel voedt die versterking. Chat, browser en code-editor leggen hun
beurten wél netjes vast, maar in de browseropslag — en de versterking leest
alleen Supabase. Die beurten worden dus opgeschreven en er gebeurt nooit iets
mee, en op een tweede computer beginnen ze weer bij nul.

AXE Core leert op dit moment dus alleen van handelen. De reparatie is een
koppeling, geen herbouw: de twee vormen passen op elkaar.

## Waar het staat

`memory` is de gewone opslag, verdeeld in naamruimtes (`axe_trader`,
`axe_intel`, `axe_companion`, `axe_research`, `global`). Een agent die zijn
eigen ruimte leest krijgt `global` er met opzet bij — dat is hoe iets dat je één
keer vertelt overal doorwerkt.

`rag_memories` houdt de embeddings en het gewicht per herinnering.
`agent_learning_episodes` is de lus zelf.
