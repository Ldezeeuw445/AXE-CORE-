/**
 * instrumentEstimate — contractgegevens als er geen broker-specificatie is.
 *
 * De Strategy Lab moet ook zonder verbonden MT5-account kunnen rekenen, maar
 * een schatting mag zich nooit als brokergetal voordoen: alles hier heeft
 * source 'estimate' en een waarschuwing die in het resultaat komt. Waar een
 * account wel verbonden is, gebruikt de lab de specificatie van de broker.
 *
 * Tickwaarde in USD. Bij een USD-genoteerd instrument (EURUSD, XAUUSD) is die
 * vast; bij USD als basis (USDJPY) hangt hij af van de koers en wordt hij per
 * bar herberekend; een cross zonder USD (EURJPY) kan zonder wisselkoers niet
 * in USD — dan rekent de lab in de noteringsvaluta en zegt dat.
 */
import type { InstrumentSpec } from '@/domain/tradingIntel/positionSizing';
import { pairSpec } from '@/domain/tradingIntel/pairRegistry';

export interface LabInstrument {
  spec: InstrumentSpec;
  /** Waarde van één tick per lot bij deze koers, in de valuta van `pnlCurrency`. */
  tickValueAt: (price: number) => number;
  pnlCurrency: string;
  warnings: string[];
}

function fxTick(symbol: string): number {
  return symbol.endsWith('JPY') ? 0.001 : 0.00001;
}

export function estimateInstrument(symbol: string): LabInstrument {
  const s = symbol.trim().toUpperCase();
  const kind = pairSpec(s)?.kind ?? null;
  const warnings = [`${s}: contract specification estimated (no broker spec) — verify against your broker`];
  const base = (spec: Omit<InstrumentSpec, 'symbol' | 'source' | 'minVolume' | 'maxVolume' | 'volumeStep'> & Partial<InstrumentSpec>): InstrumentSpec => ({
    symbol: s, minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, source: 'estimate', ...spec,
  });

  if (kind === 'fx' && s.length === 6) {
    const tickSize = fxTick(s);
    const contractSize = 100_000;
    const perTickQuote = tickSize * contractSize; // in noteringsvaluta
    if (s.endsWith('USD')) {
      return { spec: base({ tickSize, lossTickValue: perTickQuote, contractSize }), tickValueAt: () => perTickQuote, pnlCurrency: 'USD', warnings };
    }
    if (s.startsWith('USD')) {
      return {
        spec: base({ tickSize, lossTickValue: perTickQuote, contractSize }),
        tickValueAt: price => (price > 0 ? perTickQuote / price : NaN),
        pnlCurrency: 'USD', warnings,
      };
    }
    return {
      spec: base({ tickSize, lossTickValue: perTickQuote, contractSize }),
      tickValueAt: () => perTickQuote,
      pnlCurrency: s.slice(3),
      warnings: [...warnings, `${s} is a cross: P&L and risk are in ${s.slice(3)}, not USD`],
    };
  }
  if (kind === 'metal') {
    const silver = s.startsWith('XAG');
    const tickSize = silver ? 0.001 : 0.01;
    const contractSize = silver ? 5_000 : 100;
    const v = tickSize * contractSize;
    return { spec: base({ tickSize, lossTickValue: v, contractSize }), tickValueAt: () => v, pnlCurrency: 'USD', warnings };
  }
  if (kind === 'crypto') {
    return { spec: base({ tickSize: 0.01, lossTickValue: 0.01, contractSize: 1 }), tickValueAt: () => 0.01, pnlCurrency: 'USD', warnings };
  }
  if (kind === 'energy') {
    // Brokers verschillen hier het meest (100 of 1000 vaten per lot).
    return {
      spec: base({ tickSize: 0.01, lossTickValue: 10, contractSize: 1_000 }), tickValueAt: () => 10, pnlCurrency: 'USD',
      warnings: [...warnings, `${s}: 1 lot assumed 1000 units; many brokers use 100`],
    };
  }
  // Indices en onbekend: 1 per punt per lot is de gangbare CFD-definitie.
  return {
    spec: base({ tickSize: 0.01, lossTickValue: 0.01, contractSize: 1 }), tickValueAt: () => 0.01, pnlCurrency: 'USD',
    warnings: [...warnings, `${s}: 1 lot assumed 1 unit per index point`],
  };
}

/** Een broker-specificatie als lab-instrument. De tickwaarde is die van nu, toegepast op het verleden — dat staat erbij. */
export function brokerInstrument(spec: InstrumentSpec): LabInstrument {
  return {
    spec,
    tickValueAt: () => spec.lossTickValue,
    pnlCurrency: spec.accountCurrency ?? 'account',
    warnings: [`${spec.symbol}: broker tick value from today applied to the whole history`],
  };
}
