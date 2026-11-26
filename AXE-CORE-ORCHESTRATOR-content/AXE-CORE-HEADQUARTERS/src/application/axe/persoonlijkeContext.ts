/**
 * Alles wat AXE over Luka weet, in één blok voor elke chatroute (26 nov).
 *
 * Gevonden: de snelle tier-2-route had een eigen prompt en kreeg geen van
 * deze blokken -- "Wie Luka is" (interview), het sessiegeheugen, zijn stem,
 * De Raad, het bureau. Een groot deel van de gewone vragen gaat daarlangs.
 * Nu leest elke route (stableChat, voiceStore, tier 2) hier, zodat er geen
 * route meer tussendoor valt als er een blok bijkomt.
 *
 * Synchroon uit caches, net als de blokken zelf: nooit wachten op het net.
 */
import { sessieGeheugenContext } from '@/application/axe/sessieGeheugen';
import { profielContext } from '@/application/axe/profiel';
import { stemContext } from '@/application/axe/stem';
import { bureauContext } from '@/application/axe/bureau';
import { raadBlok } from '@/domain/chat/raad';

export function persoonlijkeContext(bericht: string): string {
  return sessieGeheugenContext() + profielContext() + stemContext(bericht) + raadBlok(bericht) + bureauContext(bericht);
}
