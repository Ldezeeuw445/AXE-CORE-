/**
 * Wat AXON's context-pack teruggeeft, als tekst voor een prompt.
 *
 * AXON's antwoordvorm is niet vastgelegd in deze repo; deze functie accepteert
 * de vormen die zo'n pack redelijkerwijs heeft (platte tekst, {pack|context|
 * text|markdown}, of een lijst items met content/title) en geeft '' voor de
 * rest. Liever niets dan een JSON-dump in een prompt.
 */
export function axonPackTekst(data: unknown, max = 800): string {
  const kort = (s: string) => s.replace(/\s+\n/g, '\n').trim().slice(0, max);
  if (!data) return '';
  if (typeof data === 'string') return kort(data);
  if (typeof data !== 'object') return '';
  const o = data as Record<string, unknown>;
  for (const k of ['pack', 'context', 'text', 'markdown', 'content']) {
    if (typeof o[k] === 'string' && (o[k] as string).trim()) return kort(o[k] as string);
  }
  const lijst = (['items', 'memories', 'results', 'data'] as const)
    .map((k) => o[k]).find((v) => Array.isArray(v)) as unknown[] | undefined;
  if (!lijst?.length) return '';
  const regels = lijst.map((it) => {
    if (typeof it === 'string') return it;
    const r = (it ?? {}) as Record<string, unknown>;
    const titel = typeof r.title === 'string' ? r.title.trim() : '';
    const tekst = typeof r.content === 'string' ? r.content : typeof r.text === 'string' ? r.text : '';
    return [titel, tekst.trim()].filter(Boolean).join(': ');
  }).filter(Boolean);
  return kort(regels.map((r) => `- ${r}`).join('\n'));
}
