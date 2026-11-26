/**
 * 6.6a -- de I/O rond domain/memory/oogst: rapporten lezen, het artikel
 * schrijven in de map wiki, en nakijken dat het er echt staat (het
 * geheugenhek kan een schrijfactie stil weigeren).
 */
import { sbGetRows } from '@/infrastructure/gateways/axeCoreApiService';
import { remember } from '@/infrastructure/persistence/agentMemoryService';
import { oogstArtikel, oogstOpdracht, type RapportRij } from '@/domain/memory/oogst';

export async function oogstProject(project: string): Promise<string> {
  const rijen = await sbGetRows<RapportRij>('memory', {
    filterCol: 'category', filterVal: 'projects', orderBy: 'created_at', orderDir: 'desc', limit: 500,
  });
  const artikel = oogstArtikel(project, rijen ?? []);
  if (!artikel) return `Ik vond geen rapporten van "${project}". Rapporten ontstaan als een taak klaar is of stopt; probeer de naam van de app of manager (Trading OS, NorthSea, AXE CORE).`;
  const ok = await remember({
    kind: 'doc', category: 'wiki', key: artikel.sleutel, content: artikel.inhoud,
    tags: ['wiki', 'oogst', project.toLowerCase()], source: 'oogst', importance: 0.8,
  });
  const wiki = ok ? await sbGetRows<{ key: string }>('memory', {
    filterCol: 'category', filterVal: 'wiki', orderBy: 'created_at', orderDir: 'desc', limit: 50,
  }).catch(() => []) : [];
  if (!wiki.some((r) => r.key.startsWith(artikel.sleutel))) {
    return `Ik heb het artikel gemaakt (${artikel.aantal} rapporten), maar het geheugen heeft het niet bewaard. Waarschijnlijk zit de daglimiet erop; probeer het morgen nog eens.`;
  }
  return `Wiki-artikel "${project}" staat in het geheugen (${artikel.sleutel}): ${artikel.aantal} rapporten samengevoegd, ${artikel.klaar} klaar en ${artikel.aantal - artikel.klaar} gestopt. Je vindt het onder Memory; de losse rapporten blijven staan.`;
}

/** "oogst Trading OS" uit de chat. Null = geen oogst-opdracht. */
export async function oogstBeurt(tekst: string): Promise<string | null> {
  const o = oogstOpdracht(tekst);
  if (!o) return null;
  try {
    return await oogstProject(o.project);
  } catch (e) {
    return `Oogsten lukte niet: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
  }
}
