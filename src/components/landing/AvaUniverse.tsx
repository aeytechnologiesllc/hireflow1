// AvaUniverse — the landing's 3D eye-catcher. A dotted-mesh "Ava" core orb with
// candidate particles orbiting it in tilted glowing rings and a soft inflow field,
// additive glow, slow cinematic camera drift. Raw three.js (leak-free React lifecycle).
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";

// ── Core orb shaders (dotted-mesh Fibonacci sphere displaced by 3D simplex noise) ──
const VERT = `
  uniform float uTime, uFlow, uAmp, uSize;
  varying float vB; varying float vBrass; varying float vFace;
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){ const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx); vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
    vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy); vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
    i=mod(i,289.0); vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=1.0/7.0; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m; return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3))); }
  void main(){
    vec3 nrm = normalize(position);
    float n1 = snoise(nrm*2.4 + vec3(0.0,0.0,uTime*uFlow));
    float n2 = snoise(nrm*5.2 - vec3(uTime*uFlow*0.6,0.0,0.0));
    float disp = n1*0.72 + n2*0.28;
    vec3 p = nrm * (1.0 + disp*uAmp);
    vec4 mv = modelViewMatrix * vec4(p,1.0);
    vec3 vn = normalize((modelViewMatrix*vec4(nrm,0.0)).xyz);
    vFace = clamp(vn.z,0.0,1.0);
    vB = smoothstep(-0.4,0.9,disp);
    vBrass = smoothstep(0.5,0.92, n2*0.5+0.5);
    gl_PointSize = uSize * (4.2 / -mv.z) * (0.40 + 0.95*vB) * (0.45 + 0.7*vFace);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  precision highp float;
  varying float vB; varying float vBrass; varying float vFace;
  uniform vec3 cJade, cMint, cBrass; uniform float uBright, uAlpha, uEdge;
  void main(){
    vec2 c = gl_PointCoord - 0.5; float d = length(c);
    if(d>0.5) discard;
    float a = smoothstep(0.5,0.12,d);
    vec3 col = mix(cJade, cMint, vB);
    col = mix(col, cBrass, vBrass*0.55);
    float fall = uEdge + (1.0-uEdge)*vFace;
    float bright = (0.26 + 0.95*vB) * fall * uBright;
    gl_FragColor = vec4(col*bright, a*fall*uAlpha);
  }`;
const INNER_VERT = `varying vec3 vN; varying vec3 vView;
  void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vN=normalize(mat3(modelMatrix)*normal); vView=cameraPosition-wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`;
const INNER_FRAG = `precision highp float; varying vec3 vN; varying vec3 vView;
  void main(){ float f=clamp(dot(normalize(vN),normalize(vView)),0.0,1.0);
    vec3 col = mix(vec3(0.012,0.045,0.032), vec3(0.06,0.17,0.13), pow(f,1.25));
    gl_FragColor = vec4(col,1.0); }`;

function softDot(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.85)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

const JADE = new THREE.Color(0x1f9e77);
const MINT = new THREE.Color(0x9fe7c9);
const BRASS = new THREE.Color(0xe6c184);

interface AvaUniverseProps {
  className?: string;
  style?: CSSProperties;
}

export default function AvaUniverse({ className, style }: AvaUniverseProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0, 5.4);

    const root = new THREE.Group();
    scene.add(root);

    const dot = softDot();

    // ── Core orb ──────────────────────────────────────────────────────────────
    const orb = new THREE.Group();
    root.add(orb);
    const innerGeo = new THREE.SphereGeometry(0.9, 48, 48);
    const innerMat = new THREE.ShaderMaterial({ vertexShader: INNER_VERT, fragmentShader: INNER_FRAG });
    orb.add(new THREE.Mesh(innerGeo, innerMat));

    const DOTS = 6000;
    const arr = new Float32Array(DOTS * 3);
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < DOTS; i++) {
      const y = 1 - (i / (DOTS - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = ga * i;
      arr[i * 3] = Math.cos(th) * r;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = Math.sin(th) * r;
    }
    const orbGeo = new THREE.BufferGeometry();
    orbGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const u = {
      uTime: { value: 0 }, uFlow: { value: 0.5 }, uAmp: { value: 0.22 }, uSize: { value: 4.6 },
      uBright: { value: 1.15 }, uAlpha: { value: 0.92 }, uEdge: { value: 0.22 },
      cJade: { value: JADE }, cMint: { value: MINT }, cBrass: { value: BRASS },
    };
    const orbMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: u,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    orb.add(new THREE.Points(orbGeo, orbMat));

    // ── Orbiting candidate rings ───────────────────────────────────────────────
    type Ring = { points: THREE.Points; axis: THREE.Vector3; speed: number };
    const rings: Ring[] = [];
    const ringDefs = [
      { count: 260, radius: 1.55, tilt: 1.15, spin: 0.5, shortlist: 0.10 },
      { count: 320, radius: 2.0, tilt: -0.7, spin: -0.34, shortlist: 0.07 },
      { count: 380, radius: 2.55, tilt: 0.45, spin: 0.24, shortlist: 0.05 },
    ];
    for (const def of ringDefs) {
      const pos = new Float32Array(def.count * 3);
      const col = new Float32Array(def.count * 3);
      const tiltM = new THREE.Matrix4().makeRotationX(def.tilt).multiply(new THREE.Matrix4().makeRotationZ(def.tilt * 0.5));
      const v = new THREE.Vector3();
      for (let i = 0; i < def.count; i++) {
        const a = (i / def.count) * Math.PI * 2 + Math.random() * 0.05;
        const rr = def.radius + (Math.random() - 0.5) * 0.16;
        v.set(Math.cos(a) * rr, (Math.random() - 0.5) * 0.12, Math.sin(a) * rr);
        v.applyMatrix4(tiltM);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        const shortlisted = Math.random() < def.shortlist;
        const c = shortlisted ? BRASS : (Math.random() < 0.5 ? MINT : JADE);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({
        size: 0.12, map: dot, vertexColors: true, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      });
      const pts = new THREE.Points(g, m);
      root.add(pts);
      const axis = new THREE.Vector3(Math.sin(def.tilt), 1, Math.cos(def.tilt) * 0.3).normalize();
      rings.push({ points: pts, axis, speed: def.spin });
    }

    // ── Soft inflow field (applicants streaming in) + depth dust ────────────────
    const FIELD = 700;
    const fpos = new Float32Array(FIELD * 3);
    const fcol = new Float32Array(FIELD * 3);
    const frad = new Float32Array(FIELD);
    const fang = new Float32Array(FIELD);
    const fy = new Float32Array(FIELD);
    for (let i = 0; i < FIELD; i++) {
      const r = 2.6 + Math.random() * 4.5;
      const a = Math.random() * Math.PI * 2;
      const yy = (Math.random() - 0.5) * 5;
      frad[i] = r; fang[i] = a; fy[i] = yy;
      fpos[i * 3] = Math.cos(a) * r; fpos[i * 3 + 1] = yy; fpos[i * 3 + 2] = Math.sin(a) * r;
      const c = Math.random() < 0.3 ? MINT : JADE;
      const dim = 0.4 + Math.random() * 0.4;
      fcol[i * 3] = c.r * dim; fcol[i * 3 + 1] = c.g * dim; fcol[i * 3 + 2] = c.b * dim;
    }
    const fieldGeo = new THREE.BufferGeometry();
    fieldGeo.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
    fieldGeo.setAttribute("color", new THREE.BufferAttribute(fcol, 3));
    const fieldMat = new THREE.PointsMaterial({
      size: 0.05, map: dot, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, opacity: 0.9,
    });
    const field = new THREE.Points(fieldGeo, fieldMat);
    root.add(field);

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

    let visible = true;
    const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0.01 });
    io.observe(canvas);

    // keep a permanently-lost context from leaving a dead black square
    const onContextLost = (e: Event) => e.preventDefault();
    canvas.addEventListener("webglcontextlost", onContextLost, false);

    const reduce = prefersReducedMotion();
    const t0 = performance.now();
    let raf = 0;
    const q = new THREE.Quaternion();
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      u.uTime.value = now / 1000;

      orb.rotation.y += 0.0016;
      orb.rotation.x = Math.sin(t * 0.2) * 0.12;

      for (const ring of rings) {
        q.setFromAxisAngle(ring.axis, ring.speed * 0.0022);
        ring.points.quaternion.premultiply(q);
      }

      // inflow: drift particles inward, respawn at the rim
      const fp = fieldGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < FIELD; i++) {
        frad[i] -= 0.0042 + (i % 5) * 0.0006;
        if (frad[i] < 1.5) { frad[i] = 5.5 + Math.random() * 1.6; fang[i] = Math.random() * Math.PI * 2; fy[i] = (Math.random() - 0.5) * 5; }
        fang[i] += 0.0012;
        const r = frad[i];
        fp[i * 3] = Math.cos(fang[i]) * r;
        fp[i * 3 + 1] = fy[i] * (r / 5.5);
        fp[i * 3 + 2] = Math.sin(fang[i]) * r;
      }
      fieldGeo.attributes.position.needsUpdate = true;

      // cinematic camera drift
      camera.position.x = Math.sin(t * 0.13) * 0.5;
      camera.position.y = Math.cos(t * 0.1) * 0.32;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    const loop = (now: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      frame(now);
    };
    if (reduce) {
      // honor reduced-motion: paint one static frame, no animation loop
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
      innerGeo.dispose(); innerMat.dispose();
      orbGeo.dispose(); orbMat.dispose();
      rings.forEach((r) => { r.points.geometry.dispose(); (r.points.material as THREE.Material).dispose(); });
      fieldGeo.dispose(); fieldMat.dispose();
      dot.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    />
  );
}
