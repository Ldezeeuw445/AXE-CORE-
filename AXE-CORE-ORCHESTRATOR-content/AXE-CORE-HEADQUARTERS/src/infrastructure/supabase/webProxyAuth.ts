/**
 * Zet Luka's Supabase-sessie op elk verzoek naar de web-proxy (WEB_AXE_PROXY).
 *
 * axe-core-proxy laat alleen de eigenaar door, en de AXE API wordt vanaf
 * zeventien plekken aangeroepen. Die elk zelf een token laten ophalen zijn
 * zeventien kansen om het te vergeten; dit is er één. Alleen verzoeken naar die
 * ene basis-URL worden aangeraakt. Een Authorization die de aanroeper zelf
 * meegaf wordt vervangen: de proxy kent alleen de sessie en zet de VPS-sleutel
 * er zelf bij.
 */
export function installeerWebProxyAuth(
  basis: string,
  sessieToken: () => Promise<string | null>,
  anonSleutel: string,
): void {
  const origineel = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(`${basis}/`) && url !== basis) return origineel(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const token = await sessieToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (anonSleutel && !headers.has('apikey')) headers.set('apikey', anonSleutel);

    return input instanceof Request
      ? origineel(new Request(input, { ...init, headers }))
      : origineel(input, { ...init, headers });
  };
}
