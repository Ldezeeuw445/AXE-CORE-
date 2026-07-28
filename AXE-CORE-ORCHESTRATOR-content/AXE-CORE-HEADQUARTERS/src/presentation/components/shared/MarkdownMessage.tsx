/**
 * MarkdownMessage — renders AXE's chat replies as actual formatted text
 * (bold, headers, lists, code, links) instead of raw markdown syntax shown
 * literally. AXE's system prompt asks it to format with markdown; every
 * chat surface was just dumping `{m.text}` as plain text, so every `**`,
 * `#`, `-` etc. showed up as a literal character instead of doing anything
 * — exactly why replies read as "full of symbols".
 *
 * Deliberately minimal styling (inherits size/color from the wrapping
 * bubble via `unstyled` variant) so this drops into any existing chat
 * bubble without fighting its layout.
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => <div className="font-semibold mb-1 mt-1.5 first:mt-0">{children}</div>,
          h2: ({ children }) => <div className="font-semibold mb-1 mt-1.5 first:mt-0">{children}</div>,
          h3: ({ children }) => <div className="font-semibold mb-1 mt-1.5 first:mt-0">{children}</div>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--accent-cyan)' }}>
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            const isBlock = /language-/.test(className ?? '');
            return isBlock ? (
              <pre className="rounded px-2 py-1.5 my-1 overflow-x-auto text-[0.9em]" style={{ background: 'rgba(0,0,0,0.35)' }}>
                <code>{children}</code>
              </pre>
            ) : (
              <code className="rounded px-1 py-0.5 text-[0.9em]" style={{ background: 'rgba(0,0,0,0.35)' }}>
                {children}
              </code>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="pl-2 my-1 opacity-80" style={{ borderLeft: '2px solid currentColor' }}>{children}</blockquote>
          ),
          hr: () => <hr className="my-1.5 opacity-20" />,
          table: ({ children }) => <div className="overflow-x-auto my-1"><table className="text-[0.9em]">{children}</table></div>,
          th: ({ children }) => <th className="text-left px-1.5 py-0.5 font-semibold border-b border-current/20">{children}</th>,
          td: ({ children }) => <td className="px-1.5 py-0.5 border-b border-current/10">{children}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
