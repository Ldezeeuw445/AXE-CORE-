import { forward } from '../_forward';

/** POST /api/proxy/ai → de VPS. Zie _forward voor waarom dit zo dun is. */
export const onRequest = ({ request }: { request: Request }) => forward(request, '/proxy/ai');
