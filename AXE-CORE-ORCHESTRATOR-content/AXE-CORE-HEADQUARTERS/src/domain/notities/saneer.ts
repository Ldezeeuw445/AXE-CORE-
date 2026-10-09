/**
 * Wat een notitie mag bevatten: vet, cursief, onderstreept en een kleur. Alles wat execCommand (of een
 * plak uit een andere app) verder meebrengt gaat eruit: geen scripts, geen attributen behalve een kleur
 * op een SPAN, geen links of plaatjes. Dit is een notitie, geen tekstverwerker, en deze HTML wordt
 * blijvend in Supabase bewaard. Gedeeld door de Quick Note in de app en de notitiesvensters.
 */
const TOEGESTANE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'BR', 'DIV']);

/**
 * Strip everything execCommand's output (or a paste from elsewhere) could
 * carry beyond bold/italic/underline/colour -- no scripts, no attributes
 * beyond a colour on SPAN, no links or images. This is a simple note, not a
 * document editor, and this HTML is stored durably in Supabase.
 */
export function saneerNotitieHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const opschonen = (el: Element) => {
    for (const kind of [...el.children]) {
      if (!TOEGESTANE_TAGS.has(kind.tagName)) {
        while (kind.firstChild) el.insertBefore(kind.firstChild, kind);
        el.removeChild(kind);
      } else {
        const kleur = kind.tagName === 'SPAN' ? (kind as HTMLElement).style.color : '';
        for (const attr of [...kind.attributes]) kind.removeAttribute(attr.name);
        if (kind.tagName === 'SPAN' && kleur) (kind as HTMLElement).style.color = kleur;
      }
    }
    // Unwrapping a disallowed tag can reveal new disallowed grandchildren as
    // direct children; a plain note nests at most a couple of levels deep, so
    // re-running until nothing changes is simpler and safer than getting the
    // single-pass recursion order exactly right.
    if ([...el.children].some(c => !TOEGESTANE_TAGS.has(c.tagName))) opschonen(el);
    else for (const kind of [...el.children]) opschonen(kind);
  };
  opschonen(doc.body);
  return doc.body.innerHTML;
}

/** Plain preview text, for the "first line becomes the title" logic below --
 *  identical to what the old plain-textarea version did with text.split. */
export function platTekst(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

