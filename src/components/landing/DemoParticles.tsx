// Cinematic 3D particle backdrop for the demo. A deliberate, slowly-turning field of
// "candidate" points (jade/mint with brass accents) with atmospheric depth (far points
// dimmer/smaller) and a scene-driven camera that dollies & pans per beat. Motion is
// coherent on purpose — a unified slow rotation + gentle breathing, not random jitter.
// Raw three.js; pauses when offscreen for mobile perf.
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

const JADE = new THREE.Color(0x1f9e77);
const MINT = new THREE.Color(0x9fe7c9);
const BRASS = new THREE.Color(0xe6c184);

// Per-scene camera target: {z = dolly distance, x/y = framing offset}.
const CAM = [
  { z: 5.2, x: 0.0, y: 0.4 }, // 0 hook — push in
  { z: 6.6, x: -0.7, y: 0.15 }, // 1 create — pan left
  { z: 6.2, x: 0.7, y: -0.15 }, // 2 screen — pan right
  { z: 7.4, x: 0.0, y: 0.45 }, // 3 shortlist — pull back a bit
  { z: 6.0, x: -0.5, y: 0.1 }, // 4 review — settle in
  { z: 6.4, x: 0.6, y: -0.1 }, // 5 schedule — drift across
  { z: 8.2, x: 0.0, y: 0.5 }, // 6 hire — pull back, reveal
];

function softDot(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface DemoParticlesProps {
  /** active scene index; drives the camera move */
  scene?: number;
  className?: string;
  style?: CSSProperties;
}

export default function DemoParticles({ scene = 0, className, style }: DemoParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0.4, 7);

    const N = 600;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    const spreadX = 12, spreadY = 7, spreadZ = 7;
    for (let i = 0; i < N; i++) {
      const z = (Math.random() - 0.5) * spreadZ;
      pos[i * 3] = (Math.random() - 0.5) * spreadX;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spreadY;
      pos[i * 3 + 2] = z;
      // atmospheric depth: points further back read dimmer (intentional volume, not noise)
      const depth = 0.5 + 0.5 * ((z + spreadZ / 2) / spreadZ); // 0.5 (far) → 1.0 (near)
      const c = Math.random() < 0.09 ? BRASS : Math.random() < 0.5 ? MINT : JADE;
      const dim = depth * (0.55 + Math.random() * 0.45);
      col[i * 3] = c.r * dim;
      col[i * 3 + 1] = c.g * dim;
      col[i * 3 + 2] = c.b * dim;
      seed[i] = Math.random() * Math.PI * 2;
    }
    const base = pos.slice(); // fixed home positions; motion is a small coherent offset
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const dot = softDot();
    const mat = new THREE.PointsMaterial({
      size: 0.16, map: dot, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, opacity: 0.92,
    });
    const points = new THREE.Points(geo, mat);
    points.rotation.z = -0.05; // slight static tilt for composition
    world.add(points);

    const resize = () => {
      const w = canvas.clientWidth || 64;
      const h = canvas.clientHeight || 64;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // pause when offscreen
    let visible = true;
    const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0.01 });
    io.observe(canvas);

    const onContextLost = (e: Event) => e.preventDefault();
    canvas.addEventListener("webglcontextlost", onContextLost, false);

    const reduce = prefersReducedMotion();
    const t0 = performance.now();
    let raf = 0;
    let camX = 0, camY = 0.4, camZ = 7;
    const arr = geo.attributes.position.array as Float32Array;
    const frame = (now: number) => {
      const t = (now - t0) / 1000;

      // gentle COHERENT breathing around fixed homes — alive, never jittery
      for (let i = 0; i < N; i++) {
        const ix = i * 3;
        arr[ix] = base[ix] + Math.sin(t * 0.18 + seed[i]) * 0.07;
        arr[ix + 1] = base[ix + 1] + Math.cos(t * 0.15 + seed[i]) * 0.07;
      }
      geo.attributes.position.needsUpdate = true;

      // the whole field turns slowly & continuously — one deliberate motion
      points.rotation.y += 0.0006;
      points.rotation.z = -0.05 + Math.sin(t * 0.04) * 0.03;

      // scene-driven camera: smooth dolly toward the active beat + a slow, small orbit
      const tgt = CAM[sceneRef.current] || CAM[0];
      camZ += (tgt.z - camZ) * 0.016;
      camX += (tgt.x - camX) * 0.016;
      camY += (tgt.y - camY) * 0.016;
      camera.position.set(camX + Math.sin(t * 0.1) * 0.32, camY + Math.cos(t * 0.085) * 0.16, camZ);
      camera.lookAt(0, 0, 0);

      renderer.render(world, camera);
    };
    const loop = (now: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      frame(now);
    };
    if (reduce) {
      camera.position.set(0, 0.4, CAM[0].z);
      camera.lookAt(0, 0, 0);
      raf = requestAnimationFrame((now) => { if (!cancelled) frame(now); });
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      ro.disconnect();
      io.disconnect();
      geo.dispose();
      mat.dispose();
      dot.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas ref={canvasRef} aria-hidden="true" className={className} style={{ display: "block", width: "100%", height: "100%", ...style }} />
  );
}
