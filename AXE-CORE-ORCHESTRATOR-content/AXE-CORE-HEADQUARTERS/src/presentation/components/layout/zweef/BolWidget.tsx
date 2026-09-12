/**
 * De bol van Home, klein, in een ruit rechtsboven op de browsertab. Zo blijft
 * AXE zichtbaar terwijl je op het web zit: de bol draait, de voet telt de
 * herinneringen, en één klik brengt je terug naar Home.
 *
 * Verbergen laat een chip achter op dezelfde plek; die staat er ook na een
 * herstart, tot je hem terughaalt.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { loadMemoryGrowthStats } from '@/infrastructure/persistence/memoryStatsService';
import { Zwever } from './Zwever';
import { ZweefIcoon } from './ZweefIcoon';
import { bewaarVerborgen, laadVerborgen, type Anker, type Maat } from './zweefPositie';

const NAAM = 'bol';
const ANKER: Anker = { rechts: 34, boven: 96 };
const MAAT: Maat = { b: 232, h: 258 };
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
  const [verborgen, setVerborgen] = useState(() => laadVerborgen(NAAM, window.localStorage));
  const totaal = useGeheugenTotaal();

  const zetVerborgen = (aan: boolean) => {
    bewaarVerborgen(NAAM, aan, window.localStorage);
    setVerborgen(aan);
  };

  if (verborgen) {
    return (
      <Zwever naam={NAAM} anker={ANKER} maat={CHIP} vast>
        <button type="button" className="axe-ruit axe-zwever__chip" title="Show AXE Core" onClick={() => zetVerborgen(false)}>
          <ZweefIcoon naam="bol" /> AXE Core
        </button>
      </Zwever>
    );
  }

  return (
    <Zwever naam={NAAM} anker={ANKER} maat={MAAT} className="axe-ruit axe-ruit--actief axe-bolwidget">
      <span className="axe-greep" data-greep />
      <div className="axe-bolwidget__bol">
        <AxeCoreSphere />
      </div>
      <div className="axe-bolwidget__voet">
        <i className="axe-stip c-ok" /> AXE Core · <span className="c-ok">live</span>{totaal !== null ? ` · ${teller(totaal)}` : ''}
        <button type="button" className="axe-zweefknop" title="Back to Home" onClick={() => navigate('/')}>
          <ZweefIcoon naam="home" />
        </button>
        <button type="button" className="axe-zweefknop" title="Hide" onClick={() => zetVerborgen(true)}>
          <ZweefIcoon naam="kruis" />
        </button>
      </div>
    </Zwever>
  );
}
