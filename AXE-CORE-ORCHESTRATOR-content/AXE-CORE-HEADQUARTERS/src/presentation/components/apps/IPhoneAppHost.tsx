import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { IPhoneFrame, type IPhoneSize } from '@/presentation/components/apps/IPhoneFrame';
import { AxeButton } from '@/presentation/components/ui/AxeUI';

export type IPhoneAppSource =
  | { kind: 'url'; url: string; title?: string }
  | { kind: 'route'; path: string; title?: string }
  | { kind: 'blank'; title?: string; message?: string };

interface IPhoneAppHostProps {
  source: IPhoneAppSource;
  size?: IPhoneSize;
  /** When true, render as a centered modal overlay. */
  modal?: boolean;
  onClose?: () => void;
  className?: string;
}

function toEmbedSrc(source: IPhoneAppSource): string | null {
  if (source.kind === 'url') return source.url;
  if (source.kind === 'route') {
    const path = source.path.startsWith('/') ? source.path.slice(1) : source.path;
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#/${path}`;
  }
  return null;
}

function titleOf(source: IPhoneAppSource): string {
  if (source.title) return source.title;
  if (source.kind === 'url') {
    try {
      return new URL(source.url).hostname.replace(/^www\./, '');
    } catch {
      return 'App';
    }
  }
  if (source.kind === 'route') return source.path;
  return 'App';
}

/**
 * Hosts a real app inside IPhoneFrame.
 * - `url` → iframe (works for sites that allow embedding)
 * - `route` → same-origin hash route in iframe (AXE Core pages)
 * - Sites that block iframes show a clear fallback + Open outside
 */
export function IPhoneAppHost({
  source,
  size = 'md',
  modal = false,
  onClose,
  className = '',
}: IPhoneAppHostProps) {
  const src = useMemo(() => toEmbedSrc(source), [source]);
  const title = titleOf(source);
  const [loading, setLoading] = useState(Boolean(src));
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(Boolean(src));
    setFailed(false);
  }, [src, reloadKey]);

  const openOutside = useCallback(() => {
    if (source.kind === 'url') {
      window.open(source.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (source.kind === 'route') {
      window.location.hash = `#/${source.path.replace(/^\//, '')}`;
    }
  }, [source]);

  const phone = (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <IPhoneFrame size={size} title={title}>
        {source.kind === 'blank' || !src ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 px-6 text-center bg-[#0a0a0c]">
            <p className="text-[14px] font-medium text-[#F5F0E6]">{title}</p>
            <p className="text-[12px] text-white/45 leading-relaxed">
              {source.kind === 'blank'
                ? (source.message ?? 'Geen URL of route gekoppeld aan deze app.')
                : 'Niets om te laden.'}
            </p>
          </div>
        ) : (
          <div className="relative h-full w-full bg-black">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
              </div>
            )}
            <iframe
              key={reloadKey}
              title={title}
              src={src}
              className="absolute inset-0 w-full h-full border-0 bg-white"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="no-referrer-when-downgrade"
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
            />
            {failed && (
              <div className="absolute bottom-3 left-3 right-3 z-10 rounded-xl border border-white/10 bg-black/85 backdrop-blur-md px-3 py-2.5">
                <p className="text-[11px] text-white/70 leading-snug mb-2">
                  Deze site blokkeert inbedding (X-Frame-Options). Open buiten de telefoon, of voeg een interne AXE-route toe.
                </p>
                <div className="flex gap-1.5">
                  <AxeButton size="sm" variant="primary" onClick={openOutside}>
                    <ExternalLink size={11} /> Open outside
                  </AxeButton>
                  <AxeButton size="sm" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
                    <RefreshCw size={11} /> Retry
                  </AxeButton>
                </div>
              </div>
            )}
            {/* Always-available escape hatch — many sites fail silently without onError */}
            {!failed && !loading && (
              <button
                type="button"
                onClick={openOutside}
                className="absolute top-2 right-2 z-10 px-2 py-1 rounded-lg text-[10px] text-white/60 bg-black/50 border border-white/10 hover:text-white hover:border-cyan-400/40 transition-colors"
              >
                Open outside
              </button>
            )}
          </div>
        )}
      </IPhoneFrame>

      {!modal && src && (
        <div className="flex gap-1.5">
          <AxeButton size="sm" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw size={11} /> Reload
          </AxeButton>
          <AxeButton size="sm" variant="ghost" onClick={openOutside}>
            <ExternalLink size={11} /> Outside
          </AxeButton>
        </div>
      )}
    </div>
  );

  if (!modal) return phone;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 sm:p-8">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close phone"
        onClick={onClose}
      />
      <div className="relative z-10 flex flex-col items-center gap-3 max-h-full overflow-auto">
        <div className="flex items-center justify-between w-full max-w-[420px] px-1">
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-cyan-400/80">iPhone</p>
            <p className="text-[13px] font-semibold text-[#F5F0E6]">{title}</p>
          </div>
          <div className="flex gap-1.5">
            {src && (
              <>
                <AxeButton size="sm" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
                  <RefreshCw size={11} />
                </AxeButton>
                <AxeButton size="sm" variant="secondary" onClick={openOutside}>
                  <ExternalLink size={11} />
                </AxeButton>
              </>
            )}
            <AxeButton size="sm" variant="ghost" onClick={onClose} aria-label="Close">
              <X size={14} />
            </AxeButton>
          </div>
        </div>
        {phone}
      </div>
    </div>
  );
}

export default IPhoneAppHost;
