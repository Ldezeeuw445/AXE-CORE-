# ADR: Eén agent per app -- de manager ÍS de DAX-bot

**Status:** Proposed (wacht op Luka's keuze van de indeling)
**Date:** 2026-11-26
**Deciders:** Luka

## Context

Gemeten 26 nov: er bestaan twee soorten agents naast elkaar.

| Managers (gesprek + lus elke 2 min, `manager_werk.py`) | DAX-bots (eigen container op Strato, `dax.py`) |
|---|---|
| AXE CORE Manager (de baas) | ThinkTank DAX |
| Projects Manager | Developer DAX |
| AXE Companion Manager | -- |
| AXON Memory Manager | -- |
| Trading OS Manager | Trading DAX |
| NorthSea Desk Manager | NorthSea DAX |
| -- | Browser DAX |

Gevolg: twee "NorthSea"'s en twee "Trading"'s; een manager denkt en praat maar
heeft geen eigen computer, een DAX-bot heeft een computer maar geen gesprek.
Luka: "er moeten niet 2 van dezelfde zijn, alle dax bots moeten de managers zijn",
always on, zoals GrokBot.

## Decision (voorstel)

Eén agent per app: **gesprek + lus + eigen DAX-computer** in één identiteit.

| Agent | Krijgt de DAX van | Werk |
|---|---|---|
| AXE CORE Manager | ThinkTank DAX | de baas, ideeën, verdelen |
| Projects Manager | Developer DAX | code, builds, PR's |
| NorthSea Desk Manager | NorthSea DAX | deals, mail, desk |
| Trading OS Manager | Trading DAX | Trading OS (geen orders zonder Luka) |
| AXE Companion Manager | nieuwe DAX | Companion |
| AXON Memory Manager | nieuwe DAX | AXON |

**Browser DAX** wordt geen eigen agent maar een gereedschap: elke DAX-computer
heeft al een browserprofiel; de Browser-bot verdwijnt als aparte naam.

Concreet:
1. Eén register: de manager-id is ook de DAX-id (`dax_id = manager_id`); de oude
   DAX-namen worden aliassen (zelfde volumes, niets verwijderd).
2. De managerlus voert werk uit op zijn eigen DAX (shell, browser, bestanden)
   in plaats van een losse agent-taak naar een andere bot.
3. Managers-tab en roster tonen zes agents; geen tweede NorthSea/Trading meer.
4. Always on: de lus draait al elke 2 min; de DAX-container blijft warm (idle),
   zware taken blijven achter de slots (max 3 tegelijk, 16 GB op Strato).

## Options Considered

### A: Samenvoegen (voorgesteld)
| Dimension | Assessment |
|---|---|
| Complexity | Medium-High (register, lus, UI, migratie van namen) |
| Cost | Twee extra DAX-containers op Strato (idle klein) |
| Duidelijkheid | Hoog: één naam per app, één gesprek, één computer |

### B: Laten staan, alleen koppelen (manager stuurt "zijn" DAX-bot aan)
| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Duidelijkheid | Laag: blijft twee namen per app -- precies wat Luka niet wil |

## Consequences
- Easier: één plek per app om te praten, te zien wat hij doet, en hem te laten uitvoeren.
- Harder: de managerlus krijgt uitvoerrechten op een computer; de grenzen (geen
  geld, geen orders, geen versturen/verwijderen zonder ja) moeten mee naar de DAX.
- Revisit: geheugen per agent (AXON) zodra AXON's sleutel weer werkt.

## Action Items
1. [ ] Luka: akkoord op de indeling hierboven (of anders indelen).
2. [ ] Register + aliassen (geen volumes verwijderen).
3. [ ] Managerlus voert uit op eigen DAX; grenzen meenemen; tests.
4. [ ] Managers-tab en roster: zes agents.
5. [ ] Live bewijs: elke manager doet één echte taak op zijn eigen DAX.
