/** Voert "keur alles goed" uit: alles wat met één ja kan, in één keer. Zie domain/approvals/allesGoedkeuren.ts. */
import type { AllesUitkomst } from '@/domain/approvals/allesGoedkeuren';
import { haalWachtOpJou } from '@/application/approvals/wachtOpJou';
import { beslisApproval } from '@/application/approvals/beslisAgentOk';
import { northseaMensGoedkeuren } from '@/infrastructure/gateways/axeCoreApiService';

export async function keurAllesGoed(alleen?: 'northsea'): Promise<AllesUitkomst> {
  const { items } = await haalWachtOpJou();
  const uit: AllesUitkomst = { verstuurd: 0, axeGoedgekeurd: 0, mislukt: [], overgeslagen: 0 };

  const mails = items.filter((i) => i.kanVersturen && i.approvalId);
  for (let i = 0; i < mails.length; i += 50) {
    const r = await northseaMensGoedkeuren(mails.slice(i, i + 50).map((m) => m.approvalId as string));
    uit.verstuurd += r.sent;
    for (const x of r.results) if (!x.ok) uit.mislukt.push(x.message ?? x.code ?? 'onbekend');
  }

  if (alleen !== 'northsea') {
    for (const a of items.filter((i) => i.kanHierBeslissen && i.taskId)) {
      try {
        await beslisApproval(a.taskId as string, a.id.replace(/^axe:/, ''), true, 'Approved by Luka in chat ("keur alles goed").');
        uit.axeGoedgekeurd += 1;
      } catch (e) {
        uit.mislukt.push(`${a.wat}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  uit.overgeslagen = items.filter((i) => !i.kanVersturen && !i.kanHierBeslissen
    && (alleen !== 'northsea' || i.bron === 'northsea')).length;
  return uit;
}
