/**
 * Shared helpers for the OSINT edge functions: Gemini REST calls plus the
 * honest simulated-data fallback used when GEMINI_API_KEY isn't configured
 * or the live call fails. Every simulated response is tagged isDemo: true
 * so the UI can show it as clearly non-live.
 */

export function isGeminiKeyConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return !!key && key !== "" && key !== "MY_GEMINI_API_KEY" && key !== "YOUR_API_KEY";
}

export function isQuotaError(err: unknown): boolean {
  const str = String((err as any)?.message || err || "");
  return str.includes("429") || str.includes("RESOURCE_EXHAUSTED") || str.includes("quota");
}

export async function geminiGenerateContent(body: Record<string, unknown>, model: string): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    const err = new Error(errBody || `Gemini HTTP ${response.status}`);
    (err as any).status = response.status;
    throw err;
  }

  return response.json();
}

export const SIMULATED_EVENTS: Record<string, any[]> = {
  "New York": [
    {
      title: "Times Square Traffic Congestion Surge",
      category: "traffic",
      severity: "warning",
      description:
        "A sudden influx of pedestrian and motor vehicle traffic around Broadway and 45th St has slowed average vehicle speed below 4mph. Transit reroutes advised.",
      source: "NYPD Transit Control",
      timestamp: "12 mins ago",
      location: "Manhattan Sector 4",
    },
    {
      title: "EWR Airport Runway Gridlock",
      category: "infrastructure",
      severity: "info",
      description:
        "Runway maintenance at Newark Liberty has caused consecutive taxiway queues of up to 18 aircraft. High delays expected for departures.",
      source: "FAA Wire",
      timestamp: "48 mins ago",
      location: "EWR Newark Airport",
    },
    {
      title: "Subway Line Q Electrical Switch Disruption",
      category: "infrastructure",
      severity: "critical",
      description:
        "Track fire near Canal St station has fully halted Q line northbound operations. Fire departments on-site resolving active smoke conditions.",
      source: "MTA Command Desk",
      timestamp: "3 mins ago",
      location: "Manhattan Canal St",
    },
  ],
  Tokyo: [
    {
      title: "Shinjuku Station Passenger Bottleneck",
      category: "traffic",
      severity: "warning",
      description:
        "Signal failure on the JR Yamanote line is creating extreme platform crowding at Shinjuku Station. Station authorities limiting main concourse access.",
      source: "JR East Alert",
      timestamp: "8 mins ago",
      location: "Shinjuku Station",
    },
    {
      title: "Chiba Port Shipping Congestion",
      category: "infrastructure",
      severity: "info",
      description: "High container ship arrival count has raised anchorage waiting times to 31 hours. Harbor pilots working double shifts to clear queue.",
      source: "Japan Coast Guard",
      timestamp: "2 hours ago",
      location: "Tokyo Bay South Sector",
    },
    {
      title: "Mild Tremor Activity Near Kanto Ridge",
      category: "weather",
      severity: "info",
      description: "Seismic sensors record a minor magnitude 3.8 earthquake. No infrastructure damage or tsunami threat reported. Shinkansen speeds normalized.",
      source: "JMA Tokyo",
      timestamp: "1 hour ago",
      location: "Kanto Coastline",
    },
  ],
  Paris: [
    {
      title: "Avenue des Champs-Élysées Traffic Stoppage",
      category: "traffic",
      severity: "warning",
      description:
        "Dignitary motorcade and public demonstration has caused complete road blockades near Arc de Triomphe. Gendarmerie diverting local traffic.",
      source: "Paris Police Prefecture",
      timestamp: "14 mins ago",
      location: "8th Arrondissement",
    },
    {
      title: "Gare du Nord Signal Upgrade Delays",
      category: "infrastructure",
      severity: "warning",
      description: "An unexpected telemetry discrepancy during scheduled switch updates has delayed Eurostar departures by up to 40 minutes.",
      source: "SNCF Feed",
      timestamp: "35 mins ago",
      location: "Gare du Nord Terminal",
    },
    {
      title: "Seine Water Level Advisory",
      category: "weather",
      severity: "info",
      description: "Seasonal precipitation has elevated Seine water levels to +3.4m. Commuter barge velocities restricted near historic bridge pillars.",
      source: "Vigicrues France",
      timestamp: "3 hours ago",
      location: "Paris Waterways",
    },
  ],
  London: [
    {
      title: "Heathrow Airport Air Traffic Flow Control",
      category: "traffic",
      severity: "warning",
      description: "Strong wind gusts up to 34 knots require single-runway operation procedures for arrivals. Average delay is 25 minutes.",
      source: "NATS Command",
      timestamp: "11 mins ago",
      location: "LHR Heathrow",
    },
    {
      title: "Tower Bridge Operational Hold",
      category: "infrastructure",
      severity: "info",
      description: "Mechanical sensor calibration on the bascule bridges has delayed scheduled river traffic openings by 15 minutes.",
      source: "Port of London Authority",
      timestamp: "1 hour ago",
      location: "River Thames Sector",
    },
    {
      title: "TfL Underground District Line Failure",
      category: "infrastructure",
      severity: "critical",
      description: "Power rail surge at Westminster Station has triggered station evacuation and total suspension of the District & Circle lines.",
      source: "TfL Status Board",
      timestamp: "5 mins ago",
      location: "Westminster Sector",
    },
  ],
  "San Francisco": [
    {
      title: "Golden Gate Bridge Dense Fog Advisory",
      category: "weather",
      severity: "warning",
      description: "Heavy marine layer has reduced horizontal visibility on US-101 below 50 meters. Speed limit reduced to 35mph with active patrols.",
      source: "Caltrans District 4",
      timestamp: "22 mins ago",
      location: "Golden Gate Corridor",
    },
    {
      title: "Port of Oakland Gantry Crane Outage",
      category: "infrastructure",
      severity: "warning",
      description: "Power sub-station failure has disabled two container crane gantries, slowing vessel discharge operations in Outer Harbor.",
      source: "Port of Oakland Ops",
      timestamp: "1 hour ago",
      location: "Oakland Harbor Channel",
    },
    {
      title: "Market St Power Sub-grid Instability",
      category: "infrastructure",
      severity: "info",
      description: "Localized transformer failure near Montgomery St has disrupted streetlights and traffic signals. Maintenance crews on scene.",
      source: "PG&E Dispatch",
      timestamp: "45 mins ago",
      location: "SF Financial District",
    },
  ],
  Dubai: [
    {
      title: "Sheikh Zayed Road Traffic Surge",
      category: "traffic",
      severity: "warning",
      description: "Multi-vehicle collision near Interchange 2 has blocked three northbound lanes, causing heavy backup to Business Bay.",
      source: "Dubai Police Headquarters",
      timestamp: "7 mins ago",
      location: "SZR Corridor",
    },
    {
      title: "DXB Terminal 3 Baggage System Upgrades",
      category: "infrastructure",
      severity: "info",
      description: "Scheduled software integration on Terminal 3's high-speed baggage conveyor is causing minor check-in wait increases.",
      source: "Dubai Airports Command",
      timestamp: "2 hours ago",
      location: "DXB Terminal 3",
    },
    {
      title: "High Temperature Atmospheric Advisory",
      category: "weather",
      severity: "warning",
      description: "Peak ambient temperature registered at 46°C. High humidity levels have pushed heat index to dangerous levels. Heavy labor guidelines active.",
      source: "NCM UAE",
      timestamp: "4 hours ago",
      location: "Dubai Coastline",
    },
  ],
  "Rio de Janeiro": [
    {
      title: "Guanabara Bay Cargo Vessel Anchorage",
      category: "traffic",
      severity: "info",
      description: "A surge in steel bulk cargo ships has raised inner bay anchorage occupancy to 88%. Port authorities optimizing docking order.",
      source: "Brazilian Navy Port Captain",
      timestamp: "3 hours ago",
      location: "Guanabara Sector",
    },
    {
      title: "Copacabana Coastal Roadway Maintenance",
      category: "infrastructure",
      severity: "warning",
      description: "Seawall integrity repairs have reduced Avenida Atlântica to single-lane flow. Commuters urged to use Metro Line 1.",
      source: "CET-Rio Traffic Desk",
      timestamp: "1 hour ago",
      location: "Zona Sul",
    },
    {
      title: "Heavy Precipitation Warning",
      category: "weather",
      severity: "warning",
      description: "Moisture-laden sea breeze is generating sudden cloudbursts in the Southern hills, creating minor surface water runoff on coastal lanes.",
      source: "Alerta Rio",
      timestamp: "18 mins ago",
      location: "Rio Southern Sector",
    },
  ],
};

export function getSimulatedAnalysis(query: string, city: string): { analysis: string; sources: { title: string; url: string }[] } {
  const normalizedQuery = query.toLowerCase();
  let analysis = `### SECURE SURVEILLANCE REPORT: ${city.toUpperCase()} SECTOR\n\n`;
  analysis += `*Disclaimer: No GEMINI_API_KEY is configured (or the live call failed), so this report is simulated, not live intelligence.*\n\n`;

  const sources = [
    { title: `${city} Municipal Open Data Portal`, url: "https://opendata.city.gov" },
    { title: "Global Sat-Intel Registry", url: "https://sat-intel-registry.org" },
  ];

  if (normalizedQuery.includes("airport") || normalizedQuery.includes("flight") || normalizedQuery.includes("aviation")) {
    analysis += `#### Aviation Sector Operations Summary\n`;
    analysis += `- **Aviation Hub Status:** Open & fully operational. Average departure queue wait times are at 12-18 minutes.\n`;
    analysis += `- **Radar Vectors:** All sweep grids confirm nominal flight corridor patterns. Wind-shear alerts are inactive.\n`;
    analysis += `- **Capacity Analysis:** Passenger density in main terminal check-in lobbies is elevated due to holiday transit rushes. Recommended traveler arrival lead time: 2.5 hours.`;
    sources.push({ title: "FAA Airspace Operations Desk", url: "https://faa.gov/status" });
  } else if (normalizedQuery.includes("port") || normalizedQuery.includes("ship") || normalizedQuery.includes("maritime")) {
    analysis += `#### Maritime & Harbor Logistics Report\n`;
    analysis += `- **Waterway Status:** Clear. Anchor density in primary commercial channels is balanced.\n`;
    analysis += `- **Vessel Queue:** 14 cargo carrier vessels currently anchored in outer harbor waiting queues. Average processing latency is 14.5 hours.\n`;
    analysis += `- **Maritime Safety:** Marine transponders are 100% active. Coast Guard patrols confirm zero anomaly clusters near industrial piers.`;
    sources.push({ title: "International Maritime Surveillance Logs", url: "https://marinetraffic.com" });
  } else if (normalizedQuery.includes("power") || normalizedQuery.includes("grid") || normalizedQuery.includes("electric")) {
    analysis += `#### Utility Grid & Power Telemetry\n`;
    analysis += `- **Grid Load Factor:** 78% capacity. Primary and secondary transformers are reporting standard temperature readings.\n`;
    analysis += `- **Grid Incidents:** Minor transformer maintenance in Sector East has been fully resolved; all backup feeders have switched back to normal mode.\n`;
    analysis += `- **Frequency Stability:** System operating at 100.0% nominal synchronization levels with no voltage sags recorded.`;
    sources.push({ title: "Regional Power Grid Registry", url: "https://pge-gridstatus.org" });
  } else if (normalizedQuery.includes("weather") || normalizedQuery.includes("disaster") || normalizedQuery.includes("storm")) {
    analysis += `#### Emergency & Atmospheric Advisory\n`;
    analysis += `- **Barometric Fronts:** Regional air pressure is steady. Thermal radar scans show zero severe precipitation cells approaching the metropolitan sector.\n`;
    analysis += `- **Regional Temperature:** Current index is in accordance with normal local summer climates. Real-time air quality indexing is optimal (AQI: 42).\n`;
    analysis += `- **Advices:** Standard operations. No emergency shelter or evacuation advisories are active.`;
    sources.push({ title: "World Meteorological Registry Feed", url: "https://wmo.int" });
  } else {
    analysis += `#### General Urban OSINT Overview\n`;
    analysis += `- **Transit Flows:** Main road highway grids are flowing with expected commute rush congestion. Bus and rail timetables are at 98% on-time frequency.\n`;
    analysis += `- **Public Order:** Thermal cameras and city center telemetry verify peaceful and normal public density patterns across tourist and business corridors.\n`;
    analysis += `- **Satellite Synthesis:** All optical surveillance assets confirm a standard, peaceful daily cycle. No abnormal coordinate alerts detected.`;
  }

  return { analysis, sources };
}

export function getSimulatedTriage(incidentText: string): string {
  const text = incidentText.toLowerCase();
  let threatLevel = "LOW";
  let impact = "Standard localized activity with nominal impact.";

  if (text.includes("fire") || text.includes("explosion") || text.includes("crash") || text.includes("bomb") || text.includes("crisis")) {
    threatLevel = "HIGH";
    impact = "Immediate severe safety incident. Requires active regional dispatcher triage and safety line isolation.";
  } else if (text.includes("delay") || text.includes("congest") || text.includes("crowd") || text.includes("closed") || text.includes("maintenance")) {
    threatLevel = "MEDIUM";
    impact = "Localized infrastructure or traffic disruption. Moderate regional impact with restoration forecast within 60 minutes.";
  }

  return `### TRIAGE VERDICT: ${threatLevel}\n\n*Note: No GEMINI_API_KEY configured (or the live call failed) — this is a simulated triage, not a real evaluation.*\n\n**1. Security Hazard Level:** ${
    threatLevel === "HIGH" ? "Critical (3/3)" : threatLevel === "MEDIUM" ? "Moderate Warning (2/3)" : "Nominal Informational (1/3)"
  }\n\n**2. Core Vector Evaluation:**\n- ${impact}\n\n**3. Command Actions Recommended:**\n- Dispatch local reconnaissance assets to verify coordinate reports.\n- Monitor active social networks, traffic cameras, and localized news streams.`;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders });
}
