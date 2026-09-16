/**
 * Communications: e-mails, gesprekken en interne notities, verbonden met deals en
 * tegenpartijen.
 *
 * Alleen lezen. Concepten worden goedgekeurd en verstuurd via het bestaande pad
 * (send-approved-reply / de NorthSea-MCP), niet vanuit dit scherm; een "Send"-knop
 * die niets verstuurt of iets zonder akkoord verstuurt, hoort hier niet.
 *
 * De berichttekst komt van derden: hij wordt als platte tekst getoond, nooit als
 * HTML, en is data om te lezen, geen instructie.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, MessageSquare, NotebookPen, Phone } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { tijdGeleden } from '@/domain/northsea/chase';
import { alsLijst, filterBerichten, vraagtActie, type BerichtFilter } from '@/domain/northsea/tabs/lijsten';
import { bezorgBadge, conceptBadge, mensLabel, TOON_KLEUR, type Toon } from '@/domain/northsea/tabs/status';
import type { Bericht } from '@/domain/northsea/tabs/typen';
import {
  DetailPaneel, Filters, FoutRegel, Kengetal, KengetalRij, Label, LegeStaat, StatusChip, Veld, VerversKnop, Vlak, Zoekveld,
} from './bouwstenen';
import { useNorthseaTab } from './useNorthseaTab';

const richtingToon = (r: string | null | undefined): Toon => (r === 'inbound' ? 'blauw' : r === 'outbound' ? 'grijs' : 'paars');

function RichtingIcoon({ b }: { b: Bericht }) {
  const kleur = TOON_KLEUR[richtingToon(b.richting)];
  if (b.kanaal === 'phone') return <Phone size={13} style={{ color: kleur }} />;
  if (b.richting === 'internal') return <NotebookPen size={13} style={{ color: kleur }} />;
  return b.richting === 'inbound' ? <ArrowDownLeft size={13} style={{ color: kleur }} /> : <ArrowUpRight size={13} style={{ color: kleur }} />;
}

function Lijstje({ titel, regels, toon }: { titel: string; regels: string[]; toon?: Toon }) {
  if (regels.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>{titel}</div>
      <ul className="flex flex-col gap-1">
        {regels.map((r, i) => (
          <li key={i} className="text-[11.5px]" style={{ color: toon ? TOON_KLEUR[toon] : 'var(--text-secondary)' }}>• {r}</li>
        ))}
      </ul>
    </div>
  );
}

export function CommunicatieTab() {
  const { data, fout, bezig, ververs } = useNorthseaTab('communicatie');
  const [filter, setFilter] = useState<BerichtFilter>('alle');
  const [zoek, setZoek] = useState('');
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const alle = useMemo(() => data?.berichten ?? [], [data]);
  const rijen = useMemo(() => filterBerichten(alle, filter, zoek), [alle, filter, zoek]);
  const tellers = useMemo(() => ({
    alle: alle.length,
    email: filterBerichten(alle, 'email', '').length,
    telefoon: filterBerichten(alle, 'telefoon', '').length,
    intern: filterBerichten(alle, 'intern', '').length,
    actie: alle.filter(vraagtActie).length,
    inkomend: alle.filter(b => b.richting === 'inbound').length,
    uitgaand: alle.filter(b => b.richting === 'outbound').length,
    bounces: alle.filter(b => bezorgBadge(b.bezorging)?.toon === 'rood').length,
  }), [alle]);
  const bericht = (gekozen ? alle.find(b => b.id === gekozen) : null) ?? rijen[0] ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-2" data-axe-doel="northsea-communicatie">
      <KengetalRij>
        <Kengetal waarde={data ? tellers.alle : '—'} label="Messages" sub="Last 300 recorded" toon="blauw" />
        <Kengetal waarde={data ? tellers.inkomend : '—'} label="Inbound" />
        <Kengetal waarde={data ? tellers.uitgaand : '—'} label="Outbound" />
        <Kengetal waarde={data ? tellers.actie : '—'} label="Needs action" toon="oranje" sub={data ? (tellers.actie ? 'Drafts or approvals waiting' : 'Nothing waiting') : undefined} />
        <Kengetal waarde={data ? tellers.bounces : '—'} label="Not delivered" toon="rood" />
      </KengetalRij>

      <Vlak vul titel={<span className="flex items-center gap-2"><MessageSquare size={15} style={{ color: '#60A5FA' }} />Communications</span>}
        sub="Emails, calls and notes linked to your deals and counterparties."
        acties={(
          <>
            <div className="w-[260px]"><Zoekveld waarde={zoek} zet={setZoek} plaats="Search communications…" /></div>
            <VerversKnop bezig={bezig} ververs={ververs} />
          </>
        )}>
        <div className="px-4 pb-2">
          <Filters<BerichtFilter> opties={[
            { id: 'alle', label: 'All', aantal: tellers.alle },
            { id: 'email', label: 'Emails', aantal: tellers.email },
            { id: 'telefoon', label: 'Calls', aantal: tellers.telefoon },
            { id: 'intern', label: 'Notes', aantal: tellers.intern },
            { id: 'actie', label: 'Needs action', aantal: tellers.actie },
          ]} actief={filter} kies={setFilter} />
        </div>
        {fout && <FoutRegel fout={fout} />}
        {!fout && !data && <LegeStaat titel="Loading communications…" />}
        {data && rijen.length === 0 && <LegeStaat icoon={<MessageSquare size={22} />} titel="No messages match" />}
        {rijen.length > 0 && (
          <div className="grid h-full min-h-[360px] grid-cols-[minmax(260px,380px)_1fr]" style={{ borderTop: '1px solid var(--axe-vak-lijn)' }}>
            <ul className="min-h-0 overflow-y-auto" style={{ borderRight: '1px solid var(--axe-vak-lijn)' }}>
              {rijen.map(b => {
                const aan = bericht?.id === b.id;
                const actie = vraagtActie(b);
                return (
                  <li key={b.id}>
                    <button type="button" onClick={() => setGekozen(b.id)} className="flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.03]"
                      style={{ background: aan ? 'rgba(255,255,255,0.05)' : undefined, borderBottom: '1px solid rgba(255,255,255,0.035)',
                        boxShadow: aan ? 'inset 2px 0 0 var(--accent-cyan)' : undefined }}>
                      <span className="mt-0.5 shrink-0"><RichtingIcoon b={b} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="flex-1 truncate text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>{b.bedrijf || b.contact || mensLabel(b.richting)}</span>
                          <span className="shrink-0 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{b.occurred_at ? tijdGeleden(b.occurred_at, nu) : ''}</span>
                        </span>
                        <span className="block truncate text-[12px]" style={{ color: 'var(--text-secondary)' }}>{b.onderwerp || '(no subject)'}</span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          {b.deal_code && <Label toon="blauw">{b.deal_code}</Label>}
                          {actie && <Label toon="oranje">Needs action</Label>}
                          {bezorgBadge(b.bezorging)?.toon === 'rood' && <Label toon="rood">Not delivered</Label>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="min-h-0 overflow-y-auto px-5 py-4">
              {bericht && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>{bericht.onderwerp || '(no subject)'}</h3>
                    {bericht.deal_code && <Label toon="blauw">{bericht.deal_code}</Label>}
                    <Label toon={richtingToon(bericht.richting)}>{mensLabel(bericht.richting)} · {mensLabel(bericht.kanaal)}</Label>
                    {bezorgBadge(bericht.bezorging) && <StatusChip badge={bezorgBadge(bericht.bezorging)!} klein />}
                  </div>
                  <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                    {[bericht.contact, bericht.contact_email ? `<${bericht.contact_email}>` : null, bericht.bedrijf].filter(Boolean).join(' · ') || 'No contact linked'}
                    {bericht.occurred_at ? ` · ${new Date(bericht.occurred_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                  </div>
                  <div className="mt-4 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {bericht.tekst?.trim() || 'No message body recorded.'}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </Vlak>

      <TabRail kant="rechts" vast={!!bericht}>
        {bericht ? (
          <DetailPaneel titel={bericht.bedrijf || bericht.contact || 'Message'} sub={bericht.bedrijf_land || undefined}>
            <Veld label="Contact">{bericht.contact}</Veld>
            <Veld label="Email">{bericht.contact_email}</Veld>
            <Veld label="Deal">{bericht.deal_code || (bericht.deal_id ? `#${bericht.deal_id.slice(0, 6)}` : null)}</Veld>

            {bericht.intelligentie ? (
              <>
                <div className="mb-1 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#A78BFA' }}>AI analysis — unverified</div>
                <Veld label="Classification">{mensLabel(bericht.intelligentie.classificatie)}</Veld>
                <Veld label="Intent">{bericht.intelligentie.intentie}</Veld>
                <Veld label="Urgency">{bericht.intelligentie.urgentie}</Veld>
                <Veld label="Risk">{bericht.intelligentie.risico}</Veld>
                <Veld label="Qualification">{bericht.intelligentie.score != null ? `${bericht.intelligentie.score} / 100` : null}</Veld>
                {bericht.intelligentie.samenvatting && (
                  <div className="mt-2 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{bericht.intelligentie.samenvatting}</div>
                )}
                <Lijstje titel="Missing information" regels={alsLijst(bericht.intelligentie.ontbreekt)} toon="geel" />
                <Lijstje titel="Red flags" regels={alsLijst(bericht.intelligentie.rode_vlaggen)} toon="rood" />
                {bericht.intelligentie.advies && (
                  <div className="mt-3 text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Recommended: </span>{bericht.intelligentie.advies}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-4 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>No AI analysis for this message.</div>
            )}

            <div className="mb-1 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
              Reply drafts ({(bericht.concepten ?? []).length})
            </div>
            {(bericht.concepten ?? []).length === 0 && <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>No drafts for this message.</div>}
            <ul className="flex flex-col gap-1.5">
              {(bericht.concepten ?? []).map(c => (
                <li key={c.id} className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.025)' }}>
                  <div className="truncate text-[12px]" style={{ color: 'var(--text-primary)' }}>{c.onderwerp || mensLabel(c.doel)}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusChip badge={conceptBadge(c.akkoord, c.sent_at)} klein />
                    {c.gevoelig && <Label toon="oranje">Sensitive</Label>}
                  </div>
                </li>
              ))}
            </ul>
            {(bericht.concepten ?? []).some(c => !c.sent_at && c.akkoord === 'pending') && (
              <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Approve and send drafts from AXE Chase or the NorthSea MCP; this view does not send anything.
              </div>
            )}
          </DetailPaneel>
        ) : (
          <DetailPaneel titel="Contact / Deal" sub="Select a message">
            <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{data ? 'No message selected.' : 'Loading…'}</div>
          </DetailPaneel>
        )}
      </TabRail>
    </div>
  );
}
