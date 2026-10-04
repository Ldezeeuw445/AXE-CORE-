/**
 * Schrijft de taakmap in de echte Obsidian-kluis (core_obsidian_notes +
 * vault-sync). Zonder deze aanroep bestaat de map alleen op de VPS-disk en
 * ziet Luka hem niet in de Obsidian-tab.
 */
import { writeObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import {
  kluisPadVoorTaak,
  taakKluisTekst,
  type TaakKluisInhoud,
} from '@/domain/obsidian/kluisBoom';

export async function schrijfTaakKluis(in_: TaakKluisInhoud): Promise<string> {
  const path = kluisPadVoorTaak(in_.taskId);
  await writeObsidianNote({
    path,
    title: in_.title,
    content: taakKluisTekst(in_),
    tags: ['task', in_.agent, in_.tab ?? 'home'].filter(Boolean),
    source: 'axe',
    metadata: {
      taskId: in_.taskId,
      agent: in_.agent,
      device: in_.device ?? null,
      tab: in_.tab ?? 'home',
    },
  });
  return path;
}
