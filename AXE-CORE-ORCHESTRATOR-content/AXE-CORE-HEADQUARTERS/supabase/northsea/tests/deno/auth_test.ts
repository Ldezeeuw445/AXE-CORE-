import { assertEquals } from "jsr:@std/assert@1";
import { authorizeCommandCenter, type CommandCenterAuthEnv, sha256Hex } from "../../functions/_shared/auth.ts";

const OWNER = "acff7a12-1111-481d-a7a9-cc07583b8069";
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (claims: Record<string, unknown>) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
const req = (headers: Record<string, string>) => new Request("https://x/functions/v1/northsea-command-center", { headers });
const env = async (over: Partial<CommandCenterAuthEnv> = {}): Promise<CommandCenterAuthEnv> => ({
  serviceKeySha256: await sha256Hex("correct-service-key"), ownerUserIds: [OWNER],
  ownerAuthUrl: "https://companion.test", ownerAuthApiKey: "companion-anon", ...over,
});
const noFetch = (() => { throw new Error("fetch must not be called"); }) as unknown as typeof fetch;
const fakeUser = (status: number, id?: string) => (async () => new Response(JSON.stringify(id ? { id } : {}), { status })) as unknown as typeof fetch;

Deno.test("unauthenticated -> 401", async () => {
  const d = await authorizeCommandCenter(req({}), await env(), noFetch);
  assertEquals([d.allowed, d.status], [false, 401]);
});
Deno.test("anon JWT (the exploit) -> 403, no identity lookup", async () => {
  const d = await authorizeCommandCenter(req({ authorization: `Bearer ${jwt({ role: "anon", ref: "kbimnuepbecbyezedvih" })}`, apikey: "x" }), await env(), noFetch);
  assertEquals([d.allowed, d.status, d.reason], [false, 403, "anon_not_accepted"]);
});
Deno.test("publishable / secret project keys -> 403", async () => {
  for (const k of ["sb_publishable_abc", "sb_secret_abc"]) {
    const d = await authorizeCommandCenter(req({ authorization: `Bearer ${k}` }), await env(), noFetch);
    assertEquals([d.allowed, d.status], [false, 403]);
  }
});
Deno.test("service_role JWT is not a scoped credential -> 403", async () => {
  const d = await authorizeCommandCenter(req({ authorization: `Bearer ${jwt({ role: "service_role" })}` }), await env(), noFetch);
  assertEquals([d.allowed, d.reason], [false, "service_role_not_accepted"]);
});
Deno.test("ordinary unrelated authenticated user -> 403 without trusting claims", async () => {
  const d = await authorizeCommandCenter(req({ authorization: `Bearer ${jwt({ role: "authenticated", sub: "25827309-3d91-468e-bb02-2a6091bde9d5" })}` }), await env(), noFetch);
  assertEquals([d.allowed, d.status, d.reason], [false, 403, "not_an_authorized_owner"]);
});
Deno.test("forged owner claims rejected by identity provider -> 401", async () => {
  const d = await authorizeCommandCenter(req({ authorization: `Bearer ${jwt({ role: "authenticated", sub: OWNER })}` }), await env(), fakeUser(401));
  assertEquals([d.allowed, d.status], [false, 401]);
});
Deno.test("token of another user carrying owner sub -> 403", async () => {
  const d = await authorizeCommandCenter(req({ authorization: `Bearer ${jwt({ role: "authenticated", sub: OWNER })}` }), await env(), fakeUser(200, "25827309-3d91-468e-bb02-2a6091bde9d5"));
  assertEquals([d.allowed, d.status], [false, 403]);
});
Deno.test("verified owner session -> allowed", async () => {
  const d = await authorizeCommandCenter(req({ authorization: `Bearer ${jwt({ role: "authenticated", sub: OWNER })}` }), await env(), fakeUser(200, OWNER));
  assertEquals([d.allowed, d.kind, d.scope], [true, "owner", "command_center.read"]);
});
Deno.test("owner auth not configured -> 503 (fail closed)", async () => {
  const d = await authorizeCommandCenter(req({ authorization: `Bearer ${jwt({ role: "authenticated", sub: OWNER })}` }), await env({ ownerAuthUrl: null }), noFetch);
  assertEquals([d.allowed, d.status], [false, 503]);
});
Deno.test("service credential: correct -> allowed with scope; wrong -> 403; unconfigured -> 403", async () => {
  let d = await authorizeCommandCenter(req({ "x-northsea-service-key": "correct-service-key" }), await env(), noFetch);
  assertEquals([d.allowed, d.kind, d.scope], [true, "service", "command_center.read"]);
  d = await authorizeCommandCenter(req({ "x-northsea-service-key": "wrong" }), await env(), noFetch);
  assertEquals([d.allowed, d.status], [false, 403]);
  d = await authorizeCommandCenter(req({ "x-northsea-service-key": "correct-service-key" }), await env({ serviceKeySha256: null }), noFetch);
  assertEquals([d.allowed, d.status], [false, 403]);
});
Deno.test("service header takes precedence: anon bearer + wrong key still denied", async () => {
  const d = await authorizeCommandCenter(req({ "x-northsea-service-key": "nope", authorization: `Bearer ${jwt({ role: "anon" })}` }), await env(), noFetch);
  assertEquals(d.allowed, false);
});
