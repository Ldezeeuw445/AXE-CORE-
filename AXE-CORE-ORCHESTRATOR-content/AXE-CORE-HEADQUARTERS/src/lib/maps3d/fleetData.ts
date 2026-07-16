import { FleetAsset, ChoicePoint } from "./types";

export const STRATEGIC_CHOICE_POINTS: ChoicePoint[] = [
  {
    id: "sc-1",
    label: "Strait of Malacca",
    type: "waypoint",
    lat: 2.0,
    lng: 101.0,
    color: "#22d3ee",
    description: "One of the world's most critical shipping chokepoints, handling over 80,000 vessels annually.",
    createdAt: new Date().toISOString()
  },
  {
    id: "sc-2",
    label: "Suez Canal",
    type: "waypoint",
    lat: 30.0,
    lng: 32.0,
    color: "#22d3ee",
    description: "Strategic maritime passage connecting Mediterranean and Red Sea.",
    createdAt: new Date().toISOString()
  },
  {
    id: "sc-3",
    label: "Panama Canal",
    type: "waypoint",
    lat: 9.0,
    lng: -79.5,
    color: "#22d3ee",
    description: "Key interoceanic waterway linking Atlantic and Pacific.",
    createdAt: new Date().toISOString()
  },
  {
    id: "sc-4",
    label: "Bab el-Mandeb",
    type: "waypoint",
    lat: 12.5,
    lng: 43.0,
    color: "#f87171",
    description: "Critical chokepoint between Red Sea and Gulf of Aden.",
    createdAt: new Date().toISOString()
  },
  {
    id: "sc-5",
    label: "Taiwan Strait",
    type: "waypoint",
    lat: 24.0,
    lng: 119.0,
    color: "#fb923c",
    description: "Heavily monitored strategic waterway between mainland China and Taiwan.",
    createdAt: new Date().toISOString()
  }
];

export const SEISMIC_EVENTS: FleetAsset[] = [
  {
    id: "seismic-1",
    type: "seismic",
    category: "earthquake",
    name: "Pacific Ring Fire Watch",
    label: "RING-001",
    lat: 35.0,
    lng: 139.0,
    status: "monitoring",
    severity: "warning",
    description: "Real-time tectonic monitoring node for Pacific Ring of Fire subduction zones.",
    owner: "USGS-AXE"
  },
  {
    id: "seismic-2",
    type: "seismic",
    category: "volcano",
    name: "Anak Krakatau",
    label: "VOL-004",
    lat: -6.1,
    lng: 105.4,
    status: "active",
    severity: "critical",
    description: "Active volcanic monitoring. Recent eruption activity detected.",
    owner: "BMKG-AXE"
  },
  {
    id: "seismic-3",
    type: "seismic",
    category: "tsunami",
    name: "Indian Ocean Buoy Array",
    label: "TSN-003",
    lat: -5.0,
    lng: 95.0,
    status: "active",
    severity: "normal",
    description: "DART buoy network monitoring for tsunami wave propagation.",
    owner: "NOAA-AXE"
  }
];

export const CORPORATE_JETS: FleetAsset[] = [
  {
    id: "jet-1",
    type: "jet",
    name: "Gulfstream G650",
    label: "N-AXE-01",
    lat: 40.7580,
    lng: -73.9855,
    altitude: 41000,
    speed: 850,
    heading: 45,
    status: "en-route",
    severity: "normal",
    description: "High-altitude corporate executive transport. Transatlantic corridor.",
    owner: "AXE Corp"
  },
  {
    id: "jet-2",
    type: "jet",
    name: "Bombardier Global 7500",
    label: "N-AXE-02",
    lat: 51.5074,
    lng: -0.1278,
    altitude: 43000,
    speed: 900,
    heading: 120,
    status: "en-route",
    severity: "normal",
    description: "Long-range business jet crossing European airspace.",
    owner: "AXE Corp"
  },
  {
    id: "jet-3",
    type: "jet",
    name: "Cessna Citation X",
    label: "N-AXE-03",
    lat: 25.2048,
    lng: 55.2708,
    altitude: 45000,
    speed: 950,
    heading: 270,
    status: "en-route",
    severity: "normal",
    description: "Ultra-high speed transit over Middle Eastern corridor.",
    owner: "AXE Corp"
  }
];

export const COMMERCIAL_VESSELS: FleetAsset[] = [
  {
    id: "vessel-1",
    type: "vessel",
    category: "container",
    name: "Ever Apex",
    label: "IMO-9876543",
    lat: 1.3521,
    lng: 103.8198,
    speed: 18,
    heading: 180,
    status: "transit",
    severity: "normal",
    description: "Ultra-large container vessel. Singapore port approach.",
    owner: "Evergreen-AXE"
  },
  {
    id: "vessel-2",
    type: "vessel",
    category: "tanker",
    name: "MT Solar Pioneer",
    label: "IMO-1234567",
    lat: 25.0,
    lng: 55.0,
    speed: 12,
    heading: 90,
    status: "anchored",
    severity: "normal",
    description: "Crude oil tanker anchored in Dubai anchorage zone.",
    owner: "AXE Maritime"
  },
  {
    id: "vessel-3",
    type: "vessel",
    category: "yacht",
    name: "AXE-One",
    label: "IMO-AXE-001",
    lat: 43.0,
    lng: 7.0,
    speed: 22,
    heading: 340,
    status: "cruising",
    severity: "normal",
    description: "Luxury surveillance vessel. Mediterranean patrol.",
    owner: "AXE Private"
  }
];

export function simulateAssetsMovement(assets: FleetAsset[]): FleetAsset[] {
  return assets.map((asset) => {
    if (asset.type === "seismic") return asset; // Seismic doesn't move

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
