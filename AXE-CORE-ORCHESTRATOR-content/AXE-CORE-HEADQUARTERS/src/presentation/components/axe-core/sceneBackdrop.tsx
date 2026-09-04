/**
 * Wat een 3D-scene achter zich laat zien.
 *
 * ## De storing die dit voorkomt
 *
 * Elke three.js-scene in deze app wiste zichzelf naar een ondoorzichtige
 * kleur: `alpha: false` bij het aanmaken van de renderer, of
 * `setClearColor(0x000000, 1)`. Op een zwarte app viel dat niet op -- het
 * canvas was zwart en de pagina eronder ook.
 *
 * In de glasstand ligt de app op een plaat met sfeer, en dan slaat elk van die
 * canvassen er een rechthoekig gat in. Niet subtiel: een zwart blok midden in
 * een doorlopend vlak, precies op de plek waar de sphere het mooist hoort te
 * zijn.
 *
 * ## Waarom dit per frame gebeurt en niet één keer
 *
 * `alpha` is een aanmaakvlag van de WebGL-context en kan daarna niet meer
 * veranderen -- die staat nu overal aan. Wat er per frame gewist wordt, kan
 * wel veranderen, en dat is precies wat er moet gebeuren als je midden in een
 * sessie van stand wisselt. De renderlus vraagt het gewoon opnieuw; het kost
 * één attribuutlezing en een vergelijking.
 */
import { useEffect, useState } from 'react';
import * as THREE from 'three';

/** Kleuren worden hergebruikt: een nieuwe Color per frame is puur afval. */
const cache = new Map<number, THREE.Color>();

function colorFor(hex: number): THREE.Color {
  let c = cache.get(hex);
  if (!c) { c = new THREE.Color(hex); cache.set(hex, c); }
  return c;
}

/** Of de app nu op de plaat ligt. */
export function isGlassLook(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement.dataset.look === 'glass';
}

/**
 * Zet de achtergrond van een scene naar de huidige stand.
 *
 * @param opaque de kleur die deze scene in de zwarte stand altijd al gebruikte,
 *               zodat die stand pixel voor pixel blijft zoals hij was.
 */
export function applySceneBackdrop(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene | null,
  opaque: number,
): void {
  if (isGlassLook()) {
    if (scene) scene.background = null;
    renderer.setClearColor(0x000000, 0);
    return;
  }
  if (scene) scene.background = colorFor(opaque);
  renderer.setClearColor(opaque, 1);
}

/**
 * Dezelfde vraag, maar voor React-componenten die opnieuw moeten renderen als
 * de stand wisselt.
 *
 * Kijkt naar het attribuut in plaats van naar een context, omdat de scenes
 * diep in de boom zitten en dit de enige waarheid is die ze allemaal delen --
 * een provider eromheen zou een tweede bron worden die uit de pas kan lopen.
 */
export function useIsGlassLook(): boolean {
  const [glass, setGlass] = useState(isGlassLook);
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setGlass(isGlassLook()));
    obs.observe(el, { attributes: true, attributeFilter: ['data-look'] });
    setGlass(isGlassLook());
    return () => obs.disconnect();
  }, []);
  return glass;
}

/**
 * De achtergrondkleur voor een R3F-scene, of niets in de glasstand.
 *
 * `<color attach="background">` zet scene.background; hem weglaten laat de
 * scene doorzichtig, en dan zie je de plaat eronder in plaats van een gat.
 */
export function SceneBackdrop({ opaque }: { opaque: string }) {
  const glass = useIsGlassLook();
  if (glass) return null;
  return <color attach="background" args={[opaque]} />;
}

/**
 * Of de app ÜBERHAUPT op een plaat ligt -- zwart of glas.
 *
 * Anders dan useIsGlassLook, die alleen op de lichte plaat waar is. Voor de
 * vraag "welke sphere teken ik" is dat het verkeerde onderscheid: de
 * canvas-sphere hoort in béíde standen, want de reden om hem te gebruiken
 * (bloom slaat dicht op een plaat) geldt niet alleen voor glas.
 */
export function useHeeftPlaat(): boolean {
  const [plaat, setPlaat] = useState(
    () => typeof document !== 'undefined' && document.documentElement.dataset.look !== undefined,
  );
  useEffect(() => {
    const el = document.documentElement;
    const kijk = () => setPlaat(el.dataset.look !== undefined);
    const obs = new MutationObserver(kijk);
    obs.observe(el, { attributes: true, attributeFilter: ['data-look'] });
    kijk();
    return () => obs.disconnect();
  }, []);
  return plaat;
}
