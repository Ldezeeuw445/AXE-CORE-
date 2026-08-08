/**
 * TerrainSceneMesh - realistic lit rock mountains (opaque, shadowed) with
 * additive gold wireframe caps + snow-like particles ONLY on hub summits.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { makeGlowTexture, type TerrainEngine } from './terrainEngine';

export default function TerrainSceneMesh({
  engine,
  resolution = 200,
  shadowsEnabled = true,
}: {
  engine: TerrainEngine;
  resolution?: number;
  shadowsEnabled?: boolean;
}) {
  const { solidGeo, capGeo, pointsGeo } = useMemo(() => {
    const size = engine.size;
    const geo = new THREE.PlaneGeometry(size, size, resolution, resolution);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const rockColors = new Float32Array(pos.count * 3);
    const capColors = new Float32Array(pos.count * 3);
    const c: number[] = [0, 0, 0];
    const pPos: number[] = [];
    const pCol: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = engine.heightAt(x, z);
      pos.setY(i, h);
      engine.rockAt(x, z, h, c);
      rockColors[i * 3] = c[0];
      rockColors[i * 3 + 1] = c[1];
      rockColors[i * 3 + 2] = c[2];
      const capW = engine.capAt(x, z, h, c);
      capColors[i * 3] = c[0];
      capColors[i * 3 + 1] = c[1];
      capColors[i * 3 + 2] = c[2];
      if (capW > 0.22 && i % 3 === 0) {
        pPos.push(x, h + 0.07, z);
        pCol.push(
          Math.min(1, c[0] * 1.6 + 0.25),
          Math.min(1, c[1] * 1.6 + 0.25),
          Math.min(1, c[2] * 1.6 + 0.25),
        );
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(rockColors, 3));
    geo.computeVertexNormals();
    const cap = new THREE.BufferGeometry();
    cap.setAttribute('position', geo.attributes.position);
    cap.setIndex(geo.index);
    cap.setAttribute('color', new THREE.BufferAttribute(capColors, 3));
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
    pg.setAttribute('color', new THREE.Float32BufferAttribute(pCol, 3));
    return { solidGeo: geo, capGeo: cap, pointsGeo: pg };
  }, [engine, resolution]);

  const glowTex = useMemo(() => makeGlowTexture(), []);
  const ptsMat = useRef<THREE.PointsMaterial>(null);

  useFrame(({ clock }) => {
    if (ptsMat.current) {
      ptsMat.current.opacity = 0.72 + 0.22 * Math.sin(clock.elapsedTime * 1.6);
    }
  });

  return (
    <group>
      {/* Lighting: cool moonlight key with shadows + fills for depth */}
      <hemisphereLight args={['#263752', '#04060c', 0.55]} />
      <directionalLight
        position={[26, 40, 14]}
        intensity={1.5}
        color="#cfe0ff"
        castShadow={shadowsEnabled}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={42}
        shadow-camera-bottom={-42}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-22, 18, -16]} intensity={0.3} color="#4d6fa8" />

      {/* Lit opaque rock terrain - blocks view through mountains */}
      <mesh geometry={solidGeo} renderOrder={0} castShadow={shadowsEnabled} receiveShadow={shadowsEnabled}>
        <meshStandardMaterial
          vertexColors
          roughness={0.93}
          metalness={0.06}
          polygonOffset
          polygonOffsetFactor={2}
          polygonOffsetUnits={2}
        />
      </mesh>

      {/* Gold glowing mesh caps - visible only on hub summits */}
      <mesh geometry={capGeo} renderOrder={1}>
        <meshBasicMaterial
          wireframe
          vertexColors
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Snow-like glow particles on hub caps */}
      <points geometry={pointsGeo} renderOrder={2}>
        <pointsMaterial
          ref={ptsMat}
          vertexColors
          size={0.15}
          sizeAttenuation
          map={glowTex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}
