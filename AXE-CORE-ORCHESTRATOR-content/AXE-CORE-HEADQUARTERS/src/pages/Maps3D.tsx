import React from "react";
import OSINTPanel from "@/components/maps3d/OSINTPanel";

/**
 * Maps3D - AXE-CORE- 3D OSINT Surveillance Grid
 * 
 * Features 8 intelligence sectors with toggle controls:
 * - Maritime (40+ vessels: container ships, tankers, cruise ships, mega yachts)
 * - Aviation (20+ corporate jets with real tail numbers)
 * - Seismic (15+ events: earthquakes, wildfires, volcanoes, tsunamis)
 * - Chokepoints (12 major maritime chokepoints)
 * - Nuclear (16+ power plants and facilities)
 * - Data Centers (12 major AI/cloud facilities)
 * - War Zones (12 conflict zones and military bases)
 * - Environment (11 protected/critical zones)
 */
export default function Maps3D() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#050608]">
      <OSINTPanel />
    </div>
  );
}
