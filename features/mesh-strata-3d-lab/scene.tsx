"use client";
/* eslint-disable react-hooks/immutability -- WebGL uniforms mutate .value in useFrame by design */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Vignette,
} from "@react-three/postprocessing";
import type { ContentType, FrameShape, StrataSettings } from "./defaults";

function seededPrng(seed: number) {
  let s = (seed | 0) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967295;
  };
}

function baseWaveHeightAt(
  x: number,
  z: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
) {
  const bias = Math.pow(layerT, 1.6);
  const topAmp = 0.05;
  const bottomAmp = 0.15 + (bottomBias / 100) * 1.45;
  const scale = topAmp + bias * (bottomAmp - topAmp);
  const amp = (amplitude / 100) * scale;
  const s = 0.08 + waveScale * 0.008;
  const w =
    Math.sin(x * s + seed) * Math.cos(z * s * 0.9 + seed * 1.7) * 0.55 +
    Math.sin(x * s * 1.6 + z * s * 1.2 + seed * 2.3) * 0.28 +
    Math.sin(Math.sqrt(x * x + z * z) * s * 0.85 - seed * 0.5) * 0.32;
  return w * amp;
}

type ContentPositions = {
  positions: [number, number, number][];
  edges: [number, number][]; // pair indices into positions, for network
  heightFactors?: number[]; // per-position height multiplier (data-foundation)
};

function generateFoundationLayout(
  planeSize: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
  density: number,
  variance: number,
): ContentPositions {
  const gridN = Math.max(2, Math.round(density));
  const half = planeSize * 0.42;
  const wh = (x: number, z: number) =>
    baseWaveHeightAt(x, z, layerT, amplitude, waveScale, bottomBias, seed * 0.1);
  const rng = seededPrng(Math.floor(seed * 1000) + 2003);
  const positions: [number, number, number][] = [];
  const heightFactors: number[] = [];
  const vN = Math.min(1, Math.max(0, variance / 100));
  for (let i = 0; i < gridN; i += 1) {
    for (let j = 0; j < gridN; j += 1) {
      const x = -half + (i / (gridN - 1)) * 2 * half;
      const z = -half + (j / (gridN - 1)) * 2 * half;
      positions.push([x, wh(x, z), z]);
      // (1 - variance) is the flat baseline; variance * rand adds height jitter.
      const factor = 1 - vN + vN * rng();
      heightFactors.push(Math.max(0.18, factor));
    }
  }
  return { positions, edges: [], heightFactors };
}

function generateLatticeLayout(
  planeSize: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
): { positions: [number, number, number][]; edges: [number, number][] } {
  const half = planeSize * 0.4;
  const gridN = 6;
  const wh = (x: number, z: number) =>
    baseWaveHeightAt(x, z, layerT, amplitude, waveScale, bottomBias, seed * 0.1);
  const rng = seededPrng(Math.floor(seed * 1000) + 991);

  // Generate all grid intersections, deciding which are "real" nodes.
  const gridActive: boolean[] = [];
  const gridPos: [number, number, number][] = [];
  for (let i = 0; i < gridN; i += 1) {
    for (let j = 0; j < gridN; j += 1) {
      const x = -half + (i / (gridN - 1)) * 2 * half;
      const z = -half + (j / (gridN - 1)) * 2 * half;
      const active = rng() < 0.45;
      const baseY = wh(x, z);
      // Selected nodes rise into "coherent local peaks".
      const lift = active ? 0.18 + rng() * 0.25 : 0;
      gridPos.push([x, baseY + lift, z]);
      gridActive.push(active);
    }
  }

  // Keep only the active positions; remap indices.
  const positions: [number, number, number][] = [];
  const gridToKept: number[] = new Array(gridPos.length).fill(-1);
  for (let k = 0; k < gridPos.length; k += 1) {
    if (gridActive[k]) {
      gridToKept[k] = positions.length;
      positions.push(gridPos[k]);
    }
  }

  // Connect adjacent active grid nodes (4-neighbour + 2 diagonals).
  const edges: [number, number][] = [];
  const idxOf = (i: number, j: number) => i * gridN + j;
  const neighbours: [number, number][] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let i = 0; i < gridN; i += 1) {
    for (let j = 0; j < gridN; j += 1) {
      const a = idxOf(i, j);
      if (!gridActive[a]) continue;
      for (const [di, dj] of neighbours) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= gridN || nj >= gridN) continue;
        const b = idxOf(ni, nj);
        if (!gridActive[b]) continue;
        edges.push([gridToKept[a], gridToKept[b]]);
      }
    }
  }
  return { positions, edges };
}

function generatePlatformsLayout(
  planeSize: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
): [number, number, number][] {
  const half = planeSize * 0.35;
  const wh = (x: number, z: number) =>
    baseWaveHeightAt(x, z, layerT, amplitude, waveScale, bottomBias, seed * 0.1);
  const out: [number, number, number][] = [];
  // 0 = center
  out.push([0, wh(0, 0), 0]);
  // 1..4 = cardinal satellites (back / left / right / front)
  const r = half * 0.7;
  out.push([0, wh(0, -r), -r]);
  out.push([-r, wh(-r, 0), 0]);
  out.push([r, wh(r, 0), 0]);
  out.push([0, wh(0, r), r]);
  // 5..N = edge dots along front + back rows
  const dots = 6;
  const edgeR = half * 1.05;
  for (let i = 0; i < dots; i += 1) {
    const t = i / (dots - 1);
    const x = -half + t * 2 * half;
    out.push([x, wh(x, edgeR), edgeR]);
    out.push([x, wh(x, -edgeR), -edgeR]);
  }
  return out;
}

function generatePositions(args: {
  type: ContentType;
  count: number;
  planeSize: number;
  layerT: number;
  amplitude: number;
  waveScale: number;
  bottomBias: number;
  seed: number;
  layerIndex: number;
  contentSize: number;
  foundationDensity: number;
  foundationVariance: number;
}): ContentPositions {
  const {
    type,
    count,
    planeSize,
    layerT,
    amplitude,
    waveScale,
    bottomBias,
    seed,
    layerIndex,
    foundationDensity,
    foundationVariance,
  } = args;
  if (type === "none") return { positions: [], edges: [] };
  if (type === "data-foundation") {
    return generateFoundationLayout(
      planeSize,
      layerT,
      amplitude,
      waveScale,
      bottomBias,
      seed,
      foundationDensity,
      foundationVariance,
    );
  }
  if (type === "platforms") {
    return {
      positions: generatePlatformsLayout(
        planeSize,
        layerT,
        amplitude,
        waveScale,
        bottomBias,
        seed,
      ),
      edges: [],
    };
  }
  if (type === "lattice") {
    return generateLatticeLayout(
      planeSize,
      layerT,
      amplitude,
      waveScale,
      bottomBias,
      seed,
    );
  }
  const rng = seededPrng(Math.floor(seed * 1000) + layerIndex * 977 + 17);
  const half = planeSize * 0.42;
  const positions: [number, number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    const x = (rng() * 2 - 1) * half;
    const z = (rng() * 2 - 1) * half;
    const wy = baseWaveHeightAt(
      x,
      z,
      layerT,
      amplitude,
      waveScale,
      bottomBias,
      seed * 0.1,
    );
    positions.push([x, wy, z]);
  }

  const edges: [number, number][] = [];
  if (type === "network" && positions.length > 1) {
    // Connect each node to its two nearest neighbours.
    for (let i = 0; i < positions.length; i += 1) {
      const [ax, , az] = positions[i];
      const dists: { j: number; d: number }[] = [];
      for (let j = 0; j < positions.length; j += 1) {
        if (i === j) continue;
        const [bx, , bz] = positions[j];
        const dx = ax - bx;
        const dz = az - bz;
        dists.push({ j, d: dx * dx + dz * dz });
      }
      dists.sort((a, b) => a.d - b.d);
      const k = Math.min(2, dists.length);
      for (let n = 0; n < k; n += 1) {
        const j = dists[n].j;
        const key: [number, number] = i < j ? [i, j] : [j, i];
        if (!edges.some(([a, b]) => a === key[0] && b === key[1])) {
          edges.push(key);
        }
      }
    }
  }
  return { positions, edges };
}

const flowLineVertexShader = /* glsl */ `
  attribute float aLineT;
  varying float vT;
  void main() {
    vT = aLineT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const flowLineFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uSpeed;
  varying float vT;
  void main() {
    float phase = fract(vT * 2.5 - uTime * uSpeed * 0.5);
    float pulse = smoothstep(0.7, 0.9, phase)
                * (1.0 - smoothstep(0.9, 1.0, phase));
    float alpha = uOpacity * (0.28 + pulse * 0.9);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function buildNearestLines(
  positions: [number, number, number][],
  k: number,
) {
  if (positions.length < 2) {
    return {
      positions: new Float32Array(),
      lineT: new Float32Array(),
    };
  }
  const seen = new Set<string>();
  const pos: number[] = [];
  const t: number[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    const [ax, , az] = positions[i];
    const dists: { j: number; d: number }[] = [];
    for (let j = 0; j < positions.length; j += 1) {
      if (i === j) continue;
      const [bx, , bz] = positions[j];
      const dx = ax - bx;
      const dz = az - bz;
      dists.push({ j, d: dx * dx + dz * dz });
    }
    dists.sort((a, b) => a.d - b.d);
    const kk = Math.min(k, dists.length);
    for (let n = 0; n < kk; n += 1) {
      const j = dists[n].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const p = positions[i];
      const q = positions[j];
      pos.push(p[0], p[1], p[2], q[0], q[1], q[2]);
      t.push(0, 1);
    }
  }
  return {
    positions: new Float32Array(pos),
    lineT: new Float32Array(t),
  };
}

function FlowLines({
  positions,
  color,
  opacity,
  speed,
}: {
  positions: [number, number, number][];
  color: string;
  opacity: number;
  speed: number;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const { positions: pos, lineT } = buildNearestLines(positions, 2);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aLineT", new THREE.BufferAttribute(lineT, 1));
    return g;
  }, [positions]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color() },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uSpeed: { value: 0 },
        },
        vertexShader: flowLineVertexShader,
        fragmentShader: flowLineFragmentShader,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uOpacity.value = opacity;
    u.uSpeed.value = speed;
    u.uColor.value.set(color);
  });

  return <lineSegments geometry={geometry} material={material} />;
}

function ContentShape({
  type,
  size,
  color,
  opacity,
}: {
  type: ContentType;
  size: number;
  color: string;
  opacity: number;
}) {
  const s = Math.max(0.02, size);

  const boxEdges = useMemo(() => {
    if (type !== "cubes") return null;
    return new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s));
  }, [type, s]);
  useEffect(
    () => () => {
      if (boxEdges) boxEdges.dispose();
    },
    [boxEdges],
  );

  const tileEdges = useMemo(() => {
    if (type !== "tiles") return null;
    return new THREE.EdgesGeometry(
      new THREE.BoxGeometry(s * 1.4, s * 0.14, s * 1.4),
    );
  }, [type, s]);
  useEffect(
    () => () => {
      if (tileEdges) tileEdges.dispose();
    },
    [tileEdges],
  );

  const diskEdges = useMemo(() => {
    if (type !== "disks") return null;
    return new THREE.EdgesGeometry(
      new THREE.CylinderGeometry(s * 0.6, s * 0.6, s * 0.5, 24, 1),
    );
  }, [type, s]);
  useEffect(
    () => () => {
      if (diskEdges) diskEdges.dispose();
    },
    [diskEdges],
  );

  if (type === "dots") {
    return (
      <mesh position={[0, s * 0.4, 0]}>
        <sphereGeometry args={[s * 0.3, 10, 10]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
    );
  }

  if (type === "network") {
    return (
      <mesh position={[0, s * 0.35, 0]}>
        <sphereGeometry args={[s * 0.3, 14, 14]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
    );
  }

  if (type === "tiles" && tileEdges) {
    return (
      <group position={[0, s * 0.08, 0]}>
        <mesh>
          <boxGeometry args={[s * 1.4, s * 0.14, s * 1.4]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity * 0.18}
            toneMapped={false}
          />
        </mesh>
        <lineSegments geometry={tileEdges}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      </group>
    );
  }

  if (type === "cubes" && boxEdges) {
    return (
      <group position={[0, s * 0.5, 0]}>
        <mesh>
          <boxGeometry args={[s, s, s]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity * 0.14}
            toneMapped={false}
          />
        </mesh>
        <lineSegments geometry={boxEdges}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      </group>
    );
  }

  if (type === "disks" && diskEdges) {
    return (
      <group position={[0, s * 0.25, 0]}>
        <mesh>
          <cylinderGeometry args={[s * 0.6, s * 0.6, s * 0.5, 24, 1]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity * 0.14}
            toneMapped={false}
          />
        </mesh>
        <lineSegments geometry={diskEdges}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
        <mesh position={[0, s * 0.25 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[s * 0.2, s * 0.28, 24]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity * 0.7}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    );
  }

  return null;
}

function ConcentricPlatform({
  size,
  rings,
  color,
  opacity,
  nodeScale,
}: {
  size: number;
  rings: number[];
  color: string;
  opacity: number;
  nodeScale: number;
}) {
  const ringGeoms = useMemo(
    () =>
      rings.map(
        (r) =>
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(size * r, size * r)),
      ),
    [size, rings],
  );
  useEffect(
    () => () => ringGeoms.forEach((g) => g.dispose()),
    [ringGeoms],
  );

  const baseEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size * 0.08, size)),
    [size],
  );
  useEffect(() => () => baseEdges.dispose(), [baseEdges]);

  return (
    <group>
      {/* Base tile — subtle fill + crisp edge outline */}
      <mesh position={[0, size * 0.04, 0]}>
        <boxGeometry args={[size, size * 0.08, size]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.12}
          toneMapped={false}
        />
      </mesh>
      <lineSegments geometry={baseEdges} position={[0, size * 0.04, 0]}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      {/* Nested square outlines above the tile */}
      {ringGeoms.map((g, i) => (
        <lineSegments
          key={i}
          geometry={g}
          position={[0, size * 0.09 + i * size * 0.008, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <lineBasicMaterial
            color={color}
            transparent
            opacity={opacity * (0.45 + i * 0.18)}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      ))}
      {/* Central sphere node — inner solid + outer soft glow so it reads clearly */}
      <mesh position={[0, size * 0.18, 0]}>
        <sphereGeometry args={[size * 0.11 * nodeScale, 18, 18]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, size * 0.18, 0]}>
        <sphereGeometry args={[size * 0.22 * nodeScale, 18, 18]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.22}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function SatellitePlatform({
  size,
  color,
  opacity,
  nodeScale,
}: {
  size: number;
  color: string;
  opacity: number;
  nodeScale: number;
}) {
  const baseEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size * 0.08, size)),
    [size],
  );
  useEffect(() => () => baseEdges.dispose(), [baseEdges]);
  return (
    <group>
      <mesh position={[0, size * 0.04, 0]}>
        <boxGeometry args={[size, size * 0.08, size]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.14}
          toneMapped={false}
        />
      </mesh>
      <lineSegments geometry={baseEdges} position={[0, size * 0.04, 0]}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      <mesh position={[0, size * 0.16, 0]}>
        <sphereGeometry args={[size * 0.1 * nodeScale, 14, 14]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, size * 0.16, 0]}>
        <sphereGeometry args={[size * 0.2 * nodeScale, 14, 14]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.22}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function EdgeDot({
  size,
  color,
  opacity,
}: {
  size: number;
  color: string;
  opacity: number;
}) {
  return (
    <mesh position={[0, size * 0.5, 0]}>
      <sphereGeometry args={[size * 0.28, 10, 10]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity * 0.85}
        toneMapped={false}
      />
    </mesh>
  );
}

function LayerContent({
  type,
  positions,
  edges,
  heightFactors,
  layerY,
  color,
  size,
  opacity,
  connect,
  flowSpeed,
  bob,
  layerIndex,
  sharedUniforms,
  platformColor,
  platformScale,
  platformHeight,
  platformNodeSize,
  foundationColor,
  foundationBlockSize,
  foundationMaxHeight,
}: {
  type: ContentType;
  positions: [number, number, number][];
  edges: [number, number][];
  heightFactors?: number[];
  layerY: number;
  color: string;
  size: number;
  opacity: number;
  connect: boolean;
  flowSpeed: number;
  bob: number;
  layerIndex: number;
  sharedUniforms: LayerUniforms;
  platformColor: string;
  platformScale: number;
  platformHeight: number;
  platformNodeSize: number;
  foundationColor: string;
  foundationBlockSize: number;
  foundationMaxHeight: number;
}) {
  const foundationBoxGeom = useMemo(
    () => (type === "data-foundation" ? new THREE.BoxGeometry(1, 1, 1) : null),
    [type],
  );
  const foundationEdgesGeom = useMemo(
    () =>
      type === "data-foundation"
        ? new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
        : null,
    [type],
  );
  useEffect(
    () => () => {
      foundationBoxGeom?.dispose();
      foundationEdgesGeom?.dispose();
    },
    [foundationBoxGeom, foundationEdgesGeom],
  );
  const latticeEdgeGeom = useMemo(() => {
    if (type !== "lattice" || edges.length === 0 || positions.length === 0) {
      return null;
    }
    const verts: number[] = [];
    for (const [a, b] of edges) {
      const p = positions[a];
      const q = positions[b];
      if (!p || !q) continue;
      verts.push(p[0], p[1], p[2], q[0], q[1], q[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(verts), 3),
    );
    return g;
  }, [type, edges, positions]);
  useEffect(
    () => () => {
      if (latticeEdgeGeom) latticeEdgeGeom.dispose();
    },
    [latticeEdgeGeom],
  );
  const groupRefs = useRef<(THREE.Group | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const bobAmp = (bob / 100) * size * 0.6;
    const rotAmp = (bob / 100) * 0.6;
    const cursor = sharedUniforms.uCursor.value;
    const active = sharedUniforms.uActive.value;
    const radius = sharedUniforms.uRadius.value;
    const vReach = sharedUniforms.uVerticalReach.value;
    const strength = sharedUniforms.uStrength.value;
    const rotates =
      type === "cubes" ||
      type === "tiles" ||
      type === "disks" ||
      type === "platforms";
    for (let i = 0; i < positions.length; i += 1) {
      const g = groupRefs.current[i];
      if (!g) continue;
      const [px, py, pz] = positions[i];
      // Same anisotropic cursor gaussian the mesh shader uses.
      const dx = px - cursor.x;
      const dz = pz - cursor.z;
      const dh2 = dx * dx + dz * dz;
      const worldY = layerY + py;
      const dv = worldY - cursor.y;
      const bump =
        Math.exp(-dh2 / (radius * radius) - (dv * dv) / (vReach * vReach)) *
        strength *
        active;
      const phase = i * 0.73 + layerIndex * 1.31;
      const bobOffset = bob > 0 ? Math.sin(t * 0.9 + phase) * bobAmp : 0;
      g.position.y = py + bump + bobOffset;
      if (rotates) {
        // Platforms rotate very gently — center more than satellites.
        const rateBase = type === "platforms" ? 0.08 : 0.15;
        g.rotation.y = t * rateBase * rotAmp + phase;
      }
    }
  });

  if (type === "none" || positions.length === 0) return null;

  if (type === "data-foundation" && foundationBoxGeom && foundationEdgesGeom) {
    const fColor = foundationColor || color;
    const bs = (foundationBlockSize / 100) * size * 2.4;
    const maxH = (foundationMaxHeight / 100) * size * 4;
    return (
      <group position={[0, layerY, 0]}>
        {positions.map((p, i) => {
          const factor = heightFactors?.[i] ?? 0.5;
          const h = Math.max(0.02, maxH * factor);
          return (
            <group
              key={i}
              ref={(el) => {
                groupRefs.current[i] = el;
              }}
              position={p}
            >
              <mesh
                geometry={foundationBoxGeom}
                position={[0, h / 2, 0]}
                scale={[bs, h, bs]}
              >
                <meshBasicMaterial
                  color={fColor}
                  transparent
                  opacity={opacity * 0.16}
                  toneMapped={false}
                />
              </mesh>
              <lineSegments
                geometry={foundationEdgesGeom}
                position={[0, h / 2, 0]}
                scale={[bs, h, bs]}
              >
                <lineBasicMaterial
                  color={fColor}
                  transparent
                  opacity={opacity}
                  depthWrite={false}
                  toneMapped={false}
                />
              </lineSegments>
            </group>
          );
        })}
      </group>
    );
  }

  if (type === "lattice") {
    return (
      <group position={[0, layerY, 0]}>
        {positions.map((p, i) => (
          <group
            key={i}
            ref={(el) => {
              groupRefs.current[i] = el;
            }}
            position={p}
          >
            {/* Ivory node — inner solid + subtle glow so junctions read clearly */}
            <mesh>
              <sphereGeometry args={[size * 0.22, 12, 12]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={opacity}
                toneMapped={false}
              />
            </mesh>
            <mesh>
              <sphereGeometry args={[size * 0.4, 12, 12]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={opacity * 0.18}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </group>
        ))}
        {latticeEdgeGeom && (
          <lineSegments geometry={latticeEdgeGeom}>
            <lineBasicMaterial
              color={color}
              transparent
              opacity={opacity * 0.75}
              depthWrite={false}
              toneMapped={false}
            />
          </lineSegments>
        )}
      </group>
    );
  }

  if (type === "platforms") {
    const pColor = platformColor || color;
    const pScale = platformScale / 100;
    const nodeScale = platformNodeSize / 100;
    const lift = (platformHeight / 100) * size * 3;
    // Lifted positions — platforms sit above the mesh surface by `lift`.
    const liftedPositions = positions.map(
      ([x, y, z]) => [x, y + lift, z] as [number, number, number],
    );
    return (
      <group position={[0, layerY, 0]}>
        {liftedPositions.map((p, i) => {
          const shape =
            i === 0 ? (
              <ConcentricPlatform
                size={size * 3.6 * pScale}
                rings={[1, 0.72, 0.48, 0.28]}
                color={pColor}
                opacity={opacity}
                nodeScale={nodeScale}
              />
            ) : i < 5 ? (
              <SatellitePlatform
                size={size * 1.6 * pScale}
                color={pColor}
                opacity={opacity}
                nodeScale={nodeScale}
              />
            ) : (
              <EdgeDot
                size={size * 0.55 * pScale}
                color={pColor}
                opacity={opacity}
              />
            );
          return (
            <group
              key={i}
              ref={(el) => {
                groupRefs.current[i] = el;
              }}
              position={p}
            >
              {shape}
            </group>
          );
        })}
        {connect && liftedPositions.length >= 5 && (
          <FlowLines
            positions={liftedPositions.slice(0, 5)}
            color={pColor}
            opacity={opacity * 0.55}
            speed={flowSpeed / 30}
          />
        )}
      </group>
    );
  }

  // Flow lines connect only lighter content types visually.
  const showLines =
    connect && (type === "dots" || type === "tiles" || type === "network");

  return (
    <group position={[0, layerY, 0]}>
      {positions.map((p, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
          position={p}
        >
          <ContentShape
            type={type}
            size={size}
            color={color}
            opacity={opacity}
          />
        </group>
      ))}
      {showLines && (
        <FlowLines
          positions={positions}
          color={color}
          opacity={opacity * 0.75}
          speed={flowSpeed / 30}
        />
      )}
    </group>
  );
}

const layerVertexShader = /* glsl */ `
  uniform vec3 uCursor;
  uniform float uActive;
  uniform float uRadius;
  uniform float uVerticalReach;
  uniform float uStrength;
  uniform float uTime;
  uniform float uSeed;
  uniform float uIdleAmp;
  uniform float uIdleScale;
  uniform float uIdleSpeed;
  uniform float uLayerT;
  uniform float uLayerY;

  attribute vec3 color;
  varying vec3 vColor;

  void main() {
    vec3 p = position;

    // Cursor bump — anisotropic 3D gaussian. Horizontal (XZ) reach controls
    // spread, vertical (Y) reach controls how many layers feel it.
    // Vertex world-Y = uLayerY (layer offset) + p.y (CPU wave contribution).
    float vertexWorldY = uLayerY + p.y;
    vec2 diffXZ = p.xz - uCursor.xz;
    float dh = length(diffXZ);
    float dv = vertexWorldY - uCursor.y;
    float sh = max(uRadius, 0.0001);
    float sv = max(uVerticalReach, 0.0001);
    float bump = exp(-(dh * dh) / (sh * sh) - (dv * dv) / (sv * sv))
               * uStrength * uActive;

    // Idle seed-driven motion. Amplitude scales with layer position — top
    // barely moves, bottom breathes strongly.
    float t = uTime * uIdleSpeed;
    float s = uIdleScale;
    float ph = uSeed;
    float idle =
        sin(p.x * s * 0.9 + t + ph * 1.1)
      * cos(p.z * s * 0.75 - t * 0.7 + ph) * 0.55
      + sin(p.x * s * 1.7 + p.z * s * 1.3 + t * 1.4 + ph * 1.7) * 0.28
      + sin(length(p.xz) * s * 0.6 - t * 1.2 + ph * 0.6) * 0.32;
    idle *= uIdleAmp * pow(clamp(uLayerT, 0.0, 1.0), 1.3);

    p.y += bump + idle;
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const layerFragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    // Scale down before additive blend so stacked overlapping lines stay
    // within the tone-map shoulder instead of clipping to white.
    gl_FragColor = vec4(vColor * 0.55, uOpacity);
  }
`;

/** Uniforms shared by every layer material — one instance per scene. */
export type LayerUniforms = {
  uCursor: { value: THREE.Vector3 };
  uActive: { value: number };
  uRadius: { value: number };
  uVerticalReach: { value: number };
  uStrength: { value: number };
  uTime: { value: number };
  uSeed: { value: number };
  uIdleAmp: { value: number };
  uIdleScale: { value: number };
  uIdleSpeed: { value: number };
  uOpacity: { value: number };
};


function buildLayerHeight(
  size: number,
  segments: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
) {
  const bias = Math.pow(layerT, 1.6);
  const topAmp = 0.05;
  const bottomAmp = 0.15 + (bottomBias / 100) * 1.45;
  const scale = topAmp + bias * (bottomAmp - topAmp);
  const amp = (amplitude / 100) * scale;
  const s = 0.08 + waveScale * 0.008;
  const half = size / 2;
  const step = size / segments;
  const grid: number[][] = [];
  for (let j = 0; j <= segments; j += 1) {
    const z = -half + j * step;
    const row: number[] = [];
    for (let i = 0; i <= segments; i += 1) {
      const x = -half + i * step;
      const w =
        Math.sin(x * s + seed) * Math.cos(z * s * 0.9 + seed * 1.7) * 0.55 +
        Math.sin(x * s * 1.6 + z * s * 1.2 + seed * 2.3) * 0.28 +
        Math.sin(Math.sqrt(x * x + z * z) * s * 0.85 - seed * 0.5) * 0.32;
      row.push(w * amp);
    }
    grid.push(row);
  }
  return grid;
}

function colorAt(
  x: number,
  z: number,
  size: number,
  layerT: number,
  gold: THREE.Color,
  core: THREE.Color,
  edge: THREE.Color,
) {
  const halfDiag = (size / 2) * Math.SQRT2;
  const r = Math.min(1, Math.sqrt(x * x + z * z) / halfDiag);
  const bottomWeight = Math.pow(layerT, 1.6);
  const pool = Math.max(0, 1 - Math.pow(r / 0.7, 1.4)) * bottomWeight;
  const rim = Math.pow(r, 1.2);
  const base = edge.clone().lerp(gold, 1 - rim * 0.35);
  return base.lerp(core, Math.min(1, pool * 1.15));
}

type LayerGeom = {
  y: number;
  positions: Float32Array;
  colors: Float32Array;
};

function buildLayer(
  size: number,
  segments: number,
  y: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
  meshColor: string,
  coreColor: string,
  edgeColor: string,
): LayerGeom {
  const heights = buildLayerHeight(
    size,
    segments,
    layerT,
    amplitude,
    waveScale,
    bottomBias,
    seed,
  );
  const half = size / 2;
  const step = size / segments;

  const gold = new THREE.Color(meshColor);
  const core = new THREE.Color(coreColor);
  const edge = new THREE.Color(edgeColor);

  const segCount = segments * (segments + 1) * 2;
  const positions = new Float32Array(segCount * 2 * 3);
  const colors = new Float32Array(segCount * 2 * 3);
  let p = 0;
  let c = 0;

  const pushVertex = (x: number, yy: number, z: number, col: THREE.Color) => {
    positions[p++] = x;
    positions[p++] = yy;
    positions[p++] = z;
    colors[c++] = col.r;
    colors[c++] = col.g;
    colors[c++] = col.b;
  };

  for (let j = 0; j <= segments; j += 1) {
    const z = -half + j * step;
    for (let i = 0; i < segments; i += 1) {
      const x1 = -half + i * step;
      const x2 = -half + (i + 1) * step;
      const y1 = heights[j][i];
      const y2 = heights[j][i + 1];
      pushVertex(x1, y1, z, colorAt(x1, z, size, layerT, gold, core, edge));
      pushVertex(x2, y2, z, colorAt(x2, z, size, layerT, gold, core, edge));
    }
  }
  for (let i = 0; i <= segments; i += 1) {
    const x = -half + i * step;
    for (let j = 0; j < segments; j += 1) {
      const z1 = -half + j * step;
      const z2 = -half + (j + 1) * step;
      const y1 = heights[j][i];
      const y2 = heights[j + 1][i];
      pushVertex(x, y1, z1, colorAt(x, z1, size, layerT, gold, core, edge));
      pushVertex(x, y2, z2, colorAt(x, z2, size, layerT, gold, core, edge));
    }
  }

  return { y, positions, colors };
}

function WireLayer({
  layer,
  layerT,
  sharedUniforms,
}: {
  layer: LayerGeom;
  layerT: number;
  sharedUniforms: LayerUniforms;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(layer.positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(layer.colors, 3));
    return g;
  }, [layer]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        ...sharedUniforms,
        uLayerT: { value: layerT },
        uLayerY: { value: layer.y },
      },
      vertexShader: layerVertexShader,
      fragmentShader: layerFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: true,
    });
  }, [sharedUniforms, layerT, layer.y]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <lineSegments
      position={[0, layer.y, 0]}
      geometry={geometry}
      material={material}
    />
  );
}

function buildFrameGeometry(
  shape: FrameShape,
  size: number,
  height: number,
): THREE.BufferGeometry | null {
  const r = size / 2;
  const h = height / 2;
  switch (shape) {
    case "none":
      return null;
    case "cube":
      return new THREE.EdgesGeometry(
        new THREE.BoxGeometry(size, height, size),
      );
    case "hex":
    case "oct": {
      const sides = shape === "hex" ? 6 : 8;
      const g = new THREE.BufferGeometry();
      const verts: number[] = [];
      for (let i = 0; i < sides; i += 1) {
        const a1 = (i / sides) * Math.PI * 2;
        const a2 = ((i + 1) / sides) * Math.PI * 2;
        const x1 = Math.cos(a1) * r;
        const z1 = Math.sin(a1) * r;
        const x2 = Math.cos(a2) * r;
        const z2 = Math.sin(a2) * r;
        // top ring segment
        verts.push(x1, h, z1, x2, h, z2);
        // bottom ring segment
        verts.push(x1, -h, z1, x2, -h, z2);
        // vertical edge
        verts.push(x1, -h, z1, x1, h, z1);
      }
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(verts), 3),
      );
      return g;
    }
    case "cylinder": {
      const sides = 48;
      const uprights = 12;
      const g = new THREE.BufferGeometry();
      const verts: number[] = [];
      for (let i = 0; i < sides; i += 1) {
        const a1 = (i / sides) * Math.PI * 2;
        const a2 = ((i + 1) / sides) * Math.PI * 2;
        const x1 = Math.cos(a1) * r;
        const z1 = Math.sin(a1) * r;
        const x2 = Math.cos(a2) * r;
        const z2 = Math.sin(a2) * r;
        verts.push(x1, h, z1, x2, h, z2);
        verts.push(x1, -h, z1, x2, -h, z2);
      }
      for (let i = 0; i < uprights; i += 1) {
        const a = (i / uprights) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        verts.push(x, -h, z, x, h, z);
      }
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(verts), 3),
      );
      return g;
    }
    case "pillars": {
      const g = new THREE.BufferGeometry();
      const verts = new Float32Array([
        -r, -h, -r, -r, h, -r,
        r, -h, -r, r, h, -r,
        -r, -h, r, -r, h, r,
        r, -h, r, r, h, r,
      ]);
      g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
      return g;
    }
    case "rings": {
      const g = new THREE.BufferGeometry();
      const verts: number[] = [];
      const ring = (y: number) => {
        verts.push(-r, y, -r, r, y, -r);
        verts.push(r, y, -r, r, y, r);
        verts.push(r, y, r, -r, y, r);
        verts.push(-r, y, r, -r, y, -r);
      };
      ring(-h);
      ring(h);
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(verts), 3),
      );
      return g;
    }
  }
}

function buildFrameSideGrid(
  size: number,
  height: number,
  resolution: number,
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const verts: number[] = [];
  const n = Math.max(1, Math.round(resolution));
  const w = size / 2;
  const h = height / 2;
  const stepXZ = size / n;
  const stepY = height / n;

  // Two faces perpendicular to Z (front/back at z = ±w)
  for (const z of [-w, w]) {
    for (let i = 1; i < n; i += 1) {
      const x = -w + i * stepXZ;
      verts.push(x, -h, z, x, h, z);
    }
    for (let j = 1; j < n; j += 1) {
      const y = -h + j * stepY;
      verts.push(-w, y, z, w, y, z);
    }
  }
  // Two faces perpendicular to X (left/right at x = ±w)
  for (const x of [-w, w]) {
    for (let i = 1; i < n; i += 1) {
      const z = -w + i * stepXZ;
      verts.push(x, -h, z, x, h, z);
    }
    for (let j = 1; j < n; j += 1) {
      const y = -h + j * stepY;
      verts.push(x, y, -w, x, y, w);
    }
  }
  // Two faces perpendicular to Y (top/bottom at y = ±h)
  for (const y of [-h, h]) {
    for (let i = 1; i < n; i += 1) {
      const x = -w + i * stepXZ;
      verts.push(x, y, -w, x, y, w);
    }
    for (let j = 1; j < n; j += 1) {
      const z = -w + j * stepXZ;
      verts.push(-w, y, z, w, y, z);
    }
  }

  g.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(verts), 3),
  );
  return g;
}

function FrameSideGrid({
  size,
  height,
  resolution,
  color,
  opacity,
}: {
  size: number;
  height: number;
  resolution: number;
  color: string;
  opacity: number;
}) {
  const geometry = useMemo(
    () => buildFrameSideGrid(size, height, resolution),
    [size, height, resolution],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function FrameEdges({
  shape,
  size,
  height,
  color,
  opacity,
}: {
  shape: FrameShape;
  size: number;
  height: number;
  color: string;
  opacity: number;
}) {
  const geometry = useMemo(
    () => buildFrameGeometry(shape, size, height),
    [shape, size, height],
  );
  useEffect(
    () => () => {
      if (geometry) geometry.dispose();
    },
    [geometry],
  );
  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

export function MeshStrataScene({ settings }: { settings: StrataSettings }) {
  const {
    layerCount,
    layerGaps,
    layerColors,
    layerContent,
    contentDensity,
    contentSize,
    contentOpacity,
    contentConnect,
    contentFlowSpeed,
    contentBob,
    platformColor,
    platformScale,
    platformHeight,
    platformNodeSize,
    foundationColor,
    foundationBlockSize,
    foundationMaxHeight,
    foundationVariance,
    foundationDensity,
    planeSize,
    segments,
    amplitude,
    waveScale,
    randomAmplitude,
    bottomBias,
    seed,
    meshColor,
    coreColor,
    edgeColor,
    frameColor,
    frameShape,
    framePadding,
    frameOpacity,
    frameGridEnabled,
    frameGridResolution,
    frameGridColor,
    frameGridOpacity,
    layerBlur,
    blurFocus,
    blurRange,
    lineOpacity,
    bloomIntensity,
    bloomThreshold,
    bloomSmoothing,
    vignette,
    cursorRadius,
    cursorStrength,
    cursorFluidity,
    cursorReturnSpeed,
    cursorVerticalReach,
    idleAmplitude,
    idleScale,
    idleSpeed,
  } = settings;

  // Cumulative Y positions from per-gap spacing, centered at 0.
  const { yPositions, totalHeight } = useMemo(() => {
    const gaps = layerGaps.slice(0, Math.max(0, layerCount - 1)).map(
      (g) => g * 0.03,
    );
    const ys: number[] = [0];
    for (let i = 1; i < layerCount; i += 1) {
      ys.push(ys[i - 1] - gaps[i - 1]);
    }
    const top = ys[0] ?? 0;
    const bottom = ys[layerCount - 1] ?? 0;
    const height = top - bottom;
    const shift = -(top + bottom) / 2;
    return {
      yPositions: ys.map((y) => y + shift),
      totalHeight: height,
    };
  }, [layerCount, layerGaps]);

  const layers = useMemo<LayerGeom[]>(() => {
    const out: LayerGeom[] = [];
    const rand = (i: number) => {
      const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let i = 0; i < layerCount; i += 1) {
      const t = layerCount === 1 ? 0 : i / (layerCount - 1);
      const base = layerColors[i] || meshColor;
      // Random amplitude uses a stable seeded PRNG so the same seed value gives
      // the same distribution; range is 40% – 110% of the global amplitude.
      const amp = randomAmplitude
        ? amplitude * (0.4 + rand(i) * 0.7)
        : amplitude;
      out.push(
        buildLayer(
          planeSize,
          Math.max(4, Math.round(segments)),
          yPositions[i],
          t,
          amp,
          waveScale,
          bottomBias,
          seed * 0.1,
          base,
          coreColor,
          edgeColor,
        ),
      );
    }
    return out;
  }, [
    layerCount,
    yPositions,
    planeSize,
    segments,
    amplitude,
    waveScale,
    randomAmplitude,
    bottomBias,
    seed,
    meshColor,
    layerColors,
    coreColor,
    edgeColor,
  ]);

  const contentByLayer = useMemo(() => {
    const rand = (i: number) => {
      const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: layerCount }, (_, i) => {
      const t = layerCount === 1 ? 0 : i / (layerCount - 1);
      const perLayerAmp = randomAmplitude
        ? amplitude * (0.4 + rand(i) * 0.7)
        : amplitude;
      return generatePositions({
        type: (layerContent[i] ?? "none") as ContentType,
        count: Math.max(0, Math.round(contentDensity)),
        planeSize,
        layerT: t,
        amplitude: perLayerAmp,
        waveScale,
        bottomBias,
        seed,
        layerIndex: i,
        contentSize,
        foundationDensity,
        foundationVariance,
      });
    });
  }, [
    layerCount,
    layerContent,
    contentDensity,
    contentSize,
    planeSize,
    amplitude,
    randomAmplitude,
    waveScale,
    bottomBias,
    seed,
    foundationDensity,
    foundationVariance,
  ]);

  // Auto-fit the frame's vertical padding to the realistic static wave peak
  // per layer. Cursor bump is transient AND vertically-localized, so it
  // doesn't inflate the frame; idle motion contributes a small fraction.
  const dynamicPad = useMemo(() => {
    let peak = 0;
    // Use the largest possible random layer amplitude so the frame accommodates
    // any seeded roll; otherwise use the flat global amplitude.
    const maxLayerAmp = randomAmplitude ? amplitude * 1.1 : amplitude;
    for (let i = 0; i < layerCount; i += 1) {
      const t = layerCount === 1 ? 0 : i / (layerCount - 1);
      const bias = Math.pow(t, 1.6);
      const bottomAmp = 0.15 + (bottomBias / 100) * 1.45;
      const scale = 0.05 + bias * (bottomAmp - 0.05);
      const baseAmp = (maxLayerAmp / 100) * scale;
      // 0.85 = realistic peak factor (sinusoids rarely all align).
      const baseDisp = baseAmp * 0.85;
      const idleDisp =
        (idleAmplitude / 100) * 0.9 * 0.6 * Math.pow(t, 1.3);
      peak = Math.max(peak, baseDisp + idleDisp);
    }
    return peak;
  }, [
    layerCount,
    amplitude,
    randomAmplitude,
    bottomBias,
    idleAmplitude,
  ]);

  const framePad = framePadding * 0.03;
  const frameSize = planeSize + framePad * 2;
  const frameHeight = totalHeight + framePad * 2 + dynamicPad * 2;

  // Shared shader uniforms driven by useFrame; all layer materials share
  // the same Vector2/number wrappers by reference.
  const sharedUniforms = useMemo<LayerUniforms>(
    () => ({
      uCursor: { value: new THREE.Vector3(0, 0, 0) },
      uActive: { value: 0 },
      uRadius: { value: cursorRadius },
      uVerticalReach: { value: cursorVerticalReach * 0.03 },
      uStrength: { value: cursorStrength },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uIdleAmp: { value: 0 },
      uIdleScale: { value: 0.6 },
      uIdleSpeed: { value: 0.4 },
      uOpacity: { value: lineOpacity / 100 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const cursorTarget = useRef(new THREE.Vector3(0, 0, 0));
  const cursorSmoothed = useRef(new THREE.Vector3(0, 0, 0));
  const activeTarget = useRef(0);
  const activeSmoothed = useRef(0);
  const pointerPlaneRef = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);

  useFrame((state, delta) => {
    // Orient the invisible pointer-capture plane to always face the camera,
    // so hovering "at a layer" in screen space actually lands cursor.y at
    // that visual height in world space.
    const plane = pointerPlaneRef.current;
    if (plane) plane.lookAt(camera.position);

    const fluid = Math.min(0.999, Math.max(0, cursorFluidity / 100));
    const followTau = 0.05 + fluid * 0.9;
    const followK = 1 - Math.exp(-delta / followTau);
    cursorSmoothed.current.lerp(cursorTarget.current, followK);

    const activeTau = 0.05 + Math.max(0, 1 - cursorReturnSpeed / 100) * 1.2;
    const activeK = 1 - Math.exp(-delta / activeTau);
    activeSmoothed.current +=
      (activeTarget.current - activeSmoothed.current) * activeK;

    sharedUniforms.uCursor.value.copy(cursorSmoothed.current);
    sharedUniforms.uActive.value = activeSmoothed.current;
    sharedUniforms.uTime.value = state.clock.elapsedTime;
    sharedUniforms.uRadius.value = cursorRadius;
    sharedUniforms.uVerticalReach.value = Math.max(
      0.05,
      cursorVerticalReach * 0.03,
    );
    sharedUniforms.uStrength.value = cursorStrength;
    sharedUniforms.uSeed.value = seed * 0.13;
    sharedUniforms.uIdleAmp.value = (idleAmplitude / 100) * 0.9;
    sharedUniforms.uIdleScale.value = 0.15 + (idleScale / 100) * 1.4;
    sharedUniforms.uIdleSpeed.value = (idleSpeed / 100) * 1.6;
    sharedUniforms.uOpacity.value = lineOpacity / 100;
  });

  const onCursorMove = (e: ThreeEvent<PointerEvent>) => {
    cursorTarget.current.set(e.point.x, e.point.y, e.point.z);
    activeTarget.current = 1;
  };
  const onCursorLeave = () => {
    activeTarget.current = 0;
  };

  // Camera-facing invisible plane covering the stack visually.
  const pointerPlaneSize = Math.max(planeSize, frameSize) * 3;

  return (
    <>
      <group>
        {layers.map((layer, idx) => {
          const t = layerCount === 1 ? 0 : idx / (layerCount - 1);
          const content = contentByLayer[idx];
          const contentType = (layerContent[idx] ?? "none") as ContentType;
          const contentColor = layerColors[idx] || meshColor;
          return (
            <group key={idx}>
              <WireLayer
                layer={layer}
                layerT={t}
                sharedUniforms={sharedUniforms}
              />
              {content && content.positions.length > 0 && (
                <LayerContent
                  type={contentType}
                  positions={content.positions}
                  edges={content.edges}
                  heightFactors={content.heightFactors}
                  layerY={layer.y}
                  color={contentColor}
                  size={contentSize * 0.008}
                  opacity={contentOpacity / 100}
                  connect={contentConnect}
                  flowSpeed={contentFlowSpeed}
                  bob={contentBob}
                  layerIndex={idx}
                  sharedUniforms={sharedUniforms}
                  platformColor={platformColor}
                  platformScale={platformScale}
                  platformHeight={platformHeight}
                  platformNodeSize={platformNodeSize}
                  foundationColor={foundationColor}
                  foundationBlockSize={foundationBlockSize}
                  foundationMaxHeight={foundationMaxHeight}
                />
              )}
            </group>
          );
        })}
        <FrameEdges
          shape={frameShape}
          size={frameSize}
          height={frameHeight}
          color={frameColor}
          opacity={frameOpacity / 100}
        />
        {frameGridEnabled && (
          <FrameSideGrid
            size={frameSize}
            height={frameHeight}
            resolution={frameGridResolution}
            color={frameGridColor}
            opacity={frameGridOpacity / 100}
          />
        )}

        <mesh
          ref={pointerPlaneRef}
          onPointerMove={onCursorMove}
          onPointerLeave={onCursorLeave}
        >
          <planeGeometry args={[pointerPlaneSize, pointerPlaneSize]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {(layerBlur > 0 || bloomIntensity > 0 || vignette > 0) && (
        <EffectComposer>
          {layerBlur > 0 ? (
            <DepthOfField
              focusDistance={blurFocus / 100}
              focalLength={blurRange / 200}
              bokehScale={(layerBlur / 100) * 6}
            />
          ) : (
            <></>
          )}
          {bloomIntensity > 0 ? (
            <Bloom
              intensity={bloomIntensity / 40}
              luminanceThreshold={bloomThreshold / 100}
              luminanceSmoothing={bloomSmoothing / 100}
              mipmapBlur
            />
          ) : (
            <></>
          )}
          {vignette > 0 ? (
            <Vignette eskil={false} offset={0.2} darkness={vignette / 100} />
          ) : (
            <></>
          )}
        </EffectComposer>
      )}
    </>
  );
}
