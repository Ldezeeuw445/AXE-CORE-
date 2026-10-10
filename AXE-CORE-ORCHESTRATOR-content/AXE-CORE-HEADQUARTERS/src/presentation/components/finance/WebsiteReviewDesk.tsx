import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Kaart, KaartRaster, SectieBlok, StatRij } from '@/presentation/components/layout/tabMaatstaf';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { loadReviewDesk, observationAge, type ReviewDeskSnapshot } from '@/infrastructure/persistence/reviewDeskService';

function stamp(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam' }).format(new Date(value));
}

export default function WebsiteReviewDesk() {
  const [report, setReport] = useState<ReviewDeskSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const pilot = report?.sections.find(section => section.title === 'Eerste betaalde pilot — weekdoel');
  const takeover = report?.sections.find(section => section.title === 'Native overname — actuele bouwstatus');
  const invalidate = useCallback(() => { ++generation.current; }, []);
  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const next = await loadReviewDesk();
      if (ticket === generation.current) setReport(next);
    } catch (err) {
      if (ticket === generation.current) {
        setReport(null);
        setError(err instanceof Error ? err.message : 'Report unavailable.');
      }
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const start = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 60000);
    const subscription = getSupabase()?.auth.onAuthStateChange(() => {
      ++generation.current;
      setReport(null);
      // Auth-callback verlaten voordat we de sessie opnieuw lezen.
      queueMicrotask(() => void refresh());
    });
    return () => { invalidate(); clearTimeout(start); clearInterval(timer); subscription?.data.subscription.unsubscribe(); };
  }, [refresh, invalidate]);

  return <div className="min-w-0 space-y-4" style={{ color: 'var(--text-secondary)' }}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Website Review Desk</h2>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="flex items-center gap-2 text-xs">
        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading…' : 'Refresh report'}
      </button>
    </div>
    <p className="text-xs">Private business analysis · Amsterdam time. Refresh loads the saved report; it does not check Gmail, Stripe or Metricool directly.</p>
    {error && <p role="alert" className="text-sm" style={{ color: 'var(--error)' }}>{error} No revenue or activity is inferred from a read error.</p>}
    {!loading && !error && !report && <Kaart titel="NO REPORT YET"><p className="text-sm">There is no Website Review Desk report for this signed-in account. No figures have been assumed.</p></Kaart>}
    {report && <>
      <p className="text-xs">Report updated {stamp(report.updatedAt)}. Each observation below has its own date.</p>
      <p className="text-sm whitespace-pre-wrap break-words">{report.summary}</p>
      <KaartRaster>
        {pilot && <Kaart titel="FIRST PAID PILOT"><p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{pilot.body}</p><p className="text-xs mt-3">Checked {stamp(pilot.asOf)}</p></Kaart>}
        <Kaart titel="NEXT SALES & DELIVERY ACTIONS">
          <ol className="list-decimal pl-5 space-y-3 text-sm">{report.actions.map((action, i) => <li key={i} className="break-words">{action}</li>)}</ol>
        </Kaart>
      </KaartRaster>
      {takeover && <Kaart titel="AUTOMATION — VERIFIED PROGRESS"><p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{takeover.body}</p><p className="text-xs mt-3">Checked {stamp(takeover.asOf)}</p></Kaart>}
      <StatRij>{report.metrics.map(metric => <Kaart key={metric.label} compact titel={metric.label}>
        <p className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{metric.value === null ? 'Unknown' : metric.unit === 'EUR' ? new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(metric.value) : `${metric.value}${metric.unit === 'percent' ? '%' : ''}`}</p>
        <p className="text-[10px] mt-2">{stamp(metric.asOf)} · {observationAge(metric.asOf)}</p>
        <p className="text-xs mt-1 break-words">{metric.source}</p>
      </Kaart>)}</StatRij>
      <SectieBlok titel="CHANNELS & CONNECTIONS"><KaartRaster>{report.channels.map(channel => <Kaart key={channel.name} titel={channel.name}>
        <p className="text-sm whitespace-pre-wrap break-words">{channel.status}</p><p className="text-[10px] mt-2">Checked {stamp(channel.asOf)}</p>
      </Kaart>)}</KaartRaster></SectieBlok>
      <SectieBlok titel="OUTREACH & PIPELINE"><Kaart>
        <p className="text-xs mb-3">Sent is not delivered, read or sold. Statuses reflect the listed check time.</p>
        <div className="space-y-4">{report.leads.map((lead, index) => <article key={`${lead.name}-${index}`} className="min-w-0 border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold">{lead.name} · {lead.status}</h3>
          <p className="text-xs whitespace-pre-wrap break-words mt-1">{lead.note}</p>
          <p className="text-[10px] mt-1">{stamp(lead.asOf)}</p>
          {lead.sourceUrl && <a className="text-xs underline" href={lead.sourceUrl} target="_blank" rel="noopener noreferrer">Invitation source</a>}
        </article>)}</div>
      </Kaart></SectieBlok>
      <SectieBlok titel="SOURCE CHECKS & FULL HISTORY"><div className="space-y-3">{[...report.sections]
        .filter(section => section !== pilot && section !== takeover)
        .sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf))
        .map(section => <details key={`${section.title}-${section.asOf}`} className="border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <summary className="cursor-pointer text-sm py-2" style={{ color: 'var(--text-primary)' }}>{section.title} · {stamp(section.asOf)}</summary>
          <div className="text-sm whitespace-pre-wrap break-words leading-relaxed pt-2">{section.body}</div>
        </details>)}</div></SectieBlok>
      <nav aria-label="Business resources" className="flex flex-wrap gap-4 text-xs">{report.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="underline">{link.label}</a>)}</nav>
    </>}
  </div>;
}
