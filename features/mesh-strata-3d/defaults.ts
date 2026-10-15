export const frameShapeOptions = [
  { value: "cube", label: "Cube" },
  { value: "hex", label: "Hex Column" },
  { value: "oct", label: "Oct Column" },
  { value: "cylinder", label: "Cylinder" },
  { value: "pillars", label: "Pillars Only" },
  { value: "rings", label: "Rings Only" },
  { value: "none", label: "None" },
] as const;

export type FrameShape = (typeof frameShapeOptions)[number]["value"];

export const frameColorPresets = [
  { value: "custom", label: "Custom", color: "" },
  { value: "gold", label: "Gold", color: "#b78735" },
  { value: "silver", label: "Silver", color: "#c9ccd4" },
  { value: "copper", label: "Copper", color: "#c26a3c" },
  { value: "ivory", label: "Ivory", color: "#e8dcbf" },
  { value: "emerald", label: "Emerald", color: "#2ea56b" },
  { value: "sapphire", label: "Sapphire", color: "#3e6fd8" },
  { value: "amethyst", label: "Amethyst", color: "#8f5cff" },
  { value: "neon", label: "Neon Cyan", color: "#3ee6ff" },
  { value: "magenta", label: "Magenta", color: "#ff3ea6" },
  { value: "graphite", label: "Graphite", color: "#5e6472" },
] as const;

export type FrameColorPreset = (typeof frameColorPresets)[number]["value"];

export const MAX_LAYERS = 14;

export const contentTypeOptions = [
  { value: "none", label: "None" },
  { value: "data-foundation", label: "Data Foundation" },
  { value: "platforms", label: "Platforms (Agent)" },
  { value: "lattice", label: "Lattice (Ontology)" },
  { value: "dots", label: "Dots" },
  { value: "tiles", label: "Tiles" },
  { value: "cubes", label: "Cubes" },
  { value: "disks", label: "Disks" },
  { value: "network", label: "Network" },
] as const;

export type ContentType = (typeof contentTypeOptions)[number]["value"];

export const layerConceptOptions = [
  { value: "uniform", label: "Wave" },
  { value: "box", label: "Box" },
  { value: "cloud", label: "Cloud" },
  { value: "agent", label: "Agent" },
  { value: "sparkle", label: "Sparkle" },
  { value: "terrain", label: "Terrain" },
  { value: "pavilions", label: "Pavilions" },
] as const;

// The renderer also supports the original concept meshes, although the
// inspector now offers only the shape-based concepts above.
export type LayerConcept =
  | (typeof layerConceptOptions)[number]["value"]
  | "data"
  | "ontology"
  | "logic"
  | "orchestration"
  | "outputs";

/** Fixed trio of capability pavilions that stand on the top plaza layer.
 * Colors mirror the previous badge palette so returning viewers recognize
 * the mapping. Labels, color, font family, size and weight are all editable
 * via the Pavilions section. */
export const PAVILION_IDS = ["aiAnalytics", "autonomousAgents", "yourOwnAi"] as const;
export type PavilionId = (typeof PAVILION_IDS)[number];

export type PavilionDef = {
  id: PavilionId;
  label: string;
  color: string;
  /** CSS font-family stack applied to the capability text. */
  fontFamily: string;
  /** Font size as a % of the slab's shortest horizontal edge. */
  fontSize: number;
  /** Font weight (100..900, 400 = regular, 700 = bold). */
  fontWeight: number;
  /** Interior luminosity (0..100) — drives emissiveIntensity. */
  glow: number;
  /** Reflection polish (0..100) — drives clearcoat + envMap intensity. */
  reflection: number;
  /** Surface noise (0..100) — modulates roughness variation. */
  noise: number;
  /** Label text color. Empty string = auto-derive from slab color via a
   * deep-tint rule so text stays legible against the glass. */
  textColor: string;
};

const PAVILION_FONT = '"Violet Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const DEFAULT_PAVILIONS: readonly PavilionDef[] = [
  {
    id: "aiAnalytics",
    label: "AI ANALYTICS",
    color: "#f49eff",
    fontFamily: PAVILION_FONT,
    fontSize: 44.5,
    fontWeight: 900,
    glow: 55,
    reflection: 65,
    noise: 25,
    textColor: "",
  },
  {
    id: "autonomousAgents",
    label: "AUTONOMOUS AGENTS",
    color: "#38d7ff",
    fontFamily: PAVILION_FONT,
    fontSize: 44.5,
    fontWeight: 900,
    glow: 55,
    reflection: 65,
    noise: 25,
    textColor: "",
  },
  {
    id: "yourOwnAi",
    label: "YOUR OWN AI",
    color: "#84d698",
    fontFamily: PAVILION_FONT,
    fontSize: 44.5,
    fontWeight: 900,
    glow: 55,
    reflection: 65,
    noise: 25,
    textColor: "",
  },
];

export const canvasAspectOptions = [
  { value: "auto", label: "Auto · Fit stage" },
  { value: "custom", label: "Custom…" },
  { value: "16:9", label: "16:9 · Landscape" },
  { value: "9:16", label: "9:16 · Portrait" },
  { value: "1:1", label: "1:1 · Square" },
  { value: "4:3", label: "4:3 · Landscape" },
  { value: "3:4", label: "3:4 · Portrait" },
  { value: "4:5", label: "4:5 · Portrait" },
  { value: "21:9", label: "21:9 · Wide" },
] as const;
export type CanvasAspect = typeof canvasAspectOptions[number]["value"];
export function canvasAspectValue(value: CanvasAspect | undefined, customWidth = 16, customHeight = 9): number | undefined {
  if (value === "custom") return Number.isFinite(customWidth) && Number.isFinite(customHeight) && customWidth > 0 && customHeight > 0
    ? Math.min(20, Math.max(0.05, customWidth / customHeight)) : 16 / 9;
  if (!value || value === "auto" || !canvasAspectOptions.some((option) => option.value === value)) return undefined;
  const [width, height] = value.split(":").map(Number);
  return width / height;
}

export type StrataSettings = {
  canvasAspect?: CanvasAspect;
  canvasAspectWidth?: number;
  canvasAspectHeight?: number;
  layerCount: number;
  /** Per-gap spacing between consecutive layers (length = MAX_LAYERS - 1). */
  layerGaps: number[];
  /** Per-layer base mesh color (length = MAX_LAYERS). */
  layerColors: string[];
  /** Per-layer amplitude override (length = MAX_LAYERS). */
  layerAmplitudes: number[];
  /** Per-layer wave-scale override (length = MAX_LAYERS). */
  layerWaveScales: number[];
  /** Per-layer base wave opacity when the layer has content on top (0..100). */
  layerBaseOpacity: number[];
  /** Per-layer background fill alpha (0..100). 0 hides the fill. */
  layerBgOpacity: number[];
  /** Per-layer background fill blur / roughness (0..100). */
  layerBgBlur: number[];
  /** Per-layer background transmission (0..100). 0 = solid tint,
   * 100 = clear glass passing the backdrop through. */
  layerBgTransmission: number[];
  /** Per-layer background fill color. Empty string = inherit layer color. */
  layerBgColor: string[];
  /** Per-layer content type (length = MAX_LAYERS). */
  layerContent: ContentType[];
  /** Per-layer semantic concept baked into the mesh (length = MAX_LAYERS). */
  layerConcept: LayerConcept[];
  /** Per-layer display name shown in the inspector (length = MAX_LAYERS). */
  layerNames: string[];
  layerLabelFontSize: number;
  /** Per-layer escape height for "cloud" concept (0..100). */
  layerEscapeHeight: number[];
  /** Per-layer full sparkle slab thickness; null inherits sparkleHeight for older presets. */
  layerSparkleHeight: (number | null)[];

  /** Cloud dot size (world units × 0.001). */
  cloudDotSize: number;
  /** Secondary particle colour blended per-particle with the layer colour. */
  cloudColorB: string;
  /** Tertiary particle colour — the third stop of the per-particle palette. */
  cloudColorC: string;
  /** Cloud grid resolution (dots per side). */
  cloudDensity: number;
  /** Global cloud height multiplier applied to each layer's escape height (0..200 → 0..2×). */
  cloudHeight: number;
  /** Global escape ping-pong cycle speed (0..100). */
  escapeSpeed: number;
  /** Amount of jitter when the cloud is pressed against the ceiling (0..100). */
  escapeJitter: number;

  /** Agent grid resolution — nodes per side of an N×N lattice. */
  agentGridN: number;
  /** Node dot radius (world units × 0.001). */
  agentNodeSize: number;
  /** Faint lattice edge opacity (0..100). */
  agentEdgeOpacity: number;
  /** Number of concurrent travelling signals (0..300). */
  agentSignalCount: number;
  /** Signal speed — edges traversed per second × 100. */
  agentSignalSpeed: number;
  /** Signal length as a % of one edge interval (10..100). */
  agentSignalLength: number;
  /** Signal capsule thickness (world × 0.001). */
  agentSignalThickness: number;
  /** Bright signal capsule colour. */
  agentSignalColor: string;
  /** Faint node/edge colour. */
  agentNodeColor: string;
  /** Attenuation coefficient — 1/e distance in edge-intervals (0..100). */
  agentDecayLength: number;
  /** Refractory time at a node after a signal passes (0..100 → 0..2 s). */
  agentRefractory: number;
  /** Split at every junction (energy conservation) instead of picking one edge. */
  agentJunctionSplit: boolean;
  /** New signal spawn rate at boundary edges (0..100 → 0..20 /s). */
  agentSpawnRate: number;
  /** Amplitude below which a signal is culled (0..100 → 0..1). */
  agentMinAmplitude: number;

  /** Number of concurrent bezier signal arcs riding above the lattice. */
  agentArcCount: number;
  /** Arc dash-race speed (0..100 → shader offset per second). */
  agentArcSpeed: number;
  agentArcBallSpeed: number;
  agentArcBallSize: number;
  /** Arc apex height relative to node distance (0..100 → 0..1× dist). */
  agentArcLift: number;
  /** Arc rendered thickness (informational — three.js Line stroke). */
  agentArcThickness: number;
  /** Dash length within one dash-period (0..100 → 0..1). */
  agentArcDashLength: number;
  /** Additive-glow multiplier applied to the arc color (0..100 → 0..2.5×). */
  agentArcGlow: number;
  /** Arc line/glow color. */
  agentArcColor: string;

  /** Terrain grid dots per side. */
  terrainGridN: number;
  /** Terrain dot size (world units × 0.001). */
  terrainDotSize: number;
  /** Extra height scale applied to the terrain wave for the ramp mapping. */
  terrainHeightScale: number;
  /** Terrain dot opacity (0..100). */
  terrainOpacity: number;
  /** Six-stop elevation ramp — blue → cyan → green → yellow → orange → magenta. */
  terrainRampC0: string;
  terrainRampC1: string;
  terrainRampC2: string;
  terrainRampC3: string;
  terrainRampC4: string;
  terrainRampC5: string;

  /** Master toggle for the inter-layer connector fanout system. */
  interlayerEnabled: boolean;
  /** Wires per hub (fan-out density). */
  interlayerWiresPerHub: number;
  /** Hubs per side of an NxN grid, per layer pair. */
  interlayerHubsPerSide: number;
  /** Waist depth from the top layer, as % of the pair gap (0=at top, 100=at bottom). */
  interlayerWaistDepth: number;
  /** Radial reach of the fan on the bottom plate, as % of planeSize. */
  interlayerFanRadius: number;
  /** Tube radius (world × 0.001 × planeSize). */
  interlayerTubeRadius: number;
  /** Wire color. */
  interlayerColor: string;
  /** Emissive glow multiplier for the tube base (0..100 → 0..2.5×). */
  interlayerGlow: number;
  /** Upward-flow speed of the beads (0..100 → shader units/sec). */
  interlayerFlowSpeed: number;
  /** Beads per wire (integer, 1..30). */
  interlayerBeadCount: number;
  /** Bead width as fraction of dash period (0..100 → 0..0.5). */
  interlayerBeadWidth: number;
  /** Bead peak brightness multiplier (0..300 → 0..3×). */
  interlayerBeadBrightness: number;
  interlayerBallOpacity: number;
  interlayerBallColor: string;
  /** Terminal cap cluster size (caps per hub, 1..12). */
  interlayerClusterSize: number;
  /** Cap physical size (0..100 → 0..0.05 × planeSize). */
  interlayerCapSize: number;
  /** Randomization seed for hub / wire endpoints. */
  interlayerSeed: number;
  /** Per-pair wire count override (length = MAX_LAYERS - 1). null inherits interlayerWiresPerHub. */
  interlayerWiresPerHubByPair: (number | null)[];
  /** Per-pair enable override (length = MAX_LAYERS - 1). null inherits interlayerEnabled. */
  interlayerEnabledByPair: (boolean | null)[];
  /** Cascade strength (0..100). At 0, every pair uses the base wire count; at
   * 100, only the bottom pair has full density and the top pair has zero. */
  interlayerCascade: number;
  /** When on, wire colors come from the 3-stop palette below instead of the
   * two adjacent layer colors — lets you paint a global gradient across the
   * whole stack (e.g. green → cyan → magenta). */
  interlayerUsePalette: boolean;
  /** Palette color at the bottom endpoint of each wire (source). */
  interlayerPaletteBottom: string;
  /** Palette color at the midpoint of each wire — the color the cable
   * passes through halfway between the two plates. */
  interlayerPaletteMid: string;
  /** Palette color at the top endpoint of each wire (destination). */
  interlayerPaletteTop: string;
  /** Cable shape between two layers.
   * - "strings": straight-ish vertical drops, no hub bottleneck (rain of fibers).
   * - "fan": hub with cluster caps at top + fanning bezier to bottom plate. */
  interlayerStyle: "strings" | "fan";
  /** Wire opacity (0..100 → 0..1). Transparent below 100. */
  interlayerOpacity: number;
  interlayerTopBlend: number;
  interlayerBottomBlend: number;
  /** Random cross-wiring in strings mode (0..100). At 100, every wire's top
   * endpoint is chosen independently of its bottom endpoint, producing a
   * criss-cross scatter instead of parallel drops. */
  interlayerRandomness: number;

  /** Sparkle radius as % of planeSize. */
  sparkleSize: number;
  /** How pinched the sparkle waists are (10..40, smaller = sharper points). */
  sparklePinch: number;
  /** Sparkle fill colour. */
  sparkleColor: string;
  /** Pulse amplitude (0..100 → 0..0.35 scale swing). */
  sparklePulse: number;
  /** Pulse cycles per second × 10 (0..100). */
  sparklePulseSpeed: number;
  /** Spin rate around Y (0..100 → 0..0.6 rad/s). */
  sparkleSpin: number;
  /** Face the camera (billboard) vs. lie flat on the layer. */
  sparkleBillboard: boolean;
  /** Full layer extrusion height — 0 = flat plate, higher = thicker slab. */
  sparkleHeight: number;
  sparkleGlass: boolean;
  sparkleGlassTint: string;
  sparkleGlassRoughness: number;
  sparkleGlassIOR: number;
  sparkleGlassReflection: number;
  /** Bevel size as % of extrude height (rounds the top edges). */
  sparkleBevel: number;
  /**
   * Subtract (sink) into the layer surface instead of rising above it.
   * When true, the sparkle punches downward, reading as a carved hole.
   */
  sparkleSubtract: boolean;
  /** Wave displacement on the sparkle surface (0..100 → 0..full amplitude). */
  sparkleWave: number;
  /** Wave animation speed for the sparkle surface (0..100). */
  sparkleWaveSpeed: number;
  /** Extra amplitude multiplier on this layer's wave (0..200 → 0..2×). */
  sparkleWaveHeight: number;

  contentDensity: number;
  contentSize: number;
  contentOpacity: number;
  contentConnect: boolean;
  contentFlowSpeed: number;
  contentBob: number;

  /** Platforms-specific styling. */
  platformColor: string;
  platformScale: number;
  platformHeight: number;
  platformNodeSize: number;

  /** Data Foundation-specific styling. */
  foundationColor: string;
  foundationBlockSize: number;
  foundationMaxHeight: number;
  foundationMinThickness: number;
  foundationVariance: number;
  /** Boxes per side of a uniform N×N grid across the plane. */
  foundationCount: number;
  foundationBoxGap: number;
  /** Solid fill opacity (0..100). Low = glass-like. */
  foundationFillOpacity: number;
  /** Edge line opacity (0..100). High + low fill = glass. */
  foundationEdgeOpacity: number;
  planeSize: number;
  segments: number;

  amplitude: number;
  waveScale: number;
  bottomBias: number;
  seed: number;
  /** When true, each layer gets a seeded pseudo-random amplitude around the global value. */
  randomAmplitude: boolean;

  lineOpacity: number;
  lineWidth: number;

  meshColor: string;
  coreColor: string;
  edgeColor: string;
  frameColor: string;
  backgroundColor: string;

  frameShape: FrameShape;
  frameColorPreset: FrameColorPreset;
  framePadding: number;
  frameOpacity: number;

  frameGridEnabled: boolean;
  frameGridResolution: number;
  frameGridColor: string;
  frameGridOpacity: number;

  layerBlur: number;
  blurFocus: number;
  blurRange: number;

  cursorRadius: number;
  cursorStrength: number;
  cursorFluidity: number;
  cursorReturnSpeed: number;
  /** How narrow the vertical (Y) falloff is — smaller = only the nearest layer bulges. */
  cursorVerticalReach: number;

  idleAmplitude: number;
  idleScale: number;
  idleSpeed: number;

  autoRotate: boolean;
  rotateSpeed: number;
  fov: number;
  isoView: boolean;

  bloomIntensity: number;
  bloomThreshold: number;
  bloomSmoothing: number;
  vignette: number;

  /** Gutter between pavilion slabs as a % of plane width. */
  pavilionGutter: number;
  /** Back row depth as a % of plaza depth (back row holds the two smaller
   * slabs; the remaining depth is the one wide front slab). */
  pavilionRowSplit: number;
  /** Back-left slab width as a % of back row width. */
  pavilionBackSplit: number;
  /** Pavilion slab height as a % of plane width. */
  pavilionHeight: number;
  /** Pavilion label gap above the top face as a % of plane width. */
  pavilionLabelGap: number;
  /** Per-pavilion label, color, font family, size and weight. */
  pavilions: PavilionDef[];
};

/** Scene-space Y of the top layer. Mirrors the stack layout in `scene.tsx`. */
export function computeStrataTopY(settings: Pick<StrataSettings, "layerCount" | "layerGaps">): number {
  const { layerCount, layerGaps } = settings;
  if (layerCount <= 0) return 0;
  const gaps = layerGaps.slice(0, Math.max(0, layerCount - 1)).map((g) => g * 0.03);
  const ys: number[] = [0];
  for (let i = 1; i < layerCount; i += 1) ys.push(ys[i - 1] - gaps[i - 1]);
  const top = ys[0] ?? 0;
  const bottom = ys[layerCount - 1] ?? 0;
  const shift = -(top + bottom) / 2;
  return top + shift;
}

export const defaultStrataSettings: StrataSettings = {
  canvasAspect: "auto",
  canvasAspectWidth: 16,
  canvasAspectHeight: 9,
  layerCount: 6,
  layerGaps: [81,110,115,110,100,62,62,62,62,62,62,62,62],
  layerColors: ["#f8f6ff","#9897f2","#f1e9da","#f9f0e1","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c"],
  layerAmplitudes: [0,82,82,82,82,82,82,82,82,82,82,82,82,82],
  layerWaveScales: [44,44,44,44,44,44,44,44,44,44,44,44,44,44],
  layerBaseOpacity: [20,35,35,15,14,72,35,35,35,35,35,35,35,35],
  layerBgOpacity: [0,0,41,79,0,0,0,0,0,0,0,0,0,0],
  layerBgBlur: [40,40,100,80,40,40,40,40,40,40,40,40,40,40],
  layerBgTransmission: [20,20,13,85,20,20,20,20,20,20,20,20,20,20],
  layerBgColor: ["","","","","","","","","","","","","",""],
  layerContent: ["none","none","none","none","none","none","none","none","none","none","none","none","none","none"],
  layerConcept: ["pavilions","sparkle","agent","box","cloud","uniform","uniform","uniform","uniform","uniform","uniform","uniform","uniform","uniform"],
  layerLabelFontSize: 12,
  layerNames: ["SURFACE","AGENT RUNTIME","ONTOLOGY","ML & ACTIONS","DATA FOUNDATIONS","SYSTEMS","","","","","","","",""],
  layerEscapeHeight: [35,35,35,35,37,35,35,35,35,35,35,35,35,35],
  layerSparkleHeight: [null,null,null,null,null,null,null,null,null,null,null,null,null,null],

  cloudDotSize: 0.75,
  cloudColorB: "#e5fff9",
  cloudColorC: "#a9ccf9",
  cloudDensity: 172,
  cloudHeight: 92,
  escapeSpeed: 100,
  escapeJitter: 100,

  agentGridN: 24,
  agentNodeSize: 15,
  agentEdgeOpacity: 23,
  agentSignalCount: 274,
  agentSignalSpeed: 200,
  agentSignalLength: 43,
  agentSignalThickness: 3,
  agentSignalColor: "#ffffff",
  agentNodeColor: "#ffffff",
  agentDecayLength: 100,
  agentRefractory: 95,
  agentJunctionSplit: false,
  agentSpawnRate: 100,
  agentMinAmplitude: 42,

  agentArcCount: 24,
  agentArcSpeed: 80,
  agentArcBallSpeed: 100,
  agentArcBallSize: 20,
  agentArcLift: 8,
  agentArcThickness: 21,
  agentArcDashLength: 34,
  agentArcGlow: 22,
  agentArcColor: "#f7ffb8",

  terrainGridN: 91,
  terrainDotSize: 26,
  terrainHeightScale: 66,
  terrainOpacity: 92,
  terrainRampC0: "#0a2540",
  terrainRampC1: "#0f7a86",
  terrainRampC2: "#3ec46b",
  terrainRampC3: "#f4d03f",
  terrainRampC4: "#ef7a2a",
  terrainRampC5: "#f0389e",

  interlayerEnabled: true,
  interlayerWiresPerHub: 44,
  interlayerHubsPerSide: 2,
  interlayerWaistDepth: 22,
  interlayerFanRadius: 51,
  interlayerTubeRadius: 4,
  interlayerColor: "#ffffff",
  interlayerGlow: 9,
  interlayerFlowSpeed: 100,
  interlayerBeadCount: 25,
  interlayerBeadWidth: 12,
  interlayerBeadBrightness: 185,
  interlayerBallOpacity: 71,
  interlayerBallColor: "#fffcfa",
  interlayerClusterSize: 1,
  interlayerCapSize: 0,
  interlayerSeed: 66,
  interlayerWiresPerHubByPair: [9,11,15,61,23,null,null,null,null,null,null,null,null],
  interlayerEnabledByPair: [null,null,null,null,null,null,null,null,null,null,null,null,null],
  interlayerCascade: 15,
  interlayerUsePalette: false,
  interlayerPaletteBottom: "#3ef07d",
  interlayerPaletteMid: "#3fc9ff",
  interlayerPaletteTop: "#c93de6",
  interlayerStyle: "strings",
  interlayerOpacity: 21,
  interlayerTopBlend: 23,
  interlayerBottomBlend: 30,
  interlayerRandomness: 0,

  sparkleSize: 68,
  sparklePinch: 16,
  sparkleColor: "#595959",
  sparklePulse: 27,
  sparklePulseSpeed: 57,
  sparkleSpin: 69,
  sparkleBillboard: false,
  sparkleHeight: 17,
  sparkleGlass: true,
  sparkleGlassTint: "#42ffa7",
  sparkleGlassRoughness: 99,
  sparkleGlassIOR: 205,
  sparkleGlassReflection: 199,
  sparkleBevel: 24,
  sparkleSubtract: true,
  sparkleWave: 77,
  sparkleWaveSpeed: 46,
  sparkleWaveHeight: 173,
  contentDensity: 30,
  contentSize: 30,
  contentOpacity: 90,
  contentConnect: true,
  contentFlowSpeed: 45,
  contentBob: 25,

  platformColor: "#f0e7d5",
  platformScale: 95,
  platformHeight: 35,
  platformNodeSize: 100,

  foundationColor: "#eff0fb",
  foundationBlockSize: 34,
  foundationMaxHeight: 104,
  foundationMinThickness: 50,
  foundationVariance: 59,
  foundationCount: 16,
  foundationBoxGap: 17,
  foundationFillOpacity: 95,
  foundationEdgeOpacity: 8,
  planeSize: 12.8,
  segments: 80,

  amplitude: 94,
  waveScale: 47,
  bottomBias: 11,
  seed: 78,
  randomAmplitude: true,

  lineOpacity: 100,
  lineWidth: 1,

  meshColor: "#ffc35c",
  coreColor: "#f2c16e",
  edgeColor: "#fbe9f7",
  frameColor: "#f0eff5",
  backgroundColor: "#031c0c",

  frameShape: "cube",
  frameColorPreset: "custom",
  framePadding: 0,
  frameOpacity: 0,

  frameGridEnabled: false,
  frameGridResolution: 30,
  frameGridColor: "#f0eff5",
  frameGridOpacity: 2,


  layerBlur: 0,
  blurFocus: 22,
  blurRange: 35,

  cursorRadius: 2.7,
  cursorStrength: 1.2,
  cursorFluidity: 74,
  cursorReturnSpeed: 25,
  cursorVerticalReach: 89,

  idleAmplitude: 26,
  idleScale: 42,
  idleSpeed: 30,

  autoRotate: true,
  rotateSpeed: 12,
  fov: 29,
  isoView: false,

  bloomIntensity: 20,
  bloomThreshold: 10,
  bloomSmoothing: 24,
  vignette: 20,

  pavilionGutter: 4.1,
  pavilionRowSplit: 50,
  pavilionBackSplit: 50,
  pavilionHeight: 10.5,
  pavilionLabelGap: 3,
  pavilions: [
    { ...DEFAULT_PAVILIONS[0], fontSize: 54, textColor: "#ffffff" },
    { ...DEFAULT_PAVILIONS[1], fontSize: 54, textColor: "#ffffff" },
    { ...DEFAULT_PAVILIONS[2], fontSize: 44.5, textColor: "#f5fff8" },
  ],
};
