# Incident — intel-proxy faalt 73% door een ingetrokken Unusual Whales-sleutel

Vastgesteld 15 oktober 2026 uit de function-logs van het gedeelde project.
Status: **open**, wacht op Luka (nieuwe sleutel).

## Wat je ziet

Laatste 24 uur, `intel-proxy` (v200, `verify_jwt=true`): 367× HTTP 500, 131× 200,
8× 503. Elke 20 minuten mislukken dezelfde vijf bronnen, elk 72 keer:
`unusualOptions`, `darkPoolPrints`, `insiderTrades`, `senateTrades`, `marketTide`.

Foutmelding van Unusual Whales (letterlijk): *"The API token provided has a valid
format but is not recognized. This usually means the token was revoked,
regenerated, or belongs to a different account."*

## Oorzaak

De sleutel is ingetrokken of opnieuw aangemaakt bij Unusual Whales; de oude
waarde staat nog in de geheimen.

## Waar de sleutel staat (alleen namen)

| plek | naam | wie leest hem |
|---|---|---|
| Supabase Edge-geheim, project `pqnngpcgbdwxavbatbia` | `UNUSUAL_WHALES_TOKEN` | `intel-proxy` (Companion-intel) |
| VPS `/opt/axe-core-api/.env` | `UNUSUAL_WHALES_API_KEY` | AXE Core intel-ingest in `/cron/tick` (elke 15 min) |
| Companion-server | `UNUSUAL_WHALES_TOKEN`, schakelaar `UNUSUAL_WHALES_ENABLED` | `src/lib/intel/intelSources.ts`, `/api/internal/key-health` |

## Herstel

1. Luka: nieuwe sleutel ophalen bij Unusual Whales.
2. Zetten als `UNUSUAL_WHALES_TOKEN` in Supabase → Edge Functions → Secrets, en
   als `UNUSUAL_WHALES_API_KEY` op de VPS (daarna `systemctl restart axe-core-api`).
3. Bewijs: in de function-logs van `intel-proxy` geen `uw__api_…_401` meer, en het
   aandeel 500 binnen een uur naar nul.

Tot die tijd kan `UNUSUAL_WHALES_ENABLED=false` in Companion de bron eerlijk
uitzetten in plaats van elke 20 minuten te falen; dat is een productie-instelling
en daarom ook aan Luka.

## Wat dit leert

Een bron die elke 20 minuten 401 geeft hoort na twee keer een melding te geven,
niet drie dagen ruis. Opnemen in de servicebewaker zodra er een key-health-route
is die hij kan lezen (`/api/internal/key-health` van Companion bestaat al).
