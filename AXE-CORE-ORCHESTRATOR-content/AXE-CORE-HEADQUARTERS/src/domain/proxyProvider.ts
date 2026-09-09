/**
 * Onder welke naam een provider bij de VPS-proxy aangeboden wordt.
 *
 * De app kent 'hermes' als eigen provider: een kaart, een eigen model, een
 * eigen testknop. De proxy op de VPS kent die naam ook, maar als AGENT-BRUG --
 * met een HERMES_API_KEY die er niet is. Gevolg: 503 "hermes is not
 * configured", terwijl hermes3:8b gewoon op die machine draait.
 *
 * Wat Hermes werkelijk is, is een model op de Ollama daar. Dus bieden we hem
 * zo aan. De kaart in de app blijft 'hermes' heten -- daar is het een keuze
 * die je maakt, hier is het een adres waar je naartoe belt.
 *
 * Andersom oplossen kon ook: de proxy leren dat hermes een LLM is. Dat is
 * serverwerk voor iets wat aan deze kant één regel is, en het zou een tweede
 * plek maken die weet wat Hermes is.
 */

/** Providers die bij de proxy onder een andere naam bekend zijn. */
const ANDERS_BIJ_DE_PROXY: Record<string, string> = {
  hermes: 'ollama',
};

export function proxyProviderNaam(provider: string): string {
  return ANDERS_BIJ_DE_PROXY[provider] ?? provider;
}

/** Waar of de naam onderweg verandert -- handig om in een fout te melden. */
export function wordtHernoemd(provider: string): boolean {
  return provider in ANDERS_BIJ_DE_PROXY;
}
