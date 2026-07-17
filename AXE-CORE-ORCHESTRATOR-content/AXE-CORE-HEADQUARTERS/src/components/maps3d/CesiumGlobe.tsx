import { useEffect, useRef, useCallback, useState } from "react";
import type { CityConfig, LiveOsintPoint } from "@/lib/maps3d/types";

// ─── Types ───
interface CesiumGlobeProps {
  selectedCity: CityConfig;
  osintPoints: LiveOsintPoint[];
  isActive: boolean; // controls if we should render
}

// ─── City data ───
const CITY_DATA: Record<string, { lat: number; lng: number; height: number; heading: number; pitch: number }> = {
  paris:    { lat: 48.8566, lng: 2.3522, height: 20000, heading: 0, pitch: -45 },
  london:   { lat: 51.5074, lng: -0.1278, height: 20000, heading: 0, pitch: -45 },
  sf:       { lat: 37.7749, lng: -122.4194, height: 25000, heading: 0, pitch: -45 },
  dubai:    { lat: 25.2048, lng: 55.2708, height: 20000, heading: 0, pitch: -45 },
  rio:      { lat: -22.9068, lng: -43.1729, height: 20000, heading: 0, pitch: -45 },
  amsterdam:{ lat: 52.3676, lng: 4.9041, height: 15000, heading: 0, pitch: -45 },
};

// ─── Color map for OSINT kinds ───
const OSINT_COLORS: Record<string, string> = {
  flight:   "#22D3EE", // cyan
  vessel:   "#3B82F6", // blue
  threat:   "#EF4444", // red
  news:     "#FBBF24", // yellow
  disaster: "#F97316", // orange
  cyber:    "#A855F7", // purple
  weather:  "#10B981", // emerald
};

/**
 * CesiumJS 3D Globe — AXE OSINT Surveillance Feed
 *
 * A real 3D globe with satellite tiles, custom OSINT markers, city flyTo,
 * and full camera control. Replaces Google Maps entirely.
 */
export default function CesiumGlobe({ selectedCity, osintPoints, isActive }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const entitiesRef = useRef<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ─── Initialize Cesium Viewer ───
  useEffect(() => {
    if (!isActive || !containerRef.current || viewerRef.current) return;

    const Cesium = (window as any).Cesium;
    if (!Cesium) {
      setLoadError("CesiumJS not loaded (CDN failed)");
      return;
    }

    try {
      // ArcGIS World Imagery — free satellite tiles, no token
      const imageryProvider = new Cesium.ArcGisMapServerImageryProvider({
        url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
      });

      const viewer = new Cesium.Viewer(containerRef.current, {
        imageryProvider,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        vrButton: false,
        selectionIndicator: false,
        infoBox: false,
        creditContainer: undefined,
        skyAtmosphere: false,
        skyBox: false,
        shouldAnimate: true,
        targetFrameRate: 30,
        scene3DOnly: true,
      });

      // Dark scene
      viewer.scene.backgroundColor = Cesium.Color.BLACK;
      viewer.scene.globe.baseColor = Cesium.Color.BLACK;
      viewer.scene.globe.enableLighting = false;
      viewer.scene.globe.atmosphereLightIntensity = 0.1;
      viewer.scene.highDynamicRange = false;
      viewer.scene.globe.depthTestAgainstTerrain = false;

      // Disable default left-click behaviours so UI doesn't block
      viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
        Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
      );

      // Camera controls (orbit / zoom)
      viewer.scene.screenSpaceCameraController.enableTilt = true;
      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableZoom = true;
      viewer.scene.screenSpaceCameraController.enableLook = false;

      viewerRef.current = viewer;
      setIsLoaded(true);
      console.log("[CesiumGlobe] Viewer initialized");
    } catch (err) {
      console.error("[CesiumGlobe] Init error:", err);
      setLoadError(err instanceof Error ? err.message : String(err));
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [isActive]);

  // ─── Fly to selected city ───
  useEffect(() => {
    if (!viewerRef.current || !isLoaded) return;

    const viewer = viewerRef.current;
    const city = CITY_DATA[selectedCity.id];
    if (!city) return;

    viewer.camera.flyTo({
      destination: (window as any).Cesium.Cartesian3.fromDegrees(
        city.lng,
        city.lat,
        city.height
      ),
      orientation: {
        heading: (window as any).Cesium.Math.toRadians(city.heading),
        pitch: (window as any).Cesium.Math.toRadians(city.pitch),
        roll: 0,
      },
      duration: 1.5,
    });
  }, [selectedCity, isLoaded]);

  // ─── Update OSINT markers ───
  const updateMarkers = useCallback(() => {
    if (!viewerRef.current || !isLoaded) return;

    const viewer = viewerRef.current;
    const Cesium = (window as any).Cesium;

    // Remove old entities
    entitiesRef.current.forEach((e) => viewer.entities.remove(e));
    entitiesRef.current = [];

    osintPoints.forEach((point) => {
      const color = OSINT_COLORS[point.kind] || "#888888";
      const height = point.kind === "flight" ? point.altitude ?? 10000 : 100;

      // Billboard (colored circle with label)
      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(point.lng, point.lat, height),
        billboard: {
          image: createMarkerImage(color, point.kind),
          scale: 0.5,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          eyeOffset: new Cesium.Cartesian3(0, 0, -50),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: height > 1000
            ? Cesium.HeightReference.NONE
            : Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: point.label || point.callsign || point.kind.toUpperCase(),
          font: "10px monospace",
          fillColor: Cesium.Color.fromCssColorString(color),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -28),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          eyeOffset: new Cesium.Cartesian3(0, 0, -50),
        },
      });

      entitiesRef.current.push(entity);
    });
  }, [osintPoints, isLoaded]);

  useEffect(() => {
    updateMarkers();
  }, [updateMarkers]);

  // ─── Helpers ───
  function createMarkerImage(color: string, kind: string): string {
    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Glow
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 10, 0, Math.PI * 2);
    ctx.fillStyle = color + "40";
    ctx.fill();

    // Inner dot
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // White core
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    // Icon letter in center
    ctx.fillStyle = "#000";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const letter = kind === "flight" ? "✈" : kind === "vessel" ? "⛵" : "●";
    ctx.fillText(letter, size / 2, size / 2);

    return canvas.toDataURL("image/png");
  }

  // ─── Render ───
  return (
    <div className="relative w-full h-full bg-black">
      <div ref={containerRef} className="absolute inset-0 z-[1]" />

      {/* Loading state */}
      {!isLoaded && !loadError && (
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center bg-black space-y-4">
          <div className="relative">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-xs font-mono text-cyan-400 uppercase tracking-widest animate-pulse">
              Initializing 3D Globe...
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black">
          <div className="text-center space-y-3 max-w-sm mx-4">
            <div className="text-sm font-mono text-rose-400 uppercase tracking-wider">
              3D Globe Error
            </div>
            <div className="text-[10px] font-mono text-slate-400">{loadError}</div>
          </div>
        </div>
      )}
    </div>
  );
}
