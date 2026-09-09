import type { LucideIcon } from 'lucide-react';
import { Bot, Brain, Globe, Hand, Key, Rocket, Router, Search, Server, Sparkles, Terminal, Users, Zap } from 'lucide-react';

/**
 * Zet de icoonnaam uit de catalogus om in een component.
 *
 * De catalogus staat in domain/ en mag daarom niets van React weten -- daar is
 * het icoon een naam. Dit is de enige plek die die naam omzet, zodat het
 * instellingenscherm en de uitschuifbalk gegarandeerd hetzelfde plaatje bij
 * dezelfde provider zetten.
 *
 * Een onbekende naam geeft Key en niet null: een kaart zonder icoon is smaller
 * dan de rest, en dan valt het raster uit de lijn om een reden die niets met
 * de provider te maken heeft.
 */
const ICONEN: Record<string, LucideIcon> = {
  Bot, Brain, Globe, Hand, Key, Rocket, Router, Search, Server, Sparkles, Terminal, Users, Zap,
};

export function providerIcoon(naam: string): LucideIcon {
  return ICONEN[naam] ?? Key;
}
