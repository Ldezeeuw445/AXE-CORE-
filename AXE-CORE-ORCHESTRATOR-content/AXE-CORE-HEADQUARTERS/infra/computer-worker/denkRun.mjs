// Denk-aanroep: de stoel is alleen het BREIN van de lus op de VPS (provider_router.seat_prompt).
// 22-24 nov live: zo'n aanroep liep als gewone codeeropdracht -- werkbon, eigen worktree,
// schrijfrechten -- en Claude/Codex gingen zelf aan het werk (minuten per stap) en gaven
// tekst i.p.v. één actie. Hier: een lege tijdelijke map, alleen lezen, één antwoord.
import { join } from 'node:path';

/** [bin-sleutel, argv, pad van het antwoordbestand of null] voor één denk-run. */
export function denkArgv(tool, prompt, dir, model = '') {
  if (tool === 'codex.run') {
    const uit = join(dir, 'antwoord.txt');
    // -o: alleen het laatste bericht (stdout herhaalt het hele prompt, met JSON-voorbeelden).
    const argv = ['exec', prompt, '-C', dir, '-s', 'read-only', '--skip-git-repo-check', '-o', uit];
    if (model) argv.push('-m', model);
    return ['codex', argv, uit];
  }
  if (tool === 'cursor.run') {
    const argv = ['-p', prompt, '--output-format', 'json'];
    if (model) argv.push('--model', model);
    return ['cursor-agent', argv, null];
  }
  // Claude: geen --allowedTools en geen acceptEdits -> headless mag hij niets schrijven of draaien.
  const argv = ['-p', prompt, '--output-format', 'json'];
  if (model) argv.push('--model', model);
  return ['claude', argv, null];
}
