/**
 * Supabase Edge Function: livekit-token
 * Generates a signed LiveKit JWT token for authenticated users.
 *
 * Flow:
 *   Frontend (Vercel) → POST /functions/v1/livekit-token
 *   → Verifies Supabase auth JWT
 *   → Signs LiveKit token with API_KEY + API_SECRET (from Supabase Vault)
 *   → Returns { token, roomName, livekitUrl }
 *
 * Secrets required in Supabase Vault:
 *   LIVEKIT_API_KEY
 *   LIVEKIT_API_SECRET
 *   LIVEKIT_URL  (wss://axe-core-yma6pgy1.livekit.cloud)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // ── 1. Verify Supabase Auth ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing auth token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Parse request body ────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const roomName  = (body.roomName  as string) || `axe-${user.id.slice(0, 8)}-${Date.now()}`;
    const identity  = (body.identity  as string) || `user:${user.id}`;

    // ── 3. Get LiveKit secrets from Vault ────────────────────────────────
    const apiKey    = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    const livekitUrl = Deno.env.get('LIVEKIT_URL') || 'wss://axe-core-yma6pgy1.livekit.cloud';

    if (!apiKey || !apiSecret) {
      return new Response(JSON.stringify({ error: 'LiveKit not configured on server' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 4. Build LiveKit JWT ─────────────────────────────────────────────
    const now       = Math.floor(Date.now() / 1000);
    const expiresAt = now + 3600; // 1 hour

    const header  = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iss: apiKey,
      sub: identity,
      iat: now,
      nbf: now - 10,
      exp: expiresAt,
      video: {
        roomJoin:     true,
        room:         roomName,
        canPublish:   true,
        canSubscribe: true,
        canPublishData: true,
      },
    };

    const token = await signJwt(header, payload, apiSecret);

    // ── 5. Log session to Supabase (non-blocking) ─────────────────────────
    const sbService = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    sbService.from('core_voice_sessions').insert({
      user_id:          user.id,
      room_name:        roomName,
      livekit_identity: identity,
      status:           'connecting',
    }).then(() => {}).catch(() => {});

    return new Response(
      JSON.stringify({ token, roomName, livekitUrl, identity }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[livekit-token] Error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ── JWT signing helper (no external deps needed) ─────────────────────────
async function signJwt(
  header: Record<string, string>,
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const enc    = new TextEncoder();
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const headerB64  = b64url(header);
  const payloadB64 = b64url(payload);
  const sigInput   = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig    = await crypto.subtle.sign('HMAC', key, enc.encode(sigInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${sigInput}.${sigB64}`;
}
