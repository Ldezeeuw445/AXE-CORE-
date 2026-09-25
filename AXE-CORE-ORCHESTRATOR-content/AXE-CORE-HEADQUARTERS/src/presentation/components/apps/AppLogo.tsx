/**
 * AppLogo — het echte icoon van de app, met een eerlijke terugval.
 *
 * Het register draagt `icon_url` al een tijd en de tab tekende voor elke rij
 * een generiek venster-glyph, dus Axon Memory zag eruit als een lege regel
 * terwijl zijn icoon-URL gewoon in de kolom stond. Dat is opgelost.
 *
 * Daarna bleef het halve werk staan: drie van de vier rijen hadden GEEN
 * icon_url, dus die kregen initialen in een gekleurd vierkantje. Voor de apps
 * die AXE zelf uitbrengt is dat geen terugval maar een plaatshouder -- de echte
 * marks bestonden wel, alleen in een andere repo. Ze zitten nu in de bundel
 * (zie domain/apps/appIconen.ts), en die is ook het vangnet als een remote URL
 * wegvalt: axecompanion.com geeft vandaag 402, en dan hoor je nog steeds het
 * logo te zien en niet ineens twee letters.
 *
 * `object-contain`, niet `object-cover`: het mark van Trading OS is een
 * wordmark van 1233x271. Cover snijdt daar een onleesbare strook uit het
 * midden van -- dat is het logo NIET tonen terwijl het er wel staat.
 */
import { useState } from 'react';
import { icoonBronnen } from '@/domain/apps/appIconen';

interface AppLogoProps {
  name: string;
  iconUrl?: string | null;
  color?: string | null;
  size?: number;
}

/** Eerste letters van de eerste twee woorden: "Axon Memory" → "AM". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export default function AppLogo({ name, iconUrl, color, size = 32 }: AppLogoProps) {
  const bronnen = icoonBronnen(name, iconUrl);

  /* Welke bron we nu proberen. Loopt op bij elke `onError`, dus een dode remote
   * URL zakt door naar het meegeleverde logo in plaats van naar de letters.
   *
   * De teller hangt aan de app waar hij bij hoort. Hertelde deze component naar
   * een andere rij (React hergebruikt hem in het raster), dan zou een los
   * getal blijven staan en zou de nieuwe app meteen op stap 1 beginnen -- dus
   * zijn echte icoon overslaan. Identiteit ernaast zetten en tijdens de
   * weergave vergelijken lost dat op zonder effect: een effect dat state zet,
   * tekent eerst een frame met het verkeerde logo. */
  const identiteit = `${name}|${iconUrl ?? ''}`;
  const [stand, setStand] = useState({ identiteit, stap: 0 });
  const stap = stand.identiteit === identiteit ? stand.stap : 0;

  const tint = color || 'var(--accent-cyan)';
  const bron = bronnen[stap];

  return (
    <div
      className="rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        background: `${tint}18`,
        border: `1px solid ${tint}44`,
      }}
    >
      {bron ? (
        <img
          src={bron}
          alt=""
          width={size}
          height={size}
          className="w-full h-full object-contain"
          // Iconen zijn hier decoratief -- de naam staat ernaast -- dus een
          // trage mag nooit de eerste weergave van het raster ophouden.
          loading="lazy"
          onError={() => setStand({ identiteit, stap: stap + 1 })}
        />
      ) : (
        <span
          className="font-semibold leading-none"
          style={{ color: tint, fontSize: Math.round(size * 0.34) }}
        >
          {initials(name)}
        </span>
      )}
    </div>
  );
}
