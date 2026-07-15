import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  uniform float uTime;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float wave1 = sin(pos.x * 0.05 + uTime) * cos(pos.y * 0.05 + uTime * 0.5) * 2.0;
    float wave2 = sin(pos.x * 0.1 - uTime * 0.5) * cos(pos.y * 0.1 + uTime) * 1.5;
    float wave3 = sin(pos.x * 0.02 + uTime * 1.5) * cos(pos.y * 0.02 + uTime * 0.8) * 4.0;
    float finalWave = wave1 + wave2 + wave3;
    pos.z += finalWave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uHue;

  vec3 hueShift(vec3 c, float h) {
    const vec3 k = vec3(0.57735);
    float cosA = cos(h);
    float sinA = sin(h);
    return c * cosA + cross(k, c) * sinA + k * dot(k, c) * (1.0 - cosA);
  }

  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = noise(i);
    float b = noise(i + vec2(1.0, 0.0));
    float c = noise(i + vec2(0.0, 1.0));
    float d = noise(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 1.0;
    float freq = 1.0;
    for(int i = 0; i < 5; i++) {
      sum += amp * smoothNoise(p * freq);
      amp *= 0.5;
      freq *= 2.0;
    }
    return sum;
  }

  void main() {
    vec2 uv = vUv;
    float mouseInfluence = 1.0 - smoothstep(0.0, 0.5, distance(uv, uMouse));
    uv += (uMouse - 0.5) * 0.1 * mouseInfluence;

    float t = uTime * 0.2;
    vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(1.0)));
    vec2 r = vec2(
      fbm(uv + 1.0 * q + vec2(1.7, 9.2) + 0.15 * t),
      fbm(uv + 1.0 * q + vec2(8.3, 2.8) + 0.126 * t)
    );
    float f = fbm(uv + r);

    vec3 color0 = vec3(0.23, 0.10, 0.69);
    vec3 color1 = vec3(0.0, 1.0, 1.0);
    vec3 color2 = vec3(0.90, 0.25, 1.0);
    vec3 color3 = vec3(0.0, 0.0, 0.0);

    vec3 color = mix(color0, color1, clamp(f * f * 2.0, 0.0, 1.0));
    color = mix(color, color2, clamp(length(q) * length(r), 0.0, 1.0));
    color += color1 * f * f * f * f * mouseInfluence * 2.0;

    float hueShiftAmount = uHue + fbm(uv * 0.5 + uTime * 0.1) * 0.2;
    color = hueShift(color, hueShiftAmount * 6.28318);

    float highlight = smoothstep(0.4, 0.8, f * f * 3.0 + f * length(q) * length(r));
    color = mix(color, vec3(1.0, 1.0, 1.0), highlight * 0.3);

    color += vec3(0.1, 0.1, 0.1) * mouseInfluence;

    float grain = (fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.1;
    color += grain;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export default function NeonAuroraFlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const smoothMouseRef = useRef({ x: 0.5, y: 0.5 });
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 30;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const uniforms = {
      uTime: { value: 0.0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uHue: { value: 0.55 },
    };

    const geometry = new THREE.PlaneGeometry(200, 200, 200, 200);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      wireframe: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX / window.innerWidth;
      mouseRef.current.y = 1.0 - e.clientY / window.innerHeight;
    };

    window.addEventListener('mousemove', onMouseMove);

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      uniforms.uTime.value += 0.005;

      smoothMouseRef.current.x +=
        (mouseRef.current.x - smoothMouseRef.current.x) * 0.08;
      smoothMouseRef.current.y +=
        (mouseRef.current.y - smoothMouseRef.current.y) * 0.08;

      uniforms.uMouse.value.set(
        smoothMouseRef.current.x,
        smoothMouseRef.current.y
      );

      renderer.render(scene, camera);
    };

    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
      }}
    />
  );
}
