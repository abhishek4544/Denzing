import type { LayerId as FixtureLayerId, NodeKind } from "./fixture";

/** Re-exported from fixture so callers only import from one place. */
export type LayerId = FixtureLayerId;

export const layerOptions: { value: LayerId; label: string; question: string }[] = [
  { value: "sources", label: "Sources", question: "Where does data originate?" },
  { value: "structure", label: "Structure", question: "How is it organized?" },
  { value: "meaning", label: "Business meaning", question: "What does it mean?" },
  { value: "knowledge", label: "Knowledge", question: "How should it be interpreted?" },
  { value: "agents", label: "Agents", question: "What uses it?" },
  { value: "outputs", label: "Outputs", question: "What was produced?" },
];

/** Layer's primary question, per PRD §05. */
export const layerCaption: Record<LayerId, string> = {
  sources: "WHERE DOES DATA ORIGINATE?",
  structure: "HOW IS IT ORGANIZED?",
  meaning: "WHAT DOES IT MEAN?",
  knowledge: "HOW SHOULD IT BE INTERPRETED?",
  agents: "WHAT USES IT?",
  outputs: "WHAT WAS PRODUCED?",
};

export const layerLabel: Record<LayerId, string> = {
  sources: "SOURCES",
  structure: "STRUCTURE",
  meaning: "MEANING",
  knowledge: "KNOWLEDGE",
  agents: "AGENTS",
  outputs: "OUTPUTS",
};

/** PRD §05 layer stacking order: bottom → top (raw origins → derived answers). */
export const layerOrder: LayerId[] = [
  "sources",
  "structure",
  "meaning",
  "knowledge",
  "agents",
  "outputs",
];

export const backgroundOptions = [
  { value: "studio", label: "Studio" },
  { value: "night", label: "Night" },
  { value: "dawn", label: "Dawn" },
  { value: "warehouse", label: "Warehouse" },
] as const;

export type BackgroundId = (typeof backgroundOptions)[number]["value"];

export const layoutOptions = [
  { value: "layered", label: "Layered stack" },
  { value: "orbit", label: "Orbit rings" },
  { value: "cluster", label: "Cluster force" },
] as const;

export type LayoutId = (typeof layoutOptions)[number]["value"];

export const viewModeOptions = [
  { value: "constellation-2d", label: "Constellation · 2D" },
  { value: "cosmos-3d", label: "Cosmos · 3D" },
  { value: "burst-3d", label: "Big Data Burst · 3D" },
] as const;

export type ViewMode = (typeof viewModeOptions)[number]["value"];

export const traceModeOptions = [
  { value: "off", label: "Off" },
  { value: "upstream", label: "Trace upstream" },
  { value: "downstream", label: "Trace downstream" },
  { value: "both", label: "Both directions" },
] as const;

export type TraceMode = (typeof traceModeOptions)[number]["value"];

export type ExplorerSettings = {
  /** Which canvas the tool is showing. */
  viewMode: ViewMode;

  /** Layer visibility. */
  layers: Record<LayerId, boolean>;

  /** Node styling. */
  nodeSize: number;
  nodeMetalness: number;
  nodeRoughness: number;
  nodeEmissive: number;
  nodeIridescence: number;
  labelDensity: number;
  labelSize: number;

  /** Edge styling. */
  edgeThickness: number;
  edgeOpacity: number;
  edgeCurvature: number;
  edgeGlow: number;
  edgeFlow: boolean;
  flowSpeed: number;
  showEdgeVerbs: boolean;
  showEdgeArrows: boolean;

  /** Camera / scene. */
  layout: LayoutId;
  autoRotate: boolean;
  rotateSpeed: number;
  fov: number;

  /** Layer arrangement (Cosmos 3D). */
  layerSpacing: number;
  showLayerCaptions: boolean;

  /** Appearance. */
  background: BackgroundId;
  /** Canvas background hex (used by both Cosmos and Burst scenes). */
  backgroundColor: string;
  ambientStrength: number;
  keyLight: number;
  rimLight: number;
  fillLight: number;
  fogDensity: number;
  auroraIntensity: number;

  /** Postprocessing. */
  bloomIntensity: number;
  bloomThreshold: number;
  bloomSmoothing: number;
  dofFocus: number;
  dofAperture: number;
  dofFocalLength: number;
  vignette: number;
  chromaticAberration: number;

  /** Dependency trace direction. */
  traceMode: TraceMode;
  /** Node id used as the trace root; falls back to the first output. */
  traceRootId: string | "auto";

  /** Highlighted node kind (visual emphasis, no semantic change). */
  focusKind: NodeKind | "all";
};

export const defaultExplorerSettings: ExplorerSettings = {
  viewMode: "constellation-2d",

  layers: {
    sources: true,
    structure: true,
    meaning: true,
    knowledge: true,
    agents: true,
    outputs: true,
  },

  nodeSize: 1,
  nodeMetalness: 0.75,
  nodeRoughness: 0.18,
  nodeEmissive: 0.55,
  nodeIridescence: 0.6,
  labelDensity: 100,
  labelSize: 42,

  edgeThickness: 1,
  edgeOpacity: 55,
  edgeCurvature: 24,
  edgeGlow: 30,
  edgeFlow: false,
  flowSpeed: 45,
  showEdgeVerbs: true,
  showEdgeArrows: true,

  layout: "layered",
  autoRotate: true,
  rotateSpeed: 10,
  fov: 46,

  layerSpacing: 100,
  showLayerCaptions: true,

  background: "studio",
  backgroundColor: "#040407",
  ambientStrength: 30,
  keyLight: 70,
  rimLight: 45,
  fillLight: 30,
  fogDensity: 24,
  auroraIntensity: 0,

  bloomIntensity: 45,
  bloomThreshold: 65,
  bloomSmoothing: 55,
  dofFocus: 22,
  dofAperture: 8,
  dofFocalLength: 28,
  vignette: 55,
  chromaticAberration: 0,

  traceMode: "both",
  traceRootId: "auto",

  focusKind: "all",
};

export const kindPalette: Record<NodeKind, { base: string; emissive: string; ring: string }> = {
  source: { base: "#9ea3c0", emissive: "#7b83a8", ring: "#c9cddf" },
  entityType: { base: "#8ea6ff", emissive: "#4b6bff", ring: "#c2ccff" },
  record: { base: "#7ce2ff", emissive: "#2ea9d6", ring: "#c7f2ff" },
  metric: { base: "#ffd166", emissive: "#e0a63b", ring: "#ffe6a6" },
  rule: { base: "#ff8ea3", emissive: "#e64d70", ring: "#ffc2cf" },
  knowledge: { base: "#c8a4ff", emissive: "#8f5cff", ring: "#e0ccff" },
  agent: { base: "#7cf0c0", emissive: "#26b98a", ring: "#c6f7e2" },
  output: { base: "#ff9f7c", emissive: "#e8663a", ring: "#ffd0bd" },
};

export const kindLabels: Record<NodeKind, string> = {
  source: "Source",
  entityType: "Entity type",
  record: "Record",
  metric: "Metric",
  rule: "Rule",
  knowledge: "Knowledge",
  agent: "Agent",
  output: "Output",
};

export const focusOptions: { value: ExplorerSettings["focusKind"]; label: string }[] = [
  { value: "all", label: "All kinds" },
  { value: "source", label: "Sources" },
  { value: "entityType", label: "Entity types" },
  { value: "record", label: "Records" },
  { value: "metric", label: "Metrics" },
  { value: "rule", label: "Rules" },
  { value: "knowledge", label: "Knowledge" },
  { value: "agent", label: "Agents" },
  { value: "output", label: "Outputs" },
];
