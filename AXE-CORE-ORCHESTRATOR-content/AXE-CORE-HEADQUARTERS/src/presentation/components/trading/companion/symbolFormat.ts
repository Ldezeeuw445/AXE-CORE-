export function priceDigitsForSymbol(symbol: string): number {
  const s = (symbol ?? "").toUpperCase();
  if (!s) return 5;
  if (s.includes("JPY") || s.startsWith("XAU") || s.startsWith("GOLD")) return 3;
  if (s.startsWith("BTC") || s.startsWith("ETH")) return 2;
  if (/^[A-Z]{2,5}USD$/.test(s) && s.length <= 8) return 2;
  if (s.length === 6) return 5;
  return 5;
}
