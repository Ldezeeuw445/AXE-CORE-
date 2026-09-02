import { forward } from '../../_forward';

/**
 * /api/proxy/ai en alles eronder → de VPS.
 *
 * Was een enkel bestand voor precies /api/proxy/ai. Toen /proxy/ai/providers
 * erbij kwam viel die op de SPA terug: Pages vond geen route, serveerde
 * index.html, en de fetch kreeg HTML waar JSON werd verwacht. Een catch-all
 * dekt de bare route én alles eronder, zodat een nieuw endpoint op de VPS
 * hier niet opnieuw vergeten kan worden.
 */
export const onRequest = ({ request, params }: {
  request: Request;
  params: { path?: string | string[] };
}) => {
  const segments = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const suffix = segments.length ? `/${segments.join('/')}` : '';
  return forward(request, `/proxy/ai${suffix}`);
};
