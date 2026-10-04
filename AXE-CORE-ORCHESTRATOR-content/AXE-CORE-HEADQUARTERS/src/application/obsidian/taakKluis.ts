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
import { WIE_WERKT, tabLabelVoorKluis } from '@/domain/obsidian/werkplek';

export async function schrijfTaakKluis(in_: TaakKluisInhoud): Promise<string> {
  const path = kluisPadVoorTaak(in_.taskId, in_.agent);
  const who = in_.who?.trim() || WIE_WERKT;
  const tab = tabLabelVoorKluis(in_.tab ?? 'home');
  await writeObsidianNote({
    path,
    title: in_.title,
    content: taakKluisTekst({ ...in_, who, tab }),
    tags: ['task', in_.agent, tab, in_.repo ?? ''].filter(Boolean),
    source: 'axe',
    metadata: {
      taskId: in_.taskId,
      agent: in_.agent,
      device: in_.device ?? null,
      tab,
      repo: in_.repo ?? null,
      who,
    },
  });
  return path;
}
