/**
 * Lightweight outline symbols for the Code editor v3 aside.
 * Pure text heuristics — no language server. Keeps the mockup Outline
 * panel useful without coupling Monaco diagnostics.
 */
export type CodeOutlineItem = { name: string; depth: number; kind: 'fn' | 'class' | 'const' };

const PATTERNS: Array<{ re: RegExp; kind: CodeOutlineItem['kind']; depth: number }> = [
  { re: /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, kind: 'fn', depth: 0 },
  { re: /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, kind: 'fn', depth: 0 },
  { re: /^\s*export\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: 'class', depth: 0 },
  { re: /^\s*class\s+([A-Za-z_$][\w$]*)/, kind: 'class', depth: 0 },
  { re: /^\s*export\s+(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/, kind: 'const', depth: 0 },
  { re: /^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, kind: 'fn', depth: 1 },
];

export function extractCodeOutline(source: string, limit = 24): CodeOutlineItem[] {
  if (!source) return [];
  const out: CodeOutlineItem[] = [];
  const seen = new Set<string>();
  for (const line of source.split('\n')) {
    for (const p of PATTERNS) {
      const m = line.match(p.re);
      if (!m) continue;
      const name = m[1];
      if (seen.has(name)) break;
      seen.add(name);
      out.push({ name, depth: p.depth, kind: p.kind });
      break;
    }
    if (out.length >= limit) break;
  }
  return out;
}
