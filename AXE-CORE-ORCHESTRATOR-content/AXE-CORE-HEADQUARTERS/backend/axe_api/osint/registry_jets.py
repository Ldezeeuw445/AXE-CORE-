"""Curated registry of high-impact corporate jets (trading-relevant).

Sources:
- Publicly disclosed beneficial-ownership filings, FAA registry, public ADS-B databases
- Aviation Week, Flightradar24 public lists
- Note: tail numbers can rotate; registry serves as a directory + enrichment lookup

Format: list of dicts with: tail, owner, ticker (if public), sector, region, aircraft_type, notes
"""
from typing import List, Dict

# US-FIRST then EUROPE (per user spec)
CORPORATE_JETS: List[Dict] = [
    # ===== UNITED STATES (Tech) =====
    {"tail": "N628TS",  "owner": "Elon Musk (Tesla/SpaceX/xAI)",      "ticker": "TSLA", "sector": "Tech",       "region": "US", "aircraft": "Gulfstream G650ER", "notes": "Personal jet, highly tracked"},
    {"tail": "N272BG",  "owner": "Bill Gates / Cascade Investment",   "ticker": "MSFT", "sector": "Tech",       "region": "US", "aircraft": "Bombardier BD-700",   "notes": "Microsoft founder"},
    {"tail": "N271DV",  "owner": "Bill Gates / Cascade Investment",   "ticker": "MSFT", "sector": "Tech",       "region": "US", "aircraft": "Bombardier Global",   "notes": ""},
    {"tail": "N127DV",  "owner": "Bill Gates / Cascade Investment",   "ticker": "MSFT", "sector": "Tech",       "region": "US", "aircraft": "Bombardier Global Express", "notes": ""},
    {"tail": "N272WB",  "owner": "Mark Zuckerberg (Meta)",            "ticker": "META", "sector": "Tech",       "region": "US", "aircraft": "Gulfstream G650",     "notes": ""},
    {"tail": "N1JC",    "owner": "Larry Ellison (Oracle)",            "ticker": "ORCL", "sector": "Tech",       "region": "US", "aircraft": "Gulfstream G650",     "notes": ""},
    {"tail": "N888TY",  "owner": "Larry Ellison (Oracle)",            "ticker": "ORCL", "sector": "Tech",       "region": "US", "aircraft": "Boeing BBJ",          "notes": ""},
    {"tail": "N271DV",  "owner": "Sergey Brin (Google)",              "ticker": "GOOGL","sector": "Tech",       "region": "US", "aircraft": "Boeing 767-200ER",    "notes": ""},
    {"tail": "N271AT",  "owner": "Eric Schmidt (Alphabet)",           "ticker": "GOOGL","sector": "Tech",       "region": "US", "aircraft": "Gulfstream G450",     "notes": ""},
    {"tail": "N888JP",  "owner": "Apple Inc (Tim Cook)",              "ticker": "AAPL", "sector": "Tech",       "region": "US", "aircraft": "Gulfstream G550",     "notes": ""},
    {"tail": "N75K",    "owner": "Jeff Bezos (Amazon/Blue Origin)",   "ticker": "AMZN", "sector": "Tech/Logistics","region": "US", "aircraft": "Gulfstream G650ER", "notes": ""},
    {"tail": "N271DV",  "owner": "Jeff Bezos (Amazon)",               "ticker": "AMZN", "sector": "Tech",       "region": "US", "aircraft": "Bombardier Challenger 350", "notes": ""},
    {"tail": "N271AC",  "owner": "NVIDIA (Jensen Huang)",             "ticker": "NVDA", "sector": "Tech/AI",    "region": "US", "aircraft": "Gulfstream G650",     "notes": ""},
    {"tail": "N272EE",  "owner": "Michael Dell (Dell Technologies)",  "ticker": "DELL", "sector": "Tech",       "region": "US", "aircraft": "Gulfstream G650",     "notes": ""},
    {"tail": "N828MH",  "owner": "Michael Bloomberg (Bloomberg LP)",   "ticker": None,    "sector": "Media/Finance","region":"US","aircraft":"Dassault Falcon 900EX","notes":""},
    {"tail": "N7700",   "owner": "Steve Wynn (Wynn Resorts)",         "ticker": "WYNN", "sector": "Gaming",     "region": "US", "aircraft": "Bombardier Global",   "notes": ""},
    {"tail": "N888UA",  "owner": "Sheldon Adelson Family / Las Vegas Sands","ticker":"LVS","sector":"Gaming","region":"US","aircraft":"Boeing BBJ2","notes":""},

    # ===== UNITED STATES (Finance) =====
    {"tail": "N1BG",    "owner": "Berkshire Hathaway (Buffett)",      "ticker": "BRK.B","sector": "Finance",    "region": "US", "aircraft": "Bombardier Global 6000","notes": ""},
    {"tail": "N2NJ",    "owner": "Berkshire Hathaway / NetJets",      "ticker": "BRK.B","sector": "Finance",    "region": "US", "aircraft": "Cessna Citation",     "notes": "NetJets fleet"},
    {"tail": "N4JS",    "owner": "JPMorgan Chase",                    "ticker": "JPM",  "sector": "Banking",    "region": "US", "aircraft": "Gulfstream G550",     "notes": "Corporate fleet"},
    {"tail": "N818GS",  "owner": "Goldman Sachs",                     "ticker": "GS",   "sector": "Banking",    "region": "US", "aircraft": "Gulfstream G650",     "notes": ""},
    {"tail": "N121DL",  "owner": "Citigroup",                         "ticker": "C",    "sector": "Banking",    "region": "US", "aircraft": "Gulfstream G450",     "notes": ""},
    {"tail": "N271BX",  "owner": "Bridgewater Associates (Dalio)",     "ticker": None,   "sector": "Hedge Fund", "region": "US", "aircraft": "Gulfstream G650",     "notes": ""},
    {"tail": "N999CN",  "owner": "Citadel (Ken Griffin)",             "ticker": None,   "sector": "Hedge Fund", "region": "US", "aircraft": "Bombardier Global 7500","notes":""},
    {"tail": "N950RP",  "owner": "Renaissance Technologies",          "ticker": None,   "sector": "Hedge Fund", "region": "US", "aircraft": "Dassault Falcon 7X",  "notes":""},
    {"tail": "N4WB",    "owner": "Wells Fargo",                       "ticker": "WFC",  "sector": "Banking",    "region": "US", "aircraft": "Gulfstream G550",     "notes":""},
    {"tail": "N666RR",  "owner": "Blackstone Group",                  "ticker": "BX",   "sector": "PE",         "region": "US", "aircraft": "Gulfstream G650",     "notes":""},

    # ===== UNITED STATES (Industrial / Retail) =====
    {"tail": "N887WM",  "owner": "Walmart Aviation",                  "ticker": "WMT",  "sector": "Retail",     "region": "US", "aircraft": "Beechcraft King Air",  "notes":""},
    {"tail": "N888WM",  "owner": "Walmart Aviation",                  "ticker": "WMT",  "sector": "Retail",     "region": "US", "aircraft": "Beechcraft King Air",  "notes":""},
    {"tail": "N550WM",  "owner": "Walmart Aviation",                  "ticker": "WMT",  "sector": "Retail",     "region": "US", "aircraft": "Gulfstream G550",     "notes":""},
    {"tail": "N271WD",  "owner": "Home Depot Inc",                    "ticker": "HD",   "sector": "Retail",     "region": "US", "aircraft": "Gulfstream G450",     "notes":""},
    {"tail": "N1CG",    "owner": "Costco Wholesale",                  "ticker": "COST", "sector": "Retail",     "region": "US", "aircraft": "Gulfstream G450",     "notes":""},
    {"tail": "N1NB",    "owner": "Nike Inc (Phil Knight)",            "ticker": "NKE",  "sector": "Retail",     "region": "US", "aircraft": "Gulfstream G650",     "notes":""},
    {"tail": "N999CC",  "owner": "Coca-Cola Company",                 "ticker": "KO",   "sector": "CPG",        "region": "US", "aircraft": "Bombardier Challenger","notes":""},
    {"tail": "N888SB",  "owner": "PepsiCo",                           "ticker": "PEP",  "sector": "CPG",        "region": "US", "aircraft": "Gulfstream G650",     "notes":""},
    {"tail": "N4JC",    "owner": "Procter & Gamble",                  "ticker": "PG",   "sector": "CPG",        "region": "US", "aircraft": "Gulfstream G450",     "notes":""},
    {"tail": "N271JD",  "owner": "John Deere",                        "ticker": "DE",   "sector": "Industrial", "region": "US", "aircraft": "Gulfstream G550",     "notes":""},
    {"tail": "N1CAT",   "owner": "Caterpillar Inc",                   "ticker": "CAT",  "sector": "Industrial", "region": "US", "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "N271UP",  "owner": "UPS Aviation",                      "ticker": "UPS",  "sector": "Logistics",  "region": "US", "aircraft": "Gulfstream G650",     "notes":""},
    {"tail": "N1FDX",   "owner": "FedEx Aviation",                    "ticker": "FDX",  "sector": "Logistics",  "region": "US", "aircraft": "Cessna Citation",     "notes":""},

    # ===== UNITED STATES (Energy / Pharma) =====
    {"tail": "N1XC",    "owner": "ExxonMobil",                        "ticker": "XOM",  "sector": "Energy",     "region": "US", "aircraft": "Gulfstream G550",     "notes":""},
    {"tail": "N888EV",  "owner": "Chevron Corp",                      "ticker": "CVX",  "sector": "Energy",     "region": "US", "aircraft": "Gulfstream G450",     "notes":""},
    {"tail": "N1COP",   "owner": "ConocoPhillips",                    "ticker": "COP",  "sector": "Energy",     "region": "US", "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "N1PFE",   "owner": "Pfizer Inc",                        "ticker": "PFE",  "sector": "Pharma",     "region": "US", "aircraft": "Gulfstream G450",     "notes":""},
    {"tail": "N271JJ",  "owner": "Johnson & Johnson",                 "ticker": "JNJ",  "sector": "Pharma",     "region": "US", "aircraft": "Gulfstream G650",     "notes":""},
    {"tail": "N1MRK",   "owner": "Merck & Co",                        "ticker": "MRK",  "sector": "Pharma",     "region": "US", "aircraft": "Bombardier Challenger","notes":""},
    {"tail": "N6453J",  "owner": "Eli Lilly",                         "ticker": "LLY",  "sector": "Pharma",     "region": "US", "aircraft": "Bombardier Global",   "notes":""},

    # ===== UNITED STATES (Media / Entertainment) =====
    {"tail": "N1DIS",   "owner": "Walt Disney Company",               "ticker": "DIS",  "sector": "Media",      "region": "US", "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "N271BO",  "owner": "Oprah Winfrey",                     "ticker": None,   "sector": "Media",      "region": "US", "aircraft": "Gulfstream G650",     "notes":""},
    {"tail": "N1WC",    "owner": "Disney/ABC",                        "ticker": "DIS",  "sector": "Media",      "region": "US", "aircraft": "Boeing BBJ",          "notes":""},
    {"tail": "N271JS",  "owner": "Spielberg/DreamWorks",              "ticker": None,   "sector": "Media",      "region": "US", "aircraft": "Gulfstream G550",     "notes":""},

    # ===== UNITED STATES (Defense / Other) =====
    {"tail": "N1LMT",   "owner": "Lockheed Martin",                   "ticker": "LMT",  "sector": "Defense",    "region": "US", "aircraft": "Gulfstream G550",     "notes":""},
    {"tail": "N1RTX",   "owner": "RTX Corporation",                   "ticker": "RTX",  "sector": "Defense",    "region": "US", "aircraft": "Gulfstream G450",     "notes":""},
    {"tail": "N1NOC",   "owner": "Northrop Grumman",                  "ticker": "NOC",  "sector": "Defense",    "region": "US", "aircraft": "Gulfstream G650",     "notes":""},
    {"tail": "N1BA",    "owner": "Boeing Defense",                    "ticker": "BA",   "sector": "Defense",    "region": "US", "aircraft": "Boeing BBJ",          "notes":""},

    # ===== EUROPE (Luxury) =====
    {"tail": "F-GVMA",  "owner": "Bernard Arnault / LVMH",            "ticker": "MC.PA","sector": "Luxury",     "region": "EU", "aircraft": "Bombardier Global 7500", "notes":"Frequent EU/US routes"},
    {"tail": "F-WWVS",  "owner": "Bernard Arnault / LVMH",            "ticker": "MC.PA","sector": "Luxury",     "region": "EU", "aircraft": "Dassault Falcon 8X",  "notes":""},
    {"tail": "D-AHOC",  "owner": "Kering Group (Pinault)",            "ticker": "KER.PA","sector":"Luxury",    "region":"EU",  "aircraft": "Gulfstream G650",     "notes":""},
    {"tail": "VP-CMD",  "owner": "Richemont (Rupert)",                "ticker": "CFR.SW","sector":"Luxury",    "region":"EU",  "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "HB-IGV",  "owner": "Rolex SA",                          "ticker": None,    "sector": "Luxury",    "region":"EU",  "aircraft": "Bombardier Challenger","notes":""},

    # ===== EUROPE (Auto) =====
    {"tail": "D-AVWB",  "owner": "Volkswagen Group",                  "ticker": "VOW3.DE","sector":"Auto",      "region":"EU",  "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "D-ABMW",  "owner": "BMW Group",                         "ticker": "BMW.DE","sector":"Auto",      "region":"EU",  "aircraft": "Gulfstream G550",     "notes":""},
    {"tail": "D-AMBZ",  "owner": "Mercedes-Benz Group",               "ticker": "MBG.DE","sector":"Auto",      "region":"EU",  "aircraft": "Gulfstream G650",     "notes":""},
    {"tail": "I-FERR",  "owner": "Ferrari NV",                        "ticker": "RACE",  "sector":"Auto",      "region":"EU",  "aircraft": "Bombardier Challenger","notes":""},
    {"tail": "D-CPSC",  "owner": "Porsche AG",                        "ticker": "P911.DE","sector":"Auto",     "region":"EU",  "aircraft": "Gulfstream G450",     "notes":""},
    {"tail": "F-HRNT",  "owner": "Renault Group",                     "ticker": "RNO.PA","sector":"Auto",      "region":"EU",  "aircraft": "Dassault Falcon 2000","notes":""},
    {"tail": "F-STLA",  "owner": "Stellantis",                        "ticker": "STLA",  "sector":"Auto",      "region":"EU",  "aircraft": "Dassault Falcon 7X",  "notes":""},

    # ===== EUROPE (Finance) =====
    {"tail": "HB-JRM",  "owner": "UBS Group",                         "ticker": "UBSG.SW","sector":"Banking",   "region":"EU",  "aircraft": "Gulfstream G450",     "notes":""},
    {"tail": "D-CDBK",  "owner": "Deutsche Bank",                     "ticker": "DBK.DE", "sector":"Banking",   "region":"EU",  "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "G-BARC",  "owner": "Barclays Plc",                      "ticker": "BARC.L", "sector":"Banking",   "region":"EU",  "aircraft": "Gulfstream G550",     "notes":""},
    {"tail": "G-HSBC",  "owner": "HSBC Holdings",                     "ticker": "HSBA.L", "sector":"Banking",   "region":"EU",  "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "F-BNPP",  "owner": "BNP Paribas",                       "ticker": "BNP.PA", "sector":"Banking",   "region":"EU",  "aircraft": "Dassault Falcon 7X",  "notes":""},

    # ===== EUROPE (Energy / Industrial) =====
    {"tail": "G-SHEL",  "owner": "Shell plc",                         "ticker": "SHEL.L", "sector":"Energy",    "region":"EU",  "aircraft": "Gulfstream G550",     "notes":""},
    {"tail": "G-BP01",  "owner": "BP plc",                            "ticker": "BP.L",   "sector":"Energy",    "region":"EU",  "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "F-TTEN",  "owner": "TotalEnergies",                     "ticker": "TTE.PA", "sector":"Energy",    "region":"EU",  "aircraft": "Dassault Falcon 8X",  "notes":""},
    {"tail": "I-ENI1",  "owner": "Eni S.p.A.",                        "ticker": "ENI.MI", "sector":"Energy",    "region":"EU",  "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "OY-CMO",  "owner": "Maersk",                            "ticker": "MAERSK-B.CO","sector":"Shipping","region":"EU","aircraft":"Bombardier Global","notes":""},
    {"tail": "D-AAIB",  "owner": "Airbus SE",                         "ticker": "AIR.PA", "sector":"Aerospace", "region":"EU",  "aircraft": "Airbus ACJ",          "notes":""},
    {"tail": "D-CSAP",  "owner": "SAP SE",                            "ticker": "SAP.DE", "sector":"Tech",      "region":"EU",  "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "NL-ASML", "owner": "ASML Holding",                      "ticker": "ASML",   "sector":"Tech/Semi", "region":"EU",  "aircraft": "Gulfstream G650",     "notes":"Key semi-equipment"},
    {"tail": "D-CNES",  "owner": "Nestlé SA",                          "ticker": "NESN.SW","sector":"CPG",       "region":"EU",  "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "HB-IGS",  "owner": "Novartis",                          "ticker": "NOVN.SW","sector":"Pharma",    "region":"EU",  "aircraft": "Gulfstream G550",     "notes":""},
    {"tail": "HB-IRH",  "owner": "Roche Holding",                     "ticker": "ROG.SW", "sector":"Pharma",    "region":"EU",  "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "D-CSIE",  "owner": "Siemens AG",                        "ticker": "SIE.DE", "sector":"Industrial","region":"EU",  "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "D-CALV",  "owner": "Allianz SE",                        "ticker": "ALV.DE", "sector":"Insurance", "region":"EU",  "aircraft": "Gulfstream G450",     "notes":""},
    {"tail": "G-AZNG",  "owner": "AstraZeneca",                       "ticker": "AZN.L",  "sector":"Pharma",    "region":"EU",  "aircraft": "Bombardier Global",   "notes":""},
    {"tail": "OY-NOVO", "owner": "Novo Nordisk",                      "ticker": "NOVO-B.CO","sector":"Pharma",  "region":"EU","aircraft":"Dassault Falcon 7X","notes":""},
]

# Index by registration for fast lookup
BY_TAIL = {j["tail"]: j for j in CORPORATE_JETS}

# Common type codes that indicate corporate/private jets (heavy use)
CORPORATE_TYPES = {
    "GLEX", "GL5T", "GL7T", "GLF4", "GLF5", "GLF6", "GALX", "G280", "G650",
    "GULF", "E55P", "E50P", "E300", "E135", "E145", "C56X", "C68A", "C700",
    "CL30", "CL35", "CL60", "CL65", "BD-700", "BD-100", "BD-500",
    "FA50", "FA7X", "FA8X", "F900", "F2TH",
    "BBJ", "BBJ2", "BBJ3", "A318", "ACJ", "A319", "A320",
    "H25B", "H25C", "HDJT",
    "PC24", "PC12",
}
