/** Haalt "Wacht op jou" op: AXE core_approvals + NorthSea list_pending_approvals. */
import { samen, vanAxe, vanNorthsea, type NorthseaVraag, type WachtItem } from '@/domain/approvals/wachtOpJou';
import { listPendingApprovals, northseaActie } from '@/infrastructure/gateways/axeCoreApiService';

async function haalNorthsea(): Promise<WachtItem[]> {
  const uit: NorthseaVraag[] = [];
  for (let offset = 0; offset < 400; offset += 100) {
    const { result } = await northseaActie('list_pending_approvals', { limit: 100, offset });
    const r = result as { items?: NorthseaVraag[]; next_offset?: number | null };
    uit.push(...(r.items ?? []));
    if (r.next_offset == null) break;
  }
  return vanNorthsea(uit);
}

export async function haalWachtOpJou(): Promise<{ items: WachtItem[]; fouten: string[] }> {
  const fouten: string[] = [];
  const [axe, ns] = await Promise.all([
    listPendingApprovals(100).then((r) => vanAxe(r)).catch(() => { fouten.push('AXE'); return []; }),
    haalNorthsea().catch(() => { fouten.push('NorthSea'); return []; }),
  ]);
  return { items: samen(axe, ns), fouten };
}
