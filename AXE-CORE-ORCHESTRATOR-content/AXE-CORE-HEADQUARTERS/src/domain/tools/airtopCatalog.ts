/**
 * airtopCatalog — the cloud browser as one tool.
 *
 * Split on consequence, same rule as the phone: reading a page changes
 * nothing and runs unattended; clicking and typing can post, buy or send, so
 * they stop on an approval card.
 *
 * Note the deliberate overlap with [BROWSER_AGENT:]. That one drives the
 * Playwright on the VPS and is fine for "read me this page". This one has a
 * viewport Luka can watch and take over — so anything involving a login, a
 * form, or a site that fights back belongs here.
 */
import type { ToolCatalogEntry } from '@/domain/tools/toolCatalog';

export const AIRTOP_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'airtop_read',
    marker: 'AIRTOP',
    shortForm: '[AIRTOP:]',
    gate: 'auto',
    pattern: /\[AIRTOP:\s*(\{[^\]]{1,2000}\})\s*\]/,
    stripPattern: /\[AIRTOP:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🌐 **Cloud browser — open and read** (no approval):
\`[AIRTOP: {"action":"open","url":"https://nos.nl"}]\`
\`[AIRTOP: {"action":"ask","prompt":"What are the top 3 headlines?"}]\`
\`[AIRTOP: {"action":"read"}]\`

A real Chromium in Airtop's cloud, shown live in AXE's Browser tab — so this
works on sites that refuse to be embedded, which is most of them. \`open\`
navigates and returns the page; \`ask\` runs a question against what is on
screen (cheaper and sharper than reading everything); \`read\` returns the full
page text.

Reuse the open window: \`open\` again to go elsewhere. Sessions are limited to
three at once, so do not open one per thought.`,
  },
  {
    id: 'airtop_act',
    marker: 'AIRTOP_DO',
    shortForm: '[AIRTOP_DO:]',
    gate: 'approval',
    approvalKind: 'exec',
    pattern: /\[AIRTOP_DO:\s*(\{[^\]]{1,2000}\})\s*\]/,
    stripPattern: /\[AIRTOP_DO:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🌐 **Cloud browser — click and type** (needs approval):
\`[AIRTOP_DO: {"action":"click","element":"the Accept button in the cookie banner"}]\`
\`[AIRTOP_DO: {"action":"type","text":"weer rotterdam","element":"the search box","enter":true}]\`

Describe the element in words — Airtop resolves it against the live page, so
there are no selectors to keep up to date.

If the page asks for a login, a 2FA code, or puts up a CAPTCHA: **stop and say
so.** The live view is on screen and Luka finishes it himself, then you carry
on. Do not attempt to work around a bot check, and never type a password.`,
  },
];
