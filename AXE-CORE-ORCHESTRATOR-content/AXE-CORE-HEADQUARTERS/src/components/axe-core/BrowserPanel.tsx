import { useState } from 'react';
import { Compass, Search, Globe, X, ExternalLink, Loader2 } from 'lucide-react';
import { browserFetch, browserSearch, browserAnalyze } from '@/services/kimiClawService';

interface BrowserPanelProps {
  onClose?: () => void;
}

export function BrowserPanel({ onClose }: BrowserPanelProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    title: string;
    text: string;
    url: string;
  } | null>(null);
  const [error, setError] = useState('');

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await browserFetch(url.trim());
      setResult({ title: data.title, text: data.text.slice(0, 3000), url: data.url });
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Failed to load page';
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    try {
      const results = await browserSearch(url.trim(), 5);
      const text = results.map((r: { title: string; snippet: string; url: string }) => 
        `## ${r.title}\n${r.snippet}\n[${r.url}]\n`
      ).join('\n---\n');
      setResult({ title: `Search: ${url}`, text, url: 'search' });
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Search failed';
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 300 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Globe size={12} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>IN-APP BROWSER</span>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={12} /></button>
        )}
      </div>

      <div className="flex gap-1 mb-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleFetch(); }}
          placeholder="Enter URL or search query..."
          className="flex-1 text-[10px] px-2 py-1 rounded"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={handleFetch}
          disabled={loading}
          className="px-2 py-1 rounded flex items-center gap-1 disabled:opacity-40"
          style={{ background: 'var(--accent-cyan)', color: '#000' }}
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Compass size={10} />}
          <span className="text-[9px]">Fetch</span>
        </button>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-2 py-1 rounded flex items-center gap-1 disabled:opacity-40"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}
        >
          <Search size={10} />
          <span className="text-[9px]">Search</span>
        </button>
      </div>

      {error && (
        <div className="text-[10px] mb-2 p-2 rounded" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {result && (
        <div className="flex-1 overflow-y-auto rounded p-2" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium truncate" style={{ color: 'var(--accent-cyan)' }}>{result.title}</span>
            {result.url !== 'search' && (
              <a href={result.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)' }}>
                <ExternalLink size={10} />
              </a>
            )}
          </div>
          <pre className="text-[9px] whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {result.text}
          </pre>
        </div>
      )}

      {!result && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <Globe size={24} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Enter a URL to fetch or search the web</span>
        </div>
      )}
    </div>
  );
}
