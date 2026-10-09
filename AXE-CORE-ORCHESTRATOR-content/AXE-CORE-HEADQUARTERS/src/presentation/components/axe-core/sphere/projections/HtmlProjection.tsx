import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

/**
 * Een voorbeeld dat AXE zelf heeft gemaakt -- een mockup, een schema, een kleine
 * demo -- live op Home. In een afgeschermd frame: scripts mogen draaien, maar het
 * frame kan niet bij de app, de opslag of de sessie (geen allow-same-origin).
 */
export function HtmlProjection({ payload }: { payload: ProjectionPayload }) {
  const bron = payload.text || '';
  const doc = /<html|<body|<!doctype/i.test(bron)
    ? bron
    : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;font-family:-apple-system,system-ui,sans-serif}</style></head><body>${bron}</body></html>`;
  return (
    <iframe
      title={payload.title}
      srcDoc={doc}
      sandbox="allow-scripts"
      className="absolute inset-0 h-full w-full border-0"
      style={{ background: '#fff' }}
    />
  );
}
