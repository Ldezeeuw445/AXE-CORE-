/**
 * Polymarket — what money thinks will happen, for the crypto side of Intel.
 *
 * Built in AXE CORE rather than added to Trading OS's intel-proxy, because
 * Polymarket's Gamma API needs no key: routing it through another app's edge
 * function would mean changing an app Luka asked to leave alone, for no
 * benefit. Everything that needs a secret still goes through the proxy.
 *
 * ## Why a prediction market is worth reading
 *
 * It is a price, not an opinion. Measured 2026-08-24 with BTC at ~79 800:
 * "above $80,000 on August 24" was trading at 0.0005 and "dip to $75,000 in
 * August" at 0.355 — a crowd with money down, disagreeing sharply about a
 * level 200 dollars away. That is the kind of thing a flow feed cannot say.
 *
 * Empty is returned on any failure. A prediction market that cannot be reached
 * must not become an agent inventing what the crowd thinks.
 */

const GAMMA = 'https://gamma-api.polymarket.com/markets';

/** Words that make a market about crypto. Deliberately narrow — a market that
 *  merely mentions a coin in passing is noise, not sentiment about it. */
const CRYPTO = /\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|xrp|dogecoin|doge)\b/i;

export interface PredictionMarket {
  question: string;
  /** Probability of the first outcome, 0..1. */
  probability: number | null;
  volume24h: number;
  endsAt: string | null;
}

function firstPrice(raw: unknown): number | null {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || !arr.length) return null;
    const n = Number(arr[0]);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * The busiest open crypto markets, most traded first.
 *
 * Volume is the filter that matters: a market with no money in it is a
 * question nobody answered, and reading it as sentiment would be reading
 * noise as signal.
 */
export async function fetchCryptoPredictions(limit = 8): Promise<PredictionMarket[]> {
  try {
    const res = await fetch(
      `${GAMMA}?closed=false&limit=100&order=volume24hr&ascending=false`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return [];

    return rows
      .filter(m => CRYPTO.test(String(m.question ?? '')))
      .map(m => ({
        question: String(m.question ?? '').slice(0, 160),
        probability: firstPrice(m.outcomePrices),
        volume24h: Number(m.volume24hr ?? 0),
        endsAt: typeof m.endDate === 'string' ? m.endDate : null,
      }))
      .filter(m => m.volume24h > 0)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** One block for a prompt. Says plainly when there is nothing rather than omitting the section. */
export function formatPredictions(markets: PredictionMarket[]): string {
  if (!markets.length) return 'PREDICTION MARKETS: unreachable or nothing open — do not guess what the crowd thinks.';
  const lines = markets.map(m => {
    const pct = m.probability == null ? '?' : `${(m.probability * 100).toFixed(1)}%`;
    return `- ${m.question} → ${pct} (24h volume ${Math.round(m.volume24h).toLocaleString('en-US')})`;
  });
  return ['PREDICTION MARKETS (Polymarket, money at stake — not commentary):', ...lines].join('\n');
}
