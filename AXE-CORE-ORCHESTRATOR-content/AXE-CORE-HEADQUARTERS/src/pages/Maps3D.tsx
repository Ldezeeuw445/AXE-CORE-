import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { Map, Compass, AlertTriangle, Crosshair, X } from "lucide-react";
import { CityConfig, OSINTEvent, OSINTAnalysisResponse, FleetAsset } from "@/lib/maps3d/types";
import { FEATURED_CITIES } from "@/lib/maps3d/constants";
import { simulateAssetsMovement, STRATEGIC_CHOICE_POINTS, SEISMIC_EVENTS, CORPORATE_JETS, COMMERCIAL_VESSELS } from "@/lib/maps3d/fleetData";
import { OSINTPanel } from "@/components/maps3d/OSINTPanel";
import { CitySelector } from "@/components/maps3d/CitySelector";

const SIMULATED_EVENTS: Record<string, OSINTEvent[]> = {
  "New York": [
    { title: "Times Square Traffic Congestion Surge", category: "traffic", severity: "warning", description: "Sudden influx of pedestrian and motor vehicle traffic around Broadway and 45th St.", source: "NYPD Transit Control", timestamp: "12 mins ago", location: "Manhattan Sector 4" },
    { title: "Subway Line Q Electrical Switch Disruption", category: "infrastructure", severity: "critical", description: "Track fire near Canal St station has fully halted Q line northbound operations.", source: "MTA Command Desk", timestamp: "3 mins ago", location: "Manhattan Canal St" },
    { title: "EWR Airport Runway Gridlock", category: "infrastructure", severity: "info", description: "Runway maintenance at Newark Liberty has caused consecutive taxiway queues.", source: "FAA Wire", timestamp: "48 mins ago", location: "EWR Newark Airport" }
  ],
  "Tokyo": [
    { title: "Shinjuku Station Passenger Bottleneck", category: "traffic", severity: "warning", description: "Signal failure on the JR Yamanote line creating extreme platform crowding.", source: "JR East Alert", timestamp: "8 mins ago", location: "Shinjuku Station" },
    { title: "Chiba Port Shipping Congestion", category: "infrastructure", severity: "info", description: "High container ship arrival count has raised anchorage waiting times to 31 hours.", source: "Japan Coast Guard", timestamp: "2 hours ago", location: "Tokyo Bay South Sector" },
    { title: "Mild Tremor Activity Near Kanto Ridge", category: "weather", severity: "info", description: "Seismic sensors record a minor magnitude 3.8 earthquake. No infrastructure damage.", source: "JMA Tokyo", timestamp: "1 hour ago", location: "Kanto Coastline" }
  ],
  "Paris": [
    { title: "Avenue des Champs-Élysées Traffic Stoppage", category: "traffic", severity: "warning", description: "Dignitary motorcade and public demonstration has caused complete road blockades.", source: "Paris Police Prefecture", timestamp: "14 mins ago", location: "8th Arrondissement" },
    { title: "Gare du Nord Signal Upgrade Delays", category: "infrastructure", severity: "warning", description: "Telemetry discrepancy during scheduled switch updates has delayed Eurostar departures.", source: "SNCF Feed", timestamp: "35 mins ago", location: "Gare du Nord Terminal" },
    { title: "Seine Water Level Advisory", category: "weather", severity: "info", description: "Seasonal precipitation has elevated Seine water levels to +3.4m.", source: "Vigicrues France", timestamp: "3 hours ago", location: "Paris Waterways" }
  ],
  "London": [
    { title: "Heathrow Airport Air Traffic Flow Control", category: "traffic", severity: "warning", description: "Strong wind gusts up to 34 knots require single-runway operation procedures.", source: "NATS Command", timestamp: "11 mins ago", location: "LHR Heathrow" },
    { title: "Tower Bridge Operational Hold", category: "infrastructure", severity: "info", description: "Mechanical sensor calibration has delayed scheduled river traffic openings.", source: "Port of London Authority", timestamp: "1 hour ago", location: "River Thames Sector" },
    { title: "TfL Underground District Line Failure", category: "infrastructure", severity: "critical", description: "Power rail surge at Westminster Station has triggered station evacuation.", source: "TfL Status Board", timestamp: "5 mins ago", location: "Westminster Sector" }
  ],
  "San Francisco": [
    { title: "Golden Gate Bridge Dense Fog Advisory", category: "weather", severity: "warning", description: "Heavy marine layer has reduced horizontal visibility on US-101 below 50 meters.", source: "Caltrans District 4", timestamp: "22 mins ago", location: "Golden Gate Corridor" },
    { title: "Port of Oakland Gantry Crane Outage", category: "infrastructure", severity: "warning", description: "Power sub-station failure has disabled two container crane gantries.", source: "Port of Oakland Ops", timestamp: "1 hour ago", location: "Oakland Harbor Channel" },
    { title: "Market St Power Sub-grid Instability", category: "infrastructure", severity: "info", description: "Localized transformer failure near Montgomery St has disrupted streetlights.", source: "PG&E Dispatch", timestamp: "45 mins ago", location: "SF Financial District" }
  ],
  "Dubai": [
    { title: "Sheikh Zayed Road Traffic Surge", category: "traffic", severity: "warning", description: "Multi-vehicle collision near Interchange 2 has blocked three northbound lanes.", source: "Dubai Police Headquarters", timestamp: "7 mins ago", location: "SZR Corridor" },
    { title: "DXB Terminal 3 Baggage System Upgrades", category: "infrastructure", severity: "info", description: "Scheduled software integration causing minor check-in wait increases.", source: "Dubai Airports Command", timestamp: "2 hours ago", location: "DXB Terminal 3" },
    { title: "High Temperature Atmospheric Advisory", category: "weather", severity: "warning", description: "Peak ambient temperature registered at 46°C. Heat index at dangerous levels.", source: "NCM UAE", timestamp: "4 hours ago", location: "Dubai Coastline" }
  ],
  "Rio de Janeiro": [
    { title: "Guanabara Bay Cargo Vessel Anchorage", category: "traffic", severity: "info", description: "Surge in steel bulk cargo ships has raised inner bay anchorage occupancy to 88%.", source: "Brazilian Navy Port Captain", timestamp: "3 hours ago", location: "Guanabara Sector" },
    { title: "Copacabana Coastal Roadway Maintenance", category: "infrastructure", severity: "warning", description: "Seawall integrity repairs have reduced Avenida Atlântica to single-lane flow.", source: "CET-Rio Traffic Desk", timestamp: "1 hour ago", location: "Zona Sul" },
    { title: "Heavy Precipitation Warning", category: "weather", severity: "warning", description: "Moisture-laden sea breeze generating sudden cloudbursts in the Southern hills.", source: "Alerta Rio", timestamp: "18 mins ago", location: "Rio Southern Sector" }
  ],
  "Amsterdam": [
    { title: "A10 Ring Road Congestion", category: "traffic", severity: "warning", description: "Peak hour traffic causing delays up to 45 minutes on the southern section.", source: "Rijkswaterstaat", timestamp: "15 mins ago", location: "A10 South" },
    { title: "Schiphol Baggage Handler Strike", category: "infrastructure", severity: "critical", description: "Ground crew strike affecting baggage processing. Delays up to 3 hours.", source: "Schiphol Operations", timestamp: "1 hour ago", location: "Schiphol Airport" },
    { title: "Canal Ring Water Level Normal", category: "weather", severity: "info", description: "Water levels in the canal ring system are within normal parameters.", source: "Waternet Amsterdam", timestamp: "2 hours ago", location: "Canal Ring" }
  ]
};

export default function Maps3D() {
  const navigate = useNavigate();
  const [selectedCity, setSelectedCity] = useState<CityConfig>(FEATURED_CITIES[0]);
  const [events, setEvents] = useState<OSINTEvent[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [isDemo, setIsDemo] = useState(true);
  const [showCitySelector, setShowCitySelector] = useState(false);
  const [fleetAssets, setFleetAssets] = useState<FleetAsset[]>(() => [
    ...CORPORATE_JETS,
    ...COMMERCIAL_VESSELS,
    ...STRATEGIC_CHOICE_POINTS,
    ...SEISMIC_EVENTS
  ]);

  // Load city events
  const fetchCityEvents = useCallback(() => {
    setLoadingFeed(true);
    setFeedError("");
    setTimeout(() => {
      const cityEvents = SIMULATED_EVENTS[selectedCity.name] || SIMULATED_EVENTS["New York"] || [];
      setEvents(cityEvents);
      setLoadingFeed(false);
    }, 800);
  }, [selectedCity]);

  useEffect(() => {
    fetchCityEvents();
  }, [fetchCityEvents]);

  // Fleet movement simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setFleetAssets((prev) => simulateAssetsMovement(prev));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectCity = (city: CityConfig) => {
    setSelectedCity(city);
    setShowCitySelector(false);
  };

  const handleCustomCoordinate = (lat: number, lng: number, name: string) => {
    const customCity: CityConfig = {
      name: name || "Custom Monitor Zone",
      country: "CUSTOM",
      lat,
      lng,
      altitude: 500,
      heading: 0,
      tilt: 55,
      range: 2000,
      description: `Custom monitoring zone at coordinates ${lat.toFixed(4)}, ${lng.toFixed(4)}`
    };
    setSelectedCity(customCity);
    setShowCitySelector(false);
  };

  return (
    <div className="h-full w-full flex flex-col" style={{ background: '#000000' }}>
      {/* Top Bar - City Info & Controls */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 py-2"
        style={{
          background: '#000000',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCitySelector(!showCitySelector)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: 'rgba(34,211,238,0.08)',
              border: '1px solid rgba(34,211,238,0.2)',
            }}
          >
            <Compass size={14} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-xs font-mono font-bold" style={{ color: 'var(--accent-cyan)' }}>
              {selectedCity.name.toUpperCase()}
            </span>
          </button>
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            <Crosshair size={10} />
            <span>{selectedCity.lat.toFixed(4)}°N, {selectedCity.lng.toFixed(4)}°E</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDemo && (
            <span
              className="text-[9px] font-mono px-2 py-0.5 rounded border"
              style={{
                background: 'rgba(245,158,11,0.08)',
                color: 'var(--warning)',
                border: '1px solid rgba(245,158,11,0.2)',
              }}
            >
              DEMO MODE
            </span>
          )}
          <button
            onClick={() => navigate('/browser')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono transition-all"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'var(--text-muted)',
            }}
          >
            <Map size={12} />
            <span className="hidden sm:inline">Browser</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Map Area */}
        <div className="flex-1 relative" style={{ background: '#02060d' }}>
          {/* Google Maps 3D Container */}
          <div className="absolute inset-0">
            <iframe
              title="3D Map"
              src={`https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d${selectedCity.range}!2d${selectedCity.lng}!3d${selectedCity.lat}!2m3!1f${selectedCity.tilt}!2f${selectedCity.heading}!3f0!3m2!1i1024!2i768!4f13.1!5e1!3m2!1sen!2snl!4v1`}
              className="w-full h-full border-0"
              style={{ filter: 'invert(0.9) hue-rotate(180deg) saturate(0.5)' }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          {/* Overlay - City Info */}
          <div
            className="absolute top-4 left-4 px-3 py-2 rounded-lg pointer-events-none"
            style={{
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(34,211,238,0.2)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="text-xs font-bold font-mono" style={{ color: 'var(--accent-cyan)' }}>
              {selectedCity.name.toUpperCase()} GRID
            </div>
            <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {selectedCity.country} • {selectedCity.range}m RANGE
            </div>
          </div>

          {/* Overlay - Event Count */}
          <div
            className="absolute top-4 right-4 px-3 py-2 rounded-lg pointer-events-none"
            style={{
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(239,68,68,0.2)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={12} style={{ color: 'var(--danger)' }} />
              <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--danger)' }}>
                {events.length} ACTIVE ALERTS
              </span>
            </div>
          </div>
        </div>

        {/* OSINT Panel - Right Side */}
        <div
          className="w-[380px] flex-shrink-0 border-l flex flex-col overflow-hidden"
          style={{
            background: '#000000',
            borderColor: 'rgba(255,255,255,0.04)',
          }}
        >
          <OSINTPanel
            cityName={selectedCity.name}
            lat={selectedCity.lat}
            lng={selectedCity.lng}
            events={events}
            loadingFeed={loadingFeed}
            feedError={feedError}
            fetchCityEvents={fetchCityEvents}
            isDemo={isDemo}
            setIsDemo={setIsDemo}
            onCustomCoordinate={handleCustomCoordinate}
          />
        </div>
      </div>

      {/* City Selector Modal */}
      {showCitySelector && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
          <div className="relative w-full max-w-md mx-4" style={{ maxHeight: '80vh' }}>
            <button
              onClick={() => setShowCitySelector(false)}
              className="absolute -top-10 right-0 p-2 rounded-lg transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}
            >
              <X size={16} />
            </button>
            <CitySelector
              selectedCity={selectedCity}
              onSelectCity={handleSelectCity}
              onCustomCoordinate={handleCustomCoordinate}
            />
          </div>
        </div>
      )}
    </div>
  );
}
