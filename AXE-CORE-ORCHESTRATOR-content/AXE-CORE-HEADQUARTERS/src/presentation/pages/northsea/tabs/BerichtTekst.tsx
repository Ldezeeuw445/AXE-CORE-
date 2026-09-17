/**
 * Weergave van een e-mail in de NorthSea-desk: nieuwe inhoud, handtekening,
 * geciteerde geschiedenis (standaard ingeklapt) en optioneel gesaneerde HTML.
 *
 * De `>`-prefixen van RFC-plain-text blijven in de opgeslagen tekst staan; hier
 * worden ze visueel als citaat getoond, niet als letterlijke groter-dan-tekens
 * in de nieuwe inhoud.
 */
import { useState } from 'react';
import {
  looksLikeHtml,
  renderNorthSeaMail,
  sanitizeEmailHtml,
  splitEmailBody,
  stripQuotePrefixes,
  type MailMode,
} from '@/domain/northsea/mail';

function Blok({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>{titel}</div>
      {children}
    </section>
  );
}

export function BerichtTekst({ tekst }: { tekst?: string | null }) {
  const raw = tekst?.trim() ?? '';
  if (!raw) {
    return <div className="mt-4 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>No message body recorded.</div>;
  }
  if (looksLikeHtml(raw)) {
    return (
      <Blok titel="Message">
        <div className="ns-mail-html max-w-[640px] text-[12.5px] leading-relaxed" style={{ color: 'var(--text-primary)' }}
          dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(raw) }} />
      </Blok>
    );
  }
  const parts = splitEmailBody(raw);
  const quote = parts.quotedHistory ? stripQuotePrefixes(parts.quotedHistory) : null;
  const collapseQuote = Boolean(parts.newContent.trim() && quote);
  return (
    <div className="mt-4">
      {parts.newContent.trim() ? (
        <Blok titel="New message">
          <div className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {parts.newContent}
          </div>
        </Blok>
      ) : null}
      {parts.signature ? (
        <Blok titel="Signature">
          <div className="whitespace-pre-wrap break-words text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {parts.signature}
          </div>
        </Blok>
      ) : null}
      {quote ? (
        <details className="mt-4" open={!collapseQuote}>
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            Quoted history
          </summary>
          <blockquote className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed"
            style={{ color: 'var(--text-muted)', borderLeft: '2px solid rgba(165,111,58,0.55)', paddingLeft: 12 }}>
            {quote}
          </blockquote>
        </details>
      ) : null}
    </div>
  );
}

export function OntvangerPreview({ body, mode }: { body: string; mode?: MailMode }) {
  const [open, setOpen] = useState(false);
  const mail = renderNorthSeaMail({ body, mode });
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="text-[11px]" style={{ color: 'var(--accent-cyan)' }}>
        {open ? 'Hide recipient preview' : 'Preview recipient-facing message'}
      </button>
      {open && (
        <iframe title="Recipient-facing preview" sandbox="" srcDoc={mail.html}
          className="mt-2 w-full rounded-lg bg-white"
          style={{ minHeight: 420, border: '1px solid var(--axe-vak-lijn)' }} />
      )}
    </div>
  );
}
