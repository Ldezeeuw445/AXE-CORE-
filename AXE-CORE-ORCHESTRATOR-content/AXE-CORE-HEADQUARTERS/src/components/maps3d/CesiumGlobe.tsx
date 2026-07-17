import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CityConfig, LiveOsintPoint } from "@/lib/maps3d/types";

// ─── Types ───
interface ThreeGlobeProps {
  selectedCity: CityConfig;
  osintPoints: LiveOsintPoint[];
  isActive: boolean;
}

// ─── City data ───
const CITY_DATA: Record<string, { lat: number; lng: number; height: number }> = {
  paris:    { lat: 48.8566, lng: 2.3522, height: 3.5 },
  london:   { lat: 51.5074, lng: -0.1278, height: 3.5 },
  sf:       { lat: 37.7749, lng: -122.4194, height: 4.0 },
  dubai:    { lat: 25.2048, lng: 55.2708, height: 3.5 },
  rio:      { lat: -22.9068, lng: -43.1729, height: 3.5 },
  amsterdam:{ lat: 52.3676, lng: 4.9041, height: 3.0 },
};

// ─── Color map ───
const OSINT_COLORS: Record<string, string> = {
  flight:   "#22D3EE",
  vessel:   "#3B82F6",
  threat:   "#EF4444",
  news:     "#FBBF24",
  disaster: "#F97316",
  cyber:    "#A855F7",
  weather:  "#10B981",
};

const GLOBE_RADIUS = 2;

function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

export default function ThreeGlobe({ selectedCity, osintPoints, isActive }: ThreeGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    globe: THREE.Group;
    markers: THREE.Group;
    stars: THREE.Points;
    frameId: number;
  } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cityRef = useRef(selectedCity.id);

  // ─── Initialize Three.js scene ───
  useEffect(() => {
    if (!isActive || !containerRef.current || sceneRef.current) return;

    try {
      const container = containerRef.current;
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);

      // Camera
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(0, 0, 6);

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      container.appendChild(renderer.domElement);

      // Controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.rotateSpeed = 0.5;
      controls.zoomSpeed = 0.8;
      controls.minDistance = 3;
      controls.maxDistance = 15;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.3;

      // Globe group
      const globe = new THREE.Group();
      scene.add(globe);

      // Earth sphere (dark, slightly reflective)
      const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
      const earthMat = new THREE.MeshPhongMaterial({
        color: 0x111111,
        emissive: 0x050505,
        specular: 0x222222,
        shininess: 10,
      });
      const earth = new THREE.Mesh(earthGeo, earthMat);
      globe.add(earth);

      // Atmosphere glow (inner)
      const atmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.02, 64, 64);
      const atmoMat = new THREE.MeshBasicMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.03,
        side: THREE.BackSide,
      });
      const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
      globe.add(atmosphere);

      // Atmosphere glow (outer)
      const atmoOuterGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.08, 64, 64);
      const atmoOuterMat = new THREE.MeshBasicMaterial({
        color: 0x0088ff,
        transparent: true,
        opacity: 0.015,
        side: THREE.BackSide,
      });
      const atmosphereOuter = new THREE.Mesh(atmoOuterGeo, atmoOuterMat);
      globe.add(atmosphereOuter);

      // Grid lines (latitude / longitude)
      const gridMaterial = new THREE.LineBasicMaterial({ color: 0x1a3a5c, transparent: true, opacity: 0.3 });
      const gridGroup = new THREE.Group();
      // Longitude lines
      for (let i = 0; i < 24; i++) {
        const lng = (i / 24) * 360 - 180;
        const points: THREE.Vector3[] = [];
        for (let j = 0; j <= 64; j++) {
          const lat = (j / 64) * 180 - 90;
          points.push(latLngToVector3(lat, lng, GLOBE_RADIUS * 1.001));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        gridGroup.add(new THREE.Line(geo, gridMaterial));
      }
      // Latitude lines
      for (let i = 0; i < 12; i++) {
        const lat = (i / 12) * 180 - 90;
        if (Math.abs(lat) > 89) continue;
        const points: THREE.Vector3[] = [];
        for (let j = 0; j <= 64; j++) {
          const lng = (j / 64) * 360 - 180;
          points.push(latLngToVector3(lat, lng, GLOBE_RADIUS * 1.001));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        gridGroup.add(new THREE.Line(geo, gridMaterial));
      }
      globe.add(gridGroup);

      // Stars
      const starGeo = new THREE.BufferGeometry();
      const starCount = 2000;
      const starPositions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount * 3; i++) {
        starPositions[i] = (Math.random() - 0.5) * 200;
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.8 });
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);

      // Lighting
      const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
      scene.add(ambientLight);
      const dirLight = new THREE.DirectionalLight(0xffffff, 1);
      dirLight.position.set(5, 3, 5);
      scene.add(dirLight);
      const backLight = new THREE.DirectionalLight(0x004488, 0.5);
      backLight.position.set(-5, -2, -5);
      scene.add(backLight);

      // Markers group
      const markers = new THREE.Group();
      globe.add(markers);

      // Animation loop
      const animate = () => {
        const frameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
        if (sceneRef.current) sceneRef.current.frameId = frameId;
      };
      animate();

      sceneRef.current = { scene, camera, renderer, controls, globe, markers, stars, frameId: 0 };
      setIsLoaded(true);

      // Resize handler
      const onResize = () => {
        if (!containerRef.current || !sceneRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        sceneRef.current.camera.aspect = w / h;
        sceneRef.current.camera.updateProjectionMatrix();
        sceneRef.current.renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);

      return () => {
        window.removeEventListener("resize", onResize);
        if (sceneRef.current) {
          cancelAnimationFrame(sceneRef.current.frameId);
          sceneRef.current.renderer.dispose();
          container.removeChild(sceneRef.current.renderer.domElement);
          sceneRef.current = null;
        }
      };
    } catch (err) {
      console.error("[ThreeGlobe] Init error:", err);
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [isActive]);

  // ─── Fly to city ───
  useEffect(() => {
    if (!sceneRef.current || !isLoaded) return;
    const city = CITY_DATA[selectedCity.id];
    if (!city) return;

    const target = latLngToVector3(city.lat, city.lng, city.height);
    const start = sceneRef.current.camera.position.clone();
    const duration = 1500;
    const startTime = Date.now();

    const animateCamera = () => {
      if (!sceneRef.current) return;
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad

      sceneRef.current.camera.position.lerpVectors(start, target, ease);
      sceneRef.current.camera.lookAt(0, 0, 0);

      if (t < 1) requestAnimationFrame(animateCamera);
    };
    animateCamera();

    // Disable auto-rotate temporarily
    sceneRef.current.controls.autoRotate = false;
    setTimeout(() => {
      if (sceneRef.current) sceneRef.current.controls.autoRotate = true;
    }, 5000);

    cityRef.current = selectedCity.id;
  }, [selectedCity, isLoaded]);

  // ─── Update OSINT markers ───
  const updateMarkers = useCallback(() => {
    if (!sceneRef.current || !isLoaded) return;

    const { markers, globe } = sceneRef.current;
    // Remove old markers
    while (markers.children.length > 0) {
      markers.remove(markers.children[0]);
    }

    osintPoints.forEach((point) => {
      const colorStr = OSINT_COLORS[point.kind] || "#888888";
      const color = new THREE.Color(colorStr);
      const pos = latLngToVector3(point.lat, point.lon || 0, GLOBE_RADIUS * 1.03);

      // Marker dot
      const dotGeo = new THREE.SphereGeometry(0.03, 8, 8);
      const dotMat = new THREE.MeshBasicMaterial({ color });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos);
      markers.add(dot);

      // Glow ring
      const ringGeo = new THREE.RingGeometry(0.04, 0.06, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos.clone().multiplyScalar(1.01));
      ring.lookAt(new THREE.Vector3(0, 0, 0));
      markers.add(ring);

      // Line to surface
      const surfacePos = latLngToVector3(point.lat, point.lon || 0, GLOBE_RADIUS);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([surfacePos, pos]);
      const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 });
      const line = new THREE.Line(lineGeo, lineMat);
      markers.add(line);
    });
  }, [osintPoints, isLoaded]);

  useEffect(() => {
    updateMarkers();
  }, [updateMarkers]);

  // ─── Render ───
  return (
    <div className="relative w-full h-full bg-black">
      <div ref={containerRef} className="absolute inset-0 z-[1]" />

      {!isLoaded && !loadError && (
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center bg-black space-y-4">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono text-cyan-400 uppercase tracking-widest animate-pulse">
            Initializing 3D Globe...
          </p>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black">
          <div className="text-center space-y-3 max-w-sm mx-4">
            <div className="text-sm font-mono text-rose-400 uppercase tracking-wider">3D Globe Error</div>
            <div className="text-[10px] font-mono text-slate-400">{loadError}</div>
          </div>
        </div>
      )}
    </div>
  );
}
