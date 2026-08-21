/**
 * phoneCatalog — the Samsung as two tools, split on consequence.
 *
 * [PHONE_LOOK:] reads the screen and changes nothing, so it runs unattended.
 * [PHONE_DO:] moves the phone and always stops on an approval card.
 *
 * The split is not decoration. One marker with an `action` field would mean a
 * single gate for both, and a gate that must cover `tap` cannot also let
 * `screenshot` through — so either looking becomes a prompt you click forty
 * times an hour, or tapping becomes something that happens without you. Two
 * markers keeps looking free and touching deliberate.
 */
import type { ToolCatalogEntry } from '@/domain/tools/toolCatalog';

export const PHONE_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'phone_look',
    marker: 'PHONE_LOOK',
    shortForm: '[PHONE_LOOK:]',
    gate: 'auto',
    pattern: /\[PHONE_LOOK:\s*(\{[^\]]{1,500}\})\s*\]/,
    stripPattern: /\[PHONE_LOOK:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `📱 **Phone — look at the screen** (no approval, changes nothing):
\`[PHONE_LOOK: {"action":"ui_dump"}]\`
Actions: \`ui_dump\` (labelled, tappable elements — USE THIS ONE), \`screenshot\`,
\`current_app\`, \`screen_size\`.

**Always [PHONE_LOOK:] before [PHONE_DO:].** \`ui_dump\` gives every element's
label and centre point, so you can press a button by name instead of guessing
at pixels — coordinates from a previous screen are stale the moment anything
scrolls. If a tap does not do what you expected, dump again rather than
tapping twice.

A row without \`TAP\` is still worth tapping **inside a browser**: Chrome
renders a page as one WebView node, so links and buttons on a website are
almost never reported as clickable even though tapping them works. Measured on
nos.nl. In native apps the flag is accurate — there, prefer a \`TAP\` row.`,
  },
  {
    id: 'phone_do',
    marker: 'PHONE_DO',
    shortForm: '[PHONE_DO:]',
    gate: 'approval',
    approvalKind: 'phone',
    pattern: /\[PHONE_DO:\s*(\{[^\]]{1,1000}\})\s*\]/,
    stripPattern: /\[PHONE_DO:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `📱 **Phone — press, type, open** (needs approval):
\`[PHONE_DO: {"action":"tap","label":"Inloggen"}]\`
\`[PHONE_DO: {"action":"open_url","url":"https://nos.nl"}]\`
\`[PHONE_DO: {"action":"text","text":"weer in Rotterdam"}]\`
\`[PHONE_DO: {"action":"key","key":"ENTER"}]\`
\`[PHONE_DO: {"action":"launch","package":"com.whatsapp"}]\`
\`[PHONE_DO: {"action":"swipe","x1":540,"y1":1600,"x2":540,"y2":600}]\`

Prefer \`"label"\` over \`"x"/"y"\` for a tap — the label is resolved against the
current screen, so it cannot press yesterday's coordinates. Keys allowed:
HOME, BACK, ENTER, TAB, DEL, ESCAPE, SPACE, APP_SWITCH, SEARCH, VOLUME_UP,
VOLUME_DOWN, the DPAD and media keys. To type into a field, tap the field
first, then send \`text\` — Android types wherever the cursor already is.

Never log into Chrome on this phone: signing it in breaks the AXE CORE device
manager. If a flow demands a Google sign-in, stop and say so.`,
  },
];
