import React, { useState, useRef, useEffect } from "react";
import { browser } from "../../lib/api";
import { Globe, Search, X, ExternalLink, RefreshCw, ChevronLeft, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { Spinner } from "./Spinner";

export function BrowserPanel({ onClose }) {
  const [url, setUrl] = useState("");
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionInfo, setSessionInfo] = useState(null);
  const inputRef = useRef(null);

  // Load session info on mount
  useEffect(() => {
    loadSessionInfo();
  }, []);

  const loadSessionInfo = async () => {
    try {
      const info = await browser.session();
      setSessionInfo(info);
      if (info?.history?.length > 0) {
        setHistory(info.history.map((h) => h.url));
        setHistoryIdx(info.history.length - 1);
      }
    } catch (e) {
      console.error("session info", e);
    }
  };

  const normalizeUrl = (input) => {
    let u = input.trim();
    if (!u) return null;
    if (!u.startsWith("http://") && !u.startsWith("https://")) {
      u = "https://" + u;
    }
    return u;
  };

  const handleNavigate = async (targetUrl) => {
    const normalized = normalizeUrl(targetUrl);
    if (!normalized) return;

    setUrl(normalized);
    setLoading(true);
    setError(null);
    setPage(null);

    try {
      const result = await browser.fetch(normalized);
      if (result.status === "ok") {
        setPage(result);
        // Add to history
        setHistory((prev) => [...prev.slice(0, historyIdx + 1), normalized]);
        setHistoryIdx((prev) => prev + 1);
      } else {
        setError(result.error || "Failed to load page");
      }
    } catch (e) {
      setError(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const result = await browser.analyze(url);
      if (result.status === "ok") {
        // Display analysis as a structured view
        setPage((prev) => ({
          ...prev,
          analysis: result,
        }));
      }
    } catch (e) {
      console.error("analyze", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const result = await browser.search(searchQuery, 5);
      setPage({
        status: "ok",
        title: `Search: ${searchQuery}`,
        search_result: result,
        content: JSON.stringify(result, null, 2),
      });
    } catch (e) {
      setError(e?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (historyIdx > 0) {
      const newIdx = historyIdx - 1;
      setHistoryIdx(newIdx);
      handleNavigate(history[newIdx]);
    }
  };

  const goForward = () => {
    if (historyIdx < history.length - 1) {
      const newIdx = historyIdx + 1;
      setHistoryIdx(newIdx);
      handleNavigate(history[newIdx]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleNavigate(url);
    }
  };

  const handleLinkClick = (linkUrl) => {
    handleNavigate(linkUrl);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col"
        style={{
          width: "90vw",
          height: "85vh",
          background: "#0B0C0E",
          border: "1px solid rgba(0,212,255,0.25)",
          borderRadius: 16,
          boxShadow: "0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,212,255,0.15)",
          overflow: "hidden",
        }}
      >
        {/* Browser Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8 bg-[#0B0C0E]">
          {/* Navigation buttons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={goBack}
              disabled={historyIdx <= 0}
              className="p-1.5 rounded text-[#6F8193] hover:text-[#EAF2F7] hover:bg-white/5 disabled:opacity-30 transition-colors"
              title="Back"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={goForward}
              disabled={historyIdx >= history.length - 1}
              className="p-1.5 rounded text-[#6F8193] hover:text-[#EAF2F7] hover:bg-white/5 disabled:opacity-30 transition-colors"
              title="Forward"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => url && handleNavigate(url)}
              disabled={loading}
              className="p-1.5 rounded text-[#6F8193] hover:text-[#00D4FF] hover:bg-white/5 disabled:opacity-30 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* URL bar */}
          <div className="flex-1 flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 focus-within:border-[#00D4FF]/40 transition-colors">
              <Globe size={13} className="text-[#6F8193] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter URL or search..."
                className="flex-1 bg-transparent border-0 outline-none text-[11px] text-[#EAF2F7] placeholder-[#6F8193]"
              />
              {url && (
                <button onClick={() => setUrl("")} className="text-[#6F8193] hover:text-[#FF4D6D]">
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={() => handleNavigate(url)}
              disabled={loading || !url}
              className="px-3 py-1.5 rounded-lg bg-[#00D4FF]/20 border border-[#00D4FF]/30 text-[#00D4FF] text-[10px] font-semibold tracking-[0.06em] uppercase hover:bg-[#00D4FF]/30 transition-colors disabled:opacity-40"
            >
              {loading ? <Spinner variant="dots" size={10} /> : "Go"}
            </button>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 focus-within:border-[#00D4FF]/40 transition-colors w-[200px]">
            <Search size={12} className="text-[#6F8193] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Web search..."
              className="flex-1 bg-transparent border-0 outline-none text-[11px] text-[#EAF2F7] placeholder-[#6F8193]"
            />
            <button
              onClick={handleSearch}
              disabled={!searchQuery.trim()}
              className="text-[#6F8193] hover:text-[#00D4FF] disabled:opacity-30"
            >
              <Search size={12} />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {page?.url && (
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="px-2 py-1 rounded text-[10px] text-[#9FB0C0] hover:text-[#00D4FF] hover:bg-white/5 transition-colors"
                title="Analyze page"
              >
                Analyze
              </button>
            )}
            <button
              onClick={() => window.open(url, "_blank")}
              className="p-1.5 rounded text-[#6F8193] hover:text-[#EAF2F7] hover:bg-white/5 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-[#6F8193] hover:text-[#FF4D6D] hover:bg-white/5 transition-colors"
              title="Close browser"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Error state */}
          {error && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-[#FF4D6D]/10 border border-[#FF4D6D]/20">
              <AlertCircle size={18} className="text-[#FF4D6D] shrink-0" />
              <div>
                <div className="text-[12px] font-medium text-[#FF4D6D]">Failed to load page</div>
                <div className="text-[11px] text-[#9FB0C0] mt-1">{error}</div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && !page && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 size={24} className="text-[#00D4FF] animate-spin" />
              <div className="text-[11px] text-[#6F8193]">Loading {url}...</div>
            </div>
          )}

          {/* Search results */}
          {page?.search_result && (
            <div className="space-y-3">
              <div className="text-[12px] font-semibold text-[#EAF2F7]">
                Search: {page.search_result.query}
              </div>
              <div className="p-3 rounded-lg bg-white/3 border border-white/5">
                <div className="text-[11px] text-[#9FB0C0] whitespace-pre-wrap">
                  {page.search_result.tip || "Search results would appear here with a configured search API."}
                </div>
                {page.search_result.suggested_search_engines && (
                  <div className="mt-3 space-y-1.5">
                    <div className="text-[10px] font-medium text-[#6F8193] uppercase tracking-wider">
                      Suggested Search APIs
                    </div>
                    {page.search_result.suggested_search_engines.map((eng) => (
                      <a
                        key={eng.name}
                        href={eng.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded bg-white/3 hover:bg-white/5 transition-colors"
                      >
                        <Search size={12} className="text-[#00D4FF]" />
                        <div>
                          <div className="text-[11px] text-[#EAF2F7]">{eng.name}</div>
                          <div className="text-[9px] text-[#6F8193]">{eng.docs || eng.url}</div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Page title */}
          {page?.title && (
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h2 className="text-[14px] font-semibold text-[#EAF2F7]">{page.title}</h2>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#00D4FF] hover:underline break-all"
                >
                  {page.url}
                </a>
              </div>
              {page.meta?.description && (
                <div className="text-[11px] text-[#9FB0C0] max-w-[50%]">
                  {page.meta.description}
                </div>
              )}
            </div>
          )}

          {/* Analysis results */}
          {page?.analysis && (
            <div className="p-3 rounded-lg bg-[#00D4FF]/5 border border-[#00D4FF]/15 space-y-2">
              <div className="text-[11px] font-semibold text-[#00D4FF] uppercase tracking-wider">
                Page Analysis
              </div>
              {page.analysis.headings?.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-medium text-[#6F8193]">Headings</div>
                  {page.analysis.headings.map((h, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-[#EAF2F7]"
                      style={{ paddingLeft: (h.level - 1) * 12 }}
                    >
                      {h.text}
                    </div>
                  ))}
                </div>
              )}
              {page.analysis.paragraphs?.length > 0 && (
                <div className="space-y-1 mt-2">
                  <div className="text-[10px] font-medium text-[#6F8193]">Key Content</div>
                  {page.analysis.paragraphs.map((p, i) => (
                    <p key={i} className="text-[11px] text-[#9FB0C0] leading-relaxed">
                      {p}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Links */}
          {page?.links && page.links.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#6F8193] uppercase tracking-wider">
                Links ({page.links.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto">
                {page.links.slice(0, 20).map((link, i) => (
                  <button
                    key={i}
                    onClick={() => handleLinkClick(link.url)}
                    className="flex items-center gap-2 p-2 rounded bg-white/3 hover:bg-white/5 border border-white/5 hover:border-[#00D4FF]/20 transition-colors text-left"
                  >
                    <ExternalLink size={10} className="text-[#6F8193] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-[#EAF2F7] truncate">
                        {link.text || link.url}
                      </div>
                      <div className="text-[9px] text-[#6F8193] truncate">{link.url}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Raw content preview */}
          {page?.content && !page.search_result && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-[#6F8193] uppercase tracking-wider">
                  Content Preview
                </div>
                <div className="text-[9px] text-[#6F8193]">
                  {page.content.length.toLocaleString()} chars
                </div>
              </div>
              <pre className="p-3 rounded-lg bg-white/3 border border-white/5 text-[10px] text-[#9FB0C0] overflow-auto max-h-[400px] whitespace-pre-wrap break-all">
                {page.content.slice(0, 10000)}
                {page.content.length > 10000 && "\n\n...[truncated]"}
              </pre>
            </div>
          )}

          {/* Empty state */}
          {!page && !loading && !error && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(0,212,255,0.08)",
                  border: "1px solid rgba(0,212,255,0.15)",
                }}
              >
                <Globe size={28} className="text-[#00D4FF]" />
              </div>
              <div className="text-center">
                <div className="text-[13px] font-semibold text-[#EAF2F7]">AXE Browser</div>
                <div className="text-[11px] text-[#6F8193] mt-1 max-w-[300px]">
                  Enter a URL to browse, or use the search bar. AXE can analyze pages and extract intelligence.
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {[
                  "https://news.ycombinator.com",
                  "https://www.reuters.com",
                  "https://github.com/trending",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => handleNavigate(example)}
                    className="px-3 py-1.5 rounded-full bg-white/3 border border-white/8 text-[10px] text-[#9FB0C0] hover:text-[#00D4FF] hover:border-[#00D4FF]/30 transition-colors"
                  >
                    {example.replace("https://", "")}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/5 bg-[#0B0C0E]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{
                  background: page ? "#2EF2C2" : "#6F8193",
                  boxShadow: page ? "0 0 6px #2EF2C2" : "none",
                }}
              />
              <span className="text-[9px] text-[#6F8193]">
                {page ? "Loaded" : "Ready"}
              </span>
            </div>
            {page?.content_type && (
              <span className="text-[9px] text-[#6F8193]">{page.content_type}</span>
            )}
            {page?.status_code && (
              <span className="text-[9px] text-[#2EF2C2]">HTTP {page.status_code}</span>
            )}
          </div>
          <div className="text-[9px] text-[#6F8193]">
            {history.length > 0 ? `${historyIdx + 1} / ${history.length} pages` : "No history"}
          </div>
        </div>
      </div>
    </div>
  );
}
