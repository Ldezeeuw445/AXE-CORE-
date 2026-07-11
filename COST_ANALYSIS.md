# AXE Intelligence — Bloomberg-Grade Data Cost & Sourcing Brief

**Prepared for:** AXE Intelligence Terminal operator
**Last updated:** 2026
**Purpose:** Strategic roadmap for upgrading AXE from free/no-auth OSINT to
true terminal-grade, licensable, redistribution-cleared intelligence — with
honest costs, contract gotchas, and a staged adoption path.

> **Important:** Public pricing for institutional data feeds is *negotiated,
> not advertised*. The figures below are public-domain ballparks from vendor
> RFPs, industry forums, and recent press; treat them as **order of magnitude**
> indications. Always request a written quote for your exact footprint.

---

## 0. TL;DR

| Tier | Annual cost (USD) | What you get | When to consider |
|---|---|---|---|
| **Free / OSINT (today)** | $0 | GDELT, OpenSky, Digitraffic Baltic, NASA FIRMS, USGS, NVD, FRED, World Bank, CoinGecko, Celestrak, AISStream free tier | MVP, signal validation, demo |
| **Prosumer paid feeds** | $5k – $50k | Polygon.io, Twelve Data, ADS-B Exchange Enterprise (limited), AISStream paid, NewsAPI Business | Small fund / single-desk |
| **Pro / Institutional** | $80k – $400k | Refinitiv Real-Time, Spire/exactEarth global AIS, FlightAware Firehose, Mandiant Advantage, Planet Labs PlanetScope | Multi-analyst trading desk |
| **Bloomberg / Palantir parity** | $500k – $5M+ | Bloomberg Terminal x N seats, Refinitiv full feeds, Maxar SecureWatch, Recorded Future Premier, Dataminr Pulse, full sat tasking | Hedge fund / govt / Tier-1 bank |

The most painful gap between OSINT and "Bloomberg-grade" is rarely the data
*content* — it is **latency, completeness, SLA, and redistribution rights**.

---

## 1. Equity / Macro Market Data

### 1.1 Bloomberg Terminal
- **Headline price:** roughly **$28,000–$32,000 per user / year**
  (volume-discounted; minimum 24-month contracts typical).
- **Scope:** ~35M instruments, IB chat, MSG (now hub for systematic flow),
  BSEARCH, BICS, FIGI, and full bulk reference (B-PIPE: add ~$22k+ per
  consumer).
- **Bulk via B-PIPE:** server-side data license adds **$22k–$60k/user/year**
  depending on universe and asset class.
- **Redistribution:** *not allowed* without separate enterprise contract.

### 1.2 LSEG Refinitiv (Eikon → Workspace)
- **Workspace seats:** **$22,000–$24,000/user/year** retail-bank tier.
- **Real-Time Optimized (RTO/Elektron):** **$60k–$300k/year** depending on
  message rate, asset coverage, and exchange entitlement fees (NYSE/NASDAQ/
  CME pass-through fees are *additional* — see §1.4).
- **Datascope / Tick History:** **$30k–$120k/year** for historical tick.

### 1.3 FactSet
- **Workstation:** **$12,000–$18,000/user/year**.
- **Datafeed (CTS):** **$50k–$200k/year**; common AI/quant workflow.

### 1.4 Exchange data (always pay-through)
| Exchange | Pro user / month (display) | Non-display starts at |
|---|---|---|
| NYSE Integrated | ~$60 | $7k–$25k/mo (firm-level) |
| NASDAQ TotalView | ~$76 | $5k–$50k/mo |
| CME MDP3 (futures) | ~$110/connection | $8k–$25k/mo |
| Eurex EOBI | ~€135 | €5k–€15k/mo |

**Free alternatives we already use:** FRED (US macro), World Bank, Frankfurter
(FX), CoinGecko (crypto). For equities: Polygon.io ($199–$2k/mo),
Twelve Data, Tiingo (cheap), or **IEX Cloud** (sunset 2024, but Alpaca / dxFeed
fill the gap).

---

## 2. Aviation Intelligence (ADS-B / Mode-S)

### 2.1 What we have free
- **OpenSky Network** (~6s latency, unauth tier ~10 req/s, drops at scale).
- **adsb.lol / adsb.fi mirrors** (community PiAware).
- **ADS-B Exchange (community web)** — generous but TOS prohibits commercial
  redistribution unless you sign **Enterprise**.

### 2.2 Paid grades
| Vendor | Coverage | Latency | Cost (USD) | Notes |
|---|---|---|---|---|
| **ADS-B Exchange Enterprise** | Global, *no MIL/PIA filtering* | ~1s | **$1k–$15k/mo** | Best of the "unfiltered" providers, popular w/ journalists & funds tracking corporate jets |
| **FlightAware Firehose** | Global commercial + GA | ~2s | **$25k–$120k/yr** | Highest commercial-grade; flight plans, ICAO callsigns. |
| **Flightradar24 Business** | Global, filtered (no MIL) | ~3–5s | **$15k–$45k/yr** | Easy SaaS but filtered. |
| **Spire Aviation** | Satellite-based, oceanic | ~minutes | **$80k–$250k/yr** | Game-changer over oceans (no ground stations). |
| **Aireon** | Truly global, oceanic | ~seconds | **Enterprise only** | Iridium-NEXT hosted ADS-B. Govt/large airlines. |

**For AXE:** the next clear upgrade is **ADS-B Exchange Enterprise** (~$2–5k/mo
starter) — instantly turns our "AIR" pane into genuine corporate-jet tracking
without filtering. Spire only matters once we track trans-oceanic flights.

---

## 3. Maritime AIS

### 3.1 Free coverage today
- **Finnish Digitraffic** — Baltic + parts of North Sea. Very high refresh
  (~1s) but **regional**.
- **AISStream.io** — global *terrestrial* AIS, free tier (now wired into
  AXE). Coverage is good in shipping lanes, sparse in mid-ocean.
- **Norway/HELCOM open feeds** for specific seas.

### 3.2 Paid grades
| Vendor | Coverage | Latency | Cost (USD) | Notes |
|---|---|---|---|---|
| **Spire Maritime** | Global terrestrial + sat AIS | minutes | **$60k–$250k/yr** | Industry leader; partners with Bloomberg's commodity desk. |
| **exactEarth (now Spire)** | Global sat | minutes | merged into Spire | "exactAIS" historical great for back-testing. |
| **Kpler** | Vessel + flow analytics | n/a (cleaned) | **$100k–$600k/yr** | The gold standard for tanker/LNG flows; commodity desks use this. |
| **MarineTraffic Business** | Mostly terrestrial | seconds | **$1k–$8k/mo** | Easy SaaS; visualization-grade. |
| **VesselFinder Pro** | Terrestrial | seconds | **$0.5k–$5k/mo** | Cheap and pleasant API. |
| **Lloyd's List Intelligence** | Ownership + sanctions | n/a | **$25k–$80k/yr** | The way to enrich vessels w/ beneficial-owner + sanctions. |

**For AXE:** AISStream (free, global) + Spire Maritime ($5–15k/mo entry) for
sat coverage is the realistic step. Kpler is the dream once we have AUM to
justify.

---

## 4. Satellite Imagery & EO

| Vendor | Resolution | Cost (USD) | Notes |
|---|---|---|---|
| **ESA Sentinel-1/2** | 10–20m | **Free** | Already excellent for fires / floods. |
| **NASA Landsat** | 15–30m | **Free** | Use for thermal/historical. |
| **NASA FIRMS (we use)** | thermal hotspots | **Free** | VIIRS + MODIS hotspots. |
| **Planet Labs PlanetScope** | 3m daily revisit | **$25k–$200k/yr** subscription | The "Bloomberg of EO." Daily global 3m imagery. |
| **Planet SkySat** | 0.5m tasking | **$10–$25 per km² tasked** | On-demand high-res. |
| **Maxar WorldView / GeoEye** | 0.3–0.5m | **$50k–$5M+/yr** | True intelligence-grade; pricing brutal for non-gov. |
| **Capella Space** | SAR 0.5m | **$50k–$500k/yr** | All-weather, night. Hot for ports + military. |
| **ICEYE** | SAR 0.25m | enterprise | Insurance & defense focus. |

**For AXE:** stay free (Sentinel + FIRMS) until we have a defined use case
(port counts, energy infra). Planet PlanetScope is the realistic next step.

---

## 5. Cyber / Threat Intelligence

| Vendor | Cost (USD) | Notes |
|---|---|---|
| **NVD / CISA KEV (we use)** | Free | Government, lag of hours-days. |
| **VirusTotal Free** | Free | Limited quota. |
| **VirusTotal Premium / Enterprise** | **$15k–$120k/yr** | Live retro-hunting, YARA, intel reports. |
| **Mandiant Advantage Threat Intel** | **$50k–$300k/yr** | Premium APT attribution + advisories. |
| **Recorded Future Premier** | **$100k–$500k/yr** | Hands-down the best aggregated intel. Tied to Bloomberg's risk pulse. |
| **Flashpoint / Intel 471** | **$60k–$250k/yr** | Dark-web focus. |
| **GreyNoise Enterprise** | **$15k–$60k/yr** | Background-noise filtering — invaluable for SOCs. |
| **CrowdStrike Falcon X** | bundled w/ EDR | Already in many enterprises. |

**For AXE:** keep NVD/CISA free; add VirusTotal Premium when we need
file/IOC enrichment. Recorded Future is the "premier" target.

---

## 6. News & Geopolitical Streams

| Vendor | Cost (USD) | Notes |
|---|---|---|
| **GDELT 2.0 (we use)** | Free | 15-min refresh, multi-lingual; the workhorse. |
| **NewsAPI.org Business** | **$449–$1k/mo** | Easy REST, no redistribution. |
| **NewsCatcher API** | **$1.5k–$5k/mo** | Better SLAs, paywall coverage. |
| **AYLIEN** | **$3k–$15k/mo** | Entity-tagged news + sentiment. |
| **Dow Jones Newswires (Factiva)** | **$30k–$200k/yr** | Premium licensed wires. |
| **Bloomberg News + B-Pipe News** | bundled w/ Terminal | Licensed real-time wires. |
| **Reuters Eikon News** | **$15k–$30k/seat/yr** | Licensed real-time wires. |
| **Dataminr Pulse** | **$60k–$400k/yr** | Twitter/X firehose + emerging-event detection. |
| **Dataminr First Alert (gov)** | enterprise | Used by US/EU agencies. |

**For AXE:** GDELT is enormous and free; the realistic upgrade is
**NewsAPI Business → AYLIEN** for entity-tagged sentiment.

---

## 7. Commodities & Energy

| Vendor | Cost (USD) | Notes |
|---|---|---|
| **EIA (US gov)** | Free | Crude/refined product stocks. |
| **OPEC monthly reports** | Free | Production, demand. |
| **Vortexa** | **$80k–$500k/yr** | Real-time tanker + flow analytics; competes w/ Kpler. |
| **ICIS / Argus / Platts** | **$30k–$200k/yr each** | Price benchmarks (Platts Dated Brent etc.). |
| **Wood Mackenzie** | enterprise | Asset-level energy intel. |

---

## 8. Macro / Alt-Data

| Vendor | Cost (USD) | Notes |
|---|---|---|
| **FRED / World Bank (we use)** | Free | The bedrock. |
| **Quandl / Nasdaq Data Link** | **$50–$2k/mo per dataset** | Hundreds of curated alt-datasets. |
| **YipitData** | **$50k–$300k/yr per dataset** | Consumer panel, app usage. |
| **Second Measure (Bloomberg)** | bundled | Card-spending panel. |
| **Earnest Analytics** | **$50k–$250k/yr** | Card + email receipts. |
| **SimilarWeb Enterprise** | **$15k–$80k/yr** | Web/app traffic. |
| **Apptopia** | **$10k–$60k/yr** | Mobile app SDK estimates. |

---

## 9. Space / Orbital Awareness

| Vendor | Cost (USD) | Notes |
|---|---|---|
| **Celestrak (we use)** | Free | Public TLE catalog. |
| **Space-Track.org** | Free (gov-vetted) | US-published catalog. |
| **LeoLabs Vertex** | **$50k–$500k/yr** | Commercial radar SSA — collision and rendezvous alerts. |
| **Slingshot Aerospace** | enterprise | Global SDA fusion. |
| **NorthStar EO** | enterprise | Pre-revenue but billed as "Bloomberg of space." |

---

## 10. Compliance, Sanctions, KYC

| Vendor | Cost (USD) | Notes |
|---|---|---|
| **OFAC / EU / UK sanctions lists** | Free | Public XML/CSV. |
| **Refinitiv World-Check One** | **$15k–$120k/yr** | PEP + sanctions screening, the de facto. |
| **Dow Jones Risk & Compliance** | **$15k–$120k/yr** | Major competitor to World-Check. |
| **Sayari Graph** | **$50k–$400k/yr** | Beneficial-owner intelligence used by US Treasury. |

---

## 11. The "Bloomberg Terminal" mental model

A real Bloomberg-grade desk is **not one feed** — it is the *integration*:

1. **One identifier graph** (FIGI / RIC / BBGID / ISIN cross-walk) keeps every
   instrument lined up across every dataset.
2. **One entity graph** (people, companies, vessels, jets, sanctions) makes
   alerting fire on the *right* signal.
3. **One alerting fabric** with low-latency, ACL-controlled distribution.
4. **Click-through provenance** — every cell on the screen has a citation.

AXE today already nails (3) and partially (4). To move toward Bloomberg parity
on (1) and (2), the cheapest practical step is:

- License **OpenFIGI** (free) for instrument ids.
- License **GLEIF LEI** (free) for legal entity ids.
- License **OpenSanctions** (free; commercial add-on for SLA) for sanctions.
- Optionally license **Sayari Graph** (paid) when ownership intelligence becomes
  the differentiator.

---

## 12. Recommended staged upgrade path for AXE

### Stage 1 — *Already done* (free, $0)
- GDELT, OpenSky, Digitraffic, NASA FIRMS, USGS, NVD, FRED, CoinGecko, Celestrak.
- **AISStream.io** global feed — already wired in this release.
- AI cross-source correlation via Emergent LLM Key.

### Stage 2 — *Cheap upgrade* (~$10–25k / year)
- **ADS-B Exchange Enterprise** ($2–5k/mo): unfiltered jet tracking.
- **NewsAPI Business** ($450–1k/mo): backup news firehose with SLA.
- **VirusTotal Premium** ($15k/yr): IOC enrichment.
- **Polygon.io Developer** ($199–$2k/mo): real-time US equities.

### Stage 3 — *Pro desk* ($80–200k / year)
- **Spire Maritime** ($60–120k/yr): sat AIS, mid-ocean coverage.
- **Mandiant Advantage** ($60–120k/yr): premium cyber.
- **Planet PlanetScope** ($25–50k/yr): daily 3m global EO.
- **AYLIEN / NewsCatcher Pro** ($15–30k/yr): entity-tagged news.

### Stage 4 — *Bloomberg parity* ($500k–$2M / year)
- **Bloomberg Terminal × N seats** ($28k each).
- **Refinitiv RTO** for tick history & cross-asset.
- **Recorded Future Premier** ($150–300k/yr).
- **Dataminr Pulse** ($100–250k/yr).
- **Kpler** for energy flows ($100–300k/yr).
- **Maxar SecureWatch** for tasking sat imagery.

---

## 13. Critical legal notes

- **Redistribution is *not* default-allowed** for any paid feed. Build AXE's
  data layer with a clear *consumer* model: each operator authenticates and
  pulls from servers we license; we never expose raw vendor data publicly.
- **Exchange data has pass-through fees** that scale with users; even
  Polygon.io's "real-time" feed is subject to NMS fees if shown to retail.
- **News content is copyrighted.** Even GDELT only gives us *links* + machine
  annotations, not the article body. AYLIEN/Reuters require licensing for
  full text.
- **PII screening:** AIS, ADS-B, sanctions, and ownership data can include
  personal data under GDPR. Sayari/World-Check contracts include DPA addenda.

---

## 14. AXE-specific opinion

For an operator-grade trading intelligence desk **without** Bloomberg AUM,
the highest-ROI sequencing is:

1. **AISStream + ADS-B Exchange Enterprise** — unlocks real corp-jet and global
   tanker tracking *today* for under $5k/mo.
2. **Polygon.io / dxFeed real-time equities** — gets us tradeable tickers.
3. **AYLIEN entity-tagged news** — replaces our GDELT raw stream with
   instrument-linked sentiment.
4. **VirusTotal Premium** — closes the cyber gap.
5. Only when AUM crosses ~$50M do **Spire Maritime**, **Mandiant**, and a
   **single Bloomberg seat** make ROI sense.

That progression keeps AXE feeling like a **Bloomberg / Palantir hybrid** at
1–3% of their cost while keeping all data legally redistributable to the
operator.

---

*End of brief.*
