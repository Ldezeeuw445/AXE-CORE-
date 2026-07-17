export type SectorType =
  | "maritime"
  | "aviation"
  | "seismic"
  | "chokepoints"
  | "nuclear"
  | "data_centers"
  | "war_zones"
  | "environment";

export type OverlayType =
  | "heatmap"
  | "risk-heatmap"
  | "patrol"
  | "traffic"
  | "maritime"
  | "aviation"
  | "seismic"
  | "chokepoints"
  | "nuclear"
  | "data_centers"
  | "war_zones"
  | "environment";

export interface CityConfig {
  name: string;
  country: string;
  lat: number;
  lng: number;
  altitude: number;
  heading: number;
  tilt: number;
  range: number;
  description: string;
  zoom?: number;
}

export interface WeatherData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  conditionCode: number;
  description: string;
}

export interface OSINTEvent {
  id?: string;
  title: string;
  category: "incident" | "infrastructure" | "weather" | "traffic" | "general" | "air" | "maritime" | "cyber" | "ground" | "signal" | "thermal";
  severity: "critical" | "warning" | "info";
  description: string;
  source: string;
  timestamp: string;
  location?: string;
  type?: string;
  coordinates: { lat: number; lng: number };
  verified?: boolean;
}

export interface OSINTAnalysisResponse {
  analysis: string;
  sources: { title: string; url: string }[];
  isDemo?: boolean;
}

export interface ChoicePoint {
  id: string;
  label: string;
  type: "waypoint" | "observation" | "rendezvous" | "extraction" | "target" | "hazard";
  lat: number;
  lng: number;
  color: string;
  description?: string;
  createdAt: string;
}

export interface FleetAsset {
  id: string;
  sector: SectorType;
  type: "jet" | "vessel" | "choice_point" | "seismic" | "facility" | "base" | "zone" | "event";
  category?:
    | "container"
    | "tanker"
    | "yacht"
    | "cruise"
    | "corporate_jet"
    | "commercial"
    | "earthquake"
    | "fire"
    | "tsunami"
    | "volcano"
    | "mudslide"
    | "chokepoint"
    | "power_plant"
    | "waste_facility"
    | "data_center"
    | "conflict_zone"
    | "military_base"
    | "protected_area"
    | "critical_zone";
  name: string;
  label: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  status: string;
  severity?: "normal" | "warning" | "critical";
  description: string;
  owner?: string;
  capacity?: string;
  yearBuilt?: number;
  flag?: string;
  tailNumber?: string;
  magnitude?: number;
  depth?: number;
}

export interface SignalIntercept {
  frequency: string;
  source: string;
  encryption: "AES-256" | "Q-CRYPTO" | "ROT-13" | "UNENCRYPTED";
  strength: number;
  status: "DECRYPTED" | "BROKEN" | "BREACHING" | "SECURE";
  payload: string;
  timestamp: string;
}

export interface SeismicEvent {
  id: string;
  magnitude: number;
  place: string;
  time: string;
  depth: number;
  url: string;
}

export interface ExportData {
  city: CityConfig;
  choicePoints: ChoicePoint[];
  patrolRouteIds: string[];
  closedLoop: boolean;
  events: OSINTEvent[];
}

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "info" | "error";
}

export interface SectorConfig {
  id: SectorType;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}
