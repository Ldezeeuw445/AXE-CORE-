/**
 * In welke repo de Code Editor werkt. Leeg = de werkmap van de host.
 *
 * Een NAAM uit AGENT_REPOS, geen pad: de host zoekt het pad op in dezelfde
 * whitelist als de code-agents (_werkmap in backend/axe_api/main.py).
 *
 * Een eigen module omdat twee clients hem nodig hebben: de bestanden
 * (workspaceFilesService) en de preview (axeCoreApiService). De preview kreeg
 * hem niet mee en startte daardoor `npm run dev` in een andere map dan de boom
 * liet zien (gemeten 14 sep: ENOENT /opt/axe-workspace/package.json).
 */
let editorRepo = '';

export function zetEditorRepo(naam: string): void { editorRepo = naam.trim(); }
export function huidigeEditorRepo(): string { return editorRepo; }
export function editorRepoHeaders(): Record<string, string> {
  return editorRepo ? { 'X-AXE-Repo': editorRepo } : {};
}
