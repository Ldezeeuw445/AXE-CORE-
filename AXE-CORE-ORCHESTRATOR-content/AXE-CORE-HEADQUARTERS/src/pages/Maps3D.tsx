import OSINTPanel from "@/components/maps3d/OSINTPanel";

/**
 * Maps3D Page — AXE Global Surveillance Feed
 * 
 * Fits within AppShell layout (between TopNav and BottomNav)
 */
export default function Maps3D() {
  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <OSINTPanel />
    </div>
  );
}
