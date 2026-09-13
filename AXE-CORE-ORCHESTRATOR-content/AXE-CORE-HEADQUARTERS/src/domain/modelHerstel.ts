/**
 * Een verkeerd opgeslagen modelnaam mag een werkende sleutel niet laten falen.
 *
 * Gemeten 13 september, alle sleutels uit de app getest: Anthropic en
 * Gemini-free gaven direct 200 op hun sleutel, maar elke chat faalde, want in
 * de opslag stond `Claude-sonnet-5` en `Gemini-3.1-pro` -- met een hoofdletter.
 * Cerebras had `gemma-4-31b`, dat daar niet (meer) bestaat. Op het scherm zag
 * dat eruit als "de keys werken niet".
 *
 * Twee regels:
 * 1. Bij deze providers zijn model-ids altijd kleine letters. Een hoofdletter
 *    is dus een typfout (of autocorrectie), geen ander model.
 * 2. Zegt de provider dat het model niet bestaat, dan één keer het
 *    standaardmodel van die provider. Een oud model is geen kapotte sleutel.
 */

const ALTIJD_KLEINE_LETTERS = new Set([
  'anthropic', 'openai', 'google', 'gemini', 'gemini-free', 'xai', 'cerebras', 'groq', 'mistral', 'deepseek',
]);

export function herstelModelNaam(provider: string, model: string | undefined): string | undefined {
  if (!model) return model;
  const schoon = model.trim();
  return ALTIJD_KLEINE_LETTERS.has(provider) ? schoon.toLowerCase() : schoon;
}

/** Zegt deze foutmelding dat het MODEL niet bestaat (en niet de sleutel)? */
export function isModelBestaatNiet(melding: string): boolean {
  return /model[^a-z]{0,3}(not found|does not exist|not_found)|not found for api version|unexpected model name|invalid model|unknown model|no such model|^model: |model_not_found|\bHTTP 404\b/i
    .test(melding);
}
