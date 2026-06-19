// AvaOrb — React+TS port of the vanilla-JS "Ava" Deep Jade dotted-mesh orb (ava-orb.js).
// A Fibonacci point-cloud sphere displaced by 3D simplex noise (idle ripple + slow spin),
// jade->mint->brass dots over a shaded dark inner sphere that gives it round 3D form.
// Visual output is identical to mountAva(); this only wraps it in a leak-free React lifecycle.
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import * as THREE from 'three';
import { prefersReducedMotion } from '@/lib/prefersReducedMotion';

// --- Shaders (ported verbatim from ava-orb.js) ---------------------------------

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

// shaded inner sphere — gives the orb real 3D roundness instead of a flat black disc
const INNER_VERT = `varying vec3 vN; varying vec3 vView;
  void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vN=normalize(mat3(modelMatrix)*normal); vView=cameraPosition-wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`;
const INNER_FRAG = `precision highp float; varying vec3 vN; varying vec3 vView;
  void main(){ float f=clamp(dot(normalize(vN),normalize(vView)),0.0,1.0);
    vec3 col = mix(vec3(0.015,0.05,0.035), vec3(0.07,0.19,0.14), pow(f,1.25));
    gl_FragColor = vec4(col,1.0); }`;

// --- Props ---------------------------------------------------------------------

export interface AvaOrbProps {
  /** 'rich' = additive, dense, glowing (hero >=~140px); 'compact' = normal blending, fewer crisp dots, low glow (in-UI <=~80px). Default 'rich'. */
  mode?: 'rich' | 'compact';
  /** Number of dots. Default 5500 (rich) / 1700 (compact). */
  n?: number;
  /** Dot size. Default 4.4 (rich) / 3.5 (compact). */
  uSize?: number;
  /** Ripple amplitude — the wave depth. Default 0.18 (keep ≥~0.16 or the mesh reads as a flat sphere). */
  amp?: number;
  /** Ripple/animation speed — how fast the wave travels. Default 0.45. */
  flow?: number;
  /** Brightness. Default 0.92 (rich) / 1.08 (compact). */
  bright?: number;
  /** Rotation speed. Default 0.05. */
  spin?: number;
  /** Camera distance (lower = orb fills more). Default 4.3. */
  camZ?: number;
  /** Pixel size applied to both width & height of the canvas. If omitted, the canvas fills 100%. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export default function AvaOrb({
  mode,
  n,
  uSize,
  amp,
  flow,
  bright,
  spin,
  camZ,
  size,
  className,
  style,
}: AvaOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    // Guard against React 18 StrictMode double-invoke: a cancelled flag ensures
    // a torn-down effect never keeps a loop alive, and the cleanup fully disposes
    // the GL context so a second mount creates a fresh one (no double context / leak).
    let cancelled = false;

    const compact = mode === 'compact';
    const dotCount = n ?? (compact ? 1700 : 5500);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, camZ ?? 4.3);

    const grp = new THREE.Group();
    scene.add(grp);

    // Shaded inner sphere.
    const innerGeo = new THREE.SphereGeometry(0.9, 48, 48);
    const innerMat = new THREE.ShaderMaterial({ vertexShader: INNER_VERT, fragmentShader: INNER_FRAG });
    grp.add(new THREE.Mesh(innerGeo, innerMat));

    // Fibonacci point cloud.
    const arr = new Float32Array(dotCount * 3);
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < dotCount; i++) {
      const y = 1 - (i / (dotCount - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = ga * i;
      arr[i * 3] = Math.cos(th) * r;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = Math.sin(th) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));

    const u = {
      uTime: { value: 0 },
      uFlow: { value: flow ?? 0.45 },
      uAmp: { value: amp ?? 0.18 },
      uSize: { value: uSize ?? (compact ? 3.5 : 4.4) },
      uBright: { value: bright ?? (compact ? 1.08 : 0.92) },
      uAlpha: { value: compact ? 1.0 : 0.9 },
      uEdge: { value: compact ? 0.5 : 0.2 },
      cJade: { value: new THREE.Color(0x1f9e77) },
      cMint: { value: new THREE.Color(0x9fe7c9) },
      cBrass: { value: new THREE.Color(0xe6c184) },
    };
    const pointsMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: u,
      transparent: true,
      blending: compact ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
    });
    grp.add(new THREE.Points(geo, pointsMat));

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

    const onContextLost = (e: Event) => e.preventDefault();
    canvas.addEventListener('webglcontextlost', onContextLost, false);

    const reduce = prefersReducedMotion();
    const spinRate = spin != null ? spin : 0.05;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      u.uTime.value = now / 1000;
      grp.rotation.y += spinRate * 0.02;
      grp.rotation.x = Math.sin(t * 0.25) * 0.1;
      renderer.render(scene, camera);
    };
    const loop = (now: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      frame(now);
    };
    if (reduce) {
      raf = requestAnimationFrame((now) => { if (!cancelled) frame(now); });
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      ro.disconnect();
      io.disconnect();
      innerGeo.dispose();
      innerMat.dispose();
      geo.dispose();
      pointsMat.dispose();
      renderer.dispose();
    };
  }, [mode, n, uSize, amp, flow, bright, spin, camZ]);

  const canvasStyle: CSSProperties = {
    display: 'block',
    borderRadius: '50%',
    width: size != null ? `${size}px` : '100%',
    height: size != null ? `${size}px` : '100%',
    ...style,
  };

  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={canvasStyle} />;
}
