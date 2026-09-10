/**
 * Op WELKE machine AXE zijn handen gebruikt.
 *
 * Er kunnen er meerdere ingecheckt staan — een Mac Mini en een iMac — en dat
 * is met opzet: als er één uit staat werkt de andere nog. Maar zonder gekozen
 * voorkeur weigert de relay bij twee machines te kiezen, en terecht: dezelfde
 * repo op twee Macs staat vroeg of laat op twee verschillende takken, en
 * stilletjes de verkeerde nemen geeft een zelfverzekerd verkeerd antwoord.
 *
 * De oplossing is niet raden maar vragen — één keer, en dan onthouden. Deze
 * voorkeur is dat antwoord.
 *
 * Bewust NIET hard: staat de gekozen machine niet online, dan telt hij niet
 * mee en valt de relay terug op zijn eigen regels. Een voorkeur die een
 * uitgezette computer tot enige optie maakt zou precies de zekerheid weghalen
 * die meerdere machines moesten geven.
 */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';

const KEY = 'axe_computer_voorkeur_machine';

/** De gekozen machine, of null als er nooit een gekozen is. */
export async function voorkeurMachine(): Promise<string | null> {
  const v = await loadSetting<string | null>(KEY, null);
  return typeof v === 'string' && v.trim() ? v : null;
}

/** Kies een machine, of geef null om de keuze weer los te laten. */
export async function kiesVoorkeurMachine(deviceId: string | null): Promise<void> {
  await saveSetting(KEY, deviceId);
}

/**
 * Welke van deze machines gebruikt AXE?
 *
 * Puur, zodat de regel te testen is zonder relay: de voorkeur wint als hij
 * ertussen staat, anders beslist de aanroeper zelf (null = "kies zelf maar").
 */
export function kiesUit<T extends { id: string }>(
  machines: readonly T[],
  voorkeur: string | null,
): T | null {
  if (!voorkeur) return null;
  return machines.find(m => m.id === voorkeur) ?? null;
}
