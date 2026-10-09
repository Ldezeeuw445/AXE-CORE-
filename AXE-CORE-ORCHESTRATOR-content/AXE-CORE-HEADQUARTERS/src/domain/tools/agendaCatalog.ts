import type { ToolCatalogEntry } from '@/domain/tools/toolCatalog';

/**
 * Plannen en plaatsen: AXE's handen voor "boek een restaurant", "zet het in mijn agenda" en "waar is de
 * dichtstbijzijnde elektronicawinkel".
 *
 * Alles hier is `auto`: een afspraak in de agenda zetten is terug te draaien (annuleren laat hem staan als
 * geannuleerd, er wordt niets gewist), zoeken op de kaart verandert niets, en niets hier verstuurt iets
 * naar een ander. De stap die wél naar buiten gaat -- een tafel echt reserveren, een formulier invullen,
 * bellen, betalen -- loopt via de browser-agent of de computer en heeft daar zijn eigen goedkeuring.
 */
export const AGENDA_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'find_places',
    marker: 'FIND_PLACES',
    shortForm: '[FIND_PLACES:]',
    gate: 'auto',
    pattern: /\[FIND_PLACES:\s*(\{[^\]]{1,300}\})\s*\]/,
    stripPattern: /\[FIND_PLACES:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `📍 **Find places nearby and show them on Home** (restaurants, cafés, electronics stores, pharmacies, supermarkets, hotels, fuel, parking, gyms, barbers…):
\`[FIND_PLACES: {"what":"electronics store","near":"Dam, Amsterdam"}]\`
\`near\` is optional: without it the search starts at where Luka is. The result is sorted by distance with address, opening hours and phone when OpenStreetMap has them, and the map with the pins is on Home right away — so tell Luka the best one or two and why, do not read the whole list. If it says the position is only city level, say so.`,
  },
  {
    id: 'my_location',
    marker: 'MY_LOCATION',
    shortForm: '[MY_LOCATION]',
    gate: 'auto',
    pattern: /\[MY_LOCATION:?\s*\]/,
    stripPattern: /\[MY_LOCATION:?\s*\]/g,
    promptDoc: `🧭 **Where is Luka right now**:\n\`[MY_LOCATION]\`\nHis device position when the device shares it, otherwise his city from the internet connection (and it says which). Use it before you plan anything that depends on where he is.`,
  },
  {
    id: 'agenda_add',
    marker: 'AGENDA_ADD',
    shortForm: '[AGENDA_ADD:]',
    gate: 'auto',
    pattern: /\[AGENDA_ADD:\s*(\{[^\]]{1,600}\})\s*\]/,
    stripPattern: /\[AGENDA_ADD:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🗓️ **Put an appointment in Luka's agenda**:
\`[AGENDA_ADD: {"title":"Dinner at Rijsel","date":"friday","time":"19:30","duration_min":90,"place":"Rijsel, Amsterdam","note":"table for 2"}]\`
\`date\` is YYYY-MM-DD, or today / tomorrow / a weekday. \`status\` is "planned" by default; set "confirmed" ONLY when the place or Luka has confirmed — filling in a booking form is not a confirmation. It warns when the slot overlaps something else; tell Luka before you leave it there.`,
  },
  {
    id: 'agenda_list',
    marker: 'AGENDA_LIST',
    shortForm: '[AGENDA_LIST]',
    gate: 'auto',
    pattern: /\[AGENDA_LIST:?\s*\]/,
    stripPattern: /\[AGENDA_LIST:?\s*\]/g,
    promptDoc: `🗓️ **What is coming up in Luka's agenda** (his own appointments, next 14 days, plus today's date):\n\`[AGENDA_LIST]\`\nLook before you propose a time, so you never double-book him.`,
  },
  {
    id: 'agenda_update',
    marker: 'AGENDA_UPDATE',
    shortForm: '[AGENDA_UPDATE:]',
    gate: 'auto',
    pattern: /\[AGENDA_UPDATE:\s*(\{[^\]]{1,600}\})\s*\]/,
    stripPattern: /\[AGENDA_UPDATE:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🗓️ **Change or cancel an appointment**:
\`[AGENDA_UPDATE: {"find":"Rijsel","status":"confirmed","time":"20:00"}]\`
\`find\` is the id or part of the title. You can set \`status\` (planned, confirmed, cancelled), \`date\`, \`time\`, \`duration_min\`, \`place\`, \`note\`. Cancelling keeps it in the list as cancelled; nothing is erased. If the title fits two appointments it lists them and changes nothing.`,
  },
];
