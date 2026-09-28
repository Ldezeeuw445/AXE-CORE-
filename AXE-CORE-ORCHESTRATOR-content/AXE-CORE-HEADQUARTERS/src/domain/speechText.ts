/**
 * speechText.ts — turn written text into something a voice can read aloud.
 *
 * AXE writes in Markdown for the screen: **bold**, `code`, # headings, bullet
 * lists, links, the odd emoji. Read literally, a TTS engine says "star star",
 * "hash", "backtick", spells out URLs and trips over arrows and emoji. That is
 * exactly the "it reads weird characters" problem — it sounds like a machine,
 * not like AXE.
 *
 * normalizeForSpeech strips the writing-for-screens layer and keeps the
 * writing-for-ears layer: plain words and ordinary sentence punctuation. It is
 * pure and idempotent, so it is safe to call at every speech entry point even
 * if an outer layer already cleaned the text.
 *
 * It is deliberately conservative: it removes formatting and decoration, never
 * meaning. When in doubt it drops a symbol rather than inventing a word for it,
 * because a short clean sentence sounds more professional than a literal one.
 */

/** Markdown links: [label](url) -> label, ![alt](url) -> (nothing). */
function unwrapLinks(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')        // images: no spoken content
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');      // links: keep the label only
}

/** Bare URLs and email addresses are noise when spoken; remove them. */
function stripUrls(text: string): string {
  return text
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ')             // scheme://...
    .replace(/\bwww\.\S+/gi, ' ')                              // www....
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, ' ');            // emails
}

/**
 * Emoji, pictographs, dingbats, arrows, geometric bullets and the invisible
 * joiners/variation selectors that glue emoji together. These have no natural
 * spoken form, so they become a pause (space), not a word.
 */
const DECORATIVE = new RegExp(
  '[' +
    '\\u{1F000}-\\u{1FAFF}' +   // emoji & pictographs
    '\\u{1F1E6}-\\u{1F1FF}' +   // regional indicators (flags)
    '\\u{2600}-\\u{27BF}' +     // misc symbols & dingbats
    '\\u{2190}-\\u{21FF}' +     // arrows
    '\\u{2B00}-\\u{2BFF}' +     // extra arrows/shapes
    '\\u{2000}-\\u{206F}' +     // general punctuation (bullets •, dashes, quotes handled below)
    '\\u{FE00}-\\u{FE0F}' +     // variation selectors
    '\\u{200D}' +               // zero-width joiner
    ']',
  'gu',
);

/** Reduce the handful of "smart" typographic marks to plain spoken equivalents. */
function plainPunctuation(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")   // ' ' -> '
    .replace(/[“”„‟]/g, '"')   // " " -> "
    .replace(/[–—―]/g, ', ')          // – — -> a spoken pause
    .replace(/…/g, '...')                        // … -> ...
    .replace(/[·•▪◦‣∙]/g, ' ');                       // middots / bullets
}

/** Remove line-leading Markdown structure (headings, quotes, list markers). */
function stripLineMarkers(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s+/, '')          // # Heading
    .replace(/^\s{0,3}>\s?/, '')               // > quote
    .replace(/^\s*[-*+]\s+/, '')               // - bullet
    .replace(/^\s*\d+[.)]\s+/, '')             // 1. numbered item -> spoken as the item
    .replace(/^\s*\|.*\|\s*$/, (m) =>          // table row -> its cells, pipes to spaces
      m.replace(/\|/g, ' ').trim())
    .replace(/^\s*[-:| ]{3,}\s*$/, '');        // table separator ---|:--: -> nothing
}

/**
 * Turn written text into speakable text. Removes Markdown, URLs, emoji and
 * stray symbols; keeps words and ordinary punctuation. Idempotent.
 */
export function normalizeForSpeech(input: string): string {
  if (!input) return '';

  let text = input
    .replace(/```[\s\S]*?```/g, ' ')     // fenced code blocks: never read code aloud
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`([^`]*)`/g, '$1');        // inline code: keep the words, drop the ticks

  text = unwrapLinks(text);
  text = stripUrls(text);

  text = text
    .split('\n')
    .map(stripLineMarkers)
    .join('\n');

  // Emphasis/strike markers around words: **x** *x* __x__ _x_ ~~x~~.
  text = text
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1');

  text = plainPunctuation(text);
  text = text.replace(DECORATIVE, ' ');

  // Any leftover Markdown/structural symbols that carry no spoken meaning.
  text = text.replace(/[*_`#>|~^]/g, ' ').replace(/\\([*_`#>|~])/g, '$1');

  // Tidy whitespace and stray spaces in front of punctuation.
  return text
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}
