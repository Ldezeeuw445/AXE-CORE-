/**
 * Notities: wat een notitie is, hoe hij zijn titel krijgt, hoe je er een vindt en hoe de lijst gegroepeerd wordt.
 *
 * Pure regels, zodat de Apple-Notes-achtige notitiesvensters (en de Quick Note in de app) dezelfde
 * notitie op dezelfde manier lezen. Een notitie is een rij in `core_kb_documents` met categorie
 * "Quick Notes": dezelfde tabel als de Knowledge Base, dus alles wat je opschrijft staat ook daar.
 */

export const NOTITIE_CATEGORIE = 'Quick Notes';

export interface Notitie {
  id: string;
  titel: string;
  /** Opgeschoonde HTML (alleen vet, cursief, onderstreept en kleur). */
  inhoud: string;
  /** ISO. */
  gemaakt: string;
  aangepast: string;
}

const ENTITEITEN: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** HTML -> platte tekst met regeleinden, zonder DOM (werkt ook in tests en workers). */
export function platUitHtml(html: string): string {
  return (html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, m => ENTITEITEN[m] ?? m)
    .replace(/ /g, ' ');
}

function regels(html: string): string[] {
  return platUitHtml(html).split('\n').map(r => r.trim()).filter(Boolean);
}

export const NIEUWE_TITEL = 'New note';

/** De eerste regel, ingekort; een lege notitie heet "New note". */
export function titelUit(html: string): string {
  const eerste = regels(html)[0];
  if (!eerste) return NIEUWE_TITEL;
  return eerste.length > 56 ? `${eerste.slice(0, 53)}…` : eerste;
}

/** De tekst na de titel, op één regel: wat je in de lijst onder de titel ziet. */
export function fragmentUit(html: string, max = 90): string {
  const rest = regels(html).slice(1).join(' ');
  return rest.length > max ? `${rest.slice(0, max - 1)}…` : rest;
}

/** Elk getypt woord moet ergens in titel of tekst staan; hoofdletters tellen niet. */
export function zoek(lijst: readonly Notitie[], vraag: string): Notitie[] {
  const woorden = vraag.toLowerCase().split(/\s+/).filter(Boolean);
  if (woorden.length === 0) return [...lijst];
  return lijst.filter(n => {
    const hooi = `${n.titel}\n${platUitHtml(n.inhoud)}`.toLowerCase();
    return woorden.every(w => hooi.includes(w));
  });
}

const dagStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Vandaag, gisteren, laatste 7 dagen en eerder: nieuwste bovenaan, lege groepen weggelaten. */
export function groepeer(lijst: readonly Notitie[], nu: Date): Array<{ kop: string; items: Notitie[] }> {
  const vandaag = dagStart(nu);
  const dag = 86_400_000;
  const groepen: Array<{ kop: string; items: Notitie[] }> = [
    { kop: 'Today', items: [] }, { kop: 'Yesterday', items: [] },
    { kop: 'Previous 7 days', items: [] }, { kop: 'Earlier', items: [] },
  ];
  const nieuwsteEerst = [...lijst].sort((a, b) => b.aangepast.localeCompare(a.aangepast));
  for (const n of nieuwsteEerst) {
    const t = dagStart(new Date(n.aangepast));
    const verschil = Math.round((vandaag - t) / dag);
    const i = verschil <= 0 ? 0 : verschil === 1 ? 1 : verschil <= 7 ? 2 : 3;
    groepen[i].items.push(n);
  }
  return groepen.filter(g => g.items.length > 0);
}

/** "14:05" voor vandaag, "Yesterday", een weekdag binnen de week, anders de datum. */
export function datumLabel(iso: string, nu: Date): string {
  const d = new Date(iso);
  const verschil = Math.round((dagStart(nu) - dagStart(d)) / 86_400_000);
  if (verschil <= 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (verschil === 1) return 'Yesterday';
  if (verschil < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
