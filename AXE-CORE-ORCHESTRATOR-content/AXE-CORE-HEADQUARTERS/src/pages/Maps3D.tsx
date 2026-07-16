import OSINTPanel from "@/components/maps3d/OSINTPanel";

/**
 * Maps3D Page — AXE Global Surveillance Feed
 * 
 * This page wraps the OSINTPanel component which provides the full
 * "AXE GLOBAL SURVEILLANCE FEED" layout with Google Maps 3D integration,
 * floating panels, city tabs, waypoint filters, and status bar.
 */
export default function Maps3D() {
  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <OSINTPanel />
    </div>
  );
}
