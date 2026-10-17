/**
 * Projecten voor AXE Developer op de telefoon: GitHub/registry eerst,
 * host-checkout als extra status. De host-whitelist (claudeRepos) toont
 * alleen wat op díé machine staat; Luka's repos horen allemaal in de lijst.
 */
export interface TelefoonRepoBron {
  id: string;
  label: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface TelefoonHostRepo {
  branch: string | null;
  runnable: boolean;
  exists?: boolean;
}

export interface TelefoonRepo {
  id: string;
  titel: string;
  sub: string;
  kiesId: string;
  open: boolean;
  host: boolean;
}

function sleutel(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function hostNaamVoor(bron: TelefoonRepoBron, host: Record<string, TelefoonHostRepo> | null): string | null {
  if (!host) return null;
  if (host[bron.id]) return bron.id;
  const repo = sleutel(bron.repo);
  const id = sleutel(bron.id);
  for (const naam of Object.keys(host)) {
    const n = sleutel(naam);
    if (n === repo || n === id) return naam;
  }
  return null;
}

export function telefoonRepoLijst(opts: {
  host: Record<string, TelefoonHostRepo> | null;
  github: readonly TelefoonRepoBron[];
  huidig: string;
}): TelefoonRepo[] {
  const uit: TelefoonRepo[] = [];
  const gezien = new Set<string>();
  const voeg = (rij: TelefoonRepo) => {
    const k = sleutel(rij.id) || sleutel(rij.kiesId);
    if (!k || gezien.has(k)) return;
    gezien.add(k);
    uit.push(rij);
  };

  for (const g of opts.github) {
    if (!g.id && !g.repo) continue;
    const hostId = hostNaamVoor(g, opts.host);
    const info = hostId && opts.host ? opts.host[hostId] : undefined;
    const kiesId = hostId ?? g.id ?? g.repo;
    const bits = [
      info?.branch || g.branch,
      `${g.owner}/${g.repo}`,
      info ? (info.runnable ? 'runnable' : 'protected') : 'github',
    ].filter(Boolean);
    voeg({
      id: g.id || g.repo,
      titel: g.label || g.repo || g.id,
      sub: bits.join(' · '),
      kiesId,
      open: opts.huidig === kiesId,
      host: Boolean(info),
    });
  }

  for (const [naam, info] of Object.entries(opts.host ?? {})) {
    voeg({
      id: naam,
      titel: naam,
      sub: [info.branch, info.runnable ? 'runnable' : 'protected'].filter(Boolean).join(' · '),
      kiesId: naam,
      open: opts.huidig === naam,
      host: true,
    });
  }
  return uit;
}
