"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ExplorerSettings } from "./defaults";
import { kindLabels } from "./defaults";
import type { ModelAction, ModelEdge, ModelNode, ModelState } from "./model";

type Props = {
  model: ModelState;
  dispatch: React.Dispatch<ModelAction>;
  settings: ExplorerSettings;
};

type ViewTransform = { tx: number; ty: number; scale: number };

const MIN_SCALE = 0.25;
const MAX_SCALE = 3.5;

/** Deterministic satellite scatter — small square dots orbiting each node
 *  for TextQL-style density without inflating the actual model. */
type Satellite = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  linked: boolean;
};

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function scatterFor(node: ModelNode, density: number): Satellite[] {
  // Hash the node id into a stable seed.
  let h = 0;
  for (let i = 0; i < node.id.length; i += 1)
    h = (h * 31 + node.id.charCodeAt(i)) >>> 0;
  const rand = seededRand(h);
  const count = Math.round(6 + density * 0.55);
  const out: Satellite[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = rand() * Math.PI * 2;
    const r = 26 + rand() * (90 + density * 0.4);
    out.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      size: 1.6 + rand() * 2.4,
      opacity: 0.35 + rand() * 0.55,
      linked: rand() > 0.55,
    });
  }
  return out;
}

/** Fixed background "dust" — tiny square dots covering the whole canvas at
 *  fixed viewport coordinates. Rendered in the un-transformed layer so the
 *  scatter reads as ambient noise regardless of pan/zoom. */
function makeDust(count: number, seed: number) {
  const rand = seededRand(seed);
  const dust: { x: number; y: number; s: number; a: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    dust.push({
      x: rand() * 100,
      y: rand() * 100,
      s: 0.3 + rand() * 0.7,
      a: 0.06 + rand() * 0.35,
    });
  }
  return dust;
}

function DustLayer({ count, seed }: { count: number; seed: number }) {
  const dust = useMemo(() => makeDust(count, seed), [count, seed]);
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {dust.map((d, i) => (
        <rect
          key={i}
          x={d.x}
          y={d.y}
          width={d.s * 0.12}
          height={d.s * 0.12}
          fill="#ffffff"
          fillOpacity={d.a}
        />
      ))}
    </svg>
  );
}

function isFormElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function findAncestorNodeId(el: Element | null): string | null {
  while (el) {
    if (el instanceof SVGElement || el instanceof HTMLElement) {
      const id = el.getAttribute?.("data-node-id");
      if (id) return id;
    }
    el = el.parentElement;
  }
  return null;
}

export function ConstellationCanvas({ model, dispatch, settings }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewTransform>({ tx: 0, ty: 0, scale: 1 });
  const [dragNode, setDragNode] = useState<
    { id: string; offsetX: number; offsetY: number } | null
  >(null);
  const [connect, setConnect] = useState<
    { fromId: string; x: number; y: number } | null
  >(null);
  const [pan, setPan] = useState<
    { startX: number; startY: number; startTx: number; startTy: number } | null
  >(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isFormElement(e.target)) {
        e.preventDefault();
        setSpaceDown(true);
      }
      if (e.code === "Escape") {
        setConnect(null);
        setEditingEdgeId(null);
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: cr.width, h: cr.height });
      }
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const cx = clientX - rect.left - rect.width / 2;
      const cy = clientY - rect.top - rect.height / 2;
      return {
        x: (cx - view.tx) / view.scale,
        y: (cy - view.ty) / view.scale,
      };
    },
    [view],
  );

  // Native non-passive wheel listener for pointer-anchored zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      const dir = e.deltaY > 0 ? 0.9 : 1.11;
      setView((v) => {
        const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * dir));
        const ratio = nextScale / v.scale;
        return {
          scale: nextScale,
          tx: px - (px - v.tx) * ratio,
          ty: py - (py - v.ty) * ratio,
        };
      });
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragNode) {
        const { x, y } = toWorld(e.clientX, e.clientY);
        dispatch({
          type: "moveNode2d",
          id: dragNode.id,
          position: [x - dragNode.offsetX, y - dragNode.offsetY],
        });
      } else if (connect) {
        const { x, y } = toWorld(e.clientX, e.clientY);
        setConnect((c) => (c ? { ...c, x, y } : null));
      } else if (pan) {
        setView((v) => ({
          ...v,
          tx: pan.startTx + (e.clientX - pan.startX),
          ty: pan.startTy + (e.clientY - pan.startY),
        }));
      }
    };
    const onUp = (e: PointerEvent) => {
      if (dragNode) setDragNode(null);
      if (connect) {
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const nodeId = findAncestorNodeId(target);
        if (nodeId && nodeId !== connect.fromId) {
          const id = `e-${connect.fromId}-${nodeId}-${Date.now().toString(36)}`;
          dispatch({
            type: "addEdge",
            edge: {
              id,
              source: connect.fromId,
              target: nodeId,
              verb: "uses",
            },
          });
        }
        setConnect(null);
      }
      if (pan) setPan(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragNode, connect, pan, dispatch, toWorld]);

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (!spaceDown) return;
    e.preventDefault();
    setPan({
      startX: e.clientX,
      startY: e.clientY,
      startTx: view.tx,
      startTy: view.ty,
    });
  };

  const focusActive = settings.focusKind !== "all";

  const visibleNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of model.nodeOrder) {
      const n = model.nodes[id];
      if (settings.layers[n.layer]) set.add(id);
    }
    return set;
  }, [model.nodes, model.nodeOrder, settings.layers]);

  const visibleEdges = useMemo(
    () =>
      model.edgeOrder
        .map((id) => model.edges[id])
        .filter(
          (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target),
        ),
    [model.edges, model.edgeOrder, visibleNodeIds],
  );

  // Edge count per node — used for the "APPS 39"-style label counts.
  const edgeCountByNode = useMemo(() => {
    const map: Record<string, number> = {};
    for (const id of model.edgeOrder) {
      const e = model.edges[id];
      map[e.source] = (map[e.source] ?? 0) + 1;
      map[e.target] = (map[e.target] ?? 0) + 1;
    }
    return map;
  }, [model.edges, model.edgeOrder]);

  const editingEdge = editingEdgeId ? model.edges[editingEdgeId] : null;

  const cx = size.w / 2;
  const cy = size.h / 2;

  const editingScreenPos = useMemo(() => {
    if (!editingEdge) return null;
    const src = model.nodes[editingEdge.source];
    const tgt = model.nodes[editingEdge.target];
    if (!src || !tgt) return null;
    const midX = (src.position2d[0] + tgt.position2d[0]) / 2;
    const midY = (src.position2d[1] + tgt.position2d[1]) / 2;
    return {
      left: cx + view.tx + midX * view.scale,
      top: cy + view.ty + midY * view.scale,
    };
  }, [editingEdge, model.nodes, view, cx, cy]);

  const aurora = settings.auroraIntensity / 100;

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-lg"
      style={{
        background: settings.backgroundColor,
        cursor: spaceDown ? (pan ? "grabbing" : "grab") : "default",
      }}
    >
      {/* Optional aurora (0 = pure black TextQL look, 100 = deep-space nebula) */}
      {aurora > 0.01 ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(60% 42% at 28% 22%, rgba(80,120,255,${
              0.18 * aurora
            }), transparent 70%), radial-gradient(52% 40% at 76% 82%, rgba(200,80,180,${
              0.14 * aurora
            }), transparent 70%), radial-gradient(35% 30% at 50% 50%, rgba(255,200,120,${
              0.08 * aurora
            }), transparent 70%)`,
          }}
        />
      ) : null}

      {/* Ambient dust field (2 layers for subtle parallax feel) */}
      <div className="pointer-events-none absolute inset-0">
        <DustLayer count={280} seed={17} />
        <DustLayer count={140} seed={409} />
      </div>

      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full select-none"
        onPointerDown={onCanvasPointerDown}
      >
        <defs>
          <filter id="c-edge-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.4" />
          </filter>
        </defs>

        <g transform={`translate(${cx + view.tx} ${cy + view.ty}) scale(${view.scale})`}>
          {/* Satellite scatter — behind everything */}
          {model.nodeOrder.map((id) => {
            const n = model.nodes[id];
            if (!settings.layers[n.layer]) return null;
            return (
              <SatelliteScatter
                key={`sat-${id}`}
                node={n}
                dimmed={focusActive && n.kind !== settings.focusKind}
                density={settings.labelDensity}
              />
            );
          })}

          {/* Edges */}
          {visibleEdges.map((edge) => {
            const src = model.nodes[edge.source];
            const tgt = model.nodes[edge.target];
            if (!src || !tgt) return null;
            const dimmed =
              focusActive &&
              src.kind !== settings.focusKind &&
              tgt.kind !== settings.focusKind;
            return (
              <ConstellationEdge
                key={edge.id}
                edge={edge}
                from={src.position2d}
                to={tgt.position2d}
                settings={settings}
                dimmed={dimmed}
                onClick={() => {
                  setEditingEdgeId(edge.id);
                  setLabelDraft(edge.customLabel ?? edge.verb);
                }}
              />
            );
          })}

          {/* In-progress connect line */}
          {connect
            ? (() => {
                const src = model.nodes[connect.fromId];
                if (!src) return null;
                return (
                  <line
                    x1={src.position2d[0]}
                    y1={src.position2d[1]}
                    x2={connect.x}
                    y2={connect.y}
                    stroke="#ffffff"
                    strokeWidth={1.2}
                    strokeDasharray="6 4"
                    strokeOpacity={0.85}
                    pointerEvents="none"
                  />
                );
              })()
            : null}

          {/* Nodes */}
          {model.nodeOrder.map((id) => {
            const n = model.nodes[id];
            if (!settings.layers[n.layer]) return null;
            const dimmed = focusActive && n.kind !== settings.focusKind;
            const count = edgeCountByNode[n.id] ?? 0;
            return (
              <SquareNode
                key={n.id}
                node={n}
                settings={settings}
                dimmed={dimmed}
                count={count}
                onNodePointerDown={(e) => {
                  if (spaceDown) return;
                  e.stopPropagation();
                  const { x, y } = toWorld(e.clientX, e.clientY);
                  setDragNode({
                    id: n.id,
                    offsetX: x - n.position2d[0],
                    offsetY: y - n.position2d[1],
                  });
                }}
                onHandlePointerDown={(e) => {
                  e.stopPropagation();
                  const { x, y } = toWorld(e.clientX, e.clientY);
                  setConnect({ fromId: n.id, x, y });
                }}
              />
            );
          })}
        </g>
      </svg>

      {/* Bottom-left hint bar */}
      <div className="pointer-events-none absolute left-4 bottom-3 text-[10px] uppercase tracking-[0.22em] text-white/40 font-medium leading-tight max-w-[calc(100%-48px)]"
        style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
      >
        DRAG NODES · DRAG ◇ HANDLE TO CONNECT · CLICK A LINK TO LABEL · SCROLL TO ZOOM · SPACE + DRAG TO PAN
      </div>

      {/* Top-right meta */}
      <div
        className="pointer-events-none absolute right-4 top-3 text-[10px] uppercase tracking-[0.22em] text-white/40 font-medium"
        style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
      >
        THE CONSTELLATION · {model.nodeOrder.length} NODES · {model.edgeOrder.length} LINKS
      </div>

      {/* Edge label editor */}
      {editingEdgeId && editingScreenPos ? (
        <div
          className="absolute z-20 flex items-center gap-1 rounded-md bg-[#0a0a0d]/90 backdrop-blur px-2 py-1.5 shadow-[0_10px_40px_-6px_rgba(0,0,0,0.7)] ring-1 ring-white/15"
          style={{
            left: editingScreenPos.left,
            top: editingScreenPos.top,
            transform: "translate(-50%, -50%)",
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                dispatch({
                  type: "labelEdge",
                  id: editingEdgeId,
                  label: labelDraft,
                });
                setEditingEdgeId(null);
              }
              if (e.key === "Escape") setEditingEdgeId(null);
            }}
            placeholder="verb"
            className="w-[140px] bg-transparent text-[11px] uppercase tracking-[0.14em] text-white/90 placeholder:text-white/25 outline-none"
            style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
          />
          <button
            type="button"
            onClick={() => {
              dispatch({
                type: "labelEdge",
                id: editingEdgeId,
                label: labelDraft,
              });
              setEditingEdgeId(null);
            }}
            className="text-[10px] uppercase tracking-[0.14em] text-white/70 hover:text-white px-1"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "removeEdge", id: editingEdgeId });
              setEditingEdgeId(null);
            }}
            className="text-[10px] uppercase tracking-[0.14em] text-red-300/80 hover:text-red-200 px-1"
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SatelliteScatter({
  node,
  dimmed,
  density,
}: {
  node: ModelNode;
  dimmed: boolean;
  density: number;
}) {
  const nodeId = node.id;
  const sats = useMemo(() => scatterFor({ id: nodeId } as ModelNode, density), [nodeId, density]);
  const [x, y] = node.position2d;
  const opacity = dimmed ? 0.15 : 0.85;
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      {sats.map((s, i) => (
        <g key={i}>
          {s.linked ? (
            <line
              x1={0}
              y1={0}
              x2={s.x}
              y2={s.y}
              stroke="#ffffff"
              strokeWidth={0.35}
              strokeOpacity={0.08 * opacity}
            />
          ) : null}
          <rect
            x={s.x - s.size / 2}
            y={s.y - s.size / 2}
            width={s.size}
            height={s.size}
            fill="none"
            stroke="#ffffff"
            strokeWidth={0.6}
            strokeOpacity={s.opacity * 0.55 * opacity}
          />
        </g>
      ))}
    </g>
  );
}

function SquareNode({
  node,
  settings,
  dimmed,
  count,
  onNodePointerDown,
  onHandlePointerDown,
}: {
  node: ModelNode;
  settings: ExplorerSettings;
  dimmed: boolean;
  count: number;
  onNodePointerDown: (e: React.PointerEvent) => void;
  onHandlePointerDown: (e: React.PointerEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [x, y] = node.position2d;
  const baseSize = 14 * settings.nodeSize;
  // Hub-like kinds (entity types, agents) render larger, matching TextQL's
  // "APPS / APIS / AGENTS" hubs vs the small satellite nodes.
  const kindScale =
    node.kind === "entityType"
      ? 1.4
      : node.kind === "agent" || node.kind === "output"
        ? 1.25
        : node.kind === "metric"
          ? 1.15
          : 1;
  const size = baseSize * kindScale;
  const strokeOpacity = dimmed ? 0.3 : hovered ? 1 : 0.85;
  const bracketSize = size * 0.35;

  const idScore = (() => {
    let h = 0;
    for (let i = 0; i < node.id.length; i += 1)
      h = (h * 31 + node.id.charCodeAt(i)) >>> 0;
    return h % 100;
  })();
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
    count > 0
      ? String(count).padStart(2, "0")
      : (node.sublabel ?? kindLabels[node.kind]).toUpperCase();

  return (
    <g
      data-node-id={node.id}
      transform={`translate(${x} ${y})`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Outlined square — the "ball" */}
      <rect
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        fill="none"
        stroke="#ffffff"
        strokeWidth={1.1}
        strokeOpacity={strokeOpacity}
        pointerEvents="none"
      />

      {/* Corner ticks — TextQL signature detail on hub nodes */}
      {kindScale >= 1.15 ? (
        <g pointerEvents="none" stroke="#ffffff" strokeWidth={1} strokeOpacity={strokeOpacity}>
          {/* top-left */}
          <line x1={-size / 2 - 3} y1={-size / 2} x2={-size / 2 - 3} y2={-size / 2 + bracketSize} />
          <line x1={-size / 2 - 3} y1={-size / 2} x2={-size / 2 + bracketSize - 3} y2={-size / 2} />
          {/* top-right */}
          <line x1={size / 2 + 3} y1={-size / 2} x2={size / 2 + 3} y2={-size / 2 + bracketSize} />
          <line x1={size / 2 + 3} y1={-size / 2} x2={size / 2 + 3 - bracketSize} y2={-size / 2} />
          {/* bottom-left */}
          <line x1={-size / 2 - 3} y1={size / 2} x2={-size / 2 - 3} y2={size / 2 - bracketSize} />
          <line x1={-size / 2 - 3} y1={size / 2} x2={-size / 2 + bracketSize - 3} y2={size / 2} />
          {/* bottom-right */}
          <line x1={size / 2 + 3} y1={size / 2} x2={size / 2 + 3} y2={size / 2 - bracketSize} />
          <line x1={size / 2 + 3} y1={size / 2} x2={size / 2 + 3 - bracketSize} y2={size / 2} />
        </g>
      ) : null}

      {/* Drag hit area */}
      <rect
        x={-size}
        y={-size}
        width={size * 2}
        height={size * 2}
        fill="transparent"
        onPointerDown={onNodePointerDown}
        style={{ cursor: "grab" }}
      />

      {/* Diamond connect handle — outlined, appears on hover */}
      {hovered ? (
        <g
          transform={`translate(${size / 2 + 14} 0) rotate(45)`}
          onPointerDown={onHandlePointerDown}
          style={{ cursor: "crosshair" }}
        >
          <rect
            x={-5.5}
            y={-5.5}
            width={11}
            height={11}
            fill="none"
            stroke="#ffffff"
            strokeWidth={1.1}
            strokeOpacity={0.95}
          />
        </g>
      ) : null}

      {/* Label + count */}
      {showLabel ? (
        <g pointerEvents="none">
          <text
            x={size / 2 + 12}
            y={-2}
            fill="rgba(232,234,238,0.9)"
            fontSize={10.5}
            fontWeight={500}
            letterSpacing="1.6"
            style={{
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              textTransform: "uppercase",
            }}
          >
            {labelText}
          </text>
          <text
            x={size / 2 + 12}
            y={10}
            fill="rgba(255,255,255,0.35)"
            fontSize={8.5}
            fontWeight={500}
            letterSpacing="1.2"
            style={{
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              textTransform: "uppercase",
            }}
          >
            {subLabel}
          </text>
        </g>
      ) : null}
    </g>
  );
}

function ConstellationEdge({
  edge,
  from,
  to,
  settings,
  dimmed,
  onClick,
}: {
  edge: ModelEdge;
  from: [number, number];
  to: [number, number];
  settings: ExplorerSettings;
  dimmed: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [x1, y1] = from;
  const [x2, y2] = to;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const lift = (settings.edgeCurvature / 100) * len * 0.22;
  const cxp = midX + nx * lift;
  const cyp = midY + ny * lift;
  const path = `M ${x1} ${y1} Q ${cxp} ${cyp} ${x2} ${y2}`;

  const baseOpacity = dimmed ? 0.06 : (settings.edgeOpacity / 100) * 0.45;
  const coreWidth = Math.max(0.3, settings.edgeThickness * 0.13);
  const label = edge.customLabel ?? edge.verb;

  return (
    <g
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{ cursor: "pointer" }}
    >
      {/* Wide invisible hit path */}
      <path
        d={path}
        stroke="transparent"
        strokeWidth={12}
        fill="none"
        onClick={onClick}
      />
      {/* Single thin white stroke */}
      <path
        d={path}
        stroke="#ffffff"
        strokeWidth={coreWidth}
        strokeLinecap="round"
        fill="none"
        opacity={hovered ? Math.min(1, baseOpacity + 0.4) : baseOpacity}
        pointerEvents="none"
      />
      {/* Label near midpoint */}
      {hovered || edge.customLabel ? (
        <g pointerEvents="none" transform={`translate(${cxp} ${cyp})`}>
          <rect
            x={-label.length * 3 - 6}
            y={-8}
            width={label.length * 6 + 12}
            height={16}
            rx={2}
            fill="#0a0a0d"
            fillOpacity={0.85}
            stroke="#ffffff"
            strokeOpacity={0.25}
            strokeWidth={0.6}
          />
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fontWeight={500}
            letterSpacing="1.3"
            fill="rgba(232,234,238,0.9)"
            style={{
              textTransform: "uppercase",
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            }}
          >
            {label}
          </text>
        </g>
      ) : null}
    </g>
  );
}
