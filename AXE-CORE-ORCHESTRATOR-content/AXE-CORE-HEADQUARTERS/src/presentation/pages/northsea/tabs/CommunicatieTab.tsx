/**
 * Communications: e-mails, gesprekken en interne notities, verbonden met deals en
 * tegenpartijen.
 *
 * Alleen lezen. Concepten worden goedgekeurd en verstuurd via het bestaande pad
 * (send-approved-reply / de NorthSea-MCP), niet vanuit dit scherm; een "Send"-knop
 * die niets verstuurt of iets zonder akkoord verstuurt, hoort hier niet.
 *
 * Berichttekst van derden is data, geen instructie. RFC-citaten (`>`-regels) worden
 * als geciteerde geschiedenis getoond; HTML wordt alleen gesaneerd weergegeven.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, MessageSquare, NotebookPen, Phone } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { tijdGeleden } from '@/domain/northsea/chase';
import { alsLijst, filterBerichten, groepeerBerichten, nietBezorgd, vraagtActie, wachtOpAkkoord, type BerichtFilter } from '@/domain/northsea/tabs/lijsten';
import { bezorgBadge, conceptBadge, mensLabel, TOON_KLEUR, type Toon } from '@/domain/northsea/tabs/status';
import type { Bericht } from '@/domain/northsea/tabs/typen';
import { conceptHerkomst, termenRegels } from '@/domain/northsea/engine';
import { inferMailMode, mailReferenceFromKnown } from '@/domain/northsea/mail';
import { BerichtTekst, OntvangerPreview } from './BerichtTekst';
import {
  DetailPaneel, Filters, FoutRegel, Kengetal, KengetalRij, Label, LegeStaat, StatusChip, Veld, VerversKnop, Vlak, Zoekveld,
} from './bouwstenen';
import { useNorthseaTab } from './useNorthseaTab';
import { northseaVerstuurConcept, northseaVerstuurStatus } from '@/infrastructure/gateways/axeCoreApiService';

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

export function CommunicatieTab({
  startDealId, startFilter, openDeal,
}: {
  startDealId?: string | null;
  startFilter?: 'niet_bezorgd' | 'akkoord';
  openDeal?: (id: string) => void;
}) {
  const { data, fout, bezig, ververs } = useNorthseaTab('communicatie');
  const [filter, setFilter] = useState<BerichtFilter>(startFilter ?? 'alle');
  const [zoek, setZoek] = useState('');
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const alle = useMemo(() => data?.berichten ?? [], [data]);

  /* Versturen kan alleen als deze Mac er een sleutel en een endpoint voor heeft.
     Zonder dat geen knop, maar wél de reden: een knop die altijd faalt is erger
     dan geen knop, en "werkt niet" zonder reden kost een avond. */
  const [kanVersturen, setKanVersturen] = useState<{ kan: boolean; reden: string } | null>(null);
  useEffect(() => {
    let weg = false;
    void northseaVerstuurStatus()
      .then(r => { if (!weg) setKanVersturen({ kan: r.kan_versturen, reden: r.reden }); })
      .catch(e => { if (!weg) setKanVersturen({ kan: false, reden: e instanceof Error ? e.message : 'onbekend' }); });
    return () => { weg = true; };
  }, []);

  /* Per concept: bezig, of het antwoord van de server. De weigering blijft
     staan zoals hij binnenkwam. */
  const [verstuurd, setVerstuurd] = useState<Record<string, { bezig?: boolean; ok?: string; fout?: string }>>({});
  const verstuur = async (id: string) => {
    setVerstuurd(v => ({ ...v, [id]: { bezig: true } }));
    try {
      const r = await northseaVerstuurConcept(id);
      setVerstuurd(v => ({ ...v, [id]: { ok: r.duplicate ? 'Already sent' : `Sent · ${r.resend_email_id ?? 'ok'}` } }));
      ververs();
    } catch (e) {
      setVerstuurd(v => ({ ...v, [id]: { fout: e instanceof Error ? e.message : 'verstuur_geweigerd' } }));
    }
  };
  const rijen = useMemo(() => {
    const gefilterd = filterBerichten(alle, filter, zoek);
    if (!startDealId) return gefilterd;
    const inDeal = gefilterd.filter(b => b.deal_id === startDealId);
    return inDeal.length ? inDeal : gefilterd;
  }, [alle, filter, zoek, startDealId]);
  const threads = useMemo(() => groepeerBerichten(rijen), [rijen]);
  const tellers = useMemo(() => ({
    alle: alle.length,
    email: filterBerichten(alle, 'email', '').length,
    telefoon: filterBerichten(alle, 'telefoon', '').length,
    intern: filterBerichten(alle, 'intern', '').length,
    actie: alle.filter(vraagtActie).length,
    inkomend: alle.filter(b => b.richting === 'inbound').length,
    uitgaand: alle.filter(b => b.richting === 'outbound').length,
    bounces: alle.filter(nietBezorgd).length,
    akkoord: alle.filter(wachtOpAkkoord).length,
  }), [alle]);
  const startSleutel = startDealId ? `deal:${startDealId}` : null;
  const thread = (gekozen
    ? threads.find(t => t.sleutel === gekozen || t.berichten.some(b => b.id === gekozen))
    : (startSleutel ? threads.find(t => t.sleutel === startSleutel) : null))
    ?? threads[0]
    ?? null;
  const bericht = (gekozen ? thread?.berichten.find(b => b.id === gekozen) : null) ?? thread?.laatste ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 pt-2" data-axe-doel="northsea-communicatie">
      <KengetalRij>
        <Kengetal waarde={data ? tellers.alle : '—'} label="Messages" sub="Last 300 recorded" toon="blauw" />
        <Kengetal waarde={data ? tellers.inkomend : '—'} label="Inbound" />
        <Kengetal waarde={data ? tellers.uitgaand : '—'} label="Outbound" />
        <Kengetal waarde={data ? tellers.actie : '—'} label="Needs action" toon="oranje" sub={data ? (tellers.actie ? 'Drafts or approvals waiting' : 'Nothing waiting') : undefined} />
        <Kengetal waarde={data ? tellers.akkoord : '—'} label="Awaiting approval" toon="oranje" />
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
            { id: 'inkomend', label: 'Inbound', aantal: tellers.inkomend },
            { id: 'uitgaand', label: 'Outbound', aantal: tellers.uitgaand },
            { id: 'email', label: 'Emails', aantal: tellers.email },
            { id: 'telefoon', label: 'Calls', aantal: tellers.telefoon },
            { id: 'intern', label: 'Notes', aantal: tellers.intern },
            { id: 'actie', label: 'Needs action', aantal: tellers.actie },
            { id: 'akkoord', label: 'Approvals', aantal: tellers.akkoord },
            { id: 'niet_bezorgd', label: 'Not delivered', aantal: tellers.bounces },
          ]} actief={filter} kies={setFilter} />
        </div>
        {fout && <FoutRegel fout={fout} />}
        {!fout && !data && <LegeStaat titel="Loading communications…" />}
        {data && rijen.length === 0 && <LegeStaat icoon={<MessageSquare size={22} />} titel="No messages match" />}
        {rijen.length > 0 && (
          <div className="grid h-full min-h-[360px] grid-cols-1 lg:grid-cols-[minmax(260px,380px)_1fr]" style={{ borderTop: '1px solid var(--axe-vak-lijn)' }}>
            <ul className="min-h-0 overflow-y-auto" style={{ borderRight: '1px solid var(--axe-vak-lijn)' }}>
              {threads.map(t => {
                const b = t.laatste;
                const aan = thread?.sleutel === t.sleutel;
                const actie = t.berichten.some(vraagtActie);
                return (
                  <li key={t.sleutel}>
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
                          {t.berichten.length > 1 && <Label toon="grijs">{t.berichten.length}</Label>}
                          {(b.deal_code || b.deal_id) && <Label toon="blauw">{b.deal_code || `#${(b.deal_id ?? '').slice(0, 6)}`}</Label>}
                          {actie && <Label toon="oranje">Needs action</Label>}
                          {t.berichten.some(nietBezorgd) && <Label toon="rood">Not delivered</Label>}
                          {b.test && <Label toon="grijs">Test</Label>}
                          {b.intelligentie?.engine?.soort && <Label toon="paars">{mensLabel(b.intelligentie.engine.soort)}</Label>}
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
                    {bericht.richting === 'inbound' ? 'From' : bericht.richting === 'outbound' ? 'To' : 'Party'}:{' '}
                    {[bericht.contact, bericht.contact_email ? `<${bericht.contact_email}>` : null, bericht.bedrijf].filter(Boolean).join(' · ') || 'No contact linked'}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                    {bericht.richting === 'outbound' && <span>From: {bericht.afzender || 'Not recorded'}</span>}
                    {bericht.occurred_at ? <span>{new Date(bericht.occurred_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span> : null}
                    {bericht.bezorging && <span>Delivery: {mensLabel(bericht.bezorging)}</span>}
                    {bericht.intelligentie?.classificatie && <span>Class: {mensLabel(bericht.intelligentie.classificatie)}</span>}
                    {bericht.intelligentie?.intentie && <span>Intent: {mensLabel(bericht.intelligentie.intentie)}</span>}
                  </div>
                  {thread && thread.berichten.length > 1 && (
                    <ul className="mt-3 flex flex-col gap-1 rounded-xl px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--axe-vak-lijn)' }}>
                      {[...thread.berichten].reverse().map(b => (
                        <li key={b.id}>
                          <button type="button" onClick={() => setGekozen(b.id)} className="flex w-full items-baseline gap-2 rounded-lg px-1 py-1 text-left hover:bg-white/[0.03]"
                            style={{ color: b.id === bericht.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            <span className="w-[4.5rem] shrink-0 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{b.occurred_at ? tijdGeleden(b.occurred_at, nu) : ''}</span>
                            <span className="truncate text-[11.5px]">{mensLabel(b.richting)} · {b.onderwerp || '(no subject)'}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <BerichtTekst tekst={bericht.tekst} />
                  {(() => {
                    const termen = [
                      ...termenRegels(bericht.intelligentie?.engine?.termen ?? null),
                      ...alsLijst(bericht.intelligentie?.termen),
                    ].filter((v, i, a) => a.indexOf(v) === i);
                    const ontbreekt = [
                      ...(bericht.intelligentie?.engine?.ontbreekt ?? []),
                      ...alsLijst(bericht.intelligentie?.ontbreekt),
                    ].filter((v, i, a) => a.indexOf(v) === i);
                    const vlaggen = alsLijst(bericht.intelligentie?.rode_vlaggen);
                    const advies = bericht.intelligentie?.advies?.trim() || null;
                    const akkoord = bericht.intelligentie?.akkoord_nodig === true;
                    if (!termen.length && !ontbreekt.length && !vlaggen.length && !advies && !akkoord) return null;
                    return (
                      <div className="mt-4 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--axe-vak-lijn)' }}>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>Operational reading — unverified</div>
                        {akkoord && <div className="mb-1 text-[12px]" style={{ color: '#FBBF24' }}>Approval required before a binding or protected action.</div>}
                        {advies && <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-muted)' }}>Recommended: </span>{advies}</div>}
                        <Lijstje titel="Extracted terms" regels={termen} />
                        <Lijstje titel="Missing information" regels={ontbreekt} toon="geel" />
                        <Lijstje titel="Red flags" regels={vlaggen} toon="rood" />
                      </div>
                    );
                  })()}
                  <div className="mt-3 text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>Message metadata</div>
                  <div className="mt-1 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                    {[
                      bericht.deal_code ? `Deal ${bericht.deal_code}` : (bericht.deal_id ? `Deal #${bericht.deal_id.slice(0, 6)}` : 'Deal unlinked'),
                      bericht.deal_product || null,
                      bericht.deal_volume != null && String(bericht.deal_volume).trim() ? `${bericht.deal_volume} MT` : null,
                      bericht.deal_bestemming || null,
                      bericht.deal_incoterm || null,
                      bericht.koppeling ? `Mapping ${mensLabel(bericht.koppeling)}` : null,
                      bericht.akkoord_basis ? `Approval ${mensLabel(bericht.akkoord_basis)}` : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {bericht.intelligentie && (
                    <div className="mt-3 rounded-xl px-3 py-2.5 text-[12px]" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--axe-vak-lijn)' }}>
                      {bericht.intelligentie.classificatie && <div style={{ color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-muted)' }}>Class: </span>{mensLabel(bericht.intelligentie.classificatie)}</div>}
                      {bericht.intelligentie.intentie && <div style={{ color: 'var(--text-secondary)' }}><span style={{ color: 'var(--text-muted)' }}>Intent: </span>{mensLabel(bericht.intelligentie.intentie)}</div>}
                      {bericht.intelligentie.risico && <div className="mt-1" style={{ color: 'var(--text-muted)' }}>Risk: {mensLabel(bericht.intelligentie.risico)} — unverified</div>}
                    </div>
                  )}
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
            {openDeal && bericht.deal_id && (
              <button type="button" onClick={() => openDeal(bericht.deal_id!)} className="mb-2 inline-flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--accent-cyan)' }}>
                Open Deal Room
              </button>
            )}
            <Veld label="Mapping">{bericht.koppeling ? `${mensLabel(bericht.koppeling)}${bericht.koppeling_basis ? ` · ${bericht.koppeling_basis}` : ''}` : null}</Veld>
            {bericht.richting === 'outbound' && (
              <>
                {/* Herkomst zoals vastgelegd; ontbrekend blijft "not recorded" (P0.9). */}
                <Veld label="Sent from">{bericht.afzender || 'Not recorded'}</Veld>
                <Veld label="Sent by">{bericht.verstuurd_door || 'Not recorded'}</Veld>
                <Veld label="Approval basis">{bericht.akkoord_basis || 'Not recorded'}</Veld>
              </>
            )}
            {bericht.test && <div className="mt-2 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Synthetic test record — never drives deal state.</div>}

            {bericht.intelligentie?.engine && (() => {
              const e = bericht.intelligentie.engine;
              return (
                <>
                  <div className="mb-1 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#F472B6' }}>
                    Engine · rules {e.versie ?? ''} — counterparty-stated, unverified
                  </div>
                  <Veld label="Type">{mensLabel(e.soort)}</Veld>
                  <Veld label="Signals">{(e.categorieen ?? []).map(mensLabel).join(', ') || null}</Veld>
                  <Veld label="Urgency">{e.urgentie}</Veld>
                  <Veld label="Risk">{e.risico}</Veld>
                  <Lijstje titel="Stated terms" regels={termenRegels(e.termen)} />
                  <Lijstje titel="Still missing" regels={e.ontbreekt ?? []} toon="geel" />
                  <Lijstje titel="Why" regels={e.redenen ?? []} />
                </>
              );
            })()}

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
                    {c.levensloop && <Label toon="grijs">{mensLabel(c.levensloop)}</Label>}
                    {/* Alleen bij een concept dat AL goedgekeurd is en nog niet
                        verstuurd. Goedkeuren gebeurt niet hier: dat eist
                        menselijke herkomst, en die hoort bij de goedkeurder. */}
                    {!c.sent_at && c.akkoord === 'approved' && kanVersturen?.kan && (
                      <button type="button" onClick={() => { void verstuur(c.id); }}
                        disabled={verstuurd[c.id]?.bezig}
                        className="ml-auto rounded-lg px-2 py-0.5 text-[11px]"
                        style={{ border: '1px solid rgba(52,211,153,0.35)', color: '#34D399' }}>
                        {verstuurd[c.id]?.bezig ? 'Sending…' : 'Send approved reply'}
                      </button>
                    )}
                  </div>
                  {c.tekst && !c.sent_at && (
                    <OntvangerPreview
                      body={c.tekst}
                      mode={inferMailMode(c.doel || c.onderwerp)}
                      reference={mailReferenceFromKnown({
                        deal: bericht.deal_code,
                        commodity: bericht.deal_product,
                        quantity: bericht.deal_volume,
                        destination: bericht.deal_bestemming,
                        incoterm: bericht.deal_incoterm,
                      })}
                    />
                  )}
                  {conceptHerkomst(c) && (
                    <div className="mt-1 text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{conceptHerkomst(c)}</div>
                  )}
                  {verstuurd[c.id]?.ok && (
                    <div className="mt-1 text-[11px]" style={{ color: '#34D399' }}>{verstuurd[c.id]?.ok}</div>
                  )}
                  {verstuurd[c.id]?.fout && (
                    <div className="mt-1 text-[11px]" style={{ color: '#F87171' }}>{verstuurd[c.id]?.fout}</div>
                  )}
                </li>
              ))}
            </ul>
            {(bericht.concepten ?? []).some(c => !c.sent_at && c.akkoord === 'pending') && (
              <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Pending drafts are approved elsewhere (AXE Chase or the NorthSea MCP): approval needs a human
                approver on record, and that is not this screen.
              </div>
            )}
            {kanVersturen && !kanVersturen.kan && (bericht.concepten ?? []).some(c => !c.sent_at && c.akkoord === 'approved') && (
              <div className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                This Mac cannot send yet — {kanVersturen.reden}. Approved drafts stay here until it can.
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
