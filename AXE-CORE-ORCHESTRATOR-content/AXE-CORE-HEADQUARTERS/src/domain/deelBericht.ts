/**
 * Wat er in de composer komt als je vanuit een andere app naar AXE deelt.
 *
 * ## Waarom dit niet "gewoon de tekst doorgeven" is
 *
 * Android levert een deling als drie losse velden: `title`, `text` en `url`.
 * Welke daarvan gevuld zijn verschilt per app, en ze overlappen:
 *
 * - Chrome deelt een pagina als title + url, en zet de url NOG een keer in text.
 * - WhatsApp deelt alleen text, met de url erin verwerkt.
 * - Een notitie-app deelt alleen text, zonder url.
 * - Sommige apps sturen een lege title mee in plaats van geen title.
 *
 * Plak je die drie achter elkaar, dan krijg je bij de helft van de apps dezelfde
 * link twee keer in je bericht. Daarom beslist deze module wat er overblijft, en
 * doet de rest van de app alleen nog wat hier uitkomt.
 *
 * Bewust NIET: direct versturen. Een deling is een halve gedachte -- je wilt er
 * meestal nog iets bij typen. En een share die ongevraagd een model aanroept is
 * een share die geld kost zonder dat je het vroeg.
 */

/** De velden die de Web Share Target API aanlevert. */
export interface DeelVelden {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}

function schoon(v: string | null | undefined): string {
  return (v ?? '').trim();
}

/**
 * De tekst voor de composer, of null als er niets bruikbaars gedeeld is.
 *
 * Volgorde: onderwerp, dan de tekst, dan de link -- dat leest als een bericht
 * in plaats van als een formulier.
 */
export function deelBerichtVan(velden: DeelVelden): string | null {
  const titel = schoon(velden.title);
  const tekst = schoon(velden.text);
  const url = schoon(velden.url);

  const delen: string[] = [];
  if (titel) delen.push(titel);
  // Een app die de titel ook als tekst meestuurt (dat gebeurt) moet hem niet
  // twee keer opleveren.
  if (tekst && tekst !== titel) delen.push(tekst);
  // De url alleen apart erbij als hij nog nergens staat. `includes` en geen
  // gelijkheid: WhatsApp zet de link middenin een zin.
  if (url && !delen.some((d) => d.includes(url))) delen.push(url);

  const uit = delen.join('\n\n').trim();
  return uit.length > 0 ? uit : null;
}

/** Hetzelfde, maar vanaf de zoekreeks waarmee de PWA geopend wordt. */
export function deelBerichtUitZoek(zoek: string): string | null {
  let p: URLSearchParams;
  try {
    p = new URLSearchParams(zoek || '');
  } catch {
    return null;
  }
  return deelBerichtVan({
    title: p.get('title'),
    text: p.get('text'),
    url: p.get('url'),
  });
}
