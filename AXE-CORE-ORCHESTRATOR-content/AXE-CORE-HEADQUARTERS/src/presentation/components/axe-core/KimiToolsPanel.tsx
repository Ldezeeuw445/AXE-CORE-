import { useState } from 'react';
import { Compass, Code, FileText, Loader2, Sparkles, Send } from 'lucide-react';
import { clawSearch, clawAnalyze, kimiCodeGenerate, kimiCodeReview, kimiWorkSummarize } from '@/infrastructure/gateways/kimiClawService';

interface KimiToolsPanelProps {
  onClose?: () => void;
}

type ToolTab = 'claw' | 'code' | 'work';

export function KimiToolsPanel({ onClose: _onClose }: KimiToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<ToolTab>('claw');
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('typescript');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState('');

  const handleClawSearch = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(''); setResult('');
    try {
      const data = await clawSearch(input.trim(), 5);
      setResult(data.map((r: { title: string; snippet: string; url: string }) =>
        `**${r.title}**\n${r.snippet}\n${r.url}\n---`
      ).join('\n'));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Search failed'); }
    finally { setLoading(false); }
  };

  const handleClawAnalyze = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(''); setResult('');
    try {
      const data = await clawAnalyze(input.trim());
      setResult(`**${data.title}**\n\nSummary: ${data.summary}\n\nKey Points:\n${data.keyPoints.map((p: string) => `- ${p}`).join('\n')}\n\nSentiment: ${data.sentiment}\n\nEntities: ${data.entities.map((e: { name: string; type: string }) => `${e.name} (${e.type})`).join(', ')}`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Analysis failed'); }
    finally { setLoading(false); }
  };

  const handleCodeGenerate = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(''); setResult('');
    try {
      const data = await kimiCodeGenerate(input.trim(), language);
      setResult(`**${data.language}**\n\n${data.code}\n\n*${data.explanation}*`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Code generation failed'); }
    finally { setLoading(false); }
  };

  const handleCodeReview = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(''); setResult('');
    try {
      const data = await kimiCodeReview(input.trim(), language);
      setResult(`**Review**\n\n${data.code}\n\n*${data.explanation}*\n\n${data.suggestions?.map((s: string) => `- ${s}`).join('\n') ?? ''}`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Code review failed'); }
    finally { setLoading(false); }
  };

  const handleWorkSummarize = async () => {
    if (!input.trim()) return;
    setLoading(true); setError(''); setResult('');
    try {
      const data = await kimiWorkSummarize(input.trim());
      setResult(`**Summary**\n\n${data.summary}\n\nKey Points:\n${data.keyPoints.map((p: string) => `- ${p}`).join('\n')}\n\n${data.actionItems ? `Action Items:\n${data.actionItems.map((a: string) => `- ${a}`).join('\n')}` : ''}`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Summarization failed'); }
    finally { setLoading(false); }
  };

  const runPrimary = () => {
    if (activeTab === 'claw') void handleClawSearch();
    else if (activeTab === 'code') void handleCodeGenerate();
    else void handleWorkSummarize();
  };

  const tabs = [
    { key: 'claw' as ToolTab, label: 'Claw', icon: Compass },
    { key: 'code' as ToolTab, label: 'Code', icon: Code },
    { key: 'work' as ToolTab, label: 'Work', icon: FileText },
  ];

  return (
    <div className="flex flex-col w-full min-w-0" style={{ minHeight: 220 }}>
      {/* Tabs — wrap if needed, never overflow sidebar */}
      <div className="flex flex-wrap items-center gap-1 mb-2 w-full min-w-0">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setResult(''); setError(''); setInput(''); }}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all shrink-0"
            style={{
              background: activeTab === t.key ? 'rgba(34,211,238,0.12)' : 'transparent',
              border: `1px solid ${activeTab === t.key ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}`,
              color: activeTab === t.key ? 'var(--accent-cyan)' : 'var(--text-muted)',
            }}
          >
            <t.icon size={10} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Input full width */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') runPrimary(); }}
        placeholder={
          activeTab === 'claw' ? 'Search web or enter URL...' :
          activeTab === 'code' ? 'Describe code to generate...' :
          'Text to summarize or analyze...'
        }
        className="w-full min-w-0 text-[10px] px-2 py-1.5 rounded mb-1.5 outline-none"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
      />

      {/* Language + Run on second row — fits narrow sidebar */}
      <div className="flex items-center gap-1.5 mb-2 w-full min-w-0">
        {activeTab === 'code' && (
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-[9px] px-1.5 py-1.5 rounded flex-1 min-w-0"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
          >
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="rust">Rust</option>
            <option value="go">Go</option>
          </select>
        )}
        <button
          onClick={runPrimary}
          disabled={loading}
          className="px-3 py-1.5 rounded flex items-center justify-center gap-1 disabled:opacity-40 shrink-0"
          style={{
            background: 'var(--accent-cyan)',
            color: '#000',
            minWidth: activeTab === 'code' ? 56 : '100%',
            flex: activeTab === 'code' ? '0 0 auto' : '1 1 auto',
          }}
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          <span className="text-[10px] font-semibold">Run</span>
        </button>
      </div>

      {activeTab === 'claw' && (
        <div className="flex gap-1 mb-2 w-full">
          <button
            onClick={() => void handleClawAnalyze()}
            disabled={loading || !input.trim()}
            className="px-2 py-1 rounded text-[9px] disabled:opacity-40 flex items-center gap-1"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}
          >
            <Sparkles size={9} />
            Deep Research
          </button>
        </div>
      )}

      {error && (
        <div className="text-[10px] mb-2 p-2 rounded" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {result && (
        <div className="flex-1 overflow-y-auto rounded p-2 min-w-0" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', maxHeight: 160 }}>
          <pre className="text-[9px] whitespace-pre-wrap leading-relaxed break-words" style={{ color: 'var(--text-secondary)' }}>
            {result}
          </pre>
        </div>
      )}

      {!result && !error && (
        <div className="flex flex-col items-center justify-center gap-2 py-4">
          {activeTab === 'claw' && <Compass size={22} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />}
          {activeTab === 'code' && <Code size={22} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />}
          {activeTab === 'work' && <FileText size={22} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />}
          <span className="text-[9px] text-center px-1" style={{ color: 'var(--text-muted)' }}>
            {activeTab === 'claw' ? 'Search the web or analyze any URL' :
             activeTab === 'code' ? 'Generate or review code with AI' :
             'Summarize documents and extract insights'}
          </span>
        </div>
      )}
    </div>
  );
}
