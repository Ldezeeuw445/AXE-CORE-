/**
 * De code uit een markdown-codeblok halen.
 *
 * ## Waarom dit een apart bestand is
 *
 * Er is hier geen jsdom in de testopstelling (zie vitest.config.ts: node, en
 * met opzet). Een component kun je dus niet renderen in een test, maar dit
 * rekenwerk wél -- en dit is precies het stukje dat stil fout kan gaan. Een
 * kopieerknop die `[object Object]` meegeeft ziet er goed uit; je merkt het pas
 * als je het commando plakt en het niets doet.
 */
import { isValidElement, type ReactNode } from 'react';

/**
 * react-markdown geeft children als React-nodes, niet als string: bij één
 * regel een string, bij meer regels een array met strings. Alles wat geen tekst
 * is (een element, null, een boolean) valt weg -- in een codeblok hoort dat er
 * ook niet te staan.
 */
export function alsTekst(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(alsTekst).join('');
  return '';
}

export interface Codeblok {
  code: string;
  /** Undefined bij een hek zonder taal (``` zonder `bash` erachter). */
  taal: string | undefined;
}

/**
 * Uit de children van een `<pre>` de code en de taal halen.
 *
 * Een hek zonder taal krijgt geen `language-`-klasse. Eerder werd op die klasse
 * gekozen of het een blok was, en dat liet juist die blokken zonder kopieerknop
 * staan -- terwijl dat er in de praktijk de meeste zijn. Vandaar dat de taal
 * hier mág ontbreken.
 */
export function leesCodeblok(children: ReactNode): Codeblok {
  const kind = Array.isArray(children) ? children[0] : children;
  const binnen = (isValidElement(kind) ? kind.props : {}) as {
    children?: ReactNode;
    className?: string;
  };
  return {
    // De afsluitende regelovergang hoort bij het hek, niet bij de code. Zonder
    // dit plak je een extra enter mee en voert een terminal het commando al uit.
    code: alsTekst(binnen.children).replace(/\n$/, ''),
    taal: /language-([\w-]+)/.exec(binnen.className ?? '')?.[1],
  };
}
