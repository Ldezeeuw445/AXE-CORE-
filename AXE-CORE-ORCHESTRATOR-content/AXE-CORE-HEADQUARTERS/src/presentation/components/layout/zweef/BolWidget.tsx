/**
 * De bol van Home, op de plaat van de browsertab. Groot, zonder kaart eromheen
 * -- de scène-regel uit DESIGN.md: de bol is het enige dat rechtstreeks op de
 * plaat mag staan. Eronder één ruit-chip als greep en HUD: AXE Core, of hij
 * werkt, hoeveel herinneringen er zijn, en drie knoppen (Home, pin, hide).
 *
 * Het canvas zelf sleep je niet; dat draait de bol. De chip is de greep.
 * Plek, pin en verborgen worden onthouden; `?reset=1` vergeet ze.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { loadMemoryGrowthStats } from '@/infrastructure/persistence/memoryStatsService';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { Zwever } from './Zwever';
import { ZweefIcoon } from './ZweefIcoon';
import { isBezig } from './bezig';
import { bewaarVlag, laadVlag, type Anker, type Maat } from './zweefPositie';

const NAAM = 'bol';
const ANKER: Anker = { rechts: 24, boven: 72 };
/* 400 canvas geeft een zichtbare bol van ~335 px: de bol tekent op 31% van
   zijn vak en het perspectief duwt de voorkant tot 1,36x naar buiten. */
const BOL_MAAT: Maat = { b: 400, h: 424 };
const CHIP: Maat = { b: 120, h: 26 };

/* 19 038, met een spatie als scheiding: zo staat het op de maquette en zo
   leest een teller in mono het rustigst. */
function teller(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function useGeheugenTotaal(): number | null {
  const [totaal, setTotaal] = useState<number | null>(null);
  useEffect(() => {
    let leeft = true;
    const haal = () => {
      void loadMemoryGrowthStats()
        .then((s) => { if (leeft) setTotaal(s.total); })
        .catch(() => {});
    };
    haal();
    const t = window.setInterval(haal, 30_000);
    return () => { leeft = false; window.clearInterval(t); };
  }, []);
  return totaal;
}

export function BolWidget() {
  const navigate = useNavigate();
  const [verborgen, setVerborgen] = useState(() => laadVlag(NAAM, 'verborgen', window.localStorage));
  const [vast, setVast] = useState(() => laadVlag(NAAM, 'vast', window.localStorage));
  const totaal = useGeheugenTotaal();
  const bezig = useVoiceStore((s) => isBezig(s.voiceStatus));

  const zet = (vlag: 'verborgen' | 'vast', aan: boolean) => {
    bewaarVlag(NAAM, vlag, aan, window.localStorage);
    if (vlag === 'verborgen') setVerborgen(aan); else setVast(aan);
  };

  if (verborgen) {
    return (
      <Zwever naam={NAAM} anker={ANKER} maat={CHIP} vast>
        <button type="button" className="axe-ruit axe-zwever__chip" title="Show AXE Core" onClick={() => zet('verborgen', false)}>
          <ZweefIcoon naam="bol" /> AXE Core
        </button>
      </Zwever>
    );
  }

  return (
    <Zwever naam={NAAM} anker={ANKER} maat={BOL_MAAT} vast={vast} className="axe-bol-plaat">
      <div className="axe-bol-plaat__bol">
        <AxeCoreSphere boost={bezig ? 1 : 0} />
      </div>
      <div className={`axe-ruit axe-hud${bezig ? ' axe-ruit--actief' : ''}`} data-greep>
        <span className="axe-hud__tip axe-ruit" aria-hidden="true">drag · pin · hide</span>
        <i className={`axe-stip ${bezig ? 'c-warn' : 'c-ok'}`} />
        <span>AXE Core</span>
        <span className="axe-hud__sep">·</span>
        <span className={bezig ? 'c-warn' : 'c-ok'}>{bezig ? 'thinking' : 'live'}</span>
        {totaal !== null && (
          <>
            <span className="axe-hud__sep">·</span>
            <span className="axe-hud__teller" title="memories">{teller(totaal)}</span>
          </>
        )}
        <span className="axe-hud__knoppen">
          <button type="button" className="axe-zweefknop" title="Back to Home" onClick={() => navigate('/')}>
            <ZweefIcoon naam="home" />
          </button>
          <button type="button" className={`axe-zweefknop${vast ? ' axe-zweefknop--aan' : ''}`} title={vast ? 'Unpin' : 'Pin'} onClick={() => zet('vast', !vast)}>
            <ZweefIcoon naam="speld" />
          </button>
          <button type="button" className="axe-zweefknop" title="Hide" onClick={() => zet('verborgen', true)}>
            <ZweefIcoon naam="kruis" />
          </button>
        </span>
      </div>
    </Zwever>
  );
}
