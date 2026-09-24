"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CameraShake,
  Cloud,
  Clouds,
  Edges,
  Html,
  QuadraticBezierLine,
  Stars,
} from "@react-three/drei";
import {
  Bloom,
  EffectComposer,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import * as THREE from "three";
import type { ExplorerSettings, LayerId } from "./defaults";
import { kindLabels } from "./defaults";
import type { OntologyEdge, OntologyNode } from "./fixture";

const LAYER_HEIGHT: Record<LayerId, number> = {
  sources: -9.5,
  structure: -6,
  meaning: -1.8,
  knowledge: 1.6,
  agents: 4.4,
  outputs: 7.2,
};

const LAYER_ORDER: LayerId[] = [
  "sources",
  "structure",
  "meaning",
  "knowledge",
  "agents",
  "outputs",
];

const LAYER_LABEL: Record<LayerId, string> = {
  sources: "SOURCES",
  structure: "STRUCTURE",
  meaning: "MEANING",
  knowledge: "KNOWLEDGE",
  agents: "AGENTS",
  outputs: "OUTPUTS",
};

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1)
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function applyOrganizedLayout(nodes: OntologyNode[]): OntologyNode[] {
  const byLayer: Record<LayerId, OntologyNode[]> = {
    sources: [],
    structure: [],
    meaning: [],
    knowledge: [],
    agents: [],
    outputs: [],
  };
  for (const n of nodes) byLayer[n.layer].push(n);

  const result: OntologyNode[] = [];
  for (const layer of LAYER_ORDER) {
    const list = byLayer[layer];
    const count = list.length;
    const columns = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(count))));
    const rows = Math.ceil(count / columns);
    const spacingX = 3.4;
    const spacingZ = 2.4;
    list.forEach((n, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = (col - (columns - 1) / 2) * spacingX;
      const z = (row - (rows - 1) / 2) * spacingZ;
      result.push({
        ...n,
        position: [x, LAYER_HEIGHT[layer], z],
      });
    });
  }
  return result;
}

function CentralSpine({
  visibleLayers,
  nodeCountByLayer,
}: {
  visibleLayers: LayerId[];
  nodeCountByLayer: Record<LayerId, number>;
}) {
  const yValues = visibleLayers.map((l) => LAYER_HEIGHT[l]);
  const yMin = Math.min(...yValues, -8);
  const yMax = Math.max(...yValues, 9);

  const spineGeom = useMemo(() => {
    const positions: number[] = [];
    positions.push(0, yMin - 1.5, 0, 0, yMax + 1.5, 0);
    for (const l of visibleLayers) {
      const y = LAYER_HEIGHT[l];
      positions.push(-0.35, y, 0, 0.35, y, 0);
      positions.push(0, y, -0.35, 0, y, 0.35);
    }
    for (let y = Math.floor(yMin); y <= Math.ceil(yMax); y += 1) {
      positions.push(-0.1, y, 0, 0.1, y, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    return g;
  }, [visibleLayers, yMin, yMax]);

  return (
    <group>
      <lineSegments geometry={spineGeom}>
        <lineBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.28}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      {visibleLayers.map((l, i) => {
        const y = LAYER_HEIGHT[l];
        const code = "Z" + String(i + 1).padStart(2, "0");
        const count = String(nodeCountByLayer[l] ?? 0).padStart(2, "0");
        return (
          <Html
            key={l}
            center
            distanceFactor={22}
            position={[-1.4, y, 0]}
            zIndexRange={[5, 0]}
            style={{
              pointerEvents: "none",
              fontFamily:
                "var(--font-geist-mono), ui-monospace, monospace",
              fontSize: "8.5px",
              fontWeight: 500,
              letterSpacing: "0.16em",
              color: "rgba(255,255,255,0.55)",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              transform: "translate(-100%, -50%)",
              textAlign: "right",
              lineHeight: 1.2,
            }}
          >
            <div>{code}</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.85em" }}>
              N{count}
            </div>
          </Html>
        );
      })}
    </group>
  );
}

function SlabGrid({ layer }: { layer: LayerId }) {
  const y = LAYER_HEIGHT[layer];
  const width = 22;
  const depth = 10;
  const cellsX = 12;
  const cellsZ = 6;

  const geom = useMemo(() => {
    const positions: number[] = [];
    for (let i = 0; i <= cellsX; i += 1) {
      const x = -width / 2 + (i / cellsX) * width;
      positions.push(x, y, -depth / 2, x, y, depth / 2);
    }
    for (let j = 0; j <= cellsZ; j += 1) {
      const z = -depth / 2 + (j / cellsZ) * depth;
      positions.push(-width / 2, y, z, width / 2, y, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    return g;
  }, [y, width, depth, cellsX, cellsZ]);

  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.045}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function LayerBounds({ layer }: { layer: LayerId }) {
  const y = LAYER_HEIGHT[layer];
  const width = 22;
  const depth = 10;
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial visible={false} depthWrite={false} />
        <Edges color="#ffffff" lineWidth={0.5}>
          <lineBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.11}
            depthWrite={false}
            toneMapped={false}
          />
        </Edges>
      </mesh>
      <Html
        center
        distanceFactor={22}
        position={[width / 2 + 1.6, 0, -depth / 2 + 0.6]}
        zIndexRange={[5, 0]}
        style={{
          pointerEvents: "none",
          fontFamily:
            "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: "10.5px",
          fontWeight: 600,
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.55)",
          whiteSpace: "nowrap",
          transform: "translate(-50%, -50%)",
        }}
      >
        {LAYER_LABEL[layer]}
      </Html>
    </group>
  );
}

type Child = {
  position: [number, number, number];
  size: number;
  twinklePhase: number;
};

function generateChildren(node: OntologyNode, density: number): Child[] {
  const rand = seededRand(hashId(node.id) ^ 0x9e3779b9);
  const kindMultiplier =
    node.kind === "entityType"
      ? 3.2
      : node.kind === "metric"
        ? 2
        : node.kind === "agent" || node.kind === "output"
          ? 2.4
          : 1.2;
  const base = 6 + density * 0.24;
  const count = Math.round(base * kindMultiplier);
  const cols = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(count))));
  const spacingX = 0.32;
  const spacingY = 0.32;
  const list: Child[] = [];
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    list.push({
      position: [
        (col - (cols - 1) / 2) * spacingX,
        -0.95 - row * spacingY,
        (rand() - 0.5) * 0.55,
      ],
      size: 0.085 + rand() * 0.05,
      twinklePhase: rand(),
    });
  }
  return list;
}

function ChildScatter({
  node,
  dimmed,
  density,
}: {
  node: OntologyNode;
  dimmed: boolean;
  density: number;
}) {
  const children = useMemo(() => generateChildren(node, density), [node, density]);

  const stalkGeom = useMemo(() => {
    const positions: number[] = [];
    for (const c of children) {
      positions.push(0, 0, 0, c.position[0], c.position[1], c.position[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    return g;
  }, [children]);

  const twinkleTargets = useMemo(() => {
    const arr: THREE.Vector3[] = [];
    for (const c of children) {
      if (c.twinklePhase < 0.35)
        arr.push(new THREE.Vector3(c.position[0], c.position[1], c.position[2]));
    }
    return arr;
  }, [children]);

  const twinkleRefs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < twinkleRefs.current.length; i += 1) {
      const m = twinkleRefs.current[i];
      if (!m) continue;
      const p = i * 0.618;
      const b = Math.max(0, Math.sin(t * 1.3 + p) - 0.3);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = b * 0.9;
    }
  });

  const opacity = dimmed ? 0.15 : 1;

  return (
    <group position={node.position}>
      <lineSegments geometry={stalkGeom}>
        <lineBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.09 * opacity}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      {children.map((c, i) => (
        <group key={`child-${i}`} position={c.position}>
          <mesh>
            <boxGeometry args={[c.size, c.size, c.size]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.6 * opacity}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, c.size * 0.95, 0]}>
            <sphereGeometry args={[c.size * 0.38, 12, 12]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.75 * opacity}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      {twinkleTargets.map((p, i) => (
        <mesh
          key={i}
          ref={(el) => {
            twinkleRefs.current[i] = el;
          }}
          position={p}
        >
          <sphereGeometry args={[0.028, 8, 8]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function OrbitRings({
  size,
  opacity,
  seed,
}: {
  size: number;
  opacity: number;
  seed: number;
}) {
  const groupA = useRef<THREE.Group>(null);
  const groupB = useRef<THREE.Group>(null);
  const groupC = useRef<THREE.Group>(null);

  useFrame((_s, delta) => {
    if (groupA.current) {
      groupA.current.rotation.y += delta * 0.22;
      groupA.current.rotation.x += delta * 0.05;
    }
    if (groupB.current) {
      groupB.current.rotation.z += delta * 0.14;
      groupB.current.rotation.y -= delta * 0.09;
    }
    if (groupC.current) {
      groupC.current.rotation.x += delta * 0.19;
    }
  });

  const seedRand = useMemo(() => seededRand(seed), [seed]);
  const tiltA = useMemo(() => (seedRand() - 0.5) * 0.6, [seedRand]);
  const tiltB = useMemo(() => (seedRand() - 0.5) * 0.6, [seedRand]);

  return (
    <group>
      <group ref={groupA} rotation={[tiltA, 0, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size * 2.4, 0.004, 6, 64]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={opacity * 0.55}
            toneMapped={false}
          />
        </mesh>
      </group>
      <group ref={groupB} rotation={[0, 0, tiltB]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size * 3.1, 0.003, 6, 96]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={opacity * 0.35}
            toneMapped={false}
          />
        </mesh>
      </group>
      <group ref={groupC}>
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[size * 3.8, 0.003, 6, 64]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={opacity * 0.22}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

function HubNode({
  node,
  settings,
  dimmed,
  connectionCount,
}: {
  node: OntologyNode;
  settings: ExplorerSettings;
  dimmed: boolean;
  connectionCount: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const phase = useMemo(() => {
    const h = hashId(node.id);
    return (h % 1000) / 1000;
  }, [node.id]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.rotation.y = t * 0.05 + phase * Math.PI * 2;
  });

  const kindScale =
    node.kind === "entityType"
      ? 1.7
      : node.kind === "agent" || node.kind === "output"
        ? 1.45
        : node.kind === "metric"
          ? 1.25
          : 0.95;
  const size = 0.42 * settings.nodeSize * kindScale;
  const opacity = dimmed ? 0.28 : 1;

  const idScore = hashId(node.id) % 100;
  const showLabel =
    settings.labelDensity > 0 &&
    (settings.labelDensity >= 100 ||
      node.kind === "entityType" ||
      node.kind === "metric" ||
      node.kind === "agent" ||
      node.kind === "output" ||
      settings.labelDensity > idScore);

  const labelText = node.label.toUpperCase();
  const subLabel =
    connectionCount > 0
      ? String(connectionCount).padStart(2, "0")
      : (node.sublabel ?? kindLabels[node.kind]).toUpperCase();

  const showOrbitRings = kindScale >= 1.4;

  return (
    <group ref={groupRef} position={node.position}>
      <mesh>
        <boxGeometry args={[size, size, size]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>

      {showOrbitRings ? (
        <OrbitRings size={size} opacity={opacity} seed={hashId(node.id)} />
      ) : null}

      <mesh>
        <sphereGeometry args={[size * 0.09, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>

      {showLabel ? (
        <Html
          center
          distanceFactor={13}
          position={[0, size * 1.6, 0]}
          zIndexRange={[10, 0]}
          style={{
            pointerEvents: "none",
            fontFamily:
              "var(--font-geist-mono), ui-monospace, Menlo, Monaco, monospace",
            fontSize: "10.5px",
            fontWeight: 500,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(232,234,238,0.92)",
            whiteSpace: "nowrap",
            transform: "translate(-50%, -50%)",
            opacity: dimmed ? 0.32 : 1,
            textShadow: "0 0 6px rgba(0,0,0,0.85)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              lineHeight: 1.2,
              gap: 2,
            }}
          >
            <span>{labelText}</span>
            <span
              style={{
                fontSize: "0.78em",
                letterSpacing: "0.14em",
                color: "rgba(255,255,255,0.42)",
              }}
            >
              {subLabel}
            </span>
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function HubEdge({
  from,
  to,
  settings,
  dimmed,
  offset,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  settings: ExplorerSettings;
  dimmed: boolean;
  offset: number;
}) {
  const { control, curve } = useMemo(() => {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const dist = from.distanceTo(to);
    const lift = (settings.edgeCurvature / 100) * dist * 0.24;
    const control = mid.clone().add(new THREE.Vector3(0, lift, 0));
    const curve = new THREE.QuadraticBezierCurve3(from, control, to);
    return { control, curve };
  }, [from, to, settings.edgeCurvature]);

  const pulseRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!pulseRef.current) return;
    const t = clock.getElapsedTime();
    const u = ((t * 0.15 + offset) % 1 + 1) % 1;
    const p = curve.getPointAt(u);
    pulseRef.current.position.copy(p);
    const nearEnd = Math.min(u, 1 - u) * 2;
    const mat = pulseRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = dimmed ? 0.1 : nearEnd * 0.9;
  });

  const opacity = dimmed ? 0.06 : (settings.edgeOpacity / 100) * 0.55;
  const width = Math.max(0.35, settings.edgeThickness * 0.12);

  return (
    <group>
      <QuadraticBezierLine
        start={from}
        mid={control}
        end={to}
        color="#ffffff"
        lineWidth={width}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function CrossReferences({
  nodes,
  density,
}: {
  nodes: OntologyNode[];
  density: number;
}) {
  const linesGeom = useMemo(() => {
    if (nodes.length < 2) return null;
    const rand = seededRand(0xa2b3c4d5);
    const count = Math.round(80 + density * 2.4);
    const positions: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const a = nodes[Math.floor(rand() * nodes.length)];
      const b = nodes[Math.floor(rand() * nodes.length)];
      if (a === b) continue;
      const ax = a.position[0] + (rand() - 0.5) * 0.6;
      const ay = a.position[1] - 0.9 - rand() * 1.5;
      const az = a.position[2] + (rand() - 0.5) * 0.6;
      const bx = b.position[0] + (rand() - 0.5) * 0.6;
      const by = b.position[1] - 0.9 - rand() * 1.5;
      const bz = b.position[2] + (rand() - 0.5) * 0.6;
      positions.push(ax, ay, az, bx, by, bz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    return g;
  }, [nodes, density]);

  if (!linesGeom) return null;
  return (
    <lineSegments geometry={linesGeom}>
      <lineBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.055}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function OriginReticle() {
  const geom = useMemo(() => {
    const positions = [
      -0.5, 0, 0, 0.5, 0, 0,
      0, -0.5, 0, 0, 0.5, 0,
      0, 0, -0.5, 0, 0, 0.5,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    return g;
  }, []);
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.5}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function Nebula({ hue, intensity }: { hue: number; intensity: number }) {
  if (intensity <= 0.001) return null;
  const color1 = new THREE.Color().setHSL(hue, 0.7, 0.55);
  const color2 = new THREE.Color().setHSL((hue + 0.12) % 1, 0.75, 0.45);
  return (
    <Clouds material={THREE.MeshBasicMaterial} limit={200}>
      <Cloud
        seed={1}
        segments={36}
        bounds={[30, 12, 26]}
        volume={9 + intensity * 4}
        color={color1}
        speed={0.03}
        opacity={0.18 * intensity}
        fade={24}
        growth={4}
      />
      <Cloud
        seed={2}
        segments={36}
        bounds={[24, 8, 22]}
        volume={6 + intensity * 3}
        color={color2}
        speed={0.025}
        opacity={0.14 * intensity}
        fade={22}
        growth={3.5}
        position={[3, -0.6, -2]}
      />
    </Clouds>
  );
}

export function OntologyScene({
  nodes,
  edges,
  settings,
}: {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  settings: ExplorerSettings;
}) {
  const laidOut = useMemo(() => applyOrganizedLayout(nodes), [nodes]);
  const nodeById = useMemo(() => {
    const map = new Map<string, OntologyNode>();
    for (const n of laidOut) map.set(n.id, n);
    return map;
  }, [laidOut]);

  const visibleNodes = useMemo(
    () => laidOut.filter((n) => settings.layers[n.layer]),
    [laidOut, settings.layers],
  );
  const visibleIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  );
  const visibleEdges = useMemo(
    () =>
      edges.filter(
        (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
      ),
    [edges, visibleIds],
  );
  const connectionCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of edges) {
      map[e.source] = (map[e.source] ?? 0) + 1;
      map[e.target] = (map[e.target] ?? 0) + 1;
    }
    return map;
  }, [edges]);
  const nodeCountByLayer = useMemo(() => {
    const map: Record<LayerId, number> = {
      sources: 0,
      structure: 0,
      meaning: 0,
      knowledge: 0,
      agents: 0,
      outputs: 0,
    };
    for (const n of laidOut) map[n.layer] += 1;
    return map;
  }, [laidOut]);

  const focusActive = settings.focusKind !== "all";

  const worldGroupRef = useRef<THREE.Group>(null);
  useFrame((_s, delta) => {
    if (!settings.autoRotate || !worldGroupRef.current) return;
    worldGroupRef.current.rotation.y +=
      delta * (settings.rotateSpeed / 100) * 0.14;
  });

  const visibleLayers = useMemo(
    () => LAYER_ORDER.filter((l) => settings.layers[l]),
    [settings.layers],
  );

  return (
    <>
      <color attach="background" args={[settings.backgroundColor]} />
      <fog attach="fog" args={[settings.backgroundColor, 16, 54 - settings.fogDensity * 0.14]} />

      <Stars
        radius={140}
        depth={60}
        count={5200}
        factor={1.2}
        saturation={0}
        fade
        speed={0.06}
      />

      <Nebula hue={0.62} intensity={settings.auroraIntensity / 100} />

      <CameraShake
        maxYaw={0.015}
        maxPitch={0.012}
        maxRoll={0.006}
        yawFrequency={0.09}
        pitchFrequency={0.1}
        rollFrequency={0.06}
        intensity={0.5}
        decayRate={0.65}
      />

      <group ref={worldGroupRef}>
        <CentralSpine
          visibleLayers={visibleLayers}
          nodeCountByLayer={nodeCountByLayer}
        />
        <OriginReticle />

        {visibleLayers.map((l) => (
          <group key={`slab-${l}`}>
            <LayerBounds layer={l} />
            <SlabGrid layer={l} />
          </group>
        ))}

        {visibleNodes.map((node) => (
          <ChildScatter
            key={`sat-${node.id}`}
            node={node}
            dimmed={focusActive && node.kind !== settings.focusKind}
            density={settings.labelDensity}
          />
        ))}

        <CrossReferences nodes={visibleNodes} density={settings.labelDensity} />

        {visibleEdges.map((edge, i) => {
          const src = nodeById.get(edge.source);
          const tgt = nodeById.get(edge.target);
          if (!src || !tgt) return null;
          const from = new THREE.Vector3(...src.position);
          const to = new THREE.Vector3(...tgt.position);
          const dimmed =
            focusActive &&
            src.kind !== settings.focusKind &&
            tgt.kind !== settings.focusKind;
          return (
            <HubEdge
              key={edge.id}
              from={from}
              to={to}
              settings={settings}
              dimmed={dimmed}
              offset={(i % 10) / 10}
            />
          );
        })}

        {visibleNodes.map((node) => (
          <HubNode
            key={node.id}
            node={node}
            settings={settings}
            dimmed={focusActive && node.kind !== settings.focusKind}
            connectionCount={connectionCount[node.id] ?? 0}
          />
        ))}
      </group>

      <EffectComposer multisampling={4} enableNormalPass={false}>
        <Bloom
          intensity={(settings.bloomIntensity / 100) * 0.75}
          luminanceThreshold={Math.max(0.55, settings.bloomThreshold / 100)}
          luminanceSmoothing={settings.bloomSmoothing / 100}
          mipmapBlur
          radius={0.6}
        />
        <ToneMapping mode={4} />
        <Vignette
          eskil={false}
          offset={0.18}
          darkness={settings.vignette / 100}
        />
      </EffectComposer>
    </>
  );
}
