import { forward, type ForwardEnv } from './_forward';

/** POST /api/exa → de VPS. */
export const onRequest = ({ request, env }: { request: Request; env?: ForwardEnv }) => forward(request, '/proxy/exa', env);
