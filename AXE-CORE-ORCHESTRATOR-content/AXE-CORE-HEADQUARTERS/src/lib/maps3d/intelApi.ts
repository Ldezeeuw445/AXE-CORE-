import { CityConfig, OSINTEvent } from "./types";

export async function fetchIntelData(functionName: string, body: any) {
  const response = await fetch("/api/intel/proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ functionName, body }),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch intel data from ${functionName}: ${response.statusText}`);
  }
  return await response.json();
}

const MOCK_EVENT_TEMPLATES: Record<string, Array<{ title: string; description: string; type: string; category: string; severity: "critical" | "warning" | "info" }>> = {
  "New York": [
    { title: "Suspicious Aircraft Activity", description: "Unregistered Cessna conducting low-altitude surveillance over midtown airspace. No transponder response.", type: "aircraft", category: "air", severity: "warning" },
    { title: "Maritime Anomaly Detected", description: "Container vessel deviated from standard shipping lane in Hudson corridor. Possible smuggling activity.", type: "vessel", category: "maritime", severity: "critical" },
    { title: "Cybersecurity Alert", description: "DDoS attack detected against financial district infrastructure. Attack vector traced to offshore botnet.", type: "cyber", category: "cyber", severity: "critical" },
    { title: "Traffic Surge", description: "Abnormal congestion patterns detected near Times Square. Potential event or protest forming.", type: "traffic", category: "ground", severity: "info" },
    { title: "Signal Intercept", description: "Encrypted radio traffic spike on emergency frequencies in Brooklyn sector.", type: "signal", category: "signal", severity: "warning" },
    { title: "Heat Signature", description: "Thermal anomaly detected in industrial zone. Possible unregistered facility operation.", type: "thermal", category: "ground", severity: "warning" },
  ],
  "London": [
    { title: "Drone Swarm Sighted", description: "Multiple UAS detected over Thames corridor. Civilian or hostile origin unknown.", type: "aircraft", category: "air", severity: "critical" },
    { title: "Underground Activity", description: "Seismic readings suggest tunneling operations beneath financial district.", type: "seismic", category: "ground", severity: "warning" },
    { title: "Network Intrusion", description: "APT group detected probing Westminster network infrastructure.", type: "cyber", category: "cyber", severity: "critical" },
    { title: "Ferry Deviation", description: "Passenger ferry altered course without authorization. Maritime patrol dispatched.", type: "vessel", category: "maritime", severity: "warning" },
    { title: "Surveillance Countermeasures", description: "Anti-drone system activation in Zone 1. Possible threat neutralized.", type: "signal", category: "signal", severity: "info" },
  ],
  "Tokyo": [
    { title: "Typhoon Approach", description: "Category 3 typhoon projected to make landfall within 48 hours. Evacuation protocols initiated.", type: "weather", category: "ground", severity: "critical" },
    { title: "Power Grid Fluctuation", description: "Unexplained voltage spikes in Shibuya district. Grid stability compromised.", type: "infrastructure", category: "ground", severity: "warning" },
    { title: "Unidentified Submarine", description: "Sonar contact detected in Tokyo Bay. Vessel maintaining radio silence.", type: "vessel", category: "maritime", severity: "critical" },
    { title: "Data Breach", description: "Major corporation reports unauthorized database access. 2M records potentially exposed.", type: "cyber", category: "cyber", severity: "warning" },
  ],
  "Paris": [
    { title: "Protest Formation", description: "Large crowd gathering near Champs-Élysées. riot police mobilizing.", type: "traffic", category: "ground", severity: "warning" },
    { title: "Rail Sabotage", description: "Signal interference detected on Metro Line 4. Potential cyber-physical attack.", type: "infrastructure", category: "ground", severity: "critical" },
    { title: "Airspace Violation", description: "Military aircraft entered civilian corridor without clearance.", type: "aircraft", category: "air", severity: "critical" },
  ],
  "Sydney": [
    { title: "Bushfire Outbreak", description: "Wildfire detected in Blue Mountains. Smoke plume visible from orbital sensors.", type: "thermal", category: "ground", severity: "critical" },
    { title: "Shark Alert", description: "Multiple shark sightings reported along Bondi Beach. Beach closures in effect.", type: "vessel", category: "maritime", severity: "warning" },
    { title: "Heatwave", description: "Record temperatures expected. Power consumption reaching critical levels.", type: "weather", category: "ground", severity: "warning" },
  ],
  "Berlin": [
    { title: "Pipeline Leak", description: "Pressure drop detected in Nord Stream corridor. Possible sabotage under investigation.", type: "infrastructure", category: "ground", severity: "critical" },
    { title: "Drone Activity", description: "Reconnaissance drone spotted over government district. Counter-drone measures engaged.", type: "aircraft", category: "air", severity: "warning" },
    { title: "Ransomware Attack", description: "Municipal services disrupted by ransomware. Critical systems isolated.", type: "cyber", category: "cyber", severity: "critical" },
  ],
  "Dubai": [
    { title: "Sandstorm Warning", description: "Massive sandstorm approaching from desert. Airport operations suspended.", type: "weather", category: "ground", severity: "critical" },
    { title: "Port Congestion", description: "Unusual vessel clustering at Jebel Ali Port. Customs inspection backlog.", type: "vessel", category: "maritime", severity: "warning" },
    { title: "Cyber Espionage", description: "Advanced persistent threat targeting energy sector. Data exfiltration detected.", type: "cyber", category: "cyber", severity: "critical" },
  ],
  "Singapore": [
    { title: "Port Scanning", description: "Systematic port scanning detected against maritime traffic control systems.", type: "cyber", category: "cyber", severity: "warning" },
    { title: "Strait Incident", description: "Merchant vessel reported near-collision with unidentified craft in Malacca Strait.", type: "vessel", category: "maritime", severity: "critical" },
    { title: "Haze Alert", description: "Air quality index exceeding hazardous levels. Visibility reduced to 2km.", type: "weather", category: "ground", severity: "warning" },
  ],
};

const DEFAULT_EVENTS = [
  { title: "Anomalous Signal", description: "Unidentified signal detected in sector. Analysis ongoing.", type: "signal", category: "signal", severity: "info" as const },
  { title: "Routine Patrol", description: "Standard patrol route completed. No incidents reported.", type: "traffic", category: "ground", severity: "info" as const },
  { title: "Satellite Pass", description: "Reconnaissance satellite completing overhead pass. Image capture in progress.", type: "aircraft", category: "air", severity: "info" as const },
];

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export async function getIntelligenceForCity(city: CityConfig): Promise<OSINTEvent[]> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700));

  const templates = MOCK_EVENT_TEMPLATES[city.name] || DEFAULT_EVENTS;
  const seed = city.name.length + city.lat * 100 + city.lng * 100;

  return templates.map((template, index) => {
    const offsetLat = (seededRandom(seed + index * 7) - 0.5) * 0.05;
    const offsetLng = (seededRandom(seed + index * 13) - 0.5) * 0.05;
    const timeOffset = Math.floor(seededRandom(seed + index * 3) * 86400000);

    return {
      id: `event-${city.name}-${index}-${Date.now()}`,
      title: template.title,
      description: template.description,
      type: template.type,
      category: template.category,
      severity: template.severity,
      timestamp: new Date(Date.now() - timeOffset).toISOString(),
      coordinates: {
        lat: city.lat + offsetLat,
        lng: city.lng + offsetLng,
      },
      source: "AXE-OSINT-SAT",
      verified: seededRandom(seed + index * 19) > 0.3,
    };
  });
}
