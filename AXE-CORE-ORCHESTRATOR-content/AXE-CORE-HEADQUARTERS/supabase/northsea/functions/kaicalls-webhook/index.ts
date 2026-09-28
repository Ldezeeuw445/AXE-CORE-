// kaicalls-webhook v2 (P0.9 S5): uitgeschakeld.
// NorthSea gebruikt KaiCalls niet (telefonie = STRATO-assistent, die via e-mail binnenkomt in resend-inbound).
// v1 accepteerde een token in de query-string en schreef ruwe gesprekken weg. Deze versie weigert alles,
// schrijft niets en bevat geen credential. Opnieuw aanzetten = nieuwe versie met HMAC (X-KaiCalls-Signature).
Deno.serve(() =>
  new Response(JSON.stringify({ ok: false, error: "endpoint_disabled", detail: "KaiCalls is not used by NorthSea; phone intake runs through the STRATO assistant." }), {
    status: 410,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })
);
