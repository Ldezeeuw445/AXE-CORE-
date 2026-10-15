# Teruggezet in productie

Live-code die is vervangen door een stub, letterlijk bewaard zodat terugdraaien
altijd kan. `.txt` zodat geen bouwstap of `supabase functions deploy` ze oppakt.

| functie | wat er nu draait | waarom | origineel | terugdraaien |
|---|---|---|---|---|
| `ai-proxy` | 410 Gone, `verify_jwt=true` (v48, 15 okt) | open doorgeefluik: de aanroeper kiest `baseUrl` en sleutel, de functie haalt het op vanaf Supabase. Geen enkele repo roept hem aan, 0 aanroepen in 24 uur | `ai-proxy.index.ts.txt` (v47) | inhoud als `index.ts` uitrollen met `verify_jwt=false` |
| `ai-proxy-v2` | 410 Gone, `verify_jwt=true` (v47, 15 okt) | idem; heeft nooit in git gestaan | gelijk aan `ai-proxy.index.ts.txt`, alleen regel 1 luidt `// Supabase Edge Function: AI Proxy (PUBLIC — no auth required)` (v46) | idem |

De terugdraai-notitie in de stub van `ai-proxy-v2` noemt commit `efcc04d6`; die
bevat alleen `ai-proxy`. Dit bestand is de juiste bron.

Verwijderen van de functies zelf is onomkeerbaar en daarom aan Luka.
