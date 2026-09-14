import type { ToolCatalogEntry } from '@/domain/tools/toolCatalog';

/**
 * [RESEARCH:] -- een vraag beantwoorden met actuele bronnen, via Perplexity.
 *
 * Naast [SEARCH:] en niet in plaats ervan. SEARCH (Tavily) geeft een lijst
 * zoekresultaten en is goedkoop. RESEARCH geeft een ANTWOORD met citaten, loopt
 * zelf meerdere zoekrondes, en kost per vraag geld van een apart tegoed. De
 * promptDoc zegt daarom wanneer welke: anders pakt het model het duurste
 * gereedschap voor een vraag die één zoekopdracht nodig had.
 *
 * `auto` en geen `approval`: de rem zit op de server (een dagbudget in
 * dollars, zie backend/axe_api/perplexity_agent.py), en die kan geen enkele
 * client omzeilen. Een goedkeuring per vraag zou AXE het zelf onderzoeken
 * afnemen, en dat was juist de reden om Perplexity toe te voegen.
 */
export const PERPLEXITY_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'research',
    marker: 'RESEARCH',
    shortForm: '[RESEARCH:]',
    gate: 'auto',
    pattern: /\[RESEARCH:\s*"([^"\]\n]{8,500})"\s*\]/,
    stripPattern: /\[RESEARCH:\s*"[^"\]\n]*"\s*\]/g,
    promptDoc: `📚 **Research with sources** (Perplexity) — a question answered from live web sources, with citations:
\`[RESEARCH: "what is driving gold this week and what are analysts watching"]\`
Use for: questions that need a synthesized, up-to-date answer from several sources — why a market moved, what changed in a regulation, what a company announced and how it was received.
Do NOT use for a single fact, a price, or a quick lookup — that is [SEARCH:], which is cheaper. Each [RESEARCH:] costs real money from a separate API credit.
If it comes back saying the budget is spent, the key is missing, or Perplexity is overloaded, say exactly that — do not answer as if it had searched.`,
  },
];
