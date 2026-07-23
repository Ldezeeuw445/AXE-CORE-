"""Curated registry of high-impact vessels (trading-relevant).

Focus categories:
- Oil tankers (VLCC, ULCC) — energy + sanctions intel
- Container ships (ULCV) — global trade pulse
- LNG carriers — energy security
- Bulk carriers — commodity flows
- Cruise ships — tourism/discretionary spending
- Mega yachts — UHNW activity / sanctions tracking
"""
from typing import List, Dict

HIGH_IMPACT_VESSELS: List[Dict] = [
    # ===== ULCV CONTAINER SHIPS (biggest in the world) =====
    {"mmsi": 538008515, "name": "MSC IRINA",        "type": "Container", "operator": "MSC",            "flag": "MH", "dwt": 248000, "teu": 24346, "notes": "World's largest container ship (2023)", "sector": "Shipping", "ticker": None},
    {"mmsi": 538008516, "name": "MSC LORETO",       "type": "Container", "operator": "MSC",            "flag": "MH", "dwt": 248000, "teu": 24346, "notes": "Sister of IRINA",                  "sector": "Shipping", "ticker": None},
    {"mmsi": 215012000, "name": "MSC GÜLSÜN",       "type": "Container", "operator": "MSC",            "flag": "PA", "dwt": 232618, "teu": 23756, "notes": "",                                 "sector": "Shipping", "ticker": None},
    {"mmsi": 477858100, "name": "OOCL HONG KONG",   "type": "Container", "operator": "OOCL/COSCO",     "flag": "HK", "dwt": 199159, "teu": 21413, "notes": "",                                 "sector": "Shipping", "ticker": "1199.HK"},
    {"mmsi": 477123400, "name": "COSCO SHIPPING UNIVERSE","type":"Container","operator":"COSCO",        "flag":"HK",  "dwt": 198000, "teu": 21237, "notes": "",                                 "sector": "Shipping", "ticker": "601919.SS"},
    {"mmsi": 538007700, "name": "EVER ACE",         "type": "Container", "operator": "Evergreen",      "flag": "PA", "dwt": 235579, "teu": 23992, "notes": "",                                 "sector": "Shipping", "ticker": "2603.TW"},
    {"mmsi": 636019825, "name": "EVER GIVEN",       "type": "Container", "operator": "Evergreen",      "flag": "PA", "dwt": 199000, "teu": 20124, "notes": "Famous Suez Canal blockage 2021",   "sector": "Shipping", "ticker": "2603.TW"},
    {"mmsi": 538004401, "name": "HMM ALGECIRAS",    "type": "Container", "operator": "HMM",            "flag": "PA", "dwt": 228283, "teu": 23964, "notes": "",                                 "sector": "Shipping", "ticker": "011200.KS"},
    {"mmsi": 219019560, "name": "MADRID MAERSK",    "type": "Container", "operator": "Maersk",         "flag": "DK", "dwt": 196000, "teu": 20568, "notes": "",                                 "sector": "Shipping", "ticker": "MAERSK-B.CO"},
    {"mmsi": 219018502, "name": "MUMBAI MAERSK",    "type": "Container", "operator": "Maersk",         "flag": "DK", "dwt": 195000, "teu": 20568, "notes": "",                                 "sector": "Shipping", "ticker": "MAERSK-B.CO"},
    {"mmsi": 219018880, "name": "COPENHAGEN MAERSK","type": "Container", "operator": "Maersk",         "flag": "DK", "dwt": 213000, "teu": 19000, "notes": "",                                 "sector": "Shipping", "ticker": "MAERSK-B.CO"},
    {"mmsi": 357170000, "name": "CMA CGM MARCO POLO","type":"Container", "operator": "CMA CGM",        "flag": "FR", "dwt": 187624, "teu": 16022, "notes": "",                                 "sector": "Shipping", "ticker": None},
    {"mmsi": 228420700, "name": "CMA CGM JACQUES SAADE","type":"Container","operator":"CMA CGM",        "flag":"FR",  "dwt": 230000, "teu": 23000, "notes":"LNG-powered ULCV",                    "sector": "Shipping", "ticker": None},
    {"mmsi": 477680000, "name": "HAPAG-LLOYD BERLIN EXPRESS","type":"Container","operator":"Hapag-Lloyd","flag":"DE","dwt":230000,"teu":23660,"notes":"LNG dual-fuel",                              "sector": "Shipping", "ticker": "HLAG.DE"},
    {"mmsi": 311000844, "name": "ZIM SAMMY OFER",   "type": "Container", "operator": "ZIM",            "flag": "BS", "dwt": 178000, "teu": 15000, "notes": "LNG",                              "sector": "Shipping", "ticker": "ZIM"},

    # ===== OIL TANKERS (VLCC / ULCC) =====
    {"mmsi": 538003366, "name": "TI EUROPE",        "type": "ULCC Tanker","operator":"Euronav",         "flag":"MH",  "dwt": 441585, "teu":None,  "notes":"One of largest tankers afloat",     "sector": "Energy",   "ticker": "CMBT.BR"},
    {"mmsi": 538003367, "name": "TI OCEANIA",       "type": "ULCC Tanker","operator":"Euronav",         "flag":"MH",  "dwt": 441561, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": "CMBT.BR"},
    {"mmsi": 412549050, "name": "YUAN YUAN HU",     "type": "VLCC Tanker","operator":"COSCO Shipping",   "flag":"CN",  "dwt": 320000, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": "601919.SS"},
    {"mmsi": 477123450, "name": "NEW VANGUARD",     "type": "VLCC Tanker","operator":"COSCO Shipping",   "flag":"HK",  "dwt": 318000, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": "601919.SS"},
    {"mmsi": 235107000, "name": "BRITISH PIONEER",  "type": "VLCC Tanker","operator":"BP Shipping",      "flag":"GB",  "dwt": 315000, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": "BP.L"},
    {"mmsi": 311088100, "name": "FRONT TWENTY-ONE", "type": "VLCC Tanker","operator":"Frontline",        "flag":"BS",  "dwt": 319000, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": "FRO"},
    {"mmsi": 538009999, "name": "DHT JAGUAR",       "type": "VLCC Tanker","operator":"DHT Holdings",     "flag":"MH",  "dwt": 299912, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": "DHT"},
    {"mmsi": 477001000, "name": "ARDMORE SEAFOX",   "type": "MR Tanker",  "operator":"Ardmore Shipping", "flag":"MH",  "dwt": 51500,  "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": "ASC"},
    {"mmsi": 538076110, "name": "NORDIC INNOVATOR", "type": "VLCC Tanker","operator":"Nordic American",  "flag":"MH",  "dwt": 318000, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": "NAT"},
    {"mmsi": 211281030, "name": "SUMMIT AFRICA",    "type": "VLCC Tanker","operator":"Hafnia/BW Group",   "flag":"BM",  "dwt": 320000, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": None},

    # ===== LNG CARRIERS =====
    {"mmsi": 538003800, "name": "Q-MAX MOZAH",      "type": "LNG Carrier","operator":"Nakilat (QatarEnergy)","flag":"MH","dwt":162400, "teu":None,  "notes":"Q-Max class largest LNG carrier",  "sector": "Energy",   "ticker": None},
    {"mmsi": 538003801, "name": "Q-MAX BU SAMRA",   "type": "LNG Carrier","operator":"Nakilat",          "flag":"MH",  "dwt":162400, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": None},
    {"mmsi": 311088200, "name": "DUKHAN",            "type": "LNG Carrier","operator":"Nakilat",          "flag":"BS",  "dwt":162400, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": None},
    {"mmsi": 477001100, "name": "GASLOG SARATOGA",  "type": "LNG Carrier","operator":"GasLog",           "flag":"HK",  "dwt":  95000, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": None},
    {"mmsi": 538005454, "name": "FLEX ARTEMIS",     "type": "LNG Carrier","operator":"Flex LNG",         "flag":"MH",  "dwt":  93000, "teu":None,  "notes":"",                                  "sector": "Energy",   "ticker": "FLNG"},

    # ===== BULK CARRIERS =====
    {"mmsi": 477123500, "name": "VALEMAX (BERGE EVEREST)","type":"Bulk Carrier","operator":"Vale/Berge Bulk","flag":"BM","dwt":402347,"teu":None,"notes":"Iron ore mega-carrier",                     "sector": "Mining",   "ticker": "VALE"},
    {"mmsi": 538009955, "name": "ORE TIANJIN",      "type": "Bulk Carrier","operator":"China Cosco",      "flag":"HK",  "dwt":400000, "teu":None,  "notes":"Valemax class",                     "sector": "Mining",   "ticker": "601919.SS"},
    {"mmsi": 311000333, "name": "GENCO TIGER",      "type": "Bulk Carrier","operator":"Genco Shipping",   "flag":"BS",  "dwt":206000, "teu":None,  "notes":"",                                  "sector": "Shipping", "ticker": "GNK"},
    {"mmsi": 538076500, "name": "STAR LARISA",      "type": "Bulk Carrier","operator":"Star Bulk",        "flag":"MH",  "dwt":209000, "teu":None,  "notes":"",                                  "sector": "Shipping", "ticker": "SBLK"},

    # ===== CRUISE SHIPS (tourism / discretionary spend) =====
    {"mmsi": 311000999, "name": "ICON OF THE SEAS", "type": "Cruise",     "operator":"Royal Caribbean",  "flag":"BS",  "dwt":250800, "teu":None,  "notes":"Largest cruise ship in world",     "sector": "Travel",   "ticker": "RCL"},
    {"mmsi": 311000888, "name": "WONDER OF THE SEAS","type":"Cruise",     "operator":"Royal Caribbean",  "flag":"BS",  "dwt":236857, "teu":None,  "notes":"",                                  "sector": "Travel",   "ticker": "RCL"},
    {"mmsi": 311000777, "name": "HARMONY OF THE SEAS","type":"Cruise",    "operator":"Royal Caribbean",  "flag":"BS",  "dwt":226963, "teu":None,  "notes":"",                                  "sector": "Travel",   "ticker": "RCL"},
    {"mmsi": 311088808, "name": "NORWEGIAN ESCAPE", "type": "Cruise",     "operator":"Norwegian Cruise", "flag":"BS",  "dwt":164600, "teu":None,  "notes":"",                                  "sector": "Travel",   "ticker": "NCLH"},
    {"mmsi": 354010000, "name": "CARNIVAL CELEBRATION","type":"Cruise",   "operator":"Carnival Corp",    "flag":"PA",  "dwt":183521, "teu":None,  "notes":"",                                  "sector": "Travel",   "ticker": "CCL"},
    {"mmsi": 354010001, "name": "MARDI GRAS",       "type": "Cruise",     "operator":"Carnival Corp",    "flag":"PA",  "dwt":180000, "teu":None,  "notes":"",                                  "sector": "Travel",   "ticker": "CCL"},
    {"mmsi": 354010002, "name": "MSC SEASCAPE",     "type": "Cruise",     "operator":"MSC Cruises",      "flag":"MT",  "dwt":169480, "teu":None,  "notes":"",                                  "sector": "Travel",   "ticker": None},
    {"mmsi": 354010003, "name": "DISNEY WISH",      "type": "Cruise",     "operator":"Disney Cruise Line","flag":"BS", "dwt":144000, "teu":None,  "notes":"",                                  "sector": "Travel",   "ticker": "DIS"},

    # ===== MEGA YACHTS (UHNW activity / sanctions tracking) =====
    {"mmsi": 215123100, "name": "DILBAR",            "type":"Mega Yacht",  "operator":"Alisher Usmanov",  "flag":"KY",  "dwt":  15917,"teu":None,  "notes":"Largest yacht by GT (sanctioned)", "sector": "UHNW",     "ticker": None},
    {"mmsi": 215123200, "name": "AZZAM",             "type":"Mega Yacht",  "operator":"UAE Royal Family", "flag":"AE",  "dwt":  13000,"teu":None,  "notes":"Longest private yacht (180m)",     "sector": "UHNW",     "ticker": None},
    {"mmsi": 215123300, "name": "ECLIPSE",           "type":"Mega Yacht",  "operator":"Roman Abramovich", "flag":"BM",  "dwt":  13564,"teu":None,  "notes":"Sanctioned 2022",                  "sector": "UHNW",     "ticker": None},
    {"mmsi": 215123400, "name": "FULK AL SALAMAH",   "type":"Mega Yacht",  "operator":"Sultan of Oman",   "flag":"OM",  "dwt":  11000,"teu":None,  "notes":"",                                  "sector": "UHNW",     "ticker": None},
    {"mmsi": 215123500, "name": "AL SAID",           "type":"Mega Yacht",  "operator":"Sultan of Oman",   "flag":"OM",  "dwt":  10864,"teu":None,  "notes":"",                                  "sector": "UHNW",     "ticker": None},
    {"mmsi": 215123600, "name": "FLYING FOX",        "type":"Mega Yacht",  "operator":"Dmitri Kamenshchik (charter)","flag":"KY","dwt":9022,"teu":None,"notes":"Largest charter yacht",                "sector":"UHNW",      "ticker": None},
    {"mmsi": 215123700, "name": "KOR",               "type":"Mega Yacht",  "operator":"Mark Zuckerberg (alleged)","flag":"KY","dwt":8200,"teu":None,"notes":"118m superyacht",                       "sector":"UHNW",      "ticker":"META"},
    {"mmsi": 215123800, "name": "KOLM",              "type":"Mega Yacht",  "operator":"Mark Zuckerberg support","flag":"KY","dwt":3000,"teu":None,"notes":"Support vessel for KOR",                "sector":"UHNW",      "ticker":"META"},
    {"mmsi": 215123900, "name": "SCHEHERAZADE",      "type":"Mega Yacht",  "operator":"Alleged Russian elite","flag":"KY","dwt":  9200,"teu":None,"notes":"Seized 2022",                            "sector":"UHNW",      "ticker":None},
    {"mmsi": 215124000, "name": "NORD",              "type":"Mega Yacht",  "operator":"Alexei Mordashov",  "flag":"RU", "dwt":  9270,"teu":None,  "notes":"Sanctioned",                        "sector":"UHNW",      "ticker":None},
    {"mmsi": 215124100, "name": "OCTOPUS",           "type":"Mega Yacht",  "operator":"Roger Samuelsson (former Allen)","flag":"KY","dwt":9932,"teu":None,"notes":"Former Paul Allen yacht",                  "sector":"UHNW",     "ticker":None},
    {"mmsi": 215124200, "name": "RISING SUN",        "type":"Mega Yacht",  "operator":"David Geffen",      "flag":"KY", "dwt":  7975,"teu":None,  "notes":"",                                  "sector":"UHNW",     "ticker":None},
    {"mmsi": 215124300, "name": "SERENE",            "type":"Mega Yacht",  "operator":"Mohammed bin Salman","flag":"KY","dwt":8943, "teu":None,  "notes":"Saudi Crown Prince",                "sector":"UHNW",     "ticker":None},
    {"mmsi": 215124400, "name": "VENUS",             "type":"Mega Yacht",  "operator":"Laurene Powell Jobs","flag":"KY","dwt":  3000,"teu":None,  "notes":"Steve Jobs designed",               "sector":"UHNW",     "ticker":None},

    # ===== CHARTER / RENTAL FLAGSHIPS =====
    {"mmsi": 215125000, "name": "AHPO",              "type":"Mega Yacht",  "operator":"Imtiaz family / Charter","flag":"KY","dwt":3200,"teu":None,"notes":"Charter $2.4M/wk",                       "sector":"Charter",   "ticker":None},
    {"mmsi": 215125100, "name": "VAVA II",            "type":"Mega Yacht",  "operator":"Ernesto Bertarelli","flag":"KY","dwt":3000, "teu":None,  "notes":"Charter",                           "sector":"Charter",   "ticker":None},
    {"mmsi": 215125200, "name": "O'PARI",             "type":"Mega Yacht",  "operator":"Charter",          "flag":"KY", "dwt":  2200,"teu":None,  "notes":"Charter ~$1.6M/wk",                  "sector":"Charter",  "ticker":None},
]

# Fast lookup
BY_MMSI = {v["mmsi"]: v for v in HIGH_IMPACT_VESSELS}

# Type-based aggregation for sector exposure
def sector_summary():
    out: Dict[str, int] = {}
    for v in HIGH_IMPACT_VESSELS:
        s = v.get("sector") or "Other"
        out[s] = out.get(s, 0) + 1
    return out
