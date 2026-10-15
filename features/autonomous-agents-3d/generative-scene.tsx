"use client";

/* eslint-disable react-hooks/immutability -- Three.js uniforms and buffers are
 * intentionally mutated per frame so the preview stays lightweight. */

import { OutcomeConnectors } from "./outcome-connectors";
import { VerticalSlabs } from "./vertical-slabs";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import {
  Bloom,
  EffectComposer,
  N8AO,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useEffect, useMemo, useRef, useState, type ComponentRef, type Ref } from "react";
import * as THREE from "three";
import type { GlassEnv, StrataSettings } from "./defaults";

export type RealismProps = {
  enabled: boolean;
  toneMappingExposure: number;
  hdriEnabled: boolean;
  hdriPreset: GlassEnv;
  hdriIntensity: number;
  hdriBackground: boolean;
  aoEnabled: boolean;
  aoIntensity: number;
  aoRadius: number;
  aoAperture: number;
  keyLightIntensity: number;
  fillLightIntensity: number;
  rimLightIntensity: number;
  keyLightColor: string;
  rimLightColor: string;
  filmGrain: number;
  bloomIntensity: number;
  bloomThreshold: number;
  bloomSmoothing: number;
  vignette: number;
};

function ToneMappingSync({ exposure }: { exposure: number }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const g = get().gl;
    g.toneMapping = THREE.ACESFilmicToneMapping;
    g.toneMappingExposure = exposure / 100;
    g.outputColorSpace = THREE.SRGBColorSpace;
  }, [get, exposure]);
  return null;
}

function RealismRig({ realism }: { realism: RealismProps }) {
  if (!realism.enabled) return null;
  const hasBloom = realism.bloomIntensity > 0;
  const hasVignette = realism.vignette > 0;
  const hasAO = realism.aoEnabled;
  const hasGrain = realism.filmGrain > 0;
  return (
    <>
      <ToneMappingSync exposure={realism.toneMappingExposure} />
      {realism.hdriEnabled && (
        <Environment
          preset={realism.hdriPreset}
          resolution={512}
          background={realism.hdriBackground}
          environmentIntensity={realism.hdriIntensity / 100}
        />
      )}
      <hemisphereLight args={["#ffffff", "#1a1a24", 0.35]} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={realism.keyLightIntensity / 100}
        color={realism.keyLightColor}
      />
      <directionalLight
        position={[-10, 6, -4]}
        intensity={realism.fillLightIntensity / 100}
        color="#ffffff"
      />
      <pointLight
        position={[0, 6, -14]}
        intensity={realism.rimLightIntensity / 100}
        color={realism.rimLightColor}
        distance={60}
        decay={2}
      />
      {(hasBloom || hasVignette || hasAO || hasGrain) && (
        <EffectComposer multisampling={4}>
          {hasAO ? (
            <N8AO
              intensity={realism.aoIntensity / 50}
              aoRadius={realism.aoRadius / 50}
              distanceFalloff={0.5 + realism.aoAperture / 100}
              quality="medium"
            />
          ) : (
            <></>
          )}
          {hasBloom ? (
            <Bloom
              intensity={realism.bloomIntensity / 80}
              luminanceThreshold={realism.bloomThreshold / 100}
              luminanceSmoothing={realism.bloomSmoothing / 100}
              mipmapBlur
            />
          ) : (
            <></>
          )}
          {hasGrain ? (
            <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={realism.filmGrain / 400} />
          ) : (
            <></>
          )}
          {hasVignette ? <Vignette eskil={false} offset={0.2} darkness={realism.vignette / 100} /> : <></>}
        </EffectComposer>
      )}
    </>
  );
}

function makeEnclosureClipPlanes(halfW: number, halfD: number) {
  return [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), halfW),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), halfW),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), halfD),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), halfD),
  ];
}

/** 6-sided enclosure clip volume (LRFBTB) — adds top and bottom to the LRFB
 *  version so content can't spill above the roof or below the floor. */
function makeEnclosureClipVolume(halfW: number, halfH: number, halfD: number) {
  return [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), halfW),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), halfW),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), halfD),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), halfD),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), halfH),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), halfH),
  ];
}

const BOX_W = 7.2;
const BOX_H = 15;
const BOX_D = 4.4;
const BOTTOM_Y = -BOX_H / 2 + 0.18;
const TOP_Y = BOX_H / 2 - 0.18;

function seeded(seed: number) {
  let state = seed | 0;
  return () => {
    state = Math.imul(state ^ (state >>> 16), 0x45d9f3b);
    state = Math.imul(state ^ (state >>> 16), 0x45d9f3b);
    state = state ^ (state >>> 16);
    return (state >>> 0) / 4294967296;
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smooth(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex: string): [number, number, number] {
  const parsed = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!parsed) return [1, 1, 1];
  return [parseInt(parsed[1], 16) / 255, parseInt(parsed[2], 16) / 255, parseInt(parsed[3], 16) / 255];
}

/* --- Enclosure (frame only, no rings — grid handles cross-sections now) --- */

function Enclosure({ opacity }: { opacity: number }) {
  const geometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D)),
    [],
  );
  const alpha = clamp01(opacity / 100);
  if (alpha <= 0) return null;
  return (
    <lineSegments geometry={geometry} renderOrder={2}>
      <lineBasicMaterial color="#d8f4e8" transparent opacity={alpha} depthTest={false} />
    </lineSegments>
  );
}

/* --- Wall/ceiling grid (floor is handled by BasePlane + FloorGrid below) --- */

type GridFacesProps = {
  resolution: number;
  color: string;
  opacity: number;
  padding: number;
};

function GridFaces({ resolution, color, opacity, padding }: GridFacesProps) {
  const geometry = useMemo(() => {
    const pad = THREE.MathUtils.clamp(padding / 100, 0, 0.45);
    const hw = BOX_W / 2 - pad * BOX_W;
    const hh = BOX_H / 2 - pad * BOX_H;
    const hd = BOX_D / 2 - pad * BOX_D;
    const n = Math.max(2, Math.round(resolution));
    const positions: number[] = [];
    const line = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      positions.push(ax, ay, az, bx, by, bz);
    };
    // Ceiling cross-sections
    for (let i = 0; i <= n; i += 1) {
      const u = -hw + (i / n) * (hw * 2);
      line(u, hh, -hd, u, hh, hd);
    }
    for (let i = 0; i <= n; i += 1) {
      const v = -hd + (i / n) * (hd * 2);
      line(-hw, hh, v, hw, hh, v);
    }
    // Wall horizontal rings
    for (let i = 0; i <= n; i += 1) {
      const v = -hh + (i / n) * (hh * 2);
      line(-hw, v, -hd, hw, v, -hd);
      line(-hw, v, hd, hw, v, hd);
      line(-hw, v, -hd, -hw, v, hd);
      line(hw, v, -hd, hw, v, hd);
    }
    // Wall verticals
    for (let i = 0; i <= n; i += 1) {
      const u = -hw + (i / n) * (hw * 2);
      line(u, -hh, -hd, u, hh, -hd);
      line(u, -hh, hd, u, hh, hd);
    }
    for (let i = 0; i <= n; i += 1) {
      const v = -hd + (i / n) * (hd * 2);
      line(-hw, -hh, v, -hw, hh, v);
      line(hw, -hh, v, hw, hh, v);
    }
    const buf = new THREE.BufferGeometry();
    buf.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return buf;
  }, [resolution, padding]);
  return (
    <lineSegments geometry={geometry} renderOrder={1}>
      <lineBasicMaterial color={color} transparent opacity={clamp01(opacity / 100)} depthWrite={false} />
    </lineSegments>
  );
}

/* --- Security-grid style base: dark plane + glowing grid with radial edge fade --- */

function edgeAlphaSquare(x: number, z: number, half: number, edgeFadePct: number, intensityPct: number) {
  if (edgeFadePct <= 0 || intensityPct <= 0) return 1;
  const dist = Math.max(Math.abs(x), Math.abs(z));
  const band = (edgeFadePct / 100) * half;
  const inner = Math.max(0, half - band);
  if (dist <= inner) return 1;
  if (dist >= half) return 0;
  const t = (half - dist) / Math.max(1e-6, half - inner);
  const s = t * t * (3 - 2 * t);
  return Math.pow(s, intensityPct / 100);
}

function BasePlane({ size, floorY, planeColor, planeOpacity, edgeFade, edgeIntensity, clipHalfW, clipHalfD }: {
  size: number;
  floorY: number;
  planeColor: string;
  planeOpacity: number;
  edgeFade: number;
  edgeIntensity: number;
  clipHalfW: number;
  clipHalfD: number;
}) {
  const geom = useMemo(() => {
    const segs = 56;
    const g = new THREE.PlaneGeometry(size, size, segs, segs);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const alphas = new Float32Array(pos.count);
    const h = size / 2;
    for (let i = 0; i < pos.count; i += 1) {
      alphas[i] = edgeAlphaSquare(pos.getX(i), pos.getZ(i), h, edgeFade, edgeIntensity);
    }
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    return g;
  }, [size, edgeFade, edgeIntensity]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(planeColor) },
          uOpacity: { value: planeOpacity / 100 },
        },
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          attribute float aAlpha;
          varying float vA;
          void main() {
            vA = aAlpha;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vA;
          void main() {
            float a = uOpacity * vA;
            if (a < 0.001) discard;
            gl_FragColor = vec4(uColor, a);
          }
        `,
      }),
    [planeColor, planeOpacity],
  );
  useEffect(() => {
    material.clippingPlanes = makeEnclosureClipPlanes(clipHalfW, clipHalfD);
    material.needsUpdate = true;
  }, [material, clipHalfW, clipHalfD]);
  if (planeOpacity <= 0) return null;
  return (
    <mesh geometry={geom} position={[0, floorY, 0]} renderOrder={0}>
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function FloorGrid({ size, floorY, cells, gridColor, opacityNear, opacityFar, edgeFade, edgeIntensity, clipHalfW, clipHalfD }: {
  size: number;
  floorY: number;
  cells: number;
  gridColor: string;
  opacityNear: number;
  opacityFar: number;
  edgeFade: number;
  edgeIntensity: number;
  clipHalfW: number;
  clipHalfD: number;
}) {
  const geom = useMemo(() => {
    const n = Math.max(2, Math.round(cells));
    const h = size / 2;
    const step = size / n;
    const positions: number[] = [];
    const colors: number[] = [];
    const base = new THREE.Color(gridColor);
    const splitZ = -h + size * 0.55;
    const pushLine = (ax: number, az: number, bx: number, bz: number) => {
      positions.push(ax, 0, az, bx, 0, bz);
      const mz = (az + bz) / 2;
      const perspAlpha = mz > splitZ ? opacityNear / 100 : opacityFar / 100;
      const aA = perspAlpha * edgeAlphaSquare(ax, az, h, edgeFade, edgeIntensity);
      const aB = perspAlpha * edgeAlphaSquare(bx, bz, h, edgeFade, edgeIntensity);
      colors.push(base.r, base.g, base.b, aA, base.r, base.g, base.b, aB);
    };
    for (let i = 0; i <= n; i += 1) {
      const t = -h + i * step;
      pushLine(-h, t, h, t);
      pushLine(t, -h, t, h);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
    return g;
  }, [size, cells, gridColor, opacityNear, opacityFar, edgeFade, edgeIntensity]);
  const clipPlanes = useMemo(() => makeEnclosureClipPlanes(clipHalfW, clipHalfD), [clipHalfW, clipHalfD]);
  return (
    <lineSegments geometry={geom} position={[0, floorY + 0.002, 0]} renderOrder={1}>
      <lineBasicMaterial vertexColors transparent opacity={1} toneMapped={false} clippingPlanes={clipPlanes} />
    </lineSegments>
  );
}

/* --- Zero nodes: small tile marks scattered on active grid cells near the center --- */

function ZeroNodes({ size, cells, floorY, count, color, tileScalePct, opacity, radiusPct, edgeFade, edgeIntensity, clipHalfW, clipHalfD }: {
  size: number;
  cells: number;
  floorY: number;
  count: number;
  color: string;
  tileScalePct: number;
  opacity: number;
  radiusPct: number;
  edgeFade: number;
  edgeIntensity: number;
  clipHalfW: number;
  clipHalfD: number;
}) {
  const picks = useMemo(() => {
    const rand = seeded(0x4ce11);
    const n = Math.max(2, Math.round(cells));
    const h = size / 2;
    const step = size / n;
    const maxR = (radiusPct / 100) * h;
    const target = Math.max(0, Math.round(count));
    const minSpacing = 2;
    const used = new Set<string>();
    const results: { cx: number; cz: number; alpha: number }[] = [];
    let attempts = 0;
    while (results.length < target && attempts < target * 120) {
      attempts += 1;
      const theta = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * maxR;
      const sx = Math.cos(theta) * r;
      const sz = Math.sin(theta) * r;
      const i = Math.max(0, Math.min(n - 1, Math.floor((sx + h) / step)));
      const j = Math.max(0, Math.min(n - 1, Math.floor((sz + h) / step)));
      const key = `${i}|${j}`;
      if (used.has(key)) continue;
      let tooClose = false;
      for (const other of results) {
        const oi = Math.floor((other.cx + h) / step);
        const oj = Math.floor((other.cz + h) / step);
        if (Math.abs(oi - i) < minSpacing && Math.abs(oj - j) < minSpacing) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      used.add(key);
      const cx = -h + (i + 0.5) * step;
      const cz = -h + (j + 0.5) * step;
      results.push({ cx, cz, alpha: edgeAlphaSquare(cx, cz, h, edgeFade, edgeIntensity) });
    }
    return { picks: results, cellSize: step };
  }, [size, cells, count, radiusPct, edgeFade, edgeIntensity]);
  const w = picks.cellSize * (tileScalePct / 100);
  const clipPlanes = useMemo(() => makeEnclosureClipPlanes(clipHalfW, clipHalfD), [clipHalfW, clipHalfD]);
  if (picks.picks.length === 0) return null;
  return (
    <group position={[0, floorY + 0.004, 0]} renderOrder={2}>
      {picks.picks.map((p, idx) => (
        <mesh key={`zn-${idx}`} position={[p.cx, 0, p.cz]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[w, w * 0.35]} />
          <meshBasicMaterial color={color} transparent opacity={(opacity / 100) * p.alpha} depthWrite={false} toneMapped={false} clippingPlanes={clipPlanes} />
        </mesh>
      ))}
    </group>
  );
}

/* --- Wires: straight runs from floor roots up to tips on the cube's underside --- */

type ThreadSeed = { rootX: number; rootZ: number; tipX: number; tipZ: number; phase: number; ridge: number };

function pathAt(u: number, time: number, seed: ThreadSeed, topY: number, speed: number) {
  const x = THREE.MathUtils.lerp(seed.rootX, seed.tipX, u);
  const z = THREE.MathUtils.lerp(seed.rootZ, seed.tipZ, u);
  const sag = Math.sin(u * Math.PI) * 0.06;
  const hum = Math.sin(u * 22 + seed.phase + time * speed * 0.35) * 0.008;
  const y = THREE.MathUtils.lerp(BOTTOM_Y, topY, u) - sag + hum;
  return [x, y, z] as const;
}

type FabricThreadsProps = {
  count: number;
  color: string;
  speed: number;
  density: number;
  spread: number;
  cubeWidth: number;
  cubeDepth: number;
  cubeBottomY: number;
  flowDensity: number;
  flowDuty: number;
  topFade: number;
  bottomFade: number;
  clipPlanes?: THREE.Plane[];
};

function FabricThreads({ count, color, speed, density, spread, cubeWidth, cubeDepth, cubeBottomY, flowDensity, flowDuty, topFade, bottomFade, clipPlanes }: FabricThreadsProps) {
  const threadCount = Math.max(10, Math.round(count));
  const segments = 20;
  const topY = cubeBottomY;
  const speedNorm = speed / 50;
  const { geometry, seeds, material } = useMemo(() => {
    const random = seeded(0x17a11);
    const seedList: ThreadSeed[] = [];
    const bias = THREE.MathUtils.clamp(density / 100, 0, 1);
    const spreadNorm = THREE.MathUtils.clamp(spread / 100, 0, 1);
    const rootHalfW = (BOX_W / 2 - 0.3) * (0.25 + spreadNorm * 0.95);
    const rootHalfD = (BOX_D / 2 - 0.3) * (0.25 + spreadNorm * 0.95);
    const tipHalfW = Math.max(0.02, cubeWidth / 2 - 0.04);
    const tipHalfD = Math.max(0.02, cubeDepth / 2 - 0.04);
    const positions = new Float32Array(threadCount * segments * 2 * 3);
    const progress = new Float32Array(threadCount * segments * 2);
    const threadIds = new Float32Array(threadCount * segments * 2);
    for (let thread = 0; thread < threadCount; thread += 1) {
      const rx = random() * 2 - 1;
      const rz = random() * 2 - 1;
      const biased = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 1 + bias * 1.4);
      const rootX = biased(rx) * rootHalfW;
      const rootZ = biased(rz) * rootHalfD;
      const tipX = (random() * 2 - 1) * tipHalfW;
      const tipZ = (random() * 2 - 1) * tipHalfD;
      seedList.push({
        rootX,
        rootZ,
        tipX,
        tipZ,
        phase: random() * Math.PI * 2,
        ridge: thread % 23 === 0 ? 1 : 0,
      });
    }
    let p = 0;
    let a = 0;
    for (let t = 0; t < threadCount; t += 1) {
      const seed = seedList[t];
      for (let s = 0; s < segments; s += 1) {
        const u0 = s / segments;
        const u1 = (s + 1) / segments;
        const p0 = pathAt(u0, 0, seed, topY, speedNorm);
        const p1 = pathAt(u1, 0, seed, topY, speedNorm);
        positions[p++] = p0[0]; positions[p++] = p0[1]; positions[p++] = p0[2];
        positions[p++] = p1[0]; positions[p++] = p1[1]; positions[p++] = p1[2];
        progress[a] = u0; threadIds[a++] = t + seed.ridge * 0.5;
        progress[a] = u1; threadIds[a++] = t + seed.ridge * 0.5;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aU", new THREE.BufferAttribute(progress, 1));
    geo.setAttribute("aThread", new THREE.BufferAttribute(threadIds, 1));
    const rgb = hexToRgb(color);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Vector3(rgb[0], rgb[1], rgb[2]) },
        uDensity: { value: flowDensity },
        uDuty: { value: flowDuty / 100 },
        uTopFade: { value: topFade / 100 },
        uBottomFade: { value: bottomFade / 100 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      clipping: true,
      vertexShader: /* glsl */ `
        attribute float aU;
        attribute float aThread;
        varying float vU;
        varying float vPhase;
        varying float vSpeedJitter;
        varying float vFlicker;
        #include <clipping_planes_pars_vertex>
        void main() {
          vU = aU;
          // Scatter the per-thread phase and give each thread a slightly
          // different flow speed so the whole bundle doesn't lock-step.
          vPhase = fract(aThread * 0.173);
          vSpeedJitter = 0.86 + fract(aThread * 0.613) * 0.28;
          vFlicker = fract(aThread * 1.071);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <clipping_planes_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uDensity;
        uniform float uDuty;
        uniform float uTopFade;
        uniform float uBottomFade;
        varying float vU;
        varying float vPhase;
        varying float vSpeedJitter;
        varying float vFlicker;
        #include <clipping_planes_pars_fragment>

        // Smooth gaussian-ish pulse travelling along the wire. Each wire has its
        // own phase offset + speed jitter so the bundle feels organic rather than
        // metronomic.
        void main() {
          #include <clipping_planes_fragment>
          float bottom = smoothstep(0.0, max(uBottomFade, 1e-4), vU);
          float top = smoothstep(0.0, max(uTopFade, 1e-4), 1.0 - vU);
          float fade = bottom * top;

          float phase = fract(vU * uDensity - uTime * vSpeedJitter + vPhase);
          float d = min(phase, 1.0 - phase);          // distance to nearest pulse center
          float width = clamp(uDuty * 0.5, 0.015, 0.5);

          float halo = exp(-pow(d / width, 2.0) * 3.2);                 // soft outer glow
          float core = exp(-pow(d / (width * 0.32), 2.0) * 9.0);        // thin hot core
          float ambient = 0.065;

          // Subtle per-wire flicker (very slow 2.4 Hz band noise) so quiet
          // sections aren't dead-flat.
          float f = 0.92 + 0.08 * sin(uTime * 2.4 + vFlicker * 11.1);

          float intensity = (ambient + halo * 0.95 + core * 0.75) * f;

          // Hot-white at the pulse center, settle back to uColor in the halo.
          vec3 hot = vec3(1.0, 1.0, 0.985);
          vec3 col = mix(uColor, hot, clamp(core, 0.0, 1.0));

          float a = fade * intensity;
          if (a < 0.001) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    mat.clippingPlanes = clipPlanes ?? null;
    return { geometry: geo, seeds: seedList, material: mat };
  }, [threadCount, color, density, spread, topY, speedNorm, cubeWidth, cubeDepth, flowDensity, flowDuty, topFade, bottomFade, clipPlanes]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speedNorm;
    material.uniforms.uTime.value = t;
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    let p = 0;
    for (const seed of seeds) {
      for (let s = 0; s < segments; s += 1) {
        const p0 = pathAt(s / segments, t, seed, topY, speedNorm);
        const p1 = pathAt((s + 1) / segments, t, seed, topY, speedNorm);
        positions.array[p++] = p0[0]; positions.array[p++] = p0[1]; positions.array[p++] = p0[2];
        positions.array[p++] = p1[0]; positions.array[p++] = p1[1]; positions.array[p++] = p1[2];
      }
    }
    positions.needsUpdate = true;
  });
  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
}

/* --- Top pipes: glass cylinders with bubbles rising inside, cube-top → ceiling --- */

type TopPipesProps = {
  count: number;
  color: string;
  speed: number;
  cubeWidth: number;
  cubeDepth: number;
  cubeTopY: number;
  pipeRadius: number;
  pipeOpacity: number;
  bubbleCount: number;
  bubbleSize: number;
  innerColor: string;
  innerOpacity: number;
  innerThickness: number;
  innerFlowSpeed: number;
  innerFlowDensity: number;
};

function TopPipes({ count, color, speed, cubeWidth, cubeDepth, cubeTopY, pipeRadius, pipeOpacity, bubbleCount, bubbleSize, innerColor, innerOpacity, innerThickness, innerFlowSpeed, innerFlowDensity }: TopPipesProps) {
  const safeCount = Math.max(1, Math.round(count));
  const bubbleCountSafe = Math.max(1, Math.round(bubbleCount));
  const length = Math.max(0.1, TOP_Y - cubeTopY);
  const centerY = cubeTopY + length / 2;
  const speedNorm = speed / 50;

  const anchors = useMemo(() => {
    const hw = cubeWidth / 2;
    const hd = cubeDepth / 2;
    const perim = 2 * (cubeWidth + cubeDepth);
    const walk = (s: number): [number, number] => {
      let d = ((s % perim) + perim) % perim;
      if (d < cubeWidth) return [-hw + d, -hd];
      d -= cubeWidth;
      if (d < cubeDepth) return [hw, -hd + d];
      d -= cubeDepth;
      if (d < cubeWidth) return [hw - d, hd];
      d -= cubeWidth;
      return [-hw, hd - d];
    };
    return Array.from({ length: safeCount }, (_, i) => walk((i * perim) / safeCount));
  }, [safeCount, cubeWidth, cubeDepth]);

  // Glass pipe wall: translucent cylinder with Fresnel rim so it reads as glass.
  const pipeGeom = useMemo(
    () => new THREE.CylinderGeometry(pipeRadius, pipeRadius, length, 24, 1, true),
    [pipeRadius, length],
  );
  const pipeMaterial = useMemo(() => {
    const rgb = hexToRgb(color);
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Vector3(rgb[0], rgb[1], rgb[2]) },
        uOpacity: { value: pipeOpacity / 100 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vLocalY;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vLocalY = position.y;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vLocalY;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float ndv = abs(dot(normalize(vNormal), viewDir));
          float fres = pow(1.0 - ndv, 2.6);
          // Very slow vertical shimmer so the glass isn't dead-flat.
          float shimmer = 0.5 + 0.5 * sin(vLocalY * 7.0 + uTime * 0.4);
          vec3 rim = mix(uColor, vec3(1.0), 0.55);
          vec3 col = mix(uColor, rim, fres);
          float a = uOpacity * (0.22 + fres * 0.95 + shimmer * 0.05);
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
  }, [color, pipeOpacity]);
  useEffect(() => { pipeMaterial.uniforms.uColor.value.set(hexToRgb(color)[0], hexToRgb(color)[1], hexToRgb(color)[2]); pipeMaterial.uniforms.uOpacity.value = pipeOpacity / 100; }, [pipeMaterial, color, pipeOpacity]);

  // Inner beam: thin cylinder running through the center of each pipe, with
  // upward-flowing pulses on an additive shader. Decoupled from the glass wall
  // and the bubbles so each can be tuned independently.
  const innerRadius = Math.max(0.0005, pipeRadius * (innerThickness / 100));
  const innerGeom = useMemo(
    () => new THREE.CylinderGeometry(innerRadius, innerRadius, length, 14, 1, true),
    [innerRadius, length],
  );
  const innerMaterial = useMemo(() => {
    const rgb = hexToRgb(innerColor);
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Vector3(rgb[0], rgb[1], rgb[2]) },
        uOpacity: { value: innerOpacity / 100 },
        uTime: { value: 0 },
        uSpeed: { value: innerFlowSpeed / 50 },
        uDensity: { value: innerFlowDensity },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vU;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          // Normalize local Y (±length/2) to u in [0, 1] along the beam.
          vU = position.y / length(vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        uniform float uSpeed;
        uniform float uDensity;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vU;
        void main() {
          // Taper the ends so the beam fades in near the cube and out at the ceiling.
          float topFade = smoothstep(0.0, 0.12, 1.0 - vU);
          float botFade = smoothstep(0.0, 0.08, vU);
          float fade = topFade * botFade;

          // Soft travelling pulses rising up the beam.
          float phase = fract(vU * uDensity - uTime * uSpeed * 0.35);
          float d = min(phase, 1.0 - phase);
          float width = 0.14;
          float halo = exp(-pow(d / width, 2.0) * 2.8);
          float core = exp(-pow(d / (width * 0.35), 2.0) * 10.0);

          // Side-view thickness cue: the beam reads brighter where its silhouette
          // is tangent to the camera (same trick as the glass wall).
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float sil = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 1.5);

          float base = 0.35 + sil * 0.6;
          float intensity = (base + halo * 0.75 + core * 1.2) * fade * uOpacity;

          vec3 hot = vec3(1.0, 1.0, 0.98);
          vec3 col = mix(uColor, hot, clamp(core, 0.0, 1.0));
          if (intensity < 0.004) discard;
          gl_FragColor = vec4(col, intensity);
        }
      `,
    });
  }, [innerColor, innerOpacity, innerFlowSpeed, innerFlowDensity]);
  useEffect(() => {
    const rgb = hexToRgb(innerColor);
    innerMaterial.uniforms.uColor.value.set(rgb[0], rgb[1], rgb[2]);
    innerMaterial.uniforms.uOpacity.value = innerOpacity / 100;
    innerMaterial.uniforms.uSpeed.value = innerFlowSpeed / 50;
    innerMaterial.uniforms.uDensity.value = innerFlowDensity;
  }, [innerMaterial, innerColor, innerOpacity, innerFlowSpeed, innerFlowDensity]);

  // Bubbles: instanced spheres rising inside each pipe, cycling top → bottom.
  const bubbleGeom = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);
  const bubbleMaterial = useMemo(() => {
    const rgb = hexToRgb(color);
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Vector3(rgb[0], rgb[1], rgb[2]) },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          mat3 nm = mat3(modelMatrix * instanceMatrix);
          vNormal = normalize(nm * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float ndv = abs(dot(normalize(vNormal), viewDir));
          float fres = pow(1.0 - ndv, 2.4);     // glow strongest at the silhouette
          float facing = pow(ndv, 1.8);         // bright spot where surface faces camera (like a specular highlight)
          vec3 rim = mix(uColor, vec3(1.0), 0.8);
          vec3 col = mix(uColor, rim, fres);
          float a = 0.22 + fres * 0.95 + facing * 0.5;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
  }, [color]);
  useEffect(() => { bubbleMaterial.uniforms.uColor.value.set(hexToRgb(color)[0], hexToRgb(color)[1], hexToRgb(color)[2]); }, [bubbleMaterial, color]);

  const totalBubbles = safeCount * bubbleCountSafe;
  const bubbleStates = useMemo(() => {
    const rand = seeded(0x880f);
    const bubbleBaseSize = pipeRadius * (bubbleSize / 100) * 0.9;
    const states: Array<{ pipeIdx: number; u: number; angle: number; r: number; size: number; speedMul: number }> = [];
    for (let p = 0; p < safeCount; p += 1) {
      for (let b = 0; b < bubbleCountSafe; b += 1) {
        states.push({
          pipeIdx: p,
          u: rand(),
          angle: rand() * Math.PI * 2,
          r: Math.sqrt(rand()) * pipeRadius * 0.55,
          size: bubbleBaseSize * (0.6 + rand() * 0.75),
          speedMul: 0.7 + rand() * 0.6,
        });
      }
    }
    return states;
  }, [safeCount, bubbleCountSafe, pipeRadius, bubbleSize]);

  const bubbleRef = useRef<THREE.InstancedMesh | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state, delta) => {
    const mesh = bubbleRef.current;
    if (!mesh) return;
    const dt = Math.min(0.05, delta);
    pipeMaterial.uniforms.uTime.value = state.clock.elapsedTime;
    innerMaterial.uniforms.uTime.value = state.clock.elapsedTime;
    const baseRise = 0.14 * speedNorm;
    for (let i = 0; i < bubbleStates.length; i += 1) {
      const b = bubbleStates[i];
      b.u += b.speedMul * baseRise * dt;
      if (b.u >= 1) b.u -= 1;
      // Tiny lateral drift so bubbles don't travel in dead-straight lines.
      const wobble = Math.sin(state.clock.elapsedTime * 1.5 + b.angle * 3.1) * 0.08;
      const r = Math.max(0, Math.min(pipeRadius * 0.78, b.r + wobble * pipeRadius * 0.15));
      const [ax, az] = anchors[b.pipeIdx];
      const worldY = cubeTopY + b.u * length;
      const x = ax + Math.cos(b.angle) * r;
      const z = az + Math.sin(b.angle) * r;
      // Taper size at the pipe ends so bubbles fade in near the cube and fade out near the ceiling.
      const taper = Math.min(1.0, b.u * 10, (1 - b.u) * 10);
      const s = Math.max(0.0001, b.size * taper);
      dummy.position.set(x, worldY, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {anchors.map((a, i) => (
        <group key={`pipe-${i}`} position={[a[0], centerY, a[1]]}>
          <mesh geometry={pipeGeom} material={pipeMaterial} />
          {innerOpacity > 0 && innerThickness > 0 && (
            <mesh geometry={innerGeom} material={innerMaterial} renderOrder={2} />
          )}
        </group>
      ))}
      <instancedMesh ref={bubbleRef} args={[bubbleGeom, bubbleMaterial, Math.max(1, totalBubbles)]} />
    </group>
  );
}

type TopExitLinesProps = {
  count: number;
  color: string;
  speed: number;
  cubeWidth: number;
  cubeDepth: number;
  cubeTopY: number;
};

function TopExitLines({ count, color, speed, cubeWidth, cubeDepth, cubeTopY }: TopExitLinesProps) {
  const safeCount = Math.max(1, Math.round(count));
  const segments = 24;
  const bottomY = cubeTopY;
  const speedNorm = speed / 50;
  const { geometry, anchors, material } = useMemo(() => {
    const positions = new Float32Array(safeCount * segments * 2 * 3);
    const progress = new Float32Array(safeCount * segments * 2);
    const ids = new Float32Array(safeCount * segments * 2);
    const anchorList: { x: number; z: number }[] = [];
    const hw = cubeWidth / 2;
    const hd = cubeDepth / 2;
    for (let i = 0; i < safeCount; i += 1) {
      if (safeCount === 4) {
        const corners: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
        anchorList.push({ x: corners[i][0], z: corners[i][1] });
      } else {
        const theta = (i / safeCount) * Math.PI * 2;
        anchorList.push({ x: Math.cos(theta) * hw, z: Math.sin(theta) * hd });
      }
    }
    let p = 0;
    let a = 0;
    for (let i = 0; i < safeCount; i += 1) {
      for (let s = 0; s < segments; s += 1) {
        const u0 = s / segments;
        const u1 = (s + 1) / segments;
        const y0 = THREE.MathUtils.lerp(bottomY, TOP_Y, u0);
        const y1 = THREE.MathUtils.lerp(bottomY, TOP_Y, u1);
        positions[p++] = anchorList[i].x; positions[p++] = y0; positions[p++] = anchorList[i].z;
        positions[p++] = anchorList[i].x; positions[p++] = y1; positions[p++] = anchorList[i].z;
        progress[a] = u0; ids[a++] = i;
        progress[a] = u1; ids[a++] = i;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aU", new THREE.BufferAttribute(progress, 1));
    geo.setAttribute("aId", new THREE.BufferAttribute(ids, 1));
    const rgb = hexToRgb(color);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Vector3(rgb[0], rgb[1], rgb[2]) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aU;
        attribute float aId;
        varying float vU;
        varying float vId;
        void main() {
          vU = aU;
          vId = aId;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        varying float vU;
        varying float vId;
        void main() {
          float phase = fract(vU * 1.4 - uTime * 0.55 + vId * 0.17);
          float d = min(phase, 1.0 - phase);
          float width = 0.08;
          float halo = exp(-pow(d / width, 2.0) * 2.6);
          float core = exp(-pow(d / (width * 0.35), 2.0) * 9.0);
          // Lingering tail trailing the head (slight bias toward phase > 0.5).
          float tail = pow(max(0.0, 1.0 - phase), 1.6) * 0.3;
          float ambient = 0.18;
          float intensity = ambient + halo * 0.75 + core * 0.9 + tail;
          vec3 hot = vec3(1.0, 1.0, 0.95);
          vec3 col = mix(uColor, hot, clamp(core * 0.9, 0.0, 1.0));
          float a = intensity;
          if (a < 0.001) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    return { geometry: geo, anchors: anchorList, material: mat };
  }, [safeCount, color, cubeWidth, cubeDepth, cubeTopY]);
  void anchors;
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime * speedNorm;
  });
  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
}

/* --- Agent layer: horizontal node lattice with physics-based signal flow --- */

type AgentEdge = { a: number; b: number };
type AgentSignal = { edgeIdx: number; dir: 1 | -1; posOnEdge: number; edgeLen: number; amplitude: number; alive: boolean };

function buildAgentLattice(size: number, gridN: number) {
  const N = Math.max(2, Math.round(gridN));
  const half = size / 2;
  const step = size / (N - 1);
  const nodes: Array<[number, number, number]> = [];
  for (let r = 0; r < N; r += 1) {
    const z = -half + r * step;
    for (let c = 0; c < N; c += 1) {
      const x = -half + c * step;
      nodes.push([x, 0, z]);
    }
  }
  const edges: AgentEdge[] = [];
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N - 1; c += 1) edges.push({ a: r * N + c, b: r * N + c + 1 });
  }
  for (let c = 0; c < N; c += 1) {
    for (let r = 0; r < N - 1; r += 1) edges.push({ a: r * N + c, b: (r + 1) * N + c });
  }
  const adj: Array<Array<{ edgeIdx: number; side: 0 | 1 }>> = nodes.map(() => []);
  edges.forEach((e, i) => {
    adj[e.a].push({ edgeIdx: i, side: 0 });
    adj[e.b].push({ edgeIdx: i, side: 1 });
  });
  const edgeLen = new Float32Array(edges.length);
  for (let i = 0; i < edges.length; i += 1) {
    const a = nodes[edges[i].a];
    const b = nodes[edges[i].b];
    edgeLen[i] = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const boundaryEdges: number[] = [];
  edges.forEach((e, i) => {
    const rA = Math.floor(e.a / N), cA = e.a % N;
    const rB = Math.floor(e.b / N), cB = e.b % N;
    const onA = rA === 0 || rA === N - 1 || cA === 0 || cA === N - 1;
    const onB = rB === 0 || rB === N - 1 || cB === 0 || cB === N - 1;
    if (onA && onB) boundaryEdges.push(i);
  });
  return { N, step, nodes, edges, adj, edgeLen, boundaryEdges };
}

type AgentLayerProps = {
  layerY: number;
  size: number;
  gridN: number;
  nodeColor: string;
  nodeSize: number;
  edgeOpacity: number;
  signalColor: string;
  signalCount: number;
  signalSpeed: number;
  signalLength: number;
  signalThickness: number;
  decayLength: number;
  refractory: number;
  spawnRate: number;
  minAmplitude: number;
  seedOffset?: number;
  clipPlanes?: THREE.Plane[];
  dotCount?: number;
  dotColor?: string;
  dotSize?: number;
  dotOpacity?: number;
};

function AgentLayer({
  layerY, size, gridN, nodeColor, nodeSize, edgeOpacity,
  signalColor, signalCount, signalSpeed, signalLength, signalThickness,
  decayLength, refractory, spawnRate, minAmplitude, seedOffset = 0, clipPlanes,
  dotCount = 0, dotColor = "#ffffff", dotSize = 30, dotOpacity = 25,
}: AgentLayerProps) {
  const sliceSeed = 0x51a9a1 ^ Math.floor(seedOffset * 100003);
  const lattice = useMemo(() => buildAgentLattice(size, gridN), [size, gridN]);
  const nodeGeom = useMemo(() => {
    const positions = new Float32Array(lattice.nodes.length * 3);
    for (let i = 0; i < lattice.nodes.length; i += 1) {
      positions[i * 3] = lattice.nodes[i][0];
      positions[i * 3 + 1] = lattice.nodes[i][1];
      positions[i * 3 + 2] = lattice.nodes[i][2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [lattice.nodes]);
  const nodeMaterial = useMemo(
    () => new THREE.PointsMaterial({
      color: new THREE.Color(nodeColor),
      size: nodeSize * 0.001 * size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
    }),
    [nodeColor, nodeSize, size],
  );
  useEffect(() => { nodeMaterial.clippingPlanes = clipPlanes ?? null; nodeMaterial.needsUpdate = true; }, [nodeMaterial, clipPlanes]);
  const edgeGeom = useMemo(() => {
    const positions = new Float32Array(lattice.edges.length * 6);
    lattice.edges.forEach((e, i) => {
      const a = lattice.nodes[e.a];
      const b = lattice.nodes[e.b];
      positions[i * 6] = a[0]; positions[i * 6 + 1] = a[1]; positions[i * 6 + 2] = a[2];
      positions[i * 6 + 3] = b[0]; positions[i * 6 + 4] = b[1]; positions[i * 6 + 5] = b[2];
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [lattice.edges, lattice.nodes]);
  const edgeMaterial = useMemo(
    () => new THREE.LineBasicMaterial({
      color: new THREE.Color(nodeColor),
      transparent: true,
      opacity: edgeOpacity / 100,
      depthWrite: false,
      toneMapped: false,
    }),
    [nodeColor, edgeOpacity],
  );
  useEffect(() => { edgeMaterial.clippingPlanes = clipPlanes ?? null; edgeMaterial.needsUpdate = true; }, [edgeMaterial, clipPlanes]);
  const capsuleGeom = useMemo(() => {
    const g = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
    g.rotateZ(Math.PI / 2);
    return g;
  }, []);
  const signalMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: new THREE.Color(signalColor),
      transparent: true,
      opacity: 1,
      depthWrite: false,
      toneMapped: false,
    }),
    [signalColor],
  );
  useEffect(() => { signalMaterial.clippingPlanes = clipPlanes ?? null; signalMaterial.needsUpdate = true; }, [signalMaterial, clipPlanes]);
  const MAX_SIGNALS = 800;
  const signalsRef = useRef<AgentSignal[]>([]);
  const refractoryUntilRef = useRef<Float32Array>(new Float32Array(lattice.nodes.length));
  const spawnAccumRef = useRef(0);
  const rngRef = useRef(seeded(sliceSeed));
  useEffect(() => {
    const rng = seeded(sliceSeed);
    rngRef.current = rng;
    refractoryUntilRef.current = new Float32Array(lattice.nodes.length);
    const initial = Math.min(MAX_SIGNALS, Math.max(0, Math.round(signalCount)));
    const spawnEdges = lattice.boundaryEdges.length > 0 ? lattice.boundaryEdges : lattice.edges.map((_, i) => i);
    signalsRef.current = Array.from({ length: initial }, () => {
      const edgeIdx = spawnEdges[Math.floor(rng() * spawnEdges.length)];
      const edgeLen = lattice.edgeLen[edgeIdx];
      return {
        edgeIdx,
        dir: rng() < 0.5 ? 1 : -1,
        posOnEdge: rng() * edgeLen,
        edgeLen,
        amplitude: 0.6 + rng() * 0.4,
        alive: true,
      };
    });
    spawnAccumRef.current = 0;
  }, [signalCount, sliceSeed, lattice.nodes.length, lattice.edges, lattice.edgeLen, lattice.boundaryEdges]);
  // Soft dot haze filling the gaps between lattice nodes. Point sprites with a
  // gaussian falloff shader so each dot reads as a soft blur instead of a hard pixel.
  const dotCountSafe = Math.max(0, Math.round(dotCount));
  const dotGeom = useMemo(() => {
    const rand = seeded(sliceSeed ^ 0x7f1d5);
    const positions = new Float32Array(dotCountSafe * 3);
    const offsets = new Float32Array(dotCountSafe);
    const half = size / 2;
    for (let i = 0; i < dotCountSafe; i += 1) {
      positions[i * 3] = (rand() * 2 - 1) * half;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = (rand() * 2 - 1) * half;
      offsets[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 1));
    return g;
  }, [dotCountSafe, size, sliceSeed]);
  const dotMaterial = useMemo(() => {
    const rgb = hexToRgb(dotColor);
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Vector3(rgb[0], rgb[1], rgb[2]) },
        uSize: { value: dotSize * 0.0014 * size },
        uOpacity: { value: dotOpacity / 100 },
        uPixelRatio: { value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aOffset;
        uniform float uTime;
        uniform float uSize;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          // Slow lateral breathing so the haze doesn't look dead-still.
          p.x += sin(uTime * 0.35 + aOffset * 11.0) * uSize * 0.6;
          p.z += cos(uTime * 0.28 + aOffset * 7.0) * uSize * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          // Larger, farther-ranging dots per random offset; perspective-sized.
          gl_PointSize = (0.6 + aOffset * 1.4) * uSize * 180.0 * uPixelRatio / -mv.z;
          vAlpha = 0.35 + 0.65 * aOffset;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d2 = dot(c, c);
          if (d2 > 0.25) discard;
          // Smooth gaussian falloff.
          float a = exp(-d2 * 14.0);
          gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
        }
      `,
    });
  }, [dotColor, dotSize, dotOpacity, size]);
  useEffect(() => {
    const rgb = hexToRgb(dotColor);
    dotMaterial.uniforms.uColor.value.set(rgb[0], rgb[1], rgb[2]);
    dotMaterial.uniforms.uSize.value = dotSize * 0.0014 * size;
    dotMaterial.uniforms.uOpacity.value = dotOpacity / 100;
  }, [dotMaterial, dotColor, dotSize, dotOpacity, size]);
  useEffect(() => { dotMaterial.clippingPlanes = clipPlanes ?? null; dotMaterial.needsUpdate = true; }, [dotMaterial, clipPlanes]);

  const instancedRef = useRef<THREE.InstancedMesh | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  useFrame((state, delta) => {
    dotMaterial.uniforms.uTime.value = state.clock.elapsedTime;
    const mesh = instancedRef.current;
    if (!mesh) return;
    const dt = Math.min(0.05, delta);
    const now = state.clock.elapsedTime;
    const v = (signalSpeed / 100) * lattice.step * 6;
    const attenPerStep = decayLength >= 99
      ? 1
      : Math.exp(-(v * dt) / Math.max(0.001, (decayLength / 100) * lattice.step * 8));
    const refractoryDur = (refractory / 100) * 2;
    const ampMin = minAmplitude / 100;
    const lenFrac = Math.max(0.05, signalLength / 100);
    const thickness = signalThickness * 0.001 * size;
    const rng = rngRef.current;
    const nodes = lattice.nodes;
    const edges = lattice.edges;
    const edgeLen = lattice.edgeLen;
    const adj = lattice.adj;
    const boundaryEdges = lattice.boundaryEdges;
    const refractoryUntil = refractoryUntilRef.current;
    const signals = signalsRef.current;
    for (let i = 0; i < signals.length; i += 1) {
      const s = signals[i];
      if (!s.alive) continue;
      s.posOnEdge += v * dt * s.dir;
      s.amplitude *= attenPerStep;
      if (s.amplitude < ampMin) { s.alive = false; continue; }
      let guard = 0;
      while (s.alive && guard < 4) {
        guard += 1;
        const overshoot = s.posOnEdge > s.edgeLen
          ? s.posOnEdge - s.edgeLen
          : s.posOnEdge < 0 ? -s.posOnEdge : 0;
        if (overshoot === 0) break;
        const arrivingAt = s.dir > 0 ? edges[s.edgeIdx].b : edges[s.edgeIdx].a;
        if (now < refractoryUntil[arrivingAt]) { s.alive = false; break; }
        refractoryUntil[arrivingAt] = now + refractoryDur;
        const options = adj[arrivingAt].filter((o) => o.edgeIdx !== s.edgeIdx);
        if (options.length === 0) {
          s.dir = (-s.dir) as 1 | -1;
          s.posOnEdge = s.dir > 0 ? overshoot : s.edgeLen - overshoot;
          continue;
        }
        const chosen = options[Math.floor(rng() * options.length)];
        s.edgeIdx = chosen.edgeIdx;
        s.edgeLen = edgeLen[chosen.edgeIdx];
        s.dir = (chosen.side === 0 ? 1 : -1) as 1 | -1;
        s.posOnEdge = chosen.side === 0 ? overshoot : s.edgeLen - overshoot;
        if (s.amplitude < ampMin) { s.alive = false; break; }
      }
    }
    const alive: AgentSignal[] = [];
    for (const s of signals) if (s.alive) alive.push(s);
    const rate = (spawnRate / 100) * 20;
    spawnAccumRef.current += rate * dt;
    while (spawnAccumRef.current >= 1 && alive.length < MAX_SIGNALS) {
      spawnAccumRef.current -= 1;
      const eIdx = boundaryEdges.length > 0 ? boundaryEdges[Math.floor(rng() * boundaryEdges.length)] : Math.floor(rng() * edges.length);
      const eLen = edgeLen[eIdx];
      alive.push({
        edgeIdx: eIdx,
        dir: rng() < 0.5 ? 1 : -1,
        posOnEdge: rng() < 0.5 ? 0 : eLen,
        edgeLen: eLen,
        amplitude: 0.85 + rng() * 0.15,
        alive: true,
      });
    }
    if (alive.length > MAX_SIGNALS) {
      alive.sort((a, b) => b.amplitude - a.amplitude);
      alive.length = MAX_SIGNALS;
    }
    signalsRef.current = alive;
    const count = alive.length;
    for (let i = 0; i < count; i += 1) {
      const s = alive[i];
      const edge = edges[s.edgeIdx];
      const a = nodes[edge.a];
      const b = nodes[edge.b];
      const eLen = s.edgeLen;
      const halfLen = (lenFrac * eLen) / 2;
      const p0 = Math.max(0, s.posOnEdge - halfLen);
      const p1 = Math.min(eLen, s.posOnEdge + halfLen);
      const pMid = (p0 + p1) / 2;
      const uMid = eLen > 0 ? pMid / eLen : 0;
      const midX = a[0] + (b[0] - a[0]) * uMid;
      const midY = a[1] + (b[1] - a[1]) * uMid;
      const midZ = a[2] + (b[2] - a[2]) * uMid;
      const segLen = p1 - p0;
      dummy.position.set(midX, midY, midZ);
      const yaw = Math.atan2(b[2] - a[2], b[0] - a[0]);
      dummy.rotation.set(0, -yaw, 0);
      dummy.scale.set(Math.max(0.001, segLen), thickness, thickness);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmpColor.set(signalColor).multiplyScalar(Math.max(0, Math.min(1, s.amplitude)));
      mesh.setColorAt(i, tmpColor);
    }
    for (let i = count; i < mesh.count; i += 1) {
      dummy.position.set(0, 1e6, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = Math.max(count, mesh.count);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <group position={[0, layerY, 0]}>
      <lineSegments geometry={edgeGeom} material={edgeMaterial} />
      <points geometry={nodeGeom} material={nodeMaterial} />
      {dotCountSafe > 0 && dotOpacity > 0 && (
        <points geometry={dotGeom} material={dotMaterial} frustumCulled={false} />
      )}
      <instancedMesh ref={instancedRef} args={[capsuleGeom, signalMaterial, MAX_SIGNALS]} />
    </group>
  );
}

/* --- Center cube: the agent "engine" --- */

function CenterCube({ width, height, depth, centerY, pulseColor }: { width: number; height: number; depth: number; centerY: number; pulseColor: string }) {
  const edges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
    [width, height, depth],
  );
  const face = useMemo(() => new THREE.BoxGeometry(width * 0.98, height * 0.98, depth * 0.98), [width, height, depth]);
  const glowMat = useMemo(() => {
    const rgb = hexToRgb(pulseColor);
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Vector3(rgb[0], rgb[1], rgb[2]) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        varying vec3 vNormal;
        void main() {
          vPos = position;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec3 vPos;
        varying vec3 vNormal;
        void main() {
          // Breath: cosine-eased so it lingers at the peaks and troughs rather
          // than passing through them linearly like a sine wave.
          float t = fract(uTime * 0.18);
          float breath = 0.5 - 0.5 * cos(t * 6.28318);
          breath = breath * breath * (3.0 - 2.0 * breath);
          float pulse = 0.35 + breath * 0.75;

          // Fresnel-ish rim glow: strongest where the surface faces away from
          // the viewer, softer toward the camera. Reads as a real emissive
          // volume rather than a flat shell.
          vec3 viewDir = normalize(cameraPosition - (modelMatrix * vec4(vPos, 1.0)).xyz);
          float fres = pow(1.0 - clamp(dot(normalize(vNormal), viewDir), 0.0, 1.0), 2.4);

          // Chromatic rim: slightly warmer at the pulse peak.
          vec3 warm = mix(uColor, vec3(1.0, 0.98, 0.92), 0.55);
          vec3 col = mix(uColor, warm, breath);

          float a = (0.12 + fres * 0.65) * pulse;
          gl_FragColor = vec4(col, a);
        }
      `,
    });
  }, [pulseColor]);
  useFrame(({ clock }) => {
    glowMat.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <group position={[0, centerY, 0]}>
      <mesh geometry={face} material={glowMat} />
      <lineSegments geometry={edges} renderOrder={5}>
        <lineBasicMaterial color="#f0ffe8" transparent opacity={0.95} depthTest={false} />
      </lineSegments>
    </group>
  );
}

/* --- Floor particles (ambient dust lifting from the base) --- */

function FloorParticles() {
  const count = 1400;
  const geometry = useMemo(() => {
    const random = seeded(0x91e77);
    const positions = new Float32Array(count * 3);
    const offsets = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (random() * 2 - 1) * (BOX_W / 2 - 0.3);
      positions[i * 3 + 1] = BOTTOM_Y + random() * 0.5;
      positions[i * 3 + 2] = (random() * 2 - 1) * (BOX_D / 2 - 0.3);
      offsets[i] = random();
    }
    const buf = new THREE.BufferGeometry();
    buf.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buf.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 1));
    return buf;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute float aOffset;
          uniform float uTime;
          varying float vAlpha;
          void main() {
            vec3 p = position;
            p.y += sin(uTime * 0.4 + aOffset * 11.0) * 0.08;
            p.x += cos(uTime * 0.22 + aOffset * 7.0) * 0.04;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (1.1 + 1.4 * aOffset) * (7.0 / -mv.z);
            vAlpha = 0.18 + 0.3 * aOffset;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float d = dot(c, c);
            if (d > 0.25) discard;
            float f = smoothstep(0.25, 0.0, d);
            gl_FragColor = vec4(0.72, 0.95, 0.8, vAlpha * f);
          }
        `,
      }),
    [],
  );
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/* --- Props & scene wiring --- */

export type AutonomousAgentsSceneProps = {
  background: string;
  autoRotate: boolean;
  rotateSpeed: number;
  fov: number;
  width?: number;
  height?: number;
  depth?: number;
  rings?: number;
  cubeWidth?: number;
  cubeHeight?: number;
  cubeDepth?: number;
  cubeFloorPadding?: number;
  lineCount?: number;
  lineColor?: string;
  lineAnimationSpeed?: number;
  lineBottomDensity?: number;
  lineBottomSpread?: number;
  lineTopExitCount?: number;
  lineTopExitColor?: string;
  lineFlowDensity?: number;
  lineFlowDuty?: number;
  lineTopFade?: number;
  lineBottomFade?: number;
  topPipeRadius?: number;
  topPipeOpacity?: number;
  topBubbleCount?: number;
  topBubbleSize?: number;
  topInnerColor?: string;
  topInnerOpacity?: number;
  topInnerThickness?: number;
  topInnerFlowSpeed?: number;
  topInnerFlowDensity?: number;
  gridResolution?: number;
  gridColor?: string;
  gridOpacity?: number;
  gridPadding?: number;
  basePlaneColor?: string;
  basePlaneOpacity?: number;
  floorSize?: number;
  floorCells?: number;
  floorEdgeFade?: number;
  floorEdgeIntensity?: number;
  floorOpacityNear?: number;
  floorOpacityFar?: number;
  floorGridColor?: string;
  zeroNodeCount?: number;
  zeroNodeColor?: string;
  zeroNodeSize?: number;
  zeroNodeOpacity?: number;
  zeroNodeRadius?: number;
  enclosureLineOpacity?: number;
  includeControls?: boolean;
  agentEnabled?: boolean;
  agentLayerY?: number;
  agentSize?: number;
  agentLayerCount?: number;
  agentLayerSpacing?: number;
  agentLayerStagger?: number;
  agentGridN?: number;
  agentNodeSize?: number;
  agentEdgeOpacity?: number;
  agentSignalCount?: number;
  agentSignalSpeed?: number;
  agentSignalLength?: number;
  agentSignalThickness?: number;
  agentSignalColor?: string;
  agentNodeColor?: string;
  agentDecayLength?: number;
  agentRefractory?: number;
  agentSpawnRate?: number;
  agentMinAmplitude?: number;
  controlsRef?: Ref<ComponentRef<typeof OrbitControls>>;
  realism?: RealismProps;
  outcomes?: StrataSettings;
};

function SceneContents({
  controlsRef,
  autoRotate = false,
  rotateSpeed = 0,
  width = BOX_W,
  height = BOX_H,
  depth = BOX_D,
  cubeWidth = 1.6,
  cubeHeight = 1.6,
  cubeDepth = 1.6,
  cubeFloorPadding = 7,
  lineCount = 220,
  lineColor = "#c3ffe0",
  lineAnimationSpeed = 50,
  lineBottomDensity = 72,
  lineBottomSpread = 55,
  lineTopExitCount = 4,
  lineTopExitColor = "#f5ffce",
  lineFlowDensity = 6,
  lineFlowDuty = 32,
  lineTopFade = 12,
  lineBottomFade = 16,
  topPipeRadius = 0.09,
  topPipeOpacity = 28,
  topBubbleCount = 18,
  topBubbleSize = 55,
  topInnerColor = "#ffffff",
  topInnerOpacity = 55,
  topInnerThickness = 22,
  topInnerFlowSpeed = 100,
  topInnerFlowDensity = 5,
  gridResolution = 20,
  gridColor = "#ffffff",
  gridOpacity = 16,
  gridPadding = 4,
  basePlaneColor = "#0b200f",
  basePlaneOpacity = 8,
  floorSize = 32,
  floorCells = 40,
  floorEdgeFade = 76,
  floorEdgeIntensity = 157,
  floorOpacityNear = 13,
  floorOpacityFar = 19,
  floorGridColor = "#ffffff",
  zeroNodeCount = 60,
  zeroNodeColor = "#ffffff",
  zeroNodeSize = 50,
  zeroNodeOpacity = 85,
  zeroNodeRadius = 70,
  enclosureLineOpacity = 72,
  includeControls = true,
  agentEnabled = true,
  agentLayerY = 3,
  agentSize = 6,
  agentLayerCount = 3,
  agentLayerSpacing = 0.6,
  agentLayerStagger = 0,
  agentGridN = 24,
  agentNodeSize = 15,
  agentEdgeOpacity = 23,
  agentSignalCount = 274,
  agentSignalSpeed = 200,
  agentSignalLength = 43,
  agentSignalThickness = 3,
  agentSignalColor = "#ffffff",
  agentNodeColor = "#ffffff",
  agentDecayLength = 100,
  agentRefractory = 95,
  agentSpawnRate = 100,
  agentMinAmplitude = 42,
}: Omit<AutonomousAgentsSceneProps, "background" | "fov" | "rings">) {
  const floorY = BOTTOM_Y;
  const cubeCenterY = BOTTOM_Y + cubeFloorPadding + cubeHeight / 2;
  const cubeBottomY = cubeCenterY - cubeHeight / 2;
  const cubeTopY = cubeCenterY + cubeHeight / 2;
  // Clip the base plane / floor grid / zero nodes to the enclosure footprint.
  // The enclosure spans [-BOX_W/2, BOX_W/2] × [-BOX_D/2, BOX_D/2] in local coords,
  // and clipping planes operate in world space after the group's scale is applied.
  const clipHalfW = (BOX_W / 2) * (width / BOX_W);
  const clipHalfD = (BOX_D / 2) * (depth / BOX_D);
  const clipHalfH = (BOX_H / 2) * (height / BOX_H);
  return (
    <group scale={[width / BOX_W, height / BOX_H, depth / BOX_D]}>
      <GridFaces resolution={gridResolution} color={gridColor} opacity={gridOpacity} padding={gridPadding} />
      <BasePlane
        size={floorSize}
        floorY={floorY}
        planeColor={basePlaneColor}
        planeOpacity={basePlaneOpacity}
        edgeFade={floorEdgeFade}
        edgeIntensity={floorEdgeIntensity}
        clipHalfW={clipHalfW}
        clipHalfD={clipHalfD}
      />
      <FloorGrid
        size={floorSize}
        floorY={floorY}
        cells={floorCells}
        gridColor={floorGridColor}
        opacityNear={floorOpacityNear}
        opacityFar={floorOpacityFar}
        edgeFade={floorEdgeFade}
        edgeIntensity={floorEdgeIntensity}
        clipHalfW={clipHalfW}
        clipHalfD={clipHalfD}
      />
      <ZeroNodes
        size={floorSize}
        cells={floorCells}
        floorY={floorY}
        count={zeroNodeCount}
        color={zeroNodeColor}
        tileScalePct={zeroNodeSize}
        opacity={zeroNodeOpacity}
        radiusPct={zeroNodeRadius}
        edgeFade={floorEdgeFade}
        edgeIntensity={floorEdgeIntensity}
        clipHalfW={clipHalfW}
        clipHalfD={clipHalfD}
      />
      <Enclosure opacity={enclosureLineOpacity} />
      <FloorParticles />
      {/* -π/2 Z rotation turns the vertical cone (floor→cube) into a horizontal
          one (left wall → center). The position offset compensates for
          cubeBottomY so the convergence point lands at local x = 0, i.e.
          exactly on the centered vertical slabs. */}
      <group position={[-cubeBottomY, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <FabricThreads
          count={lineCount}
          color={lineColor}
          speed={lineAnimationSpeed}
          density={lineBottomDensity}
          spread={lineBottomSpread}
          cubeWidth={cubeWidth}
          cubeDepth={cubeDepth}
          cubeBottomY={cubeBottomY}
          flowDensity={lineFlowDensity}
          flowDuty={lineFlowDuty}
          topFade={lineTopFade}
          bottomFade={lineBottomFade}
          clipPlanes={makeEnclosureClipVolume(clipHalfW, clipHalfH, clipHalfD)}
        />
      </group>
      <TopPipes
        count={lineTopExitCount}
        color={lineTopExitColor}
        speed={lineAnimationSpeed}
        cubeWidth={cubeWidth}
        cubeDepth={cubeDepth}
        cubeTopY={cubeTopY}
        pipeRadius={topPipeRadius}
        pipeOpacity={topPipeOpacity}
        bubbleCount={topBubbleCount}
        bubbleSize={topBubbleSize}
        innerColor={topInnerColor}
        innerOpacity={topInnerOpacity}
        innerThickness={topInnerThickness}
        innerFlowSpeed={topInnerFlowSpeed}
        innerFlowDensity={topInnerFlowDensity}
      />
      {/* Center cube removed — wires still terminate at cubeBottomY / cubeTopY. */}
      {agentEnabled && (() => {
        // Stack `agentLayerCount` lattice slices, `agentLayerSpacing` world units apart,
        // centered on agentLayerY. Signal count divides evenly so density stays
        // what you dialled in regardless of layer count.
        //
        // `agentLayerStagger` perturbs each slice's Y position by a seeded
        // per-slice offset (±stagger% × spacing), so the stack reads organic
        // rather than mechanically uniform.
        const count = Math.max(1, Math.round(agentLayerCount));
        const totalHeight = (count - 1) * agentLayerSpacing;
        const perSliceSignals = Math.max(0, Math.round(agentSignalCount / count));
        const agentClipPlanes = makeEnclosureClipVolume(clipHalfW, clipHalfH, clipHalfD);
        const staggerRand = seeded(0xA6EC7);
        const jitterAmp = (agentLayerStagger / 100) * agentLayerSpacing;
        return Array.from({ length: count }).map((_, i) => {
          const base = agentLayerY - totalHeight / 2 + i * agentLayerSpacing;
          const jitter = (staggerRand() - 0.5) * 2 * jitterAmp;
          return (
            <AgentLayer
              key={`agent-slice-${i}`}
              layerY={base + jitter}
              size={agentSize}
              gridN={agentGridN}
              nodeColor={agentNodeColor}
              nodeSize={agentNodeSize}
              edgeOpacity={agentEdgeOpacity}
              signalColor={agentSignalColor}
              signalCount={perSliceSignals}
              signalSpeed={agentSignalSpeed}
              signalLength={agentSignalLength}
              signalThickness={agentSignalThickness}
              decayLength={agentDecayLength}
              refractory={agentRefractory}
              spawnRate={agentSpawnRate}
              minAmplitude={agentMinAmplitude}
              seedOffset={i * 0.37}
              clipPlanes={agentClipPlanes}
              dotCount={0}
              dotOpacity={0}
            />
          );
        });
      })()}
      {includeControls && (
        <OrbitControls
          ref={controlsRef}
          enableRotate
          enableZoom
          enablePan
          enableDamping
          dampingFactor={0.08}
          minDistance={4}
          maxDistance={60}
          autoRotate={autoRotate}
          autoRotateSpeed={rotateSpeed / 20}
          makeDefault
          target={[0, 0, 0]}
        />
      )}
    </group>
  );
}

export function AutonomousAgentsGenerativeScene(props: AutonomousAgentsSceneProps) {
  const { background, fov, realism, outcomes, ...rest } = props;
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 42], fov, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true, alpha: false }}
      onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
    >
      <color attach="background" args={[background]} />
      {realism ? <RealismRig realism={realism} /> : null}
      <SceneContents {...rest} />
      {outcomes ? <VerticalSlabs settings={outcomes} /> : null}
      {outcomes ? <OutcomeConnectors settings={outcomes} /> : null}
    </Canvas>
  );
}

/** Render the current autonomous-agents scene inside an externally-owned
 *  <Canvas>, driven by StrataSettings. Used by the video exporter so the
 *  encoded clip matches the live canvas 1:1. */
export function realismFromSettings(settings: StrataSettings): RealismProps {
  return {
    enabled: settings.realismEnabled,
    toneMappingExposure: settings.toneMappingExposure,
    hdriEnabled: settings.hdriEnabled,
    hdriPreset: settings.hdriPreset,
    hdriIntensity: settings.hdriIntensity,
    hdriBackground: settings.hdriBackground,
    aoEnabled: settings.aoEnabled,
    aoIntensity: settings.aoIntensity,
    aoRadius: settings.aoRadius,
    aoAperture: settings.aoAperture,
    keyLightIntensity: settings.keyLightIntensity,
    fillLightIntensity: settings.fillLightIntensity,
    rimLightIntensity: settings.rimLightIntensity,
    keyLightColor: settings.keyLightColor,
    rimLightColor: settings.rimLightColor,
    filmGrain: settings.filmGrain,
    bloomIntensity: settings.bloomIntensity,
    bloomThreshold: settings.bloomThreshold,
    bloomSmoothing: settings.bloomSmoothing,
    vignette: settings.vignette,
  };
}

export function AutonomousAgentsSceneFromSettings({ settings, includeControls = false }: { settings: StrataSettings; includeControls?: boolean }) {
  return (
    <>
      {settings.realismEnabled ? <RealismRig realism={realismFromSettings(settings)} /> : null}
      {settings.verticalSlabsEnabled ? <VerticalSlabs settings={settings} /> : null}
      {settings.outcomeConnectorsEnabled ? <OutcomeConnectors settings={settings} /> : null}
    <SceneContents
      includeControls={includeControls}
      autoRotate={settings.autoRotate}
      rotateSpeed={settings.rotateSpeed}
      width={settings.enclosureWidth}
      height={settings.enclosureHeight}
      depth={settings.enclosureDepth}
      cubeWidth={settings.coreCubeWidth}
      cubeHeight={settings.coreCubeHeight}
      cubeDepth={settings.coreCubeDepth}
      cubeFloorPadding={settings.coreCubeFloorPadding}
      lineCount={settings.lineCount}
      lineColor={settings.lineColor}
      lineAnimationSpeed={settings.lineAnimationSpeed}
      lineBottomDensity={settings.lineBottomDensity}
      lineBottomSpread={settings.lineBottomSpread}
      lineTopExitCount={settings.lineTopExitCount}
      lineTopExitColor={settings.lineTopExitColor}
      lineFlowDensity={settings.lineFlowDensity}
      lineFlowDuty={settings.lineFlowDuty}
      lineTopFade={settings.lineTopFade}
      lineBottomFade={settings.lineBottomFade}
      topPipeRadius={settings.topPipeRadius}
      topPipeOpacity={settings.topPipeOpacity}
      topBubbleCount={settings.topBubbleCount}
      topBubbleSize={settings.topBubbleSize}
      topInnerColor={settings.topInnerColor}
      topInnerOpacity={settings.topInnerOpacity}
      topInnerThickness={settings.topInnerThickness}
      topInnerFlowSpeed={settings.topInnerFlowSpeed}
      topInnerFlowDensity={settings.topInnerFlowDensity}
      gridResolution={settings.gridResolution}
      gridColor={settings.gridColor}
      gridOpacity={settings.gridOpacity}
      gridPadding={settings.gridPadding}
      basePlaneColor={settings.basePlaneColor}
      basePlaneOpacity={settings.basePlaneOpacity}
      floorSize={settings.floorSize}
      floorCells={settings.floorCells}
      floorEdgeFade={settings.floorEdgeFade}
      floorEdgeIntensity={settings.floorEdgeIntensity}
      floorOpacityNear={settings.floorOpacityNear}
      floorOpacityFar={settings.floorOpacityFar}
      floorGridColor={settings.floorGridColor}
      zeroNodeCount={settings.zeroNodeCount}
      zeroNodeColor={settings.zeroNodeColor}
      zeroNodeSize={settings.zeroNodeSize}
      zeroNodeOpacity={settings.zeroNodeOpacity}
      zeroNodeRadius={settings.zeroNodeRadius}
      enclosureLineOpacity={settings.enclosureLineOpacity}
      agentEnabled={settings.agentEnabled}
      agentLayerY={settings.agentLayerY}
      agentSize={settings.agentSize}
      agentLayerCount={settings.agentLayerCount}
      agentLayerSpacing={settings.agentLayerSpacing}
      agentLayerStagger={settings.agentLayerStagger}
      agentGridN={settings.agentGridN}
      agentNodeSize={settings.agentNodeSize}
      agentEdgeOpacity={settings.agentEdgeOpacity}
      agentSignalCount={settings.agentSignalCount}
      agentSignalSpeed={settings.agentSignalSpeed}
      agentSignalLength={settings.agentSignalLength}
      agentSignalThickness={settings.agentSignalThickness}
      agentSignalColor={settings.agentSignalColor}
      agentNodeColor={settings.agentNodeColor}
      agentDecayLength={settings.agentDecayLength}
      agentRefractory={settings.agentRefractory}
      agentSpawnRate={settings.agentSpawnRate}
      agentMinAmplitude={settings.agentMinAmplitude}
    />
    </>
  );
}
