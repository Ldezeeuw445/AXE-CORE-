/**
 * Saldo, vermogen en zwevend resultaat per account -- alleen zolang je kijkt.
 *
 * ## Waarom dit aan zichtbaarheid hangt
 *
 * MetaAPI heeft een limiet die deze app al een keer heeft geraakt: vier
 * accounts die te vaak bevraagd worden leveren 429's op, en dan valt de hele
 * desk stil -- niet alleen dit paneel. Een blik-paneel dat blijft pollen
 * terwijl het achter de rand verborgen is, betaalt die prijs voor niets.
 *
 * Dus: `actief` uit, geen verkeer. Aan, één ronde meteen en daarna eens per
 * minuut. Dat laatste getal is met opzet gelijk aan de bestaande afkoeling in
 * de budgetlaag; sneller pollen dan de rem verzet, verzet niets.
 *
 * De cijfers komen langs precies dezelfde weg als de accountpagina zelf
 * (metaApiAccountInfoFor + metaApiPositionsFor). Een tweede route zou een
 * tweede waarheid worden, en dan is de vraag welke van de twee liegt.
 */
import { useEffect, useState } from 'react';
import { getAccounts, type TradingAccount } from '@/infrastructure/persistence/tradingAccountsService';
import { metaApiAccountInfoFor, metaApiPositionsFor } from '@/infrastructure/gateways/metaApiService';

export interface AccountGlance {
  id: string;
  label: string;
  balance: number | null;
  equity: number | null;
  /** Zwevend resultaat: de som van de winst op de open posities. */
  floating: number | null;
  error: string | null;
}

const POLL_MS = 60_000;

async function leesEen(a: TradingAccount): Promise<AccountGlance> {
  const cfg = { token: a.token, accountId: a.accountId, region: a.region, enabled: true, updatedAt: a.addedAt };
  const [info, pos] = await Promise.all([metaApiAccountInfoFor(cfg), metaApiPositionsFor(cfg)]);
  if (!info.ok) {
    return { id: a.id, label: a.label, balance: null, equity: null, floating: null, error: info.error };
  }
  const rows = (pos.ok ? pos.positions : []) as Array<{ profit?: number }>;
  return {
    id: a.id,
    label: a.label,
    balance: info.info.balance,
    equity: info.info.equity,
    // Alleen een som als de posities ook echt binnenkwamen. Anders leest 0 als
    // "vlak" terwijl het "onbekend" betekent -- twee heel verschillende dingen.
    floating: pos.ok ? rows.reduce((n, r) => n + (typeof r.profit === 'number' ? r.profit : 0), 0) : null,
    error: null,
  };
}

export function useAccountGlance(actief: boolean): { accounts: AccountGlance[]; laden: boolean } {
  const [accounts, setAccounts] = useState<AccountGlance[]>([]);
  const [laden, setLaden] = useState(false);

  useEffect(() => {
    if (!actief) return;
    let gestopt = false;

    const ronde = async () => {
      setLaden(true);
      try {
        const state = await getAccounts();
        const aan = state.accounts.filter(a => a.enabled);
        const uit = await Promise.all(aan.map(leesEen));
        if (!gestopt) setAccounts(uit);
      } catch {
        /* Een blik die niet lukt laat gewoon staan wat er stond. */
      } finally {
        if (!gestopt) setLaden(false);
      }
    };

    void ronde();
    const t = setInterval(() => void ronde(), POLL_MS);
    return () => { gestopt = true; clearInterval(t); };
  }, [actief]);

  return { accounts, laden };
}
