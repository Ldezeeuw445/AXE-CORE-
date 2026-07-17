import OSINTPanel from "@/components/maps3d/OSINTPanel";

/**
 * Maps3D Page — AXE Global Surveillance Feed
 * 
 * Fits within AppShell layout (between TopNav and BottomNav)
 */
export default function Maps3D() {
  return (
    <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
      <OSINTPanel />
    </div>
  );
}
