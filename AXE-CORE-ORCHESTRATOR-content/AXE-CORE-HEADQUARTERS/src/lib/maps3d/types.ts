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
  title: string;
  category: "incident" | "infrastructure" | "weather" | "traffic" | "general";
  severity: "critical" | "warning" | "info";
  description: string;
  source: string;
  timestamp: string;
  location?: string;
  type?: string;
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
  type: "jet" | "vessel" | "choice_point" | "seismic";
  category?: "container" | "tanker" | "yacht" | "earthquake" | "fire" | "tsunami" | "volcano" | "mudslide";
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
