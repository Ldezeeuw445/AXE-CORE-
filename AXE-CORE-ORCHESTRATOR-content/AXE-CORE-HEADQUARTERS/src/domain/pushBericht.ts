/**
 * Van een `core_notifications`-rij naar wat er op je slotscherm komt te staan.
 *
 * ## Waarom dit een regel in domain is
 *
 * De zender draait in Python op de VPS, de service worker in JavaScript op het
 * toestel, en later leest de Kotlin-schil van de A17 dezelfde rijen. Drie
 * plekken die hetzelfde moeten vinden van één rij. Als elk zijn eigen
 * samenvatting maakt lopen ze uit elkaar, en dan is "wat stond er ook alweer in
 * die melding" niet te beantwoorden.
 *
 * Hier staat die ene afleiding, en hij hergebruikt wat de bel al gebruikt:
 * `notificationText` (titel en detail uit het bericht -- er IS geen title-kolom,
 * zie de kop van notification.ts) en `notificationTarget` (waar je heen springt
 * als je erop tikt).
 *
 * ## Waarom `tag`
 *
 * 173 van de 186 rijen in dat logboek waren dezelfde zin over een provider die
 * wegviel. In de bel vangt `collapseRepeats` dat op. Een melding heeft daar zijn
 * eigen mechanisme voor: twee meldingen met dezelfde `tag` vervangen elkaar in
 * plaats van zich op te stapelen. Zonder dat wordt je slotscherm bij zo'n bui
 * onbruikbaar -- en dat is precies het moment dat je hem nodig hebt.
 */
import { notificationText, notificationTarget } from '@/domain/notification';

/** Wat een melding op het scherm nodig heeft. Niet meer: dit gaat over de lijn
 *  en komt op een slotscherm terecht. */
export interface PushBericht {
  titel: string;
  body: string;
  /** Meldingen met dezelfde tag vervangen elkaar. */
  tag: string;
  /** Hash-route om te openen bij een tik. Altijd een route, nooit leeg. */
  url: string;
}

export interface MeldingRij {
  id: string;
  type?: string | null;
  message?: string | null;
}

/** Een tag per soort bericht, niet per rij: dat is wat herhalingen samenvouwt.
 *  Kleine letters en zonder cijfers, zodat "3 van de 5 mislukt" en "4 van de 5
 *  mislukt" dezelfde tag krijgen. */
function tagVan(titel: string): string {
  const kaal = titel
    .toLowerCase()
    .replace(/[0-9]+/g, '')
    .replace(/[^a-zà-ÿ ]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return kaal ? `axe-${kaal.slice(0, 40)}` : 'axe-melding';
}

/**
 * De melding voor deze rij, of null als er niets te melden valt.
 *
 * Null bij een leeg bericht: een melding zonder tekst is een trilling zonder
 * reden, en die leert je om ze weg te vegen zonder te kijken.
 */
export function pushBerichtVan(rij: MeldingRij): PushBericht | null {
  const bericht = (rij.message ?? '').trim();
  if (!bericht) return null;

  const { title, detail } = notificationText(bericht);
  const doel = notificationTarget(bericht);

  return {
    titel: title,
    // Zonder detail de titel niet herhalen: dan staat dezelfde zin twee keer
    // onder elkaar op je slotscherm.
    body: detail,
    tag: tagVan(title),
    // Geen doel bekend? Dan de app zelf. Een melding die nergens heen gaat
    // laat je achter op het scherm waar je toevallig was.
    url: doel?.route ?? '/',
  };
}
