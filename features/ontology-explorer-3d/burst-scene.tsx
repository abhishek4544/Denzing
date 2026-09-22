"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Billboard,
  CameraShake,
  Cloud,
  Clouds,
  ContactShadows,
  Edges,
  Environment,
  Html,
  Line,
  QuadraticBezierLine,
  Sparkles,
  Stars,
} from "@react-three/drei";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  SSAO,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import type { ExplorerSettings, LayerId } from "./defaults";
import { kindLabels } from "./defaults";
import type { NodeKind, OntologyEdge, OntologyNode } from "./fixture";

const ACCENT = "#ff6a1a";

/** Layers as concentric rings — raw source outermost, derived answer innermost. */
const LAYER_RING: Record<LayerId, number> = {
  outputs: 2.4,
  agents: 4.6,
  knowledge: 6.6,
  meaning: 8.6,
  structure: 11.2,
  sources: 13.6,
};

const RING_ORDER_OUTWARD: LayerId[] = [
  "outputs",
  "agents",
  "knowledge",
  "meaning",
  "structure",
  "sources",
];

const LAYER_LABEL: Record<LayerId, string> = {
  sources: "SOURCES",
  structure: "STRUCTURE",
  meaning: "MEANING",
  knowledge: "KNOWLEDGE",
  agents: "AGENTS",
  outputs: "OUTPUTS",
};

/** Angular sectors per kind — same-kind nodes cluster in a legible arc. */
const KIND_BASE_ANGLE: Record<NodeKind, number> = {
  source: -Math.PI * 0.35,
  entityType: -Math.PI * 0.15,
  record: Math.PI * 0.1,
  metric: -Math.PI * 0.55,
  rule: Math.PI * 0.6,
  knowledge: Math.PI * 0.85,
  agent: Math.PI * 1.15,
  output: Math.PI * 1.55,
};

const KIND_SECTOR: Record<NodeKind, number> = {
  source: 0.55,
  entityType: 0.55,
  record: 0.9,
  metric: 0.5,
  rule: 0.3,
  knowledge: 0.3,
  agent: 0.45,
  output: 0.45,
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

/** Concentric-ring layout: radius by layer, angle by kind cluster. */
function applyOntologyRadial(nodes: OntologyNode[]): OntologyNode[] {
  const byKind: Record<string, OntologyNode[]> = {};
  for (const n of nodes) (byKind[n.kind] ??= []).push(n);

  const result: OntologyNode[] = [];
  for (const n of nodes) {
    const list = byKind[n.kind];
    const index = list.indexOf(n);
    const count = list.length;
    const base = KIND_BASE_ANGLE[n.kind];
    const sector = KIND_SECTOR[n.kind] * Math.PI;
    const t = count > 1 ? index / (count - 1) - 0.5 : 0;
    const angle = base + t * sector;
    const radius = LAYER_RING[n.layer];
    const jitter = ((hashId(n.id) % 100) / 100 - 0.5) * 1.4;
    result.push({
      ...n,
      position: [Math.cos(angle) * radius, jitter, Math.sin(angle) * radius],
    });
  }
  return result;
}

/** Compute the derivation path from each edge's target back to the root
 *  output. Nodes on this path get the orange-accent treatment. */
function computeDerivationPath(
  nodes: OntologyNode[],
  edges: OntologyEdge[],
): Set<string> {
  // Prefer explicit output nodes as the root.
  const outputs = nodes.filter((n) => n.kind === "output");
  const rootId = outputs[0]?.id ?? nodes[0]?.id;
  if (!rootId) return new Set();

  // Build reverse adjacency (target → sources) so we walk from root outward.
  const rev: Record<string, string[]> = {};
  for (const e of edges) {
    (rev[e.source] ??= []).push(e.target);
    (rev[e.target] ??= []).push(e.source);
  }
  const path = new Set<string>();
  const queue: string[] = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (path.has(id)) continue;
    path.add(id);
    for (const next of rev[id] ?? []) queue.push(next);
  }
  return path;
}

/** Concentric radar rings PER LAYER — each ring is the visible boundary of
 *  a layer, labeled at the +X edge. Cardinal tick marks on all four edges
 *  strengthen the "organized" feel. Stroke width follows settings.edgeThickness
 *  so the ring stays in sync with the edge control. */
function ringPoints(radius: number): [number, number, number][] {
  const segments = 256;
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    pts.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
  }
  return pts;
}

function LayerRings({
  visibleLayers,
  settings,
}: {
  visibleLayers: LayerId[];
  settings: ExplorerSettings;
}) {
  const width = Math.max(0.35, settings.edgeThickness * 0.35);
  return (
    <group>
      {RING_ORDER_OUTWARD.filter((l) => visibleLayers.includes(l)).map(
        (l, i) => {
          const r = LAYER_RING[l];
          return (
            <group key={l} position={[0, 0, 0]}>
              <Line
                points={ringPoints(r)}
                color="#ffffff"
                lineWidth={width}
                transparent
                opacity={0.35 + (i % 2) * 0.08}
                depthWrite={false}
                toneMapped={false}
              />
              <Html
                center
                distanceFactor={22}
                position={[r + 0.5, 0.7, 0]}
                zIndexRange={[5, 0]}
                style={{
                  pointerEvents: "none",
                  fontFamily:
                    "var(--font-geist-mono), ui-monospace, monospace",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.34em",
                  color: "rgba(255,255,255,0.75)",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  transform: "translate(-50%, -50%)",
                  textShadow: "0 0 12px rgba(0,0,0,0.85)",
                }}
              >
                {LAYER_LABEL[l]}
              </Html>
              {/* Four cardinal tick markers per ring — orient the eye */}
              {[[r, 0, 0], [-r, 0, 0], [0, 0, r], [0, 0, -r]].map((pos, j) => (
                <mesh key={j} position={pos as [number, number, number]}>
                  <boxGeometry args={[0.07, 0.07, 0.07]} />
                  <meshBasicMaterial
                    color={j === 0 ? ACCENT : "#ffffff"}
                    transparent
                    opacity={j === 0 ? 1 : 0.7}
                    toneMapped={false}
                  />
                </mesh>
              ))}
            </group>
          );
        },
      )}
    </group>
  );
}

/** Decorative background spike burst — provides the "big data" texture WITHOUT
 *  carrying semantic weight. Just visual density. */
function DecorativeSpikes({
  nodes,
  density,
  visibleLayers,
}: {
  nodes: OntologyNode[];
  density: number;
  visibleLayers: Set<LayerId>;
}) {
  const geom = useMemo(() => {
    const positions: number[] = [];
    const coreR = 1.5;
    const rand = seededRand(0x1a2b3c4d);
    const perNode = Math.round(18 + density * 0.5);
    for (const n of nodes) {
      if (!visibleLayers.has(n.layer)) continue;
      const [nx, ny, nz] = n.position;
      const len = Math.hypot(nx, ny, nz) || 1;
      const dirX = nx / len;
      const dirY = ny / len;
      const dirZ = nz / len;
      for (let k = 0; k < perNode; k += 1) {
        const spread = 0.14 + rand() * 0.22;
        const rLen = len * (0.62 + rand() * 0.5);
        const jx = dirX + (rand() - 0.5) * spread;
        const jy = dirY + (rand() - 0.5) * spread * 0.35;
        const jz = dirZ + (rand() - 0.5) * spread;
        const jLen = Math.hypot(jx, jy, jz) || 1;
        const ex = (jx / jLen) * rLen;
        const ey = (jy / jLen) * rLen;
        const ez = (jz / jLen) * rLen;
        const sx = (jx / jLen) * coreR;
        const sy = (jy / jLen) * coreR;
        const sz = (jz / jLen) * coreR;
        positions.push(sx, sy, sz, ex, ey, ez);
      }
    }
    // Ambient short spikes filling the sphere.
    const ambient = Math.round(70 + density * 1.8);
    for (let i = 0; i < ambient; i += 1) {
      const theta = rand() * Math.PI * 2;
      const r = 3 + rand() * 8;
      const y = (rand() - 0.5) * 1.2;
      const dx = Math.cos(theta) * r;
      const dy = y;
      const dz = Math.sin(theta) * r;
      const nd = Math.hypot(dx, dy, dz) || 1;
      const sx = (dx / nd) * coreR;
      const sy = (dy / nd) * coreR;
      const sz = (dz / nd) * coreR;
      positions.push(sx, sy, sz, dx, dy, dz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    return g;
  }, [nodes, density, visibleLayers]);

  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.11}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

/** Real derivation edge — visible bezier from source to target. Path-emphasized
 *  edges gain an animated flow pulse and orange colour so the eye follows the
 *  derivation from raw source inward to the answer. */
function DerivationEdge({
  from,
  to,
  emphasized,
  dimmed,
  settings,
  offset,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  emphasized: boolean;
  dimmed: boolean;
  settings: ExplorerSettings;
  offset: number;
}) {
  const { control, curve } = useMemo(() => {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const inward = mid.clone().multiplyScalar(-0.15);
    const control = mid.clone().add(inward);
    const curve = new THREE.QuadraticBezierCurve3(from, control, to);
    return { control, curve };
  }, [from, to]);

  const pulseRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!pulseRef.current || !emphasized || dimmed) return;
    const t = clock.getElapsedTime();
    // Pulses travel INWARD (source → target = end → start on the "toward center" arc).
    const u = 1 - (((t * 0.22 + offset) % 1 + 1) % 1);
    const p = curve.getPointAt(u);
    pulseRef.current.position.copy(p);
    const nearEnd = Math.min(u, 1 - u) * 2;
    const mat = pulseRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = nearEnd * 0.95;
  });

  const baseOpacity = dimmed
    ? 0.06
    : emphasized
      ? 0.95
      : (settings.edgeOpacity / 100) * 0.6;
  const width = Math.max(0.35, settings.edgeThickness * 0.35);
  const color = emphasized ? ACCENT : "#ffffff";

  return (
    <group>
      <QuadraticBezierLine
        start={from}
        mid={control}
        end={to}
        color={color}
        lineWidth={width}
        transparent
        opacity={baseOpacity}
        depthWrite={false}
        toneMapped={false}
      />
      {emphasized && !dimmed ? (
        <mesh ref={pulseRef}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial
            color={ACCENT}
            transparent
            opacity={0}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ) : null}
    </group>
  );
}

function HubNode({
  node,
  settings,
  dimmed,
  connectionCount,
  isOnPath,
}: {
  node: OntologyNode;
  settings: ExplorerSettings;
  dimmed: boolean;
  connectionCount: number;
  isOnPath: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const phase = useMemo(() => (hashId(node.id) % 1000) / 1000, [node.id]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.rotation.y = t * 0.05 + phase * Math.PI * 2;
  });

  const kindScale =
    node.kind === "entityType"
      ? 1.55
      : node.kind === "agent" || node.kind === "output"
        ? 1.4
        : node.kind === "metric"
          ? 1.25
          : 0.9;
  const size = 0.5 * settings.nodeSize * kindScale;
  const opacity = dimmed ? 0.28 : 1;
  const isHubScale = kindScale >= 1.15;

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

  return (
    <group ref={groupRef} position={node.position}>
      {/* Physical inner core — clearcoat glass over dark metal so real light
       *  reflects off the surface and edges catch the HDR environment. */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[size * 0.96, size * 0.96, size * 0.96]} />
        <meshPhysicalMaterial
          color="#14151f"
          metalness={0.75}
          roughness={0.22}
          clearcoat={1}
          clearcoatRoughness={0.15}
          envMapIntensity={1.35}
          transparent
          opacity={dimmed ? 0.5 : 1}
        />
      </mesh>

      <mesh>
        <boxGeometry args={[size, size, size]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        <Edges color="#ffffff" lineWidth={1} threshold={15}>
          <lineBasicMaterial
            color="#ffffff"
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </Edges>
      </mesh>

      <mesh>
        <sphereGeometry args={[size * 0.16, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>

      {/* Soft billboarded halo on hub-scale nodes for hero-quality bloom */}
      {isHubScale ? (
        <Billboard>
          <mesh>
            <circleGeometry args={[size * 2.2, 32]} />
            <meshBasicMaterial
              color={isOnPath ? ACCENT : "#ffffff"}
              transparent
              opacity={isOnPath ? 0.12 : 0.06}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </Billboard>
      ) : null}

      {isOnPath ? (
        <mesh>
          <sphereGeometry args={[size * 0.34, 16, 16]} />
          <meshBasicMaterial
            color={ACCENT}
            transparent
            opacity={0.6}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ) : null}

      {showLabel ? (
        <Html
          center
          distanceFactor={13}
          position={[0, size * 2, 0]}
          zIndexRange={[10, 0]}
          style={{
            pointerEvents: "none",
            fontFamily:
              "var(--font-geist-mono), ui-monospace, Menlo, Monaco, monospace",
            whiteSpace: "nowrap",
            transform: "translate(-50%, -50%)",
            opacity: dimmed ? 0.35 : 1,
          }}
        >
          <div
            style={{
              background: isOnPath ? ACCENT : "#ffffff",
              color: "#0d0e12",
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.16em",
              padding: "2px 6px",
              textTransform: "uppercase",
              lineHeight: 1.1,
              boxShadow: isOnPath
                ? "0 0 12px rgba(255,106,26,0.35)"
                : undefined,
            }}
          >
            {labelText}
            <span
              style={{
                opacity: isOnPath ? 0.72 : 0.55,
                marginLeft: 6,
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

function DustField({ density }: { density: number }) {
  const geom = useMemo(() => {
    const rand = seededRand(0xcafef00d);
    const count = Math.round(140 + density * 2.4);
    const positions: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const r = 3 + rand() * 12;
      const theta = rand() * Math.PI * 2;
      const y = (rand() - 0.5) * 3;
      positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    return g;
  }, [density]);
  return (
    <points geometry={geom}>
      <pointsMaterial
        color="#ffffff"
        size={0.05}
        sizeAttenuation
        transparent
        opacity={0.4}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

function Nebula({ hue, intensity }: { hue: number; intensity: number }) {
  if (intensity <= 0.001) return null;
  const color = new THREE.Color().setHSL(hue, 0.7, 0.55);
  return (
    <Clouds material={THREE.MeshBasicMaterial} limit={200}>
      <Cloud
        seed={1}
        segments={36}
        bounds={[28, 10, 24]}
        volume={8 + intensity * 4}
        color={color}
        speed={0.03}
        opacity={0.18 * intensity}
        fade={22}
        growth={4}
      />
    </Clouds>
  );
}

export function BigDataBurstScene({
  nodes,
  edges,
  settings,
}: {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  settings: ExplorerSettings;
}) {
  const laidOut = useMemo(() => applyOntologyRadial(nodes), [nodes]);
  const nodeById = useMemo(() => {
    const map = new Map<string, OntologyNode>();
    for (const n of laidOut) map.set(n.id, n);
    return map;
  }, [laidOut]);

  const visibleNodes = useMemo(
    () => laidOut.filter((n) => settings.layers[n.layer]),
    [laidOut, settings.layers],
  );
  const visibleLayerSet = useMemo(() => {
    const set = new Set<LayerId>();
    for (const n of visibleNodes) set.add(n.layer);
    return set;
  }, [visibleNodes]);
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

  // Everything reachable from the root output — the derivation path.
  const derivationPath = useMemo(
    () => computeDerivationPath(visibleNodes, visibleEdges),
    [visibleNodes, visibleEdges],
  );

  const focusActive = settings.focusKind !== "all";

  const worldGroupRef = useRef<THREE.Group>(null);
  useFrame((_s, delta) => {
    if (!settings.autoRotate || !worldGroupRef.current) return;
    worldGroupRef.current.rotation.y +=
      delta * (settings.rotateSpeed / 100) * 0.12;
  });

  const visibleLayersOrdered = useMemo(
    () => RING_ORDER_OUTWARD.filter((l) => visibleLayerSet.has(l)),
    [visibleLayerSet],
  );

  return (
    <>
      <color attach="background" args={[settings.backgroundColor]} />
      <fog attach="fog" args={[settings.backgroundColor, 20, 60 - settings.fogDensity * 0.14]} />

      <Stars
        radius={140}
        depth={60}
        count={3800}
        factor={1.1}
        saturation={0}
        fade
        speed={0.06}
      />

      <Nebula hue={0.62} intensity={settings.auroraIntensity / 100} />

      {/* HDR environment for real reflections on all physical materials */}
      <Environment preset="night" background={false} environmentIntensity={0.8} />

      {/* Real three-point lighting */}
      <ambientLight intensity={0.2} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={2.2}
        color="#fff4e2"
        castShadow
      />
      <directionalLight
        position={[-10, 4, -6]}
        intensity={1.6}
        color="#9fb4ff"
      />
      <pointLight
        position={[0, -6, 4]}
        intensity={1.0}
        color="#ffb280"
      />

      {/* Contact shadow disc — anchors the floating geometry to real space */}
      <ContactShadows
        position={[0, -3.5, 0]}
        opacity={0.55}
        scale={40}
        blur={2.6}
        far={14}
        resolution={1024}
        color="#000000"
      />

      <CameraShake
        maxYaw={0.012}
        maxPitch={0.01}
        maxRoll={0.006}
        yawFrequency={0.09}
        pitchFrequency={0.1}
        rollFrequency={0.06}
        intensity={0.5}
        decayRate={0.65}
      />

      {/* Ambient drifting particles — cinematic depth cue */}
      <Sparkles
        count={220}
        scale={[32, 16, 32]}
        size={1.6}
        speed={0.14}
        opacity={0.55}
        color="#ffffff"
      />
      <Sparkles
        count={90}
        scale={[42, 22, 42]}
        size={0.9}
        speed={0.08}
        opacity={0.35}
        color={ACCENT}
      />

      <group ref={worldGroupRef}>
        <LayerRings visibleLayers={visibleLayersOrdered} settings={settings} />
        <DustField density={settings.labelDensity} />

        {/* Decorative background spikes for texture only */}
        <DecorativeSpikes
          nodes={visibleNodes}
          density={settings.labelDensity}
          visibleLayers={visibleLayerSet}
        />

        {/* Real ontology edges — arced slightly inward toward the center */}
        {visibleEdges.map((edge, i) => {
          const src = nodeById.get(edge.source);
          const tgt = nodeById.get(edge.target);
          if (!src || !tgt) return null;
          const from = new THREE.Vector3(...src.position);
          const to = new THREE.Vector3(...tgt.position);
          const emphasized =
            derivationPath.has(edge.source) && derivationPath.has(edge.target);
          const dimmed =
            focusActive &&
            src.kind !== settings.focusKind &&
            tgt.kind !== settings.focusKind;
          return (
            <DerivationEdge
              key={edge.id}
              from={from}
              to={to}
              emphasized={emphasized}
              dimmed={dimmed}
              settings={settings}
              offset={(i % 8) / 8}
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
            isOnPath={derivationPath.has(node.id)}
          />
        ))}
      </group>

      <EffectComposer multisampling={8} enableNormalPass>
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={20}
          radius={0.28}
          intensity={22}
          luminanceInfluence={0.65}
          bias={0.03}
          worldDistanceThreshold={0}
          worldDistanceFalloff={0}
          worldProximityThreshold={0}
          worldProximityFalloff={0}
        />
        <Bloom
          intensity={(settings.bloomIntensity / 100) * 1.4}
          luminanceThreshold={Math.max(0.35, settings.bloomThreshold / 100)}
          luminanceSmoothing={settings.bloomSmoothing / 100}
          mipmapBlur
          radius={1.05}
        />
        <DepthOfField
          focusDistance={0.02}
          focalLength={0.03}
          bokehScale={1.8}
        />
        <ToneMapping mode={4} />
        <Vignette
          eskil={false}
          offset={0.14}
          darkness={Math.min(0.85, (settings.vignette / 100) * 1.2)}
        />
      </EffectComposer>
    </>
  );
}
