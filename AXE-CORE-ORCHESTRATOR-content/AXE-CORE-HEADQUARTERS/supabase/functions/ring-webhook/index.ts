// ring-webhook — receives smart-ring / Apple Health vitals pushed from an
// iPhone Shortcuts automation (or any other client that knows the shared
// secret) and writes them into the same `user_settings` row the AXE Core
// UI's SmartRingWidget already reads (key = 'axe_ring_snapshot'). No JWT
// verification (deployed with verify_jwt=false) — auth is a static shared
// secret looked up from core_webhook_secrets (service-role-only table),
// since a Shortcuts automation cannot hold a Supabase user session.
//
// Expected POST body (all fields optional except at least one metric):
// { "steps": 8200, "heartRate": 72, "spo2": 98, "sleepHours": 7.2,
//   "sleepScore": 84, "hrv": 45, "stress": 30, "calories": 420,
//   "temperature": 36.4, "note": "ochtend" }
// Header: Authorization: Bearer <ring_webhook_secret>

import { createClient } from 'npm:@supabase/supabase-js@2';

const METRIC_KEYS = [
  'steps', 'heartRate', 'spo2', 'hrv', 'stress', 'calories',
  'sleepScore', 'sleepHours', 'battery', 'temperature', 'note',
] as const;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const hasMetric = METRIC_KEYS.some((k) => body[k] !== undefined && body[k] !== null);
  if (!hasMetric) {
    return new Response(JSON.stringify({ error: 'No known ring metric fields in body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const providedSecret = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();

  const { data: rows, error: secretErr } = await sb
    .from('core_webhook_secrets')
    .select('name, value')
    .in('name', ['ring_webhook_secret', 'ring_webhook_user_id']);

  if (secretErr || !rows) {
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const expectedSecret = rows.find((r) => r.name === 'ring_webhook_secret')?.value;
  const userId = rows.find((r) => r.name === 'ring_webhook_user_id')?.value;

  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!userId) {
    return new Response(JSON.stringify({ error: 'No target user configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const snapshot: Record<string, unknown> = { source: 'Da Rings (Shortcuts)' };
  for (const key of METRIC_KEYS) {
    if (body[key] !== undefined && body[key] !== null) snapshot[key] = body[key];
  }
  snapshot.updatedAt = new Date().toISOString();

  const { error: upsertErr } = await sb.from('user_settings').upsert(
    {
      user_id: userId,
      key: 'axe_ring_snapshot',
      value: snapshot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' },
  );

  if (upsertErr) {
    return new Response(JSON.stringify({ error: upsertErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, snapshot }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
