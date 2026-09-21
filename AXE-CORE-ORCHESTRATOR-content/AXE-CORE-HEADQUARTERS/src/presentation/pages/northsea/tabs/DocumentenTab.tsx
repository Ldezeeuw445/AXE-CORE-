/**
 * Documents: deal-documenten en binnengekomen bijlagen.
 *
 * `deal_documents` is (september 2026) leeg; er zijn 4 bijlagen uit inkomende
 * e-mail. Die staan hier als "Received — not classified", niet als bewijs:
 * document en bewijs zijn verschillende dingen (POLICIES.md, DOCUMENT_STANDARDS.md).
 * De kolommen van inbound_email_attachments liggen niet vast in de query, dus de
 * velden worden defensief gelezen.
 */
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Paperclip } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { tijdGeleden } from '@/domain/northsea/chase';
import { past, tel } from '@/domain/northsea/tabs/lijsten';
import { mensLabel, type Badge } from '@/domain/northsea/tabs/status';
import type { Bijlage, DealDocument } from '@/domain/northsea/tabs/typen';
import {
  DetailPaneel, Filters, FoutRegel, Kengetal, KengetalRij, LegeStaat, StatusChip, Veld, VerversKnop, Vlak, Zoekveld,
} from './bouwstenen';
import { useNorthseaTab } from './useNorthseaTab';

interface Rij {
  id: string;
  bron: 'document' | 'bijlage';
  naam: string;
  soort: string;
  deal: string | null;
  status: Badge;
  grootte: number | null;
  op: string | null;
  url: string | null;
  ruw: DealDocument | Bijlage;
}

const tekst = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const getalOfNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

function documentStatus(status: string | null | undefined): Badge {
  const s = (status ?? '').trim().toLowerCase();
  if (['verified', 'signed', 'approved'].includes(s)) return { sleutel: s, label: mensLabel(s), toon: 'groen', betekenis: 'Confirmed.' };
  if (['expired', 'rejected', 'invalid'].includes(s)) return { sleutel: s, label: mensLabel(s), toon: 'rood', betekenis: 'Not usable.', volgende: 'Request a replacement' };
  if (['required', 'requested', 'missing'].includes(s)) return { sleutel: s, label: mensLabel(s), toon: 'oranje', betekenis: 'Needed and not received.', volgende: 'Request the document' };
  if (['under_review', 'reviewing', 'pending', 'received'].includes(s)) return { sleutel: s, label: mensLabel(s), toon: 'geel', betekenis: 'Received, review pending.', volgende: 'Review the document' };
  return { sleutel: s || 'unknown', label: s ? mensLabel(s) : 'Unknown', toon: 'grijs', betekenis: 'No status recorded.' };
}

function naarRijen(documenten: readonly DealDocument[], bijlagen: readonly Bijlage[]): Rij[] {
  const uit: Rij[] = documenten.map(d => ({
    id: `doc-${d.id}`, bron: 'document', naam: tekst(d.pad)?.split('/').pop() ?? mensLabel(d.soort),
    soort: mensLabel(d.soort), deal: tekst(d.deal_code) ?? (d.deal_id ? `#${d.deal_id.slice(0, 6)}` : null),
    status: documentStatus(d.status), grootte: null, op: d.updated_at ?? d.created_at ?? null, url: tekst(d.url), ruw: d,
  }));
  for (const [i, b] of bijlagen.entries()) {
    const naam = tekst(b.filename) ?? tekst(b.file_name) ?? tekst(b.name) ?? tekst(b.original_filename) ?? `Attachment ${i + 1}`;
    uit.push({
      id: `bij-${tekst(b.id) ?? i}`, bron: 'bijlage', naam,
      soort: tekst(b.content_type) ?? tekst(b.mime_type) ?? 'Email attachment',
      deal: null,
      status: { sleutel: 'received', label: 'Received — not classified', toon: 'geel', betekenis: 'Arrived by email; not classified or linked to a deal yet.', volgende: 'Classify and link to a deal' },
      grootte: getalOfNull(b.size) ?? getalOfNull(b.size_bytes) ?? getalOfNull(b.bytes_size),
      op: tekst(b.created_at) ?? tekst(b.received_at), url: null, ruw: b,
    });
  }
  return uit.sort((a, b) => (Date.parse(b.op ?? '') || 0) - (Date.parse(a.op ?? '') || 0));
}

const grootteTekst = (n: number | null) => (n === null ? null : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function DocumentenTab() {
  const { data, fout, bezig, ververs } = useNorthseaTab('documenten');
  const [zoek, setZoek] = useState('');
  const [bron, setBron] = useState<'alle' | 'document' | 'bijlage'>('alle');
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const alle = useMemo(() => (data ? naarRijen(data.documenten ?? [], data.bijlagen ?? []) : []), [data]);
  const rijen = alle.filter(r => (bron === 'alle' || r.bron === bron) && past(zoek, r.naam, r.soort, r.deal));
  const statussen = tel(alle, r => r.status.label);
  const detail = gekozen ? alle.find(r => r.id === gekozen) ?? null : null;
  const aantalDocs = data?.documenten?.length ?? 0;
  const aantalBijlagen = data?.bijlagen?.length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-2" data-axe-doel="northsea-documenten">
      <KengetalRij>
        <Kengetal waarde={data ? alle.length : '—'} label="Total" toon="blauw" />
        <Kengetal waarde={data ? aantalDocs : '—'} label="Deal documents" sub={data && aantalDocs === 0 ? 'None filed yet' : undefined} />
        <Kengetal waarde={data ? aantalBijlagen : '—'} label="Email attachments" toon="geel" sub={data ? 'Awaiting classification' : undefined} />
        <Kengetal waarde={data ? alle.filter(r => r.status.toon === 'oranje').length : '—'} label="Action required" toon="oranje" />
      </KengetalRij>

      <Vlak vul titel={<span className="flex items-center gap-2"><FileText size={15} style={{ color: '#94A3B8' }} />Documents</span>}
        sub="Deal documents and received attachments. A document is not evidence until it is verified."
        acties={(
          <>
            <div className="w-[240px]"><Zoekveld waarde={zoek} zet={setZoek} plaats="Search documents…" /></div>
            <VerversKnop bezig={bezig} ververs={ververs} />
          </>
        )}>
        <div className="px-4 pb-2">
          <Filters<'alle' | 'document' | 'bijlage'> opties={[
            { id: 'alle', label: 'All', aantal: alle.length },
            { id: 'document', label: 'Deal documents', aantal: aantalDocs },
            { id: 'bijlage', label: 'Email attachments', aantal: aantalBijlagen },
          ] as const} actief={bron} kies={setBron} />
        </div>
        {fout && <FoutRegel fout={fout} />}
        {!fout && !data && <LegeStaat titel="Loading documents…" />}
        {data && rijen.length === 0 && (
          <LegeStaat icoon={<FileText size={22} />} titel={alle.length === 0 ? 'No documents yet' : 'No documents match'}
            uitleg={alle.length === 0 ? 'Documents appear here once they are filed against a deal (deal_documents) or received by email.' : 'Change the filter or the search.'} />
        )}
        {rijen.length > 0 && (
          <table className="w-full table-fixed border-collapse text-[12px]" style={{ minWidth: 720 }}>
            <colgroup><col /><col style={{ width: 170 }} /><col style={{ width: 96 }} /><col style={{ width: 80 }} /><col style={{ width: 190 }} /><col style={{ width: 92 }} /></colgroup>
            <thead className="sticky top-0 z-[1]" style={{ background: 'var(--axe-vak-vlak)' }}>
              <tr>{['File', 'Type', 'Deal', 'Size', 'Status', 'Updated'].map(k => (
                <th key={k} className="truncate px-3 py-1.5 text-left text-[10.5px] font-medium" style={{ color: 'var(--text-muted)' }}>{k}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rijen.map(r => (
                <tr key={r.id} onClick={() => setGekozen(r.id)} className="cursor-pointer hover:bg-white/[0.03]"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.035)',
                    background: gekozen === r.id ? 'rgba(255,255,255,0.05)' : undefined,
                    boxShadow: gekozen === r.id ? 'inset 2px 0 0 var(--accent-cyan)' : undefined }}>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-primary)' }}>
                    <span className="inline-flex max-w-full items-center gap-2">
                      {r.bron === 'bijlage' ? <Paperclip size={12} style={{ color: 'var(--text-muted)' }} /> : <FileText size={12} style={{ color: 'var(--text-muted)' }} />}
                      <span className="truncate" title={r.naam}>{r.naam}</span>
                    </span>
                  </td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{r.soort}</td>
                  <td className="truncate px-3 py-2 font-mono-data" style={{ color: 'var(--text-secondary)' }}>{r.deal ?? '—'}</td>
                  <td className="truncate px-3 py-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>{grootteTekst(r.grootte) ?? '—'}</td>
                  <td className="truncate px-3 py-2"><StatusChip badge={r.status} klein /></td>
                  <td className="truncate px-3 py-2" style={{ color: 'var(--text-muted)' }}>{r.op ? tijdGeleden(r.op, nu) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Vlak>

      <TabRail kant="rechts" vast={!!detail}>
        {detail ? (
          <DetailPaneel titel={detail.naam} sub={detail.soort} sluit={() => setGekozen(null)}>
            <div className="mb-3"><StatusChip badge={detail.status} /></div>
            <Veld label="Source">{detail.bron === 'bijlage' ? 'Inbound email attachment' : 'Deal document'}</Veld>
            <Veld label="Deal">{detail.deal}</Veld>
            <Veld label="Size">{grootteTekst(detail.grootte)}</Veld>
            <Veld label="Updated">{detail.op ? tijdGeleden(detail.op, nu) : null}</Veld>
            {detail.url && (
              <a href={detail.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--accent-cyan)' }}>
                Open document <ExternalLink size={12} />
              </a>
            )}
            {detail.status.volgende && <div className="mt-3 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Next: {detail.status.volgende}</div>}
          </DetailPaneel>
        ) : (
          <DetailPaneel titel="Document status" sub="Select a document for details">
            {statussen.length === 0 && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{data ? 'Nothing filed yet.' : 'Loading…'}</div>}
            <div className="flex flex-col gap-1.5 text-[12px]">
              {statussen.map(s => (
                <div key={s.sleutel} className="flex items-center gap-2">
                  <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{s.sleutel}</span>
                  <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>{s.aantal}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Naming standard: NS-{'{DEAL_ID}'}-{'{DOCTYPE}'}-{'{COUNTERPARTY}'}-{'{YYYYMMDD}'}-v{'{N}'}
            </div>
          </DetailPaneel>
        )}
      </TabRail>
    </div>
  );
}
