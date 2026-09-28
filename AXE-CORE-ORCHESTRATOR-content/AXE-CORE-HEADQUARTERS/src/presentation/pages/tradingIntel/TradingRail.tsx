/**
 * Wat er links en rechts naast de trading-tab hangt.
 *
 * ## Waar de tabbalk heen ging
 *
 * Eerst een strook over de volle breedte, toen een schuifpaneel met twaalf
 * regels tekst. Dat paneel moest je openschuiven voordat je kon kiezen, en dan
 * las je nog twaalf namen -- een tweede navigatie naast de navigatie die er al
 * is.
 *
 * Nu kale iconen in de band naast de composer (TradingTabZuil): geen paneel om
 * te openen, geen namen om te lezen, en de naam van de tab waar je overheen
 * gaat verschijnt in zijn eigen kleur.
 *
 * ## Waarom het accounts-paneel weg is
 *
 * Het herhaalde wat de accounts-tab al toont, en je moest het openschuiven om
 * het te zien -- dus het was een tweede pagina die uit de pas kon lopen met de
 * eerste. Precies het bezwaar dat hier eerder als reden stond om er alleen een
 * BLIK van te maken; een blik die je moet openschuiven is geen blik.
 *
 * Op die plek staat nu de radiaal-dok, gespiegeld, met de kill switch in het
 * gat. Dat is wel iets dat je vanuit elke tab binnen handbereik wilt hebben.
 */
import { useState, type ReactNode } from 'react';
import { OctagonX } from 'lucide-react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { PlaatSlot } from '@/presentation/components/layout/PlaatSlots';
import { TradingTabZuil } from './TradingTabZuil';

export function TradingRail({
  tabs, actief, kies, instellingen, opKillSwitch, killBezig,
}: {
  tabs: ReadonlyArray<{ id: string; label: string }>;
  actief: string;
  kies: (id: string) => void;
  /** Wat er in de rechter schuifbalk hoort zolang je op trading bent. */
  instellingen: ReactNode;
  /** Alles plat en de autopilot uit. Zie tradingKillSwitch.ts. */
  opKillSwitch: () => void;
  killBezig: boolean;
}) {
  const [vraagt, setVraagt] = useState(false);
  return (
    <>
      {/* De rechter schuifbalk toont op elke tab iets anders. Op Home blijven
          het Mindset en de snelle acties; hier de instellingen van de desk. */}
      <TabRail kant="rechts">{instellingen}</TabRail>

      {/* De tabs staan nu als kale iconen in de band naast de composer, niet
          meer in een paneel dat je moet openschuiven. Zie TradingTabZuil. */}
      <PlaatSlot slot="links">
        <TradingTabZuil tabs={tabs} actief={actief} kies={kies} />
      </PlaatSlot>

      {/* Rechts in de hoek dezelfde radiaal-dok als links, gespiegeld: het gat
          wijst naar buiten en daar staat de kill switch in plaats van de
          driehoek.

          Het accounts-paneel dat hier stond is weg. Het herhaalde wat de
          accounts-tab al toont, en je moest het openschuiven om het te zien --
          dus het was een tweede pagina die uit de pas kon lopen met de eerste.
          De cijfers staan op de tab zelf, één klik verderop in deze zuil. */}
      {/* De radiaal-dok stond hier, alleen op deze tab. Hij hangt nu in de
          schil (AppShell) en staat dus overal -- een dok die op één pagina
          bestaat is geen dok maar een knop van die pagina.

          De kill switch hoort wél bij deze tab en blijft hier: hij sluit
          posities, en die knop mag niet op een pagina staan waar je niets met
          posities doet. */}

      {vraagt && (
        <KillBevestiging
          bezig={killBezig}
          onJa={() => { setVraagt(false); opKillSwitch(); }}
          onNee={() => setVraagt(false)}
        />
      )}
    </>
  );
}

/**
 * De vraag vóór de kill switch.
 *
 * Zegt wat er gaat gebeuren en niet "weet je het zeker" -- dat laatste
 * beantwoord je met ja zonder te lezen. Annuleren staat links en is de knop
 * waar je op landt; de rode staat rechts en moet je halen.
 */
function KillBevestiging({ bezig, onJa, onNee }: { bezig: boolean; onJa: () => void; onNee: () => void }) {
  return (
    <div
      className="axe-killvraag-achter"
      role="dialog"
      aria-modal="true"
      aria-label="Kill switch bevestigen"
      onClick={onNee}
    >
      <div className="axe-killvraag" onClick={e => e.stopPropagation()}>
        <div className="axe-killvraag-kop">
          <OctagonX size={16} />
          Alles sluiten?
        </div>
        <p className="axe-killvraag-tekst">
          Elke open positie op elke rekening wordt gesloten, de autopilot gaat uit
          en de circuit breaker gaat aan. Dit is niet terug te draaien.
        </p>
        <div className="axe-killvraag-knoppen">
          <button type="button" onClick={onNee} autoFocus>Laat staan</button>
          <button type="button" className="axe-killvraag-ja" onClick={onJa} disabled={bezig}>
            {bezig ? 'Bezig…' : 'Alles sluiten'}
          </button>
        </div>
      </div>
    </div>
  );
}

