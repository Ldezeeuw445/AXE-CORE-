/**
 * TerrainMarkers - gold beacons on hub summits (clickable), leaf-node rings
 * revealed around a focused hub (clickable -> opens the app's leaf card),
 * and the cinematic camera rig.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, QuadraticBezierLine } from '@react-three/drei';
import { makeGlowTexture, type EngineHub, type TerrainEngine } from './terrainEngine';

const beamVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const beamFragment = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float a = pow(1.0 - vUv.y, 2.2) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export interface LeafNodeData {
  id: string;
  label: string;
  detail?: string;
  source?: unknown;
}

interface PlacedLeaf extends LeafNodeData {
  x: number;
  y: number;
  z: number;
}

export function computeLeafRing(hub: EngineHub, leaves: LeafNodeData[], engine: TerrainEngine): PlacedLeaf[] {
  return leaves.map((s, i) => {
    const ang = (i / Math.max(1, leaves.length)) * Math.PI * 2 + 0.7;
    const r = hub.radius * (0.85 + 0.3 * (i % 2));
    const x = hub.x + Math.cos(ang) * r;
    const z = hub.z + Math.sin(ang) * r;
    const y = engine.heightAt(x, z);
    return { ...s, x, y, z };
  });
}

function HubBeacon({
  hub,
  engine,
  glowTex,
  hovered,
  selected,
  dimmed,
  onSelect,
  onHover,
}: {
  hub: EngineHub;
  engine: TerrainEngine;
  glowTex: THREE.Texture;
  hovered: boolean;
  selected: boolean;
  dimmed: boolean;
  onSelect: (hub: EngineHub) => void;
  onHover: (id: string | null) => void;
}) {
  const peakY = useMemo(() => engine.heightAt(hub.x, hub.z), [hub, engine]);
  const beamH = 1.5 + hub.height * 0.4;
  const spriteRef = useRef<THREE.Sprite>(null);
  const beamMat = useRef<THREE.ShaderMaterial>(null);

  const beamUniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(hub.colorHex) }, uOpacity: { value: 0.7 } }),
    [hub.colorHex],
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 1 + 0.1 * Math.sin(t * 2 + hub.x * 1.3);
    const s = (hovered || selected ? 2.9 : 2.1) * pulse;
    if (spriteRef.current) spriteRef.current.scale.set(s, s, 1);
    if (beamMat.current) {
      beamMat.current.uniforms.uOpacity.value =
        (hovered || selected ? 0.95 : 0.6) + 0.15 * Math.sin(t * 2.3 + hub.z);
    }
  });

  return (
    <group position={[hub.x, peakY, hub.z]}>
      <sprite ref={spriteRef} position={[0, 0.15, 0]} renderOrder={3}>
        <spriteMaterial
          map={glowTex}
          color={hub.colorHex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          opacity={dimmed ? 0.35 : 0.9}
          toneMapped={false}
        />
      </sprite>
      <mesh position={[0, beamH / 2, 0]} renderOrder={3}>
        <cylinderGeometry args={[0.03, 0.1, beamH, 8, 1, true]} />
        <shaderMaterial
          ref={beamMat}
          uniforms={beamUniforms}
          vertexShader={beamVertex}
          fragmentShader={beamFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* invisible hitbox */}
      <mesh
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          if (e.delta <= 2) onSelect(hub);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover(hub.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[1.6, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hub.name && !hub.hideLabel && (
        <Html
          center
          position={[0, 2.6, 0]}
          distanceFactor={30}
          zIndexRange={[40, 0]}
          style={{ pointerEvents: 'none', opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.4s ease' }}
        >
          <div style={{ textAlign: 'center', whiteSpace: 'nowrap', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, letterSpacing: 0.2, textShadow: '0 2px 14px rgba(0,0,0,0.9)' }}>
              {hub.name}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11.5, marginTop: 1 }}>
              {hub.memories.toLocaleString()} memories
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function LeafRing({
  hub,
  leaves,
  engine,
  glowTex,
  showLabels,
  onSelectLeaf,
}: {
  hub: EngineHub;
  leaves: PlacedLeaf[];
  engine: TerrainEngine;
  glowTex: THREE.Texture;
  showLabels: boolean;
  onSelectLeaf: (leaf: PlacedLeaf) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const prog = useRef(0);
  useEffect(() => {
    prog.current = 0;
  }, [hub]);
  useFrame((_, dt) => {
    prog.current = Math.min(1, prog.current + dt * 1.3);
    const e = 1 - Math.pow(1 - prog.current, 3);
    if (group.current) {
      group.current.visible = prog.current > 0.03;
      group.current.scale.setScalar(THREE.MathUtils.lerp(0.92, 1, e));
    }
  });

  const peakY = engine.heightAt(hub.x, hub.z);
  const peakTop: [number, number, number] = [hub.x, peakY + 0.3, hub.z];

  return (
    <group ref={group}>
      {leaves.map((n) => (
        <group key={n.id}>
          <QuadraticBezierLine
            start={peakTop}
            end={[n.x, n.y + 0.25, n.z]}
            mid={[(hub.x + n.x) / 2, Math.max(peakY, n.y) + 1.5, (hub.z + n.z) / 2]}
            color={hub.colorHex}
            lineWidth={1}
            transparent
            opacity={0.45}
          />
          <sprite position={[n.x, n.y + 0.25, n.z]} scale={[1.15, 1.15, 1]} renderOrder={3}>
            <spriteMaterial
              map={glowTex}
              color={hub.colorHex}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.9}
              toneMapped={false}
            />
          </sprite>
          <mesh position={[n.x, n.y + 0.25, n.z]} renderOrder={3}>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          {/* invisible hitbox - leaf opens the app's memory card */}
          <mesh
            position={[n.x, n.y + 0.25, n.z]}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
            }}
            onPointerUp={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              if (e.delta <= 2) onSelectLeaf(n);
            }}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
            }}
          >
            <sphereGeometry args={[0.7, 8, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          {showLabels && (
            <Html
              center
              position={[n.x, n.y + 1.05, n.z]}
              distanceFactor={20}
              zIndexRange={[40, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div style={{ textAlign: 'center', whiteSpace: 'nowrap', fontFamily: "'Inter', sans-serif" }}>
                <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>{n.label}</div>
              </div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}

export function TerrainCameraRig({
  engine,
  selected,
  controlsRef,
  defaultCam = [0, 18, 31],
  defaultTarget = [0, 0.5, 0],
}: {
  engine: TerrainEngine;
  selected: EngineHub | null;
  controlsRef: React.MutableRefObject<any>;
  defaultCam?: [number, number, number];
  defaultTarget?: [number, number, number];
}) {
  const { camera } = useThree();
  const anim = useRef<any>({ active: false, t: 0 });

  useEffect(() => {
    const ctl = controlsRef.current;
    if (!ctl) return;
    let toPos: THREE.Vector3;
    let toTgt: THREE.Vector3;
    if (selected) {
      const peakY = engine.heightAt(selected.x, selected.z);
      toTgt = new THREE.Vector3(selected.x, peakY + 0.3, selected.z);
      const dir = new THREE.Vector3(selected.x, 0, selected.z);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
      dir.normalize();
      const dist = selected.radius * 2.4;
      toPos = new THREE.Vector3(
        selected.x + dir.x * dist,
        peakY + selected.radius * 0.85,
        selected.z + dir.z * dist,
      );
    } else {
      toTgt = new THREE.Vector3(...defaultTarget);
      toPos = new THREE.Vector3(...defaultCam);
    }
    anim.current = {
      active: true,
      t: 0,
      fromPos: camera.position.clone(),
      toPos,
      fromTgt: ctl.target.clone(),
      toTgt,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useFrame((_, dt) => {
    const ctl = controlsRef.current;
    if (!ctl) return;
    const a = anim.current;
    if (a.active) {
      a.t = Math.min(1, a.t + dt / 1.5);
      const e = easeInOutCubic(a.t);
      camera.position.lerpVectors(a.fromPos, a.toPos, e);
      ctl.target.lerpVectors(a.fromTgt, a.toTgt, e);
      if (a.t >= 1) a.active = false;
    }
    ctl.enabled = !a.active;
    const minY = engine.heightAt(camera.position.x, camera.position.z) + 0.7;
    if (camera.position.y < minY) camera.position.y = minY;
    ctl.update();
  });

  return null;
}

export default function TerrainMarkers({
  engine,
  selected,
  leaves,
  hoveredId,
  onHover,
  onSelectHub,
  onSelectLeaf,
  showLeafLabels,
}: {
  engine: TerrainEngine;
  selected: EngineHub | null;
  leaves: PlacedLeaf[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelectHub: (hub: EngineHub) => void;
  onSelectLeaf: (leaf: PlacedLeaf) => void;
  showLeafLabels: boolean;
}) {
  const glowTex = useMemo(() => makeGlowTexture(), []);
  return (
    <group>
      {engine.hubs
        .filter((hub) => !hub.decorative)
        .map((hub) => (
          <HubBeacon
            key={hub.id}
            hub={hub}
            engine={engine}
            glowTex={glowTex}
            hovered={hoveredId === hub.id}
            selected={selected?.id === hub.id}
            dimmed={!!selected && selected.id !== hub.id}
            onSelect={onSelectHub}
            onHover={onHover}
          />
        ))}
      {selected && leaves.length > 0 && (
        <LeafRing
          hub={selected}
          leaves={leaves}
          engine={engine}
          glowTex={glowTex}
          showLabels={showLeafLabels}
          onSelectLeaf={onSelectLeaf}
        />
      )}
    </group>
  );
}
