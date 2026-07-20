import { FleetAsset, ChoicePoint, SectorType } from "@/domain/maps3d/types";

export const ALL_SECTORS: SectorType[] = [
  "maritime",
  "aviation",
  "seismic",
  "chokepoints",
  "nuclear",
  "data_centers",
  "war_zones",
  "environment",
];

export const SECTOR_LABELS: Record<SectorType, string> = {
  maritime: "Maritime",
  aviation: "Aviation",
  seismic: "Seismic",
  chokepoints: "Chokepoints",
  nuclear: "Nuclear",
  data_centers: "Data Centers",
  war_zones: "War Zones",
  environment: "Environment",
};

// ==================== MARITIME (40 vessels) ====================
export const MARITIME_ASSETS: FleetAsset[] = [
  // Container Ships
  {
    id: "mar-001", sector: "maritime", type: "vessel", category: "container",
    name: "Ever Alot", label: "IMO-9893890", lat: 31.23, lng: 121.47, speed: 18, heading: 90, status: "transit", severity: "normal",
    description: "World's largest container ship (24,004 TEU). Shanghai approach.", owner: "Evergreen Marine", flag: "PAN", yearBuilt: 2022, capacity: "24004 TEU"
  },
  {
    id: "mar-002", sector: "maritime", type: "vessel", category: "container",
    name: "MSC Irina", label: "IMO-9904520", lat: 1.26, lng: 103.83, speed: 17, heading: 270, status: "transit", severity: "normal",
    description: "MSC ultra-large container vessel (24,346 TEU). Singapore Strait.", owner: "MSC", flag: "PAN", yearBuilt: 2023, capacity: "24346 TEU"
  },
  {
    id: "mar-003", sector: "maritime", type: "vessel", category: "container",
    name: "OOCL Spain", label: "IMO-9904620", lat: 36.14, lng: -5.35, speed: 19, heading: 45, status: "transit", severity: "normal",
    description: "OOCL megamax container ship (24,188 TEU). Gibraltar approach.", owner: "OOCL", flag: "HKG", yearBuilt: 2023, capacity: "24188 TEU"
  },
  {
    id: "mar-004", sector: "maritime", type: "vessel", category: "container",
    name: "MSC Tessa", label: "IMO-9904540", lat: 36.0, lng: 14.5, speed: 16, heading: 180, status: "transit", severity: "normal",
    description: "MSC Tessa-class container vessel. Mediterranean corridor.", owner: "MSC", flag: "PAN", yearBuilt: 2023, capacity: "24346 TEU"
  },
  {
    id: "mar-005", sector: "maritime", type: "vessel", category: "container",
    name: "HMM Algeciras", label: "IMO-9864150", lat: 34.0, lng: 128.0, speed: 20, heading: 270, status: "transit", severity: "normal",
    description: "HMM mega container ship (23,964 TEU). Korea-Japan route.", owner: "HMM", flag: "PAN", yearBuilt: 2020, capacity: "23964 TEU"
  },
  {
    id: "mar-006", sector: "maritime", type: "vessel", category: "container",
    name: "Ever Ace", label: "IMO-9893910", lat: 37.8, lng: 122.4, speed: 18, heading: 45, status: "transit", severity: "normal",
    description: "Evergreen G-class container ship. San Francisco Bay approach.", owner: "Evergreen", flag: "PAN", yearBuilt: 2021, capacity: "23992 TEU"
  },
  {
    id: "mar-007", sector: "maritime", type: "vessel", category: "container",
    name: "Tihama", label: "IMO-9247475", lat: 21.5, lng: 39.2, speed: 15, heading: 180, status: "anchored", severity: "normal",
    description: "Saudi-flag container vessel. Jeddah anchorage.", owner: "Bahri", flag: "SAU", yearBuilt: 2002, capacity: "4250 TEU"
  },
  {
    id: "mar-008", sector: "maritime", type: "vessel", category: "container",
    name: "ONE Innovation", label: "IMO-9934967", lat: 34.7, lng: 137.0, speed: 17, heading: 90, status: "transit", severity: "normal",
    description: "ONE megamax container vessel. Nagoya approach.", owner: "Ocean Network Express", flag: "JPN", yearBuilt: 2023, capacity: "24136 TEU"
  },
  {
    id: "mar-009", sector: "maritime", type: "vessel", category: "container",
    name: "CMA CGM Marco Polo", label: "IMO-9454436", lat: 50.9, lng: -1.4, speed: 18, heading: 270, status: "transit", severity: "normal",
    description: "CMA CGM flagship container ship. English Channel.", owner: "CMA CGM", flag: "FRA", yearBuilt: 2012, capacity: "16020 TEU"
  },
  {
    id: "mar-010", sector: "maritime", type: "vessel", category: "container",
    name: "Madrid Maersk", label: "IMO-9778790", lat: 55.7, lng: 12.6, speed: 16, heading: 0, status: "transit", severity: "normal",
    description: "Maersk 2nd-gen Triple E container ship. Copenhagen approach.", owner: "Maersk", flag: "DNK", yearBuilt: 2017, capacity: "20568 TEU"
  },
  // Oil Tankers
  {
    id: "mar-011", sector: "maritime", type: "vessel", category: "tanker",
    name: "TI Europe", label: "IMO-9260432", lat: 26.2, lng: 50.6, speed: 12, heading: 90, status: "transit", severity: "normal",
    description: "World's largest oil tanker (441,893 DWT). Persian Gulf route.", owner: "Tankers International", flag: "LBR", yearBuilt: 2002, capacity: "441893 DWT"
  },
  {
    id: "mar-012", sector: "maritime", type: "vessel", category: "tanker",
    name: "TI Oceania", label: "IMO-9260456", lat: 1.1, lng: 103.5, speed: 13, heading: 270, status: "transit", severity: "normal",
    description: "TI-class supertanker. Malacca Strait transit.", owner: "Tankers International", flag: "LBR", yearBuilt: 2002, capacity: "441893 DWT"
  },
  {
    id: "mar-013", sector: "maritime", type: "vessel", category: "tanker",
    name: "TI Asia", label: "IMO-9260440", lat: 30.0, lng: 32.0, speed: 11, heading: 180, status: "transit", severity: "normal",
    description: "TI-class supertanker. Suez Canal passage.", owner: "Tankers International", flag: "LBR", yearBuilt: 2002, capacity: "441893 DWT"
  },
  {
    id: "mar-014", sector: "maritime", type: "vessel", category: "tanker",
    name: "Seawise Giant", label: "IMO-7360094", lat: 26.5, lng: 56.5, speed: 10, heading: 45, status: "anchored", severity: "normal",
    description: "Former largest ship ever (564,763 DWT). Scrapped 2009 but kept as historical marker.", owner: "Historical", flag: "LBR", yearBuilt: 1979, capacity: "564763 DWT"
  },
  {
    id: "mar-015", sector: "maritime", type: "vessel", category: "tanker",
    name: "Batillus", label: "IMO-7360109", lat: 51.9, lng: 4.0, speed: 11, heading: 0, status: "transit", severity: "normal",
    description: "Batillus-class supertanker. Rotterdam approach.", owner: "Shell", flag: "FRA", yearBuilt: 1976, capacity: "553662 DWT"
  },
  {
    id: "mar-016", sector: "maritime", type: "vessel", category: "tanker",
    name: "Nai Superba", label: "IMO-7508094", lat: 37.6, lng: 12.3, speed: 12, heading: 90, status: "transit", severity: "normal",
    description: "Very large crude carrier. Sicily channel.", owner: "Navigazione Italiana", flag: "ITA", yearBuilt: 1978, capacity: "409400 DWT"
  },
  {
    id: "mar-017", sector: "maritime", type: "vessel", category: "tanker",
    name: "Jahre Viking", label: "IMO-7360111", lat: 25.0, lng: 55.0, speed: 10, heading: 180, status: "anchored", severity: "normal",
    description: "Former Seawise Giant renamed. Dubai anchorage.", owner: "Historical", flag: "NOR", yearBuilt: 1979, capacity: "564763 DWT"
  },
  {
    id: "mar-018", sector: "maritime", type: "vessel", category: "tanker",
    name: "MT Solar Pioneer", label: "IMO-1234567", lat: 25.0, lng: 55.0, speed: 12, heading: 90, status: "anchored", severity: "normal",
    description: "Crude oil tanker anchored in Dubai anchorage zone.", owner: "AXE Maritime", flag: "UAE", yearBuilt: 2015, capacity: "320000 DWT"
  },
  {
    id: "mar-019", sector: "maritime", type: "vessel", category: "tanker",
    name: "Berge Emperor", label: "IMO-7360123", lat: 29.0, lng: 48.0, speed: 11, heading: 270, status: "transit", severity: "normal",
    description: "Berge-class supertanker. Kuwait approach.", owner: "Bergesen", flag: "NOR", yearBuilt: 1975, capacity: "423745 DWT"
  },
  {
    id: "mar-020", sector: "maritime", type: "vessel", category: "tanker",
    name: "Hellespont Alhambra", label: "IMO-9216574", lat: 9.0, lng: -79.5, speed: 13, heading: 180, status: "transit", severity: "normal",
    description: "TI-class sister ship. Panama Canal transit.", owner: "Hellespont", flag: "LBR", yearBuilt: 2002, capacity: "441893 DWT"
  },
  // Cruise Ships
  {
    id: "mar-021", sector: "maritime", type: "vessel", category: "cruise",
    name: "Wonder of the Seas", label: "IMO-9836878", lat: 25.8, lng: -80.2, speed: 22, heading: 90, status: "cruising", severity: "normal",
    description: "World's largest cruise ship (236,857 GT). Miami departure.", owner: "Royal Caribbean", flag: "BAH", yearBuilt: 2022, capacity: "6988 pax"
  },
  {
    id: "mar-022", sector: "maritime", type: "vessel", category: "cruise",
    name: "Icon of the Seas", label: "IMO-9904883", lat: 18.2, lng: -66.5, speed: 21, heading: 270, status: "cruising", severity: "normal",
    description: "Royal Caribbean Icon-class (248,663 GT). San Juan approach.", owner: "Royal Caribbean", flag: "BAH", yearBuilt: 2023, capacity: "7600 pax"
  },
  {
    id: "mar-023", sector: "maritime", type: "vessel", category: "cruise",
    name: "Symphony of the Seas", label: "IMO-9744001", lat: 43.7, lng: 7.3, speed: 22, heading: 180, status: "cruising", severity: "normal",
    description: "Oasis-class cruise ship (228,081 GT). Monaco approach.", owner: "Royal Caribbean", flag: "BAH", yearBuilt: 2018, capacity: "6680 pax"
  },
  {
    id: "mar-024", sector: "maritime", type: "vessel", category: "cruise",
    name: "Harmony of the Seas", label: "IMO-9638411", lat: 51.9, lng: -4.5, speed: 20, heading: 270, status: "cruising", severity: "normal",
    description: "Oasis-class cruise ship (226,963 GT). English Channel.", owner: "Royal Caribbean", flag: "BAH", yearBuilt: 2016, capacity: "6687 pax"
  },
  {
    id: "mar-025", sector: "maritime", type: "vessel", category: "cruise",
    name: "Oasis of the Seas", label: "IMO-9404064", lat: 40.7, lng: -74.0, speed: 21, heading: 90, status: "cruising", severity: "normal",
    description: "First Oasis-class (225,282 GT). New York approach.", owner: "Royal Caribbean", flag: "BAH", yearBuilt: 2009, capacity: "5400 pax"
  },
  {
    id: "mar-026", sector: "maritime", type: "vessel", category: "cruise",
    name: "MSC World Europa", label: "IMO-9837420", lat: 25.2, lng: 55.3, speed: 19, heading: 45, status: "cruising", severity: "normal",
    description: "MSC World-class cruise ship (205,700 GT). Dubai departure.", owner: "MSC Cruises", flag: "MLT", yearBuilt: 2022, capacity: "6762 pax"
  },
  {
    id: "mar-027", sector: "maritime", type: "vessel", category: "cruise",
    name: "Costa Smeralda", label: "IMO-9781889", lat: 41.9, lng: 12.5, speed: 20, heading: 180, status: "cruising", severity: "normal",
    description: "Costa LNG-powered cruise ship (185,010 GT). Rome approach.", owner: "Costa Cruises", flag: "ITA", yearBuilt: 2019, capacity: "6554 pax"
  },
  {
    id: "mar-028", sector: "maritime", type: "vessel", category: "cruise",
    name: "P\u0026O Iona", label: "IMO-9830050", lat: 50.8, lng: -1.1, speed: 18, heading: 270, status: "cruising", severity: "normal",
    description: "P\u0026O LNG-powered cruise ship (184,089 GT). Southampton.", owner: "P\u0026O Cruises", flag: "GBR", yearBuilt: 2020, capacity: "5200 pax"
  },
  {
    id: "mar-029", sector: "maritime", type: "vessel", category: "cruise",
    name: "Arvia", label: "IMO-9830048", lat: 51.5, lng: -0.1, speed: 19, heading: 90, status: "cruising", severity: "normal",
    description: "P\u0026O Excel-class cruise ship (184,700 GT). London approach.", owner: "P\u0026O Cruises", flag: "GBR", yearBuilt: 2022, capacity: "5200 pax"
  },
  {
    id: "mar-030", sector: "maritime", type: "vessel", category: "cruise",
    name: "Norwegian Encore", label: "IMO-9733090", lat: 47.6, lng: -122.3, speed: 22, heading: 270, status: "cruising", severity: "normal",
    description: "Breakaway Plus-class (169,116 GT). Seattle departure.", owner: "NCL", flag: "BAH", yearBuilt: 2019, capacity: "3998 pax"
  },
  // Mega Yachts
  {
    id: "mar-031", sector: "maritime", type: "vessel", category: "yacht",
    name: "Azzam", label: "IMO-9693367", lat: 43.7, lng: 7.3, speed: 14, heading: 180, status: "cruising", severity: "normal",
    description: "World's largest private yacht (180.65m). Monaco.", owner: "Khalifa bin Zayed Al Nahyan", flag: "ARE", yearBuilt: 2013, capacity: "180.65m"
  },
  {
    id: "mar-032", sector: "maritime", type: "vessel", category: "yacht",
    name: "Eclipse", label: "IMO-9617865", lat: 43.73, lng: 7.42, speed: 13, heading: 90, status: "anchored", severity: "normal",
    description: "Roman Abramovich's yacht (162.5m). Antibes.", owner: "Roman Abramovich", flag: "BMU", yearBuilt: 2009, capacity: "162.5m"
  },
  {
    id: "mar-033", sector: "maritime", type: "vessel", category: "yacht",
    name: "Dilbar", label: "IMO-9661792", lat: 43.55, lng: 7.02, speed: 12, heading: 270, status: "anchored", severity: "normal",
    description: "Alisher Usmanov's yacht (156m). Cannes.", owner: "Alisher Usmanov", flag: "CAY", yearBuilt: 2015, capacity: "156m"
  },
  {
    id: "mar-034", sector: "maritime", type: "vessel", category: "yacht",
    name: "Al Said", label: "IMO-9442665", lat: 23.6, lng: 58.5, speed: 15, heading: 45, status: "cruising", severity: "normal",
    description: "Sultan of Oman's yacht (155m). Muscat approach.", owner: "Sultan of Oman", flag: "OMN", yearBuilt: 2008, capacity: "155m"
  },
  {
    id: "mar-035", sector: "maritime", type: "vessel", category: "yacht",
    name: "A+", label: "IMO-1011223", lat: 25.2, lng: 55.3, speed: 14, heading: 0, status: "anchored", severity: "normal",
    description: "Andrey Melnichenko's sailing yacht (142.81m). Dubai.", owner: "Andrey Melnichenko", flag: "BER", yearBuilt: 2017, capacity: "142.81m"
  },
  {
    id: "mar-036", sector: "maritime", type: "vessel", category: "yacht",
    name: "Fulk Al Salamah", label: "IMO-9693365", lat: 21.5, lng: 39.2, speed: 13, heading: 180, status: "anchored", severity: "normal",
    description: "Omani royal yacht (164m). Jeddah.", owner: "Sultan of Oman", flag: "OMN", yearBuilt: 2016, capacity: "164m"
  },
  {
    id: "mar-037", sector: "maritime", type: "vessel", category: "yacht",
    name: "Serene", label: "IMO-1011855", lat: 43.7, lng: 7.35, speed: 14, heading: 270, status: "cruising", severity: "normal",
    description: "Mohammed bin Salman's yacht (133.9m). Monaco.", owner: "Mohammed bin Salman", flag: "CAY", yearBuilt: 2011, capacity: "133.9m"
  },
  {
    id: "mar-038", sector: "maritime", type: "vessel", category: "yacht",
    name: "Rising Sun", label: "IMO-8975988", lat: 33.8, lng: -118.2, speed: 16, heading: 270, status: "cruising", severity: "normal",
    description: "David Geffen's yacht (138m). Los Angeles approach.", owner: "David Geffen", flag: "CAY", yearBuilt: 2004, capacity: "138m"
  },
  {
    id: "mar-039", sector: "maritime", type: "vessel", category: "yacht",
    name: "Flying Fox", label: "IMO-9823464", lat: 43.7, lng: 7.42, speed: 12, heading: 45, status: "anchored", severity: "normal",
    description: "Imperial Yachts charter (136m). Antibes.", owner: "Dmitry Kamenshchik", flag: "MLT", yearBuilt: 2019, capacity: "136m"
  },
  {
    id: "mar-040", sector: "maritime", type: "vessel", category: "yacht",
    name: "Nord", label: "IMO-9876562", lat: 22.3, lng: 114.2, speed: 15, heading: 90, status: "cruising", severity: "normal",
    description: "Alexey Mordashov's yacht (142m). Hong Kong approach.", owner: "Alexey Mordashov", flag: "CAY", yearBuilt: 2021, capacity: "142m"
  },
];

// ==================== AVIATION (20+ jets) ====================
export const AVIATION_ASSETS: FleetAsset[] = [
  {
    id: "avi-001", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Gulfstream G700", label: "N700GA", lat: 33.64, lng: -84.43, altitude: 43000, speed: 850, heading: 45, status: "en-route", severity: "normal",
    description: "Gulfstream flagship ultra-long-range business jet. Atlanta corridor.", owner: "Gulfstream Aerospace", tailNumber: "N700GA", yearBuilt: 2023
  },
  {
    id: "avi-002", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Gulfstream G650ER", label: "N650GA", lat: 51.47, lng: -0.46, altitude: 45000, speed: 900, heading: 270, status: "en-route", severity: "normal",
    description: "Extended range G650. London-Heathrow departure.", owner: "Gulfstream Aerospace", tailNumber: "N650GA", yearBuilt: 2021
  },
  {
    id: "avi-003", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Gulfstream G650", label: "N-AXE-01", lat: 40.758, lng: -73.9855, altitude: 41000, speed: 850, heading: 45, status: "en-route", severity: "normal",
    description: "High-altitude corporate executive transport. Transatlantic corridor.", owner: "AXE Corp", tailNumber: "N-AXE-01", yearBuilt: 2019
  },
  {
    id: "avi-004", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Bombardier Global 7500", label: "N750BA", lat: 45.47, lng: -73.74, altitude: 43000, speed: 900, heading: 120, status: "en-route", severity: "normal",
    description: "Long-range business jet. Montreal-Trudeau departure.", owner: "Bombardier", tailNumber: "N750BA", yearBuilt: 2022
  },
  {
    id: "avi-005", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Bombardier Global 8000", label: "N800BA", lat: 43.68, lng: -79.63, altitude: 45000, speed: 950, heading: 90, status: "en-route", severity: "normal",
    description: "Ultra-long-range business jet. Toronto-Pearson departure.", owner: "Bombardier", tailNumber: "N800BA", yearBuilt: 2023
  },
  {
    id: "avi-006", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Dassault Falcon 8X", label: "N8XDA", lat: 43.66, lng: 7.22, altitude: 47000, speed: 850, heading: 270, status: "en-route", severity: "normal",
    description: "French ultra-long-range business jet. Nice-Côte d'Azur.", owner: "Dassault Aviation", tailNumber: "N8XDA", yearBuilt: 2020
  },
  {
    id: "avi-007", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Dassault Falcon 7X", label: "N7XDA", lat: 48.73, lng: 2.37, altitude: 45000, speed: 820, heading: 180, status: "en-route", severity: "normal",
    description: "Trijet long-range business aircraft. Paris-Le Bourget.", owner: "Dassault Aviation", tailNumber: "N7XDA", yearBuilt: 2018
  },
  {
    id: "avi-008", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Cessna Citation X", label: "N-AXE-03", lat: 25.2048, lng: 55.2708, altitude: 45000, speed: 950, heading: 270, status: "en-route", severity: "normal",
    description: "Ultra-high speed transit over Middle Eastern corridor.", owner: "AXE Corp", tailNumber: "N-AXE-03", yearBuilt: 2016
  },
  {
    id: "avi-009", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Cessna Citation Longitude", label: "N700CJ", lat: 39.86, lng: -104.67, altitude: 43000, speed: 880, heading: 90, status: "en-route", severity: "normal",
    description: "Super-midsize business jet. Denver International.", owner: "Textron Aviation", tailNumber: "N700CJ", yearBuilt: 2021
  },
  {
    id: "avi-010", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Cessna Citation Latitude", label: "N680CJ", lat: 32.82, lng: -96.85, altitude: 41000, speed: 800, heading: 0, status: "en-route", severity: "normal",
    description: "Midsize business jet. Dallas-Love Field.", owner: "Textron Aviation", tailNumber: "N680CJ", yearBuilt: 2020
  },
  {
    id: "avi-011", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Boeing Business Jet (BBJ)", label: "N737BB", lat: 47.45, lng: -122.31, altitude: 39000, speed: 780, heading: 270, status: "en-route", severity: "normal",
    description: "VIP-configured Boeing 737. Seattle-Tacoma.", owner: "Boeing", tailNumber: "N737BB", yearBuilt: 2019
  },
  {
    id: "avi-012", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Airbus ACJ320neo", label: "N320AC", lat: 43.63, lng: 1.37, altitude: 41000, speed: 790, heading: 45, status: "en-route", severity: "normal",
    description: "VIP-configured A320neo. Toulouse-Blagnac.", owner: "Airbus", tailNumber: "N320AC", yearBuilt: 2022
  },
  {
    id: "avi-013", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Embraer Praetor 600", label: "N600EM", lat: -23.43, lng: -46.47, altitude: 43000, speed: 810, heading: 90, status: "en-route", severity: "normal",
    description: "Super-midsize business jet. São Paulo-Guarulhos.", owner: "Embraer", tailNumber: "N600EM", yearBuilt: 2021
  },
  {
    id: "avi-014", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Embraer Phenom 300E", label: "N300EM", lat: -22.91, lng: -43.17, altitude: 40000, speed: 750, heading: 180, status: "en-route", severity: "normal",
    description: "Light business jet. Rio de Janeiro-Galeão.", owner: "Embraer", tailNumber: "N300EM", yearBuilt: 2022
  },
  {
    id: "avi-015", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Gulfstream G500", label: "N500GA", lat: 33.94, lng: -118.41, altitude: 42000, speed: 830, heading: 270, status: "en-route", severity: "normal",
    description: "Clean-sheet design business jet. LAX departure.", owner: "Gulfstream Aerospace", tailNumber: "N500GA", yearBuilt: 2020
  },
  {
    id: "avi-016", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Pilatus PC-24", label: "N24PC", lat: 46.93, lng: 7.5, altitude: 38000, speed: 685, heading: 0, status: "en-route", severity: "normal",
    description: "Super Versatile Jet. Bern Airport.", owner: "Pilatus Aircraft", tailNumber: "N24PC", yearBuilt: 2021
  },
  {
    id: "avi-017", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Bombardier Global 6000", label: "N600BA", lat: 53.35, lng: -6.26, altitude: 43000, speed: 870, heading: 270, status: "en-route", severity: "normal",
    description: "Ultra-long-range business jet. Dublin Airport.", owner: "Bombardier", tailNumber: "N600BA", yearBuilt: 2019
  },
  {
    id: "avi-018", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "HondaJet Elite", label: "N420HJ", lat: 35.21, lng: -80.94, altitude: 37000, speed: 720, heading: 90, status: "en-route", severity: "normal",
    description: "Over-the-wing engine mount light jet. Charlotte.", owner: "Honda Aircraft", tailNumber: "N420HJ", yearBuilt: 2021
  },
  {
    id: "avi-019", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Learjet 75 Liberty", label: "N75LB", lat: 37.62, lng: -122.38, altitude: 39000, speed: 780, heading: 45, status: "en-route", severity: "normal",
    description: "Light business jet. San Francisco approach.", owner: "Bombardier", tailNumber: "N75LB", yearBuilt: 2020
  },
  {
    id: "avi-020", sector: "aviation", type: "jet", category: "corporate_jet",
    name: "Dassault Falcon 2000LXS", label: "N2000DA", lat: 40.64, lng: -73.78, altitude: 41000, speed: 800, heading: 270, status: "en-route", severity: "normal",
    description: "Large-cabin business jet. JFK departure.", owner: "Dassault Aviation", tailNumber: "N2000DA", yearBuilt: 2019
  },
];

// ==================== SEISMIC (15+ events) ====================
export const SEISMIC_ASSETS: FleetAsset[] = [
  {
    id: "seis-001", sector: "seismic", type: "event", category: "earthquake",
    name: "Turkey-Syria Earthquake", label: "EQ-2023-01", lat: 37.17, lng: 37.03, status: "aftershock", severity: "critical",
    description: "M7.8 earthquake, 50,000+ fatalities. Aftershock monitoring active.", magnitude: 7.8, depth: 17.9, owner: "USGS-AXE"
  },
  {
    id: "seis-002", sector: "seismic", type: "event", category: "earthquake",
    name: "Japan Noto Peninsula", label: "EQ-2024-01", lat: 37.5, lng: 137.3, status: "aftershock", severity: "critical",
    description: "M7.6 earthquake, January 2024. Tsunami warning lifted.", magnitude: 7.6, depth: 16.0, owner: "JMA-AXE"
  },
  {
    id: "seis-003", sector: "seismic", type: "event", category: "earthquake",
    name: "California Ridgecrest", label: "EQ-2019-01", lat: 35.77, lng: -117.6, status: "monitoring", severity: "warning",
    description: "M7.1 Ridgecrest sequence. Southern California fault system.", magnitude: 7.1, depth: 8.7, owner: "USGS-AXE"
  },
  {
    id: "seis-004", sector: "seismic", type: "event", category: "earthquake",
    name: "Chile Atacama", label: "EQ-2024-02", lat: -20.0, lng: -70.0, status: "monitoring", severity: "warning",
    description: "M6.8 earthquake. Northern Chile subduction zone.", magnitude: 6.8, depth: 35.0, owner: "USGS-AXE"
  },
  {
    id: "seis-005", sector: "seismic", type: "event", category: "earthquake",
    name: "Indonesia Sumatra", label: "EQ-2024-03", lat: 0.0, lng: 100.0, status: "monitoring", severity: "warning",
    description: "M6.5 earthquake. Sunda Megathrust active zone.", magnitude: 6.5, depth: 25.0, owner: "BMKG-AXE"
  },
  {
    id: "seis-006", sector: "seismic", type: "event", category: "earthquake",
    name: "Mexico Oaxaca", label: "EQ-2024-04", lat: 16.5, lng: -98.0, status: "monitoring", severity: "warning",
    description: "M6.4 earthquake. Cocos Plate subduction.", magnitude: 6.4, depth: 20.0, owner: "SSN-AXE"
  },
  {
    id: "seis-007", sector: "seismic", type: "event", category: "fire",
    name: "California Wildfire Watch", label: "FIRE-CA-01", lat: 38.5, lng: -120.5, status: "active", severity: "critical",
    description: "Active wildfire zone. Sierra Nevada monitoring.", owner: "CAL FIRE-AXE"
  },
  {
    id: "seis-008", sector: "seismic", type: "event", category: "fire",
    name: "Australia Bushfire Zone", label: "FIRE-AU-01", lat: -37.8, lng: 145.0, status: "active", severity: "critical",
    description: "Victoria bushfire season. Active fire front.", owner: "CFA-AXE"
  },
  {
    id: "seis-009", sector: "seismic", type: "event", category: "fire",
    name: "Greece Wildfire", label: "FIRE-GR-01", lat: 38.0, lng: 23.7, status: "active", severity: "warning",
    description: "Attica wildfire. Athens periphery.", owner: "Hellenic Fire Service-AXE"
  },
  {
    id: "seis-010", sector: "seismic", type: "event", category: "volcano",
    name: "Anak Krakatau", label: "VOL-004", lat: -6.1, lng: 105.4, status: "active", severity: "critical",
    description: "Active volcanic monitoring. Recent eruption activity detected.", owner: "BMKG-AXE"
  },
  {
    id: "seis-011", sector: "seismic", type: "event", category: "volcano",
    name: "Kīlauea Hawaii", label: "VOL-001", lat: 19.4, lng: -155.3, status: "active", severity: "critical",
    description: "Hawaiian volcanic monitoring. Continuous lava flow.", owner: "USGS-HVO-AXE"
  },
  {
    id: "seis-012", sector: "seismic", type: "event", category: "volcano",
    name: "Fagradalsfjall Iceland", label: "VOL-002", lat: 63.9, lng: -22.3, status: "active", severity: "warning",
    description: "Icelandic volcanic system. Reykjanes Peninsula.", owner: "IMO-AXE"
  },
  {
    id: "seis-013", sector: "seismic", type: "event", category: "volcano",
    name: "Mount Etna", label: "VOL-003", lat: 37.75, lng: 14.99, status: "active", severity: "warning",
    description: "Sicilian active volcano. Strombolian activity.", owner: "INGV-AXE"
  },
  {
    id: "seis-014", sector: "seismic", type: "event", category: "tsunami",
    name: "Pacific Tsunami Watch", label: "TSN-001", lat: 35.0, lng: -140.0, status: "active", severity: "warning",
    description: "Pacific DART buoy network. Real-time wave monitoring.", owner: "NOAA-AXE"
  },
  {
    id: "seis-015", sector: "seismic", type: "event", category: "tsunami",
    name: "Indian Ocean Buoy Array", label: "TSN-003", lat: -5.0, lng: 95.0, status: "active", severity: "normal",
    description: "DART buoy network monitoring for tsunami wave propagation.", owner: "NOAA-AXE"
  },
  {
    id: "seis-016", sector: "seismic", type: "event", category: "mudslide",
    name: "Norway Quick Clay", label: "MUD-NO-01", lat: 62.5, lng: 6.3, status: "monitoring", severity: "warning",
    description: "Quick clay landslide zone. Gjerdrum monitoring.", owner: "NVE-AXE"
  },
];

// ==================== CHOKEPOINTS (10+) ====================
export const CHOKEPOINT_ASSETS: FleetAsset[] = [
  {
    id: "chk-001", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Strait of Hormuz", label: "CHK-HORMUZ", lat: 26.6, lng: 56.25, status: "active", severity: "critical",
    description: "20% of world oil passes through. Heavily monitored chokepoint.", owner: "INTEL-AXE"
  },
  {
    id: "chk-002", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Strait of Malacca", label: "CHK-MALACCA", lat: 2.0, lng: 101.0, status: "active", severity: "critical",
    description: "80,000+ vessels annually. One-third of global trade.", owner: "INTEL-AXE"
  },
  {
    id: "chk-003", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Suez Canal", label: "CHK-SUEZ", lat: 30.0, lng: 32.0, status: "active", severity: "critical",
    description: "12% of global trade. 193km artificial waterway.", owner: "INTEL-AXE"
  },
  {
    id: "chk-004", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Panama Canal", label: "CHK-PANAMA", lat: 9.0, lng: -79.5, status: "active", severity: "warning",
    description: "Key interoceanic waterway linking Atlantic and Pacific.", owner: "INTEL-AXE"
  },
  {
    id: "chk-005", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Bab el-Mandeb", label: "CHK-BAB", lat: 12.5, lng: 43.0, status: "active", severity: "critical",
    description: "Critical chokepoint between Red Sea and Gulf of Aden. Houthi threat zone.", owner: "INTEL-AXE"
  },
  {
    id: "chk-006", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Strait of Gibraltar", label: "CHK-GIB", lat: 36.0, lng: -5.5, status: "active", severity: "warning",
    description: "Gateway between Mediterranean and Atlantic. 300 ships/day.", owner: "INTEL-AXE"
  },
  {
    id: "chk-007", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Bosphorus Strait", label: "CHK-BOS", lat: 41.2, lng: 29.1, status: "active", severity: "warning",
    description: "Istanbul strait. Only passage between Black Sea and Mediterranean.", owner: "INTEL-AXE"
  },
  {
    id: "chk-008", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Dover Strait", label: "CHK-DOVER", lat: 51.0, lng: 1.4, status: "active", severity: "warning",
    description: "Busiest shipping lane in the world. 400+ vessels/day.", owner: "INTEL-AXE"
  },
  {
    id: "chk-009", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Taiwan Strait", label: "CHK-TAIWAN", lat: 24.0, lng: 119.0, status: "active", severity: "critical",
    description: "Heavily monitored strategic waterway. China-Taiwan tension zone.", owner: "INTEL-AXE"
  },
  {
    id: "chk-010", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Lombok Strait", label: "CHK-LOMBOK", lat: -8.5, lng: 115.5, status: "active", severity: "warning",
    description: "Deep-water alternative to Malacca. 25% of cargo traffic.", owner: "INTEL-AXE"
  },
  {
    id: "chk-011", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Oresund Strait", label: "CHK-ORESUND", lat: 55.6, lng: 12.7, status: "active", severity: "normal",
    description: "Baltic Sea access. Copenhagen-Malbridge crossing.", owner: "INTEL-AXE"
  },
  {
    id: "chk-012", sector: "chokepoints", type: "choice_point", category: "chokepoint",
    name: "Singapore Strait", label: "CHK-SING", lat: 1.25, lng: 103.85, status: "active", severity: "critical",
    description: "Confluence of East-West shipping lanes. 100,000+ vessels/year.", owner: "INTEL-AXE"
  },
];

// ==================== NUCLEAR (15+) ====================
export const NUCLEAR_ASSETS: FleetAsset[] = [
  {
    id: "nuc-001", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Kashiwazaki-Kariwa", label: "NPP-KK", lat: 37.43, lng: 138.6, status: "standby", severity: "warning",
    description: "World's largest nuclear plant (8,212 MW). Offline since 2011.", owner: "TEPCO", capacity: "8212 MW", yearBuilt: 1985
  },
  {
    id: "nuc-002", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Bruce Nuclear", label: "NPP-BRUCE", lat: 44.33, lng: -81.6, status: "active", severity: "normal",
    description: "Largest operating nuclear plant (6,430 MW). Ontario, Canada.", owner: "Bruce Power", capacity: "6430 MW", yearBuilt: 1977
  },
  {
    id: "nuc-003", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Zaporizhzhia NPP", label: "NPP-ZAP", lat: 47.51, lng: 34.58, status: "active", severity: "critical",
    description: "Europe's largest nuclear plant (6,000 MW). Occupied by Russian forces.", owner: "Energoatom", capacity: "6000 MW", yearBuilt: 1984
  },
  {
    id: "nuc-004", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Gravelines", label: "NPP-GRAV", lat: 51.02, lng: 2.13, status: "active", severity: "normal",
    description: "France's largest nuclear plant (5,700 MW). English Channel coast.", owner: "EDF", capacity: "5700 MW", yearBuilt: 1980
  },
  {
    id: "nuc-005", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Paluel", label: "NPP-PAL", lat: 49.86, lng: 0.63, status: "active", severity: "normal",
    description: "French PWR plant (5,528 MW). Normandy coast.", owner: "EDF", capacity: "5528 MW", yearBuilt: 1984
  },
  {
    id: "nuc-006", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Hanul (Wolsong)", label: "NPP-HANUL", lat: 37.09, lng: 129.38, status: "active", severity: "normal",
    description: "South Korea's largest nuclear complex (7,268 MW).", owner: "KHNP", capacity: "7268 MW", yearBuilt: 1988
  },
  {
    id: "nuc-007", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Yangjiang", label: "NPP-YJ", lat: 21.71, lng: 111.98, status: "active", severity: "normal",
    description: "Chinese nuclear plant (6,516 MW). Guangdong province.", owner: "CGN", capacity: "6516 MW", yearBuilt: 2014
  },
  {
    id: "nuc-008", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Taishan", label: "NPP-TS", lat: 21.92, lng: 112.98, status: "active", severity: "warning",
    description: "EPR reactor (3,500 MW). Fuel rod issue detected 2021.", owner: "CGN", capacity: "3500 MW", yearBuilt: 2018
  },
  {
    id: "nuc-009", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Hongyanhe", label: "NPP-HYH", lat: 39.45, lng: 121.5, status: "active", severity: "normal",
    description: "Northernmost Chinese nuclear plant (4,572 MW). Liaoning.", owner: "CGN", capacity: "4572 MW", yearBuilt: 2013
  },
  {
    id: "nuc-010", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Fuqing", label: "NPP-FQ", lat: 25.45, lng: 119.45, status: "active", severity: "normal",
    description: "Hualong One demonstration plant (4,550 MW). Fujian.", owner: "CNNC", capacity: "4550 MW", yearBuilt: 2014
  },
  {
    id: "nuc-011", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Tianwan", label: "NPP-TW", lat: 34.69, lng: 119.46, status: "active", severity: "normal",
    description: "VVER-1000 reactors (6,080 MW). Jiangsu province.", owner: "CNNC", capacity: "6080 MW", yearBuilt: 2007
  },
  {
    id: "nuc-012", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Shin Kori", label: "NPP-SK", lat: 35.33, lng: 129.3, status: "active", severity: "normal",
    description: "APR-1400 reactors (5,928 MW). Busan region.", owner: "KHNP", capacity: "5928 MW", yearBuilt: 2011
  },
  {
    id: "nuc-013", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Ohi Nuclear", label: "NPP-OHI", lat: 35.54, lng: 135.65, status: "active", severity: "normal",
    description: "Japanese PWR plant (4,710 MW). Fukui prefecture.", owner: "Kansai EP", capacity: "4710 MW", yearBuilt: 1977
  },
  {
    id: "nuc-014", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Takahama", label: "NPP-TAK", lat: 35.52, lng: 135.5, status: "active", severity: "normal",
    description: "Japanese PWR plant (3,304 MW). Fukui prefecture.", owner: "Kansai EP", capacity: "3304 MW", yearBuilt: 1984
  },
  {
    id: "nuc-015", sector: "nuclear", type: "facility", category: "power_plant",
    name: "Kozloduy", label: "NPP-KOZ", lat: 43.75, lng: 23.77, status: "active", severity: "normal",
    description: "Bulgarian VVER reactors (3,072 MW). Danube River.", owner: "Kozloduy NPP", capacity: "3072 MW", yearBuilt: 1974
  },
  {
    id: "nuc-016", sector: "nuclear", type: "facility", category: "waste_facility",
    name: "WIPP Nuclear Waste", label: "WAST-WIPP", lat: 32.37, lng: -103.79, status: "active", severity: "normal",
    description: "Waste Isolation Pilot Plant. Transuranic waste storage.", owner: "US DOE", capacity: "6.2M ft³", yearBuilt: 1999
  },
];

// ==================== DATA CENTERS (10+) ====================
export const DATA_CENTER_ASSETS: FleetAsset[] = [
  {
    id: "dc-001", sector: "data_centers", type: "facility", category: "data_center",
    name: "Google Council Bluffs", label: "DC-GO-CB", lat: 41.26, lng: -95.86, status: "active", severity: "normal",
    description: "Google's largest US data center. 350+ MW capacity.", owner: "Google Cloud", capacity: "350 MW", yearBuilt: 2007
  },
  {
    id: "dc-002", sector: "data_centers", type: "facility", category: "data_center",
    name: "Google The Dalles", label: "DC-GO-TD", lat: 45.6, lng: -121.18, status: "active", severity: "normal",
    description: "Oregon data center. Hydro-powered.", owner: "Google Cloud", capacity: "200 MW", yearBuilt: 2006
  },
  {
    id: "dc-003", sector: "data_centers", type: "facility", category: "data_center",
    name: "Microsoft Quincy", label: "DC-MS-QC", lat: 47.23, lng: -119.85, status: "active", severity: "normal",
    description: "Central Washington data center. Azure backbone.", owner: "Microsoft Azure", capacity: "250 MW", yearBuilt: 2007
  },
  {
    id: "dc-004", sector: "data_centers", type: "facility", category: "data_center",
    name: "Amazon Northern Virginia", label: "DC-AWS-NOVA", lat: 38.9, lng: -77.2, status: "active", severity: "critical",
    description: "AWS us-east-1 region. Largest cloud region globally.", owner: "Amazon AWS", capacity: "500+ MW", yearBuilt: 2006
  },
  {
    id: "dc-005", sector: "data_centers", type: "facility", category: "data_center",
    name: "Meta Prineville", label: "DC-META-PR", lat: 44.3, lng: -120.85, status: "active", severity: "normal",
    description: "Facebook's first own data center. Oregon high desert.", owner: "Meta Platforms", capacity: "150 MW", yearBuilt: 2010
  },
  {
    id: "dc-006", sector: "data_centers", type: "facility", category: "data_center",
    name: "Google Mayes County", label: "DC-GO-MC", lat: 36.3, lng: -95.3, status: "active", severity: "normal",
    description: "Oklahoma data center. AI training cluster.", owner: "Google Cloud", capacity: "250 MW", yearBuilt: 2011
  },
  {
    id: "dc-007", sector: "data_centers", type: "facility", category: "data_center",
    name: "Microsoft San Antonio", label: "DC-MS-SA", lat: 29.42, lng: -98.49, status: "active", severity: "normal",
    description: "Texas data center. South Central US region.", owner: "Microsoft Azure", capacity: "180 MW", yearBuilt: 2014
  },
  {
    id: "dc-008", sector: "data_centers", type: "facility", category: "data_center",
    name: "Meta Luleå", label: "DC-META-LU", lat: 65.58, lng: 22.15, status: "active", severity: "normal",
    description: "Arctic Circle data center. Hydro-powered. 100% renewable.", owner: "Meta Platforms", capacity: "120 MW", yearBuilt: 2013
  },
  {
    id: "dc-009", sector: "data_centers", type: "facility", category: "data_center",
    name: "Google Lenoir", label: "DC-GO-LN", lat: 35.91, lng: -81.54, status: "active", severity: "normal",
    description: "North Carolina data center. East Coast hub.", owner: "Google Cloud", capacity: "100 MW", yearBuilt: 2008
  },
  {
    id: "dc-010", sector: "data_centers", type: "facility", category: "data_center",
    name: "Microsoft Chicago", label: "DC-MS-CHI", lat: 41.88, lng: -87.63, status: "active", severity: "normal",
    description: "Illinois data center. Central US backbone.", owner: "Microsoft Azure", capacity: "200 MW", yearBuilt: 2012
  },
  {
    id: "dc-011", sector: "data_centers", type: "facility", category: "data_center",
    name: "Amazon Ashburn", label: "DC-AWS-ASH", lat: 39.04, lng: -77.49, status: "active", severity: "critical",
    description: "AWS Data Center Alley. Multiple availability zones.", owner: "Amazon AWS", capacity: "400 MW", yearBuilt: 2008
  },
  {
    id: "dc-012", sector: "data_centers", type: "facility", category: "data_center",
    name: "Meta Odense", label: "DC-META-OD", lat: 55.4, lng: 10.4, status: "active", severity: "normal",
    description: "Danish data center. AI inference cluster.", owner: "Meta Platforms", capacity: "100 MW", yearBuilt: 2020
  },
];

// ==================== WAR ZONES (10+) ====================
export const WARZONE_ASSETS: FleetAsset[] = [
  {
    id: "wz-001", sector: "war_zones", type: "zone", category: "conflict_zone",
    name: "Ukraine Theater", label: "WZ-UKR", lat: 49.0, lng: 31.0, status: "active", severity: "critical",
    description: "Ongoing Russian invasion. Multi-front conflict.", owner: "NATO-AXE"
  },
  {
    id: "wz-002", sector: "war_zones", type: "zone", category: "conflict_zone",
    name: "Gaza Strip", label: "WZ-GAZA", lat: 31.5, lng: 34.4, status: "active", severity: "critical",
    description: "Israel-Hamas conflict. High-intensity urban warfare.", owner: "IDF-AXE"
  },
  {
    id: "wz-003", sector: "war_zones", type: "zone", category: "conflict_zone",
    name: "Syria Civil War", label: "WZ-SYR", lat: 35.0, lng: 38.0, status: "active", severity: "critical",
    description: "Multi-party conflict. Iranian/Russian/Turkish involvement.", owner: "UN-AXE"
  },
  {
    id: "wz-004", sector: "war_zones", type: "zone", category: "conflict_zone",
    name: "Yemen Houthi Conflict", label: "WZ-YEM", lat: 15.0, lng: 48.0, status: "active", severity: "critical",
    description: "Houthi insurgency. Red Sea shipping attacks.", owner: "Coalition-AXE"
  },
  {
    id: "wz-005", sector: "war_zones", type: "zone", category: "conflict_zone",
    name: "Sudan Civil War", label: "WZ-SUD", lat: 15.5, lng: 32.5, status: "active", severity: "critical",
    description: "SAF vs RSF conflict. Khartoum siege.", owner: "UN-AXE"
  },
  {
    id: "wz-006", sector: "war_zones", type: "zone", category: "conflict_zone",
    name: "Myanmar Civil War", label: "WZ-MYA", lat: 21.0, lng: 96.0, status: "active", severity: "warning",
    description: "Military junta vs ethnic armed groups. 3+ year conflict.", owner: "ASEAN-AXE"
  },
  {
    id: "wz-007", sector: "war_zones", type: "zone", category: "military_base",
    name: "Camp Humphreys", label: "BASE-HUM", lat: 36.97, lng: 127.03, status: "active", severity: "warning",
    description: "Largest US overseas military base. Pyeongtaek, S. Korea.", owner: "US DoD", capacity: "36,000 personnel"
  },
  {
    id: "wz-008", sector: "war_zones", type: "zone", category: "military_base",
    name: "Guantanamo Bay", label: "BASE-GTMO", lat: 19.9, lng: -75.1, status: "active", severity: "warning",
    description: "US Naval Base Cuba. Detention facility.", owner: "US Navy", capacity: "6000 personnel"
  },
  {
    id: "wz-009", sector: "war_zones", type: "zone", category: "military_base",
    name: "Al Udeid Air Base", label: "BASE-AUD", lat: 25.12, lng: 51.32, status: "active", severity: "warning",
    description: "US/Central Command forward HQ. Qatar.", owner: "USAF", capacity: "11,000 personnel"
  },
  {
    id: "wz-010", sector: "war_zones", type: "zone", category: "military_base",
    name: "RAF Akrotiri", label: "BASE-AKR", lat: 34.59, lng: 32.99, status: "active", severity: "warning",
    description: "UK Sovereign Base Area. Cyprus. Strike operations hub.", owner: "RAF", capacity: "3500 personnel"
  },
  {
    id: "wz-011", sector: "war_zones", type: "zone", category: "military_base",
    name: "Kadena Air Base", label: "BASE-KAD", lat: 26.36, lng: 127.77, status: "active", severity: "warning",
    description: "USAF hub. Okinawa, Japan. Pacific theater.", owner: "USAF", capacity: "20,000 personnel"
  },
  {
    id: "wz-012", sector: "war_zones", type: "zone", category: "conflict_zone",
    name: "DRC East", label: "WZ-DRC", lat: -1.7, lng: 29.2, status: "active", severity: "warning",
    description: "M23 rebel activity. Mineral-rich eastern region.", owner: "UN MONUSCO-AXE"
  },
];

// ==================== ENVIRONMENT (10+) ====================
export const ENVIRONMENT_ASSETS: FleetAsset[] = [
  {
    id: "env-001", sector: "environment", type: "zone", category: "protected_area",
    name: "Amazon Rainforest", label: "ENV-AMZ", lat: -3.47, lng: -62.22, status: "active", severity: "critical",
    description: "World's largest rainforest. Deforestation critical.", owner: "WWF-AXE"
  },
  {
    id: "env-002", sector: "environment", type: "zone", category: "protected_area",
    name: "Great Barrier Reef", label: "ENV-GBR", lat: -18.29, lng: 147.7, status: "active", severity: "critical",
    description: "Coral bleaching event. UNESCO heritage site.", owner: "GBRMPA-AXE"
  },
  {
    id: "env-003", sector: "environment", type: "zone", category: "protected_area",
    name: "Congo Basin", label: "ENV-CB", lat: -1.0, lng: 17.0, status: "active", severity: "critical",
    description: "Second largest rainforest. Poaching and logging.", owner: "UNEP-AXE"
  },
  {
    id: "env-004", sector: "environment", type: "zone", category: "critical_zone",
    name: "Antarctic Peninsula", label: "ENV-ANT", lat: -63.5, lng: -58.0, status: "active", severity: "critical",
    description: "Ice shelf collapse monitoring. Rapid warming.", owner: "NSF-AXE"
  },
  {
    id: "env-005", sector: "environment", type: "zone", category: "critical_zone",
    name: "Arctic National Wildlife Refuge", label: "ENV-ANWR", lat: 69.2, lng: -145.0, status: "active", severity: "warning",
    description: "Drilling controversy zone. Caribou migration.", owner: "USFWS-AXE"
  },
  {
    id: "env-006", sector: "environment", type: "zone", category: "protected_area",
    name: "Serengeti-Mara", label: "ENV-SER", lat: -1.5, lng: 34.8, status: "active", severity: "warning",
    description: "Annual wildebeest migration. Conservation priority.", owner: "TANAPA-AXE"
  },
  {
    id: "env-007", sector: "environment", type: "zone", category: "protected_area",
    name: "Galápagos Islands", label: "ENV-GAL", lat: -0.95, lng: -90.97, status: "active", severity: "warning",
    description: "Unique ecosystem. Marine reserve expansion.", owner: "GNP-AXE"
  },
  {
    id: "env-008", sector: "environment", type: "zone", category: "critical_zone",
    name: "Yellowstone Caldera", label: "ENV-YEL", lat: 44.43, lng: -110.59, status: "active", severity: "warning",
    description: "Supervolcano monitoring. Seismic swarm activity.", owner: "USGS-AXE"
  },
  {
    id: "env-009", sector: "environment", type: "zone", category: "critical_zone",
    name: "Arctic Ocean Ice Sheet", label: "ENV-ARC", lat: 75.0, lng: 0.0, status: "active", severity: "critical",
    description: "Sea ice extent at record low. Climate tipping point.", owner: "NOAA-AXE"
  },
  {
    id: "env-010", sector: "environment", type: "zone", category: "critical_zone",
    name: "Greenland Ice Sheet", label: "ENV-GRL", lat: 71.7, lng: -42.6, status: "active", severity: "critical",
    description: "Rapid ice melt. Jakobshavn glacier acceleration.", owner: "NASA-AXE"
  },
  {
    id: "env-011", sector: "environment", type: "zone", category: "protected_area",
    name: "Sundarbans Mangroves", label: "ENV-SUN", lat: 22.0, lng: 89.0, status: "active", severity: "warning",
    description: "World's largest mangrove forest. Tiger habitat.", owner: "UNESCO-AXE"
  },
];

// ==================== LEGACY DATA (keep for compatibility) ====================
export const STRATEGIC_CHOICE_POINTS: ChoicePoint[] = [
  {
    id: "sc-1", label: "Strait of Malacca", type: "waypoint", lat: 2.0, lng: 101.0, color: "#22d3ee",
    description: "One of the world's most critical shipping chokepoints, handling over 80,000 vessels annually.", createdAt: new Date().toISOString()
  },
  {
    id: "sc-2", label: "Suez Canal", type: "waypoint", lat: 30.0, lng: 32.0, color: "#22d3ee",
    description: "Strategic maritime passage connecting Mediterranean and Red Sea.", createdAt: new Date().toISOString()
  },
  {
    id: "sc-3", label: "Panama Canal", type: "waypoint", lat: 9.0, lng: -79.5, color: "#22d3ee",
    description: "Key interoceanic waterway linking Atlantic and Pacific.", createdAt: new Date().toISOString()
  },
  {
    id: "sc-4", label: "Bab el-Mandeb", type: "waypoint", lat: 12.5, lng: 43.0, color: "#f87171",
    description: "Critical chokepoint between Red Sea and Gulf of Aden.", createdAt: new Date().toISOString()
  },
  {
    id: "sc-5", label: "Taiwan Strait", type: "waypoint", lat: 24.0, lng: 119.0, color: "#fb923c",
    description: "Heavily monitored strategic waterway between mainland China and Taiwan.", createdAt: new Date().toISOString()
  }
];

export const SEISMIC_EVENTS_LEGACY: FleetAsset[] = [
  {
    id: "seismic-1", sector: "seismic", type: "seismic", category: "earthquake",
    name: "Pacific Ring Fire Watch", label: "RING-001", lat: 35.0, lng: 139.0, status: "monitoring", severity: "warning",
    description: "Real-time tectonic monitoring node for Pacific Ring of Fire subduction zones.", owner: "USGS-AXE"
  },
  {
    id: "seismic-2", sector: "seismic", type: "seismic", category: "volcano",
    name: "Anak Krakatau", label: "VOL-004", lat: -6.1, lng: 105.4, status: "active", severity: "critical",
    description: "Active volcanic monitoring. Recent eruption activity detected.", owner: "BMKG-AXE"
  },
  {
    id: "seismic-3", sector: "seismic", type: "seismic", category: "tsunami",
    name: "Indian Ocean Buoy Array", label: "TSN-003", lat: -5.0, lng: 95.0, status: "active", severity: "normal",
    description: "DART buoy network monitoring for tsunami wave propagation.", owner: "NOAA-AXE"
  }
];

export const CORPORATE_JETS_LEGACY: FleetAsset[] = [
  {
    id: "jet-1", sector: "aviation", type: "jet", name: "Gulfstream G650", label: "N-AXE-01", lat: 40.758, lng: -73.9855,
    altitude: 41000, speed: 850, heading: 45, status: "en-route", severity: "normal",
    description: "High-altitude corporate executive transport. Transatlantic corridor.", owner: "AXE Corp"
  },
  {
    id: "jet-2", sector: "aviation", type: "jet", name: "Bombardier Global 7500", label: "N-AXE-02", lat: 51.5074, lng: -0.1278,
    altitude: 43000, speed: 900, heading: 120, status: "en-route", severity: "normal",
    description: "Long-range business jet crossing European airspace.", owner: "AXE Corp"
  },
  {
    id: "jet-3", sector: "aviation", type: "jet", name: "Cessna Citation X", label: "N-AXE-03", lat: 25.2048, lng: 55.2708,
    altitude: 45000, speed: 950, heading: 270, status: "en-route", severity: "normal",
    description: "Ultra-high speed transit over Middle Eastern corridor.", owner: "AXE Corp"
  }
];

export const COMMERCIAL_VESSELS_LEGACY: FleetAsset[] = [
  {
    id: "vessel-1", sector: "maritime", type: "vessel", category: "container", name: "Ever Apex", label: "IMO-9876543",
    lat: 1.3521, lng: 103.8198, speed: 18, heading: 180, status: "transit", severity: "normal",
    description: "Ultra-large container vessel. Singapore port approach.", owner: "Evergreen-AXE"
  },
  {
    id: "vessel-2", sector: "maritime", type: "vessel", category: "tanker", name: "MT Solar Pioneer", label: "IMO-1234567",
    lat: 25.0, lng: 55.0, speed: 12, heading: 90, status: "anchored", severity: "normal",
    description: "Crude oil tanker anchored in Dubai anchorage zone.", owner: "AXE Maritime"
  },
  {
    id: "vessel-3", sector: "maritime", type: "vessel", category: "yacht", name: "AXE-One", label: "IMO-AXE-001",
    lat: 43.0, lng: 7.0, speed: 22, heading: 340, status: "cruising", severity: "normal",
    description: "Luxury surveillance vessel. Mediterranean patrol.", owner: "AXE Private"
  }
];

// ==================== ALL ASSETS COMBINED ====================
export const ALL_FLEET_ASSETS: FleetAsset[] = [
  ...MARITIME_ASSETS,
  ...AVIATION_ASSETS,
  ...SEISMIC_ASSETS,
  ...CHOKEPOINT_ASSETS,
  ...NUCLEAR_ASSETS,
  ...DATA_CENTER_ASSETS,
  ...WARZONE_ASSETS,
  ...ENVIRONMENT_ASSETS,
  ...SEISMIC_EVENTS_LEGACY,
  ...CORPORATE_JETS_LEGACY,
  ...COMMERCIAL_VESSELS_LEGACY,
];

export function getAssetsBySector(sector: SectorType): FleetAsset[] {
  return ALL_FLEET_ASSETS.filter((a) => a.sector === sector);
}

export function getSectorCount(sector: SectorType): number {
  return ALL_FLEET_ASSETS.filter((a) => a.sector === sector).length;
}

export function simulateAssetsMovement(assets: FleetAsset[]): FleetAsset[] {
  return assets.map((asset) => {
    if (asset.type === "seismic" || asset.type === "event" || asset.type === "facility" || asset.type === "zone" || asset.type === "choice_point") {
      return asset;
    }

    const drift = 0.0005;
    const newLat = asset.lat + (Math.random() - 0.5) * drift * 2;
    const newLng = asset.lng + (Math.random() - 0.5) * drift * 2;
    const newSpeed = asset.speed !== undefined
      ? Math.max(0, asset.speed + (Math.random() - 0.5) * 5)
      : undefined;
    const newHeading = asset.heading !== undefined
      ? (asset.heading + (Math.random() - 0.5) * 3) % 360
      : undefined;

    return {
      ...asset,
      lat: newLat,
      lng: newLng,
      speed: newSpeed,
      heading: newHeading,
    };
  });
}
