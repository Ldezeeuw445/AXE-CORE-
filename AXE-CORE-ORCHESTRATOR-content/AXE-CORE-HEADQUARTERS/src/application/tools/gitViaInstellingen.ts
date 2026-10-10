/**
 * De git-tools van de chat en de stem, met de GitHub-tokens uit Settings → Developer.
 *
 * Tot 10 okt liepen GIT_READ / GIT_WRITE / GIT_BRANCH / GIT_PR via de VPS (`/github/*`), die zijn eigen
 * `GITHUB_TOKEN` in `.env` gebruikt. Dat token is ingetrokken (401 "Bad credentials"), terwijl de tokens
 * in Settings per repo gewoon werken: de Code-editor, BUILD en de repo-gezondheid gebruiken die direct vanuit
 * de app. De tools zeiden dus "GitHub call failed" voor repo's waar de app wel bij kon. De tokens blijven
 * hier waar ze horen (client-side, nooit naar de backend); de VPS is alleen nog de weg voor een repo waar
 * Settings geen token voor heeft.
 */
import { loadRepoConfigs, type RepoConfig } from '@/infrastructure/persistence/repoConfigService';

/** De Settings-repo met een token voor 'owner/repo', of null (dan blijft de VPS-weg over). */
export function repoMetToken(volleNaam: string): RepoConfig | null {
  const [eigenaar, naam] = volleNaam.trim().toLowerCase().split('/');
  if (!eigenaar || !naam) return null;
  return loadRepoConfigs().find(c =>
    !!c.token?.trim() && c.owner.toLowerCase() === eigenaar && c.repo.toLowerCase() === naam,
  ) ?? null;
}
