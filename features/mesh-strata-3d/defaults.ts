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

export const glassEnvOptions = [
  { value: "studio", label: "Studio" },
  { value: "city", label: "City" },
  { value: "apartment", label: "Apartment" },
  { value: "lobby", label: "Lobby" },
  { value: "warehouse", label: "Warehouse" },
  { value: "sunset", label: "Sunset" },
  { value: "dawn", label: "Dawn" },
  { value: "park", label: "Park" },
  { value: "forest", label: "Forest" },
  { value: "night", label: "Night" },
] as const;

export type GlassEnv = (typeof glassEnvOptions)[number]["value"];

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
] as const;

export type LayerConcept = (typeof layerConceptOptions)[number]["value"];

export type StrataSettings = {
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
  /** Per-layer content type (length = MAX_LAYERS). */
  layerContent: ContentType[];
  /** Per-layer semantic concept baked into the mesh (length = MAX_LAYERS). */
  layerConcept: LayerConcept[];
  /** Per-layer display name shown in the inspector (length = MAX_LAYERS). */
  layerNames: string[];
  /** Per-layer escape height for "cloud" concept (0..100). */
  layerEscapeHeight: number[];

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
  /** Extrusion depth as % of planeSize — 0 = flat cutout, higher = raised relief. */
  sparkleHeight: number;
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

  /** Realistic glass fill on the frame (uses MeshTransmissionMaterial). */
  frameGlass: boolean;
  /** HDRI preset that drives reflections & refractions. */
  frameGlassEnv: GlassEnv;
  /** Roughness of the glass surface (0..100). */
  frameGlassRoughness: number;
  /** Index of refraction (100..250 → 1.0..2.5). */
  frameGlassIOR: number;
  /** Physical thickness for refraction depth (0..100). */
  frameGlassThickness: number;
  /** Chromatic aberration strength (0..100). */
  frameGlassChromatic: number;
  /** Anisotropic blur (0..100). */
  frameGlassAnisotropy: number;
  /** Distortion strength (0..100). */
  frameGlassDistortion: number;
  /** Attenuation distance — how quickly tint absorbs light (0..100). */
  frameGlassAttenuation: number;
  /** Glass tint colour (independent from wireframe frame color). */
  frameGlassTint: string;
  /** Backside pass for double-sided refraction (heavier). */
  frameGlassBackside: boolean;

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
};

const DEFAULT_MESH_COLOR = "#ffc35c";

export const defaultStrataSettings: StrataSettings = {
  layerCount: 5,
  layerGaps: [79, 79, 76, 88, 62, 62, 62, 62, 62, 62, 62, 62, 62],
  layerColors: Array(MAX_LAYERS).fill(DEFAULT_MESH_COLOR),
  layerAmplitudes: Array(MAX_LAYERS).fill(82),
  layerWaveScales: Array(MAX_LAYERS).fill(44),
  layerBaseOpacity: [35, 24, 5, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35],
  layerContent: Array.from(
    { length: MAX_LAYERS },
    () => "none",
  ) as ContentType[],
  layerConcept: Array.from({ length: MAX_LAYERS }, (_, i) =>
    i === 2 ? "box" : "uniform",
  ) as LayerConcept[],
  layerNames: Array.from({ length: MAX_LAYERS }, (_, i) =>
    i === 2 ? "Data Foundation" : "",
  ),
  layerEscapeHeight: Array(MAX_LAYERS).fill(35),

  cloudDotSize: 0.75,
  cloudColorB: "#a68cff",
  cloudColorC: "#ff6db3",
  cloudDensity: 120,
  cloudHeight: 100,
  escapeSpeed: 30,
  escapeJitter: 30,

  agentGridN: 16,
  agentNodeSize: 20,
  agentEdgeOpacity: 14,
  agentSignalCount: 40,
  agentSignalSpeed: 35,
  agentSignalLength: 60,
  agentSignalThickness: 25,
  agentSignalColor: "#ffffff",
  agentNodeColor: "#ffffff",
  agentDecayLength: 100,
  agentRefractory: 8,
  agentJunctionSplit: false,
  agentSpawnRate: 22,
  agentMinAmplitude: 4,

  sparkleSize: 30,
  sparklePinch: 18,
  sparkleColor: "#ffffff",
  sparklePulse: 15,
  sparklePulseSpeed: 20,
  sparkleSpin: 0,
  sparkleBillboard: false,
  sparkleHeight: 8,
  sparkleBevel: 25,
  sparkleSubtract: false,
  sparkleWave: 40,
  sparkleWaveSpeed: 30,
  sparkleWaveHeight: 100,
  contentDensity: 30,
  contentSize: 30,
  contentOpacity: 90,
  contentConnect: true,
  contentFlowSpeed: 45,
  contentBob: 25,

  platformColor: "#ffd88a",
  platformScale: 120,
  platformHeight: 35,
  platformNodeSize: 100,

  foundationColor: "#f2ede4",
  foundationBlockSize: 37,
  foundationMaxHeight: 104,
  foundationMinThickness: 29,
  foundationVariance: 75,
  foundationCount: 14,
  foundationBoxGap: 7,
  foundationFillOpacity: 18,
  foundationEdgeOpacity: 27,
  planeSize: 11.2,
  segments: 73,

  amplitude: 94,
  waveScale: 47,
  bottomBias: 11,
  seed: 78,
  randomAmplitude: true,

  lineOpacity: 100,
  lineWidth: 1,

  meshColor: DEFAULT_MESH_COLOR,
  coreColor: "#f2c16e",
  edgeColor: "#fbe9f7",
  frameColor: "#f0eff5",
  backgroundColor: "#031c0c",

  frameShape: "cube",
  frameColorPreset: "custom",
  framePadding: 0,
  frameOpacity: 6,

  frameGridEnabled: true,
  frameGridResolution: 30,
  frameGridColor: "#f0eff5",
  frameGridOpacity: 2,

  frameGlass: false,
  frameGlassEnv: "studio",
  frameGlassRoughness: 8,
  frameGlassIOR: 145,
  frameGlassThickness: 45,
  frameGlassChromatic: 12,
  frameGlassAnisotropy: 6,
  frameGlassDistortion: 0,
  frameGlassAttenuation: 60,
  frameGlassTint: "#ffffff",
  frameGlassBackside: true,

  layerBlur: 0,
  blurFocus: 7,
  blurRange: 13,

  cursorRadius: 2.7,
  cursorStrength: 1.2,
  cursorFluidity: 74,
  cursorReturnSpeed: 25,
  cursorVerticalReach: 89,

  idleAmplitude: 26,
  idleScale: 42,
  idleSpeed: 30,

  autoRotate: false,
  rotateSpeed: 18,
  fov: 26,
  isoView: false,

  bloomIntensity: 2,
  bloomThreshold: 10,
  bloomSmoothing: 24,
  vignette: 0,
};
