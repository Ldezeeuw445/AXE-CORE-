/**
 * De stemmen waaruit je kunt kiezen. Vier, en niet meer.
 *
 * ## Waarom een lijst van vier en geen bibliotheek
 *
 * De instellingen haalden de HELE ElevenLabs-bibliotheek op: tientallen namen
 * met een land en een omschrijving erbij, waarvan je er in de praktijk één
 * gebruikt. Erger: ze klinken voor dit doel nauwelijks verschillend, dus je
 * luistert twintig voorbeelden en kiest alsnog de eerste. Een keuzelijst die je
 * niet kunt beantwoorden is geen keuze maar werk.
 *
 * Vier is wat er echt toe doet: de stem van AXE (Fish), een man en een vrouw
 * bij ElevenLabs voor als je wilt wisselen, en de browser als er niets werkt.
 *
 * ## Waarom de browser erbij hoort
 *
 * Niet als volwaardige stem maar als vangnet: hij heeft geen sleutel en geen
 * internet nodig. Zonder die optie is "de TTS doet het niet" een doodlopende
 * weg; met die optie praat AXE gewoon door terwijl je het uitzoekt.
 */

export type TtsMotor = 'fish' | 'elevenlabs' | 'browser';

export interface StemKeuze {
  id: string;
  naam: string;
  motor: TtsMotor;
  /** Alleen voor ElevenLabs: welke stem daar. */
  stemId?: string;
  /** Eén regel: wanneer kies je deze. */
  uitleg: string;
}

/** De stem die AXE standaard is. */
export const STANDAARD_STEM = 'fish';

export const STEMMEN: readonly StemKeuze[] = [
  {
    id: 'fish',
    naam: 'AXE',
    motor: 'fish',
    uitleg: 'De stem van AXE. Fish Audio, de standaard.',
  },
  {
    id: 'el-man',
    naam: 'Man',
    motor: 'elevenlabs',
    // Adam: diep en rustig. Van de negen die er stonden was dit de enige die
    // als AXE klonk; de rest was variatie zonder verschil.
    stemId: 'pNInz6obpgDQGcFmaJgB',
    uitleg: 'ElevenLabs — diep en rustig.',
  },
  {
    id: 'el-vrouw',
    naam: 'Vrouw',
    motor: 'elevenlabs',
    // Sarah: helder en zakelijk, en niet de fluisterstem die de andere
    // vrouwelijke opties waren.
    stemId: 'EXAVITQu4vr4xnSDxMaL',
    uitleg: 'ElevenLabs — helder en zakelijk.',
  },
  {
    id: 'browser',
    naam: 'Browser',
    motor: 'browser',
    uitleg: 'Het vangnet. Geen sleutel, geen internet nodig.',
  },
] as const;

export function stemVan(id: string): StemKeuze {
  return STEMMEN.find(s => s.id === id) ?? STEMMEN[0];
}
