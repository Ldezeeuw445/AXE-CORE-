import { forward } from './_forward';

/** POST /api/exa → de VPS. */
export const onRequest = ({ request }: { request: Request }) => forward(request, '/proxy/exa');
