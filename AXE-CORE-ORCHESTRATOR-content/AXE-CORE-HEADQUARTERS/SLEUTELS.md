# Waar elke sleutel woont

Luka, 8 september: *"ik heb geen idee waar keys staan."* Dit bestand is het
antwoord. Het noemt **namen en plaatsen, nooit waarden** -- het staat in git,
dus er mag niets geheims in.

## De vier plekken

### 1. De kluis op de SSD — de enige bron

```
/Volumes/EagetSSD/AXE-VAULT/secrets.env
```

**103 sleutels.** Dit is de waarheid. Staat een sleutel nergens anders meer,
dan staat hij hier. Alles wat je kwijtraakt haal je hier terug.

Ligt op de SSD en niet in git, en dat is met opzet: git onthoudt alles voor
altijd, ook wat je later weghaalt.

### 2. `.env` in de repo — wat de app bij het bouwen nodig heeft

**15 sleutels.** Alleen wat in de gebouwde app terecht moet komen (`VITE_`) of
wat een script lokaal nodig heeft.

Dit is een KOPIE uit de kluis, geen origineel. Mist er iets, kopieer het uit
`secrets.env` -- niet andersom.

Let op: alles met `VITE_` komt in de bundel en is dus leesbaar voor wie de app
heeft. Zet daar nooit iets in dat geheim moet blijven; die horen op de VPS.

### 3. In de app zelf — jouw providersleutels

Niet in een bestand. Je zet ze in **Instellingen → Keys**, en ze gaan naar:

- `localStorage`, in vier sleuven: `axe_slot_primary`, `axe_slot_fallback1`,
  `2` en `3`
- `user_settings` in Supabase, achter RLS -- daarom kan geen enkel script van
  buitenaf ze lezen, en daarom zegt `axe-status` eerlijk "niet te testen
  vanaf hier" in plaats van te gokken

Dit is de reden dat je op een nieuwe machine je keys opnieuw invoert: ze horen
bij je account, niet bij de map.

### 4. Op de VPS — wat nooit in een browser mag

```
/opt/axe-core-api/.env        op api.axecompanion.com
```

MetaAPI, de cron-sleutel, databasetoegang. Alles wat een browser niet mag zien
staat daar en nergens anders.

## Hoe je iets terugvindt

```bash
grep -o '^[A-Z_]*=' /Volumes/EagetSSD/AXE-VAULT/secrets.env | tr -d '=' | sort
```

Namen, geen waarden. Zoek je een specifieke:

```bash
grep '^OPENAI' /Volumes/EagetSSD/AXE-VAULT/secrets.env
```

## Als er iets niet werkt

| symptoom | kijk hier |
|---|---|
| Een provider antwoordt niet | Instellingen → Keys, knop Test per kaart |
| De app bouwt maar mist iets | `.env`, vergelijken met de kluis |
| De VPS geeft 401 of 500 | `/opt/axe-core-api/.env` op de host |
| Je bent alles kwijt | de kluis. Altijd de kluis. |

## Wat hier niet in staat

Geen enkele waarde. Wie dit bestand leest weet waar hij moet zoeken, niet wat
er staat. Dat onderscheid is het hele punt.
