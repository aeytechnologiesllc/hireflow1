/**
 * AvaOrb — Deep Jade dotted-mesh sphere with optional "swirl" variant
 * tuned to match the premium auth-mockup look (flowing streamlines, rim glow, halo).
 */
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";

const SWIRL_VERT = `
  uniform float uTime, uFlow, uAmp, uSize;
  varying float vB;
  varying float vBrass;
  varying float vFace;
  varying float vStream;
  varying float vVel;

  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0);
    const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy));
    vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);
    vec3 l=1.0-g;
    vec3 i1=min(g.xyz,l.zxy);
    vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;
    vec3 x2=x0-i2+C.yyy;
    vec3 x3=x0-D.yyy;
    i=mod(i,289.0);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=1.0/7.0;
    vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);
    vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy;
    vec4 y=y_*ns.x+ns.yyyy;
    vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);
    vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0;
    vec4 s1=floor(b1)*2.0+1.0;
    vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
    vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);
    vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z);
    vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
    m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  void main(){
    vec3 nrm = normalize(position);
    float n1 = snoise(nrm*2.4 + vec3(0.0,0.0,uTime*uFlow));
    float n2 = snoise(nrm*5.2 - vec3(uTime*uFlow*0.6,0.0,0.0));
    float n3 = snoise(nrm*8.0 + vec3(uTime*uFlow*0.3,0.0,0.0));
    float disp = n1*0.50 + n2*0.32 + n3*0.18;
    vec3 p = nrm * (1.0 + disp*uAmp);

    float theta = atan(nrm.z, nrm.x);
    float flowA = sin(theta * 3.8 + n1 * 5.2 + uTime * uFlow * 0.75);
    float flowB = sin(nrm.y * 5.5 + n2 * 4.0 - uTime * uFlow * 0.45);
    float stream = flowA * flowA * 0.62 + flowB * flowB * 0.38;
    vStream = smoothstep(0.08, 0.88, stream);
    vVel = smoothstep(0.25, 0.92, abs(n3));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 vn = normalize((modelViewMatrix*vec4(nrm,0.0)).xyz);
    vFace = clamp(vn.z, 0.0, 1.0);
    vB = smoothstep(-0.35, 0.92, disp);
    vBrass = smoothstep(0.35, 0.94, n2*0.5+0.5 + stream*0.25);

    float sizeBoost = 0.40 + 0.95*vB + 0.50*vStream;
    float faceBoost = 0.40 + 0.75*vFace + 0.35*vStream;
    gl_PointSize = uSize * (4.4 / -mv.z) * sizeBoost * faceBoost * (0.75 + 0.55*vVel);
    gl_Position = projectionMatrix * mv;
  }
`;

const SWIRL_FRAG = `
  precision highp float;
  varying float vB;
  varying float vBrass;
  varying float vFace;
  varying float vStream;
  varying float vVel;
  uniform vec3 cJade, cMint, cBrass, cDeep;
  uniform float uBright, uAlpha, uEdge;

  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if(d > 0.5) discard;
    float a = smoothstep(0.5, 0.06, d);
    vec3 col = mix(cJade, cMint, vB + vStream*0.45);
    col = mix(col, cBrass, vBrass*0.55 + vStream*0.22);
    col = mix(col, cDeep, (1.0-vB)*(1.0-vStream)*0.18);
    float fall = uEdge + (1.0-uEdge)*vFace;
    float bright = (0.14 + 0.75*vB + 0.78*vStream + 0.22*vVel) * fall * uBright;
    float glow = a * a * (0.28 + vStream*0.72);
    gl_FragColor = vec4(col*bright + glow*vec3(0.35,0.95,0.62), a*fall*uAlpha);
  }
`;

const INNER_VERT = `
  varying vec3 vN;
  varying vec3 vView;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const INNER_FRAG = `
  precision highp float;
  varying vec3 vN;
  varying vec3 vView;
  void main(){
    float f = clamp(dot(normalize(vN), normalize(vView)), 0.0, 1.0);
    vec3 col = mix(vec3(0.012,0.04,0.03), vec3(0.09,0.24,0.17), pow(f, 1.15));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function fibonacciSphere(count: number, radius = 1): Float32Array {
  const arr = new Float32Array(count * 3);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    arr[i * 3] = Math.cos(th) * r * radius;
    arr[i * 3 + 1] = y * radius;
    arr[i * 3 + 2] = Math.sin(th) * r * radius;
  }
  return arr;
}

export interface AvaOrbProps {
  /** Pixel width/height of the canvas. Default 380. */
  size?: number;
  /** Core particle count. Defaults to auto-scale with `size` (smaller orb = fewer dots). */
  coreCount?: number;
  /** Outer halo particle count. Defaults to auto-scale with `size`. */
  haloCount?: number;
  /** Wave depth. Default 0.22. */
  amp?: number;
  /** Wave travel speed. Default 0.55. */
  flow?: number;
  /** Dot size. Defaults to auto-scale with `size`. */
  dotSize?: number;
  /** Rotation speed. Default 0.06. */
  spin?: number;
  /** Show soft ground reflection beneath orb. Default true. */
  reflection?: boolean;
  /** Outer glow halo via CSS drop-shadow. Default true. */
  glow?: boolean;
  /** Optional 0..1 live intensity (e.g. Ava's voice amplitude) read each frame to make the
   *  orb pulse WITHOUT re-initializing the scene. Pass a getter, not a changing prop. */
  getIntensity?: () => number;
  className?: string;
  style?: CSSProperties;
}

export function AvaOrb({
  size = 380,
  coreCount,
  haloCount,
  amp = 0.22,
  flow = 0.55,
  dotSize,
  spin = 0.06,
  reflection = true,
  glow = true,
  getIntensity,
  className,
  style,
}: AvaOrbProps) {
  // Density scales by AREA (size²), not linearly, so the visual dot-density
  // stays constant across sizes: the ~380px hero stays lush while small orbs
  // (120–200px) thin out to a clean, well-separated mesh. The old linear
  // `size * 16` crammed near-hero dot counts into a fraction of the area, which
  // made small orbs look cluttered/messy.
  const DENSITY = 0.04; // core dots per px² of canvas, calibrated to the hero
  const resolvedCore =
    coreCount ?? Math.round(Math.min(6200, Math.max(520, DENSITY * size * size)));
  const resolvedHalo = haloCount ?? Math.round(resolvedCore * 0.18);
  // gl_PointSize is in absolute framebuffer pixels, so it must track the canvas
  // size — otherwise dots stay the same pixel size and look chunky on a small
  // orb. Scale sub-linearly so dots grow modestly *relative* to the sphere as
  // it shrinks, keeping the surface readable with fewer points.
  const resolvedDot = dotSize ?? 2.8 + 2.5 * Math.min(1, size / 380);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Live intensity getter kept in a ref so updating it never re-runs the scene effect
  // (changing amp/flow props would tear down + rebuild the WebGL context every frame).
  const getIntensityRef = useRef(getIntensity);
  getIntensityRef.current = getIntensity;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Creating a WebGLRenderer throws if the browser can't grant a GL context
    // (context blocked, GPU lost, or too many live contexts on the page). Guard
    // it so a failed orb degrades to nothing instead of crashing the whole page.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 4.3);

    const grp = new THREE.Group();
    scene.add(grp);

    const innerGeo = new THREE.SphereGeometry(0.9, 48, 48);
    const innerMat = new THREE.ShaderMaterial({
      vertexShader: INNER_VERT,
      fragmentShader: INNER_FRAG,
    });
    grp.add(new THREE.Mesh(innerGeo, innerMat));

    const makePoints = (
      positions: Float32Array,
      uniforms: Record<string, THREE.IUniform>,
      blending: THREE.Blending,
    ) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.ShaderMaterial({
        vertexShader: SWIRL_VERT,
        fragmentShader: SWIRL_FRAG,
        uniforms,
        transparent: true,
        blending,
        depthWrite: false,
      });
      return { geo, mat, points: new THREE.Points(geo, mat) };
    };

    const coreU = {
      uTime: { value: 0 },
      uFlow: { value: flow },
      uAmp: { value: amp },
      uSize: { value: resolvedDot },
      uBright: { value: 1.15 },
      uAlpha: { value: 0.88 },
      uEdge: { value: 0.10 },
      cJade: { value: new THREE.Color(0x1a9e6e) },
      cMint: { value: new THREE.Color(0x7fe3c2) },
      cBrass: { value: new THREE.Color(0xe6c184) },
      cDeep: { value: new THREE.Color(0x0a2019) },
    };

    const haloU = {
      uTime: { value: 0 },
      uFlow: { value: flow * 0.65 },
      uAmp: { value: amp * 0.55 },
      uSize: { value: resolvedDot * 0.62 },
      uBright: { value: 0.65 },
      uAlpha: { value: 0.42 },
      uEdge: { value: 0.0 },
      cJade: { value: new THREE.Color(0x1f9e77) },
      cMint: { value: new THREE.Color(0x9fe7c9) },
      cBrass: { value: new THREE.Color(0xe6c184) },
      cDeep: { value: new THREE.Color(0x0a2019) },
    };

    const core = makePoints(fibonacciSphere(resolvedCore), coreU, THREE.AdditiveBlending);
    const halo = makePoints(fibonacciSphere(resolvedHalo, 1.1), haloU, THREE.AdditiveBlending);
    grp.add(core.points);
    grp.add(halo.points);

    const resize = () => {
      const w = canvas.clientWidth || size;
      const h = canvas.clientHeight || size;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Render one frame immediately on mount. This avoids a blank-canvas flash
    // before the first rAF tick, guarantees a visible orb even when
    // requestAnimationFrame is throttled (background tab) or paused (screenshot
    // tooling), and gives reduced-motion users the static frame right away.
    coreU.uTime.value = 1.2;
    haloU.uTime.value = 1.2;
    renderer.render(scene, camera);

    const t0 = performance.now();
    let raf = 0;
    let visible = true;

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
      },
      { threshold: 0.05 },
    );
    if (wrapRef.current) io.observe(wrapRef.current);

    const onVis = () => {
      visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    const loop = (now: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(loop);
      if (!visible || reducedMotion) {
        if (reducedMotion && coreU.uTime.value === 0) {
          coreU.uTime.value = 1.2;
          haloU.uTime.value = 1.2;
          renderer.render(scene, camera);
        }
        return;
      }
      const t = (now - t0) / 1000;
      coreU.uTime.value = now / 1000;
      haloU.uTime.value = now / 1000;
      // Live voice reactivity — modulate uniforms in place (no scene re-init). k=0 → unchanged.
      const k = Math.max(0, Math.min(1, getIntensityRef.current?.() ?? 0));
      coreU.uAmp.value = amp * (1 + k * 0.9);
      coreU.uFlow.value = flow * (1 + k * 0.7);
      coreU.uBright.value = 1.15 + k * 0.9;
      haloU.uAmp.value = amp * 0.55 * (1 + k * 0.9);
      haloU.uBright.value = 0.65 + k * 0.6;
      grp.rotation.y += spin * 0.02 * (1 + k * 0.6);
      grp.rotation.x = Math.sin(t * 0.25) * 0.1;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      innerGeo.dispose();
      innerMat.dispose();
      core.geo.dispose();
      core.mat.dispose();
      halo.geo.dispose();
      halo.mat.dispose();
      renderer.dispose();
    };
  }, [size, resolvedCore, resolvedHalo, amp, flow, resolvedDot, spin]);

  const glowStyle: CSSProperties = glow
    ? {
        filter:
          "drop-shadow(0 0 80px rgba(31,158,119,0.55)) drop-shadow(0 0 30px rgba(203,163,106,0.12))",
      }
    : {};

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size + (reflection ? 48 : 0),
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: size,
          height: size,
          ...glowStyle,
        }}
      />
      {reflection && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            bottom: 0,
            transform: "translateX(-50%)",
            width: size * 0.72,
            height: 36,
            background:
              "radial-gradient(ellipse at center, rgba(31,158,119,0.22) 0%, rgba(31,158,119,0.06) 45%, transparent 70%)",
            filter: "blur(8px)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

export default AvaOrb;
