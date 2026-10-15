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
  { value: "terrain", label: "Terrain" },
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
  enclosureWidth: number;
  enclosureHeight: number;
  enclosureDepth: number;
  enclosureRings: number;
  coreCubeWidth: number;
  coreCubeHeight: number;
  coreCubeDepth: number;
  coreCubeFloorPadding: number;
  lineCount: number;
  lineColor: string;
  lineAnimationSpeed: number;
  lineBottomDensity: number;
  lineBottomSpread: number;
  lineTopExitCount: number;
  lineTopExitColor: string;
  lineFlowDensity: number;
  lineFlowDuty: number;
  lineTopFade: number;
  lineBottomFade: number;
  topPipeRadius: number;
  topPipeOpacity: number;
  topBubbleCount: number;
  topBubbleSize: number;
  topInnerColor: string;
  topInnerOpacity: number;
  topInnerThickness: number;
  topInnerFlowSpeed: number;
  topInnerFlowDensity: number;
  gridResolution: number;
  gridColor: string;
  gridOpacity: number;
  gridPadding: number;
  basePlaneColor: string;
  basePlaneOpacity: number;
  floorSize: number;
  floorCells: number;
  floorEdgeFade: number;
  floorEdgeIntensity: number;
  floorOpacityNear: number;
  floorOpacityFar: number;
  floorGridColor: string;
  zeroNodeCount: number;
  zeroNodeColor: string;
  zeroNodeSize: number;
  zeroNodeOpacity: number;
  zeroNodeRadius: number;
  enclosureLineOpacity: number;
  agentEnabled: boolean;
  agentLayerY: number;
  agentSize: number;
  agentLayerCount: number;
  agentLayerSpacing: number;
  agentLayerStagger: number;
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

  /** Master toggle for the three overlay callouts (badges + connectors). */
  showCallouts: boolean;

  /** Callout badge screen positions (% of canvas, measured from top-left). */
  calloutAiLeft: number;
  calloutAiTop: number;
  calloutAutonomousLeft: number;
  calloutAutonomousTop: number;
  calloutYourOwnAiLeft: number;
  calloutYourOwnAiTop: number;

  /** AI Analytics connector: steps horizontally from the badge to a trunk X,
   * drops vertically to a target Y, then bends into the Systems layer edge.
   * `trunkX` is the % X where the vertical column sits (0 = canvas left). */
  calloutAiTrunkX: number;
  calloutAiLineDown: number;
  calloutAiBendRight: number;
  /** Autonomous Agents connector — short vertical drop to the top layer. */
  calloutAutonomousLineDown: number;
  /** Your Own AI connector: steps horizontally from the badge to a trunk X,
   * drops vertically, then bends LEFT into the Agent Runtime right edge. */
  calloutYourOwnAiTrunkX: number;
  calloutYourOwnAiLineDown: number;
  calloutYourOwnAiBendLeft: number;

  /** Hyper-realism controls — always-on tone mapping, HDRI, AO, lighting rig, lens effects. */
  realismEnabled: boolean;
  toneMappingExposure: number;        // 0..200 → 0..2.0 (multiplier on 1.0 base)
  hdriEnabled: boolean;
  hdriPreset: GlassEnv;
  hdriIntensity: number;              // 0..200 → 0..2.0
  hdriBackground: boolean;            // if true, HDRI shows as background too
  aoEnabled: boolean;
  aoIntensity: number;                // 0..200 → 0..4.0
  aoRadius: number;                   // 0..100 → 0..2.0 (world units)
  aoAperture: number;                 // 0..100 → 0..1.0 (how much it reads non-contact occlusion)
  keyLightIntensity: number;          // 0..300 → 0..3.0
  fillLightIntensity: number;         // 0..300 → 0..3.0
  rimLightIntensity: number;          // 0..300 → 0..3.0
  keyLightColor: string;
  rimLightColor: string;
  filmGrain: number;                  // 0..100 → 0..0.25
  /** Global multiplier (0..100) applied to every outline/line opacity in the scene. */
  globalLineOpacity: number;

  /** Outcome badges — rendered as an HTML overlay on the right of the canvas. */
  outcomesEnabled: boolean;
  outcomeLabels: string[];
  outcomeRightPct: number;    // 0..100 — right edge of the stack as % of canvas width
  outcomeTopPct: number;      // 0..100 — top of the first badge as % of canvas height
  outcomeSpacingPct: number;  // 0..40 — vertical gap between badges as % of canvas height
  outcomeFontSize: number;    // px
  outcomeFg: string;          // label text color
  /** Thin 3D connector lines from the center slabs out to just past the right
   *  wall, one per outcome label. */
  outcomeConnectorsEnabled: boolean;
  outcomeConnectorColor: string;
  outcomeConnectorThickness: number;  // cylinder radius in world units
  outcomeConnectorOpacity: number;

  verticalSlabsEnabled: boolean;
  verticalSlabCount: number;
  verticalSlabCenterXPct: number;      // 0..100 — center of slab zone as % of enclosureWidth
  verticalSlabZoneWidthPct: number;    // how wide the cluster of slabs is, % of W
  verticalSlabHeightPct: number;       // % of enclosureHeight
  verticalSlabDepthPct: number;        // % of enclosureDepth
  verticalSlabThickness: number;       // X thickness in world units
  verticalSlabColor: string;
  verticalSlabOpacity: number;
  verticalSlabGridResolution: number;
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
  enclosureWidth: 20,
  enclosureHeight: 10,
  enclosureDepth: 10,
  enclosureRings: 6,
  coreCubeWidth: 1.6,
  coreCubeHeight: 1.6,
  coreCubeDepth: 1.6,
  coreCubeFloorPadding: 7,
  lineCount: 520,
  lineColor: "#02c05e",
  lineAnimationSpeed: 59,
  lineBottomDensity: 0,
  lineBottomSpread: 180,
  lineTopExitCount: 0,
  lineTopExitColor: "#f5ffce",
  lineFlowDensity: 15,
  lineFlowDuty: 26,
  lineTopFade: 37,
  lineBottomFade: 5,
  topPipeRadius: 0.075,
  topPipeOpacity: 14,
  topBubbleCount: 9,
  topBubbleSize: 10,
  topInnerColor: "#ffffff",
  topInnerOpacity: 55,
  topInnerThickness: 0,
  topInnerFlowSpeed: 128,
  topInnerFlowDensity: 5,
  gridResolution: 25,
  gridColor: "#ffffff",
  gridOpacity: 8,
  gridPadding: 0,
  basePlaneColor: "#000000",
  basePlaneOpacity: 10,
  floorSize: 14,
  floorCells: 40,
  floorEdgeFade: 76,
  floorEdgeIntensity: 150,
  floorOpacityNear: 9,
  floorOpacityFar: 12,
  floorGridColor: "#ffffff",
  zeroNodeCount: 157,
  zeroNodeColor: "#ffffff",
  zeroNodeSize: 54,
  zeroNodeOpacity: 12,
  zeroNodeRadius: 70,
  enclosureLineOpacity: 9,
  agentEnabled: false,
  agentLayerY: 0.5,
  agentSize: 9.4,
  agentLayerCount: 4,
  agentLayerSpacing: 0.7,
  agentLayerStagger: 49,
  layerCount: 5,
  layerGaps: [108,91,91,80,62,62,62,62,62,62,62,62,62],
  layerColors: ["#9897f2","#f1e9da","#f9f0e1","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c","#ffc35c"],
  layerAmplitudes: [82,82,82,82,82,82,82,82,82,82,82,82,82,82],
  layerWaveScales: [44,44,44,44,44,44,44,44,44,44,44,44,44,44],
  layerBaseOpacity: [35,35,15,14,45,35,35,35,35,35,35,35,35,35],
  layerContent: ["none","none","none","none","none","none","none","none","none","none","none","none","none","none"],
  layerConcept: ["sparkle","agent","box","cloud","uniform","uniform","uniform","uniform","uniform","uniform","uniform","uniform","uniform","uniform"],
  layerLabelFontSize: 12,
  layerNames: ["AGENT RUNTIME","ONTOLOGY","ML & ACTIONS","DATA FOUNDATIONS","SYSTEMS","","","","","","","","",""],
  layerEscapeHeight: [35,35,35,37,35,35,35,35,35,35,35,35,35,35],
  layerSparkleHeight: [null,null,null,null,null,null,null,null,null,null,null,null,null,null],

  cloudDotSize: 0.75,
  cloudColorB: "#e5fff9",
  cloudColorC: "#a9ccf9",
  cloudDensity: 172,
  cloudHeight: 92,
  escapeSpeed: 100,
  escapeJitter: 100,

  agentGridN: 32,
  agentNodeSize: 12,
  agentEdgeOpacity: 22,
  agentSignalCount: 571,
  agentSignalSpeed: 261,
  agentSignalLength: 42,
  agentSignalThickness: 7,
  agentSignalColor: "#ffffff",
  agentNodeColor: "#ffffff",
  agentDecayLength: 59,
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
  interlayerWiresPerHub: 55,
  interlayerHubsPerSide: 3,
  interlayerWaistDepth: 22,
  interlayerFanRadius: 100,
  interlayerTubeRadius: 4,
  interlayerColor: "#ffffff",
  interlayerGlow: 9,
  interlayerFlowSpeed: 100,
  interlayerBeadCount: 31,
  interlayerBeadWidth: 12,
  interlayerBeadBrightness: 65,
  interlayerBallOpacity: 100,
  interlayerBallColor: "#fffcfa",
  interlayerClusterSize: 1,
  interlayerCapSize: 0,
  interlayerSeed: 66,
  interlayerWiresPerHubByPair: [5,21,36,63,null,null,null,null,null,null,null,null,null],
  interlayerEnabledByPair: [null,null,null,null,null,null,null,null,null,null,null,null,null],
  interlayerCascade: 75,
  interlayerUsePalette: false,
  interlayerPaletteBottom: "#3ef07d",
  interlayerPaletteMid: "#3fc9ff",
  interlayerPaletteTop: "#c93de6",
  interlayerStyle: "strings",
  interlayerOpacity: 35,
  interlayerTopBlend: 45,
  interlayerBottomBlend: 37,
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
  sparkleGlassRoughness: 83,
  sparkleGlassIOR: 137,
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
  foundationCount: 18,
  foundationBoxGap: 7,
  foundationFillOpacity: 38,
  foundationEdgeOpacity: 13,
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
  frameOpacity: 6,

  frameGridEnabled: true,
  frameGridResolution: 30,
  frameGridColor: "#f0eff5",
  frameGridOpacity: 2,

  frameGlass: false,
  frameGlassEnv: "studio",
  frameGlassRoughness: 0,
  frameGlassIOR: 100,
  frameGlassThickness: 1,
  frameGlassChromatic: 0,
  frameGlassAnisotropy: 11,
  frameGlassDistortion: 17,
  frameGlassAttenuation: 100,
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
  rotateSpeed: 21,
  fov: 29,
  isoView: false,

  bloomIntensity: 2,
  bloomThreshold: 10,
  bloomSmoothing: 24,
  vignette: 0,

  showCallouts: true,

  calloutAiLeft: 20.3,
  calloutAiTop: 15.0,
  calloutAutonomousLeft: 43.3,
  calloutAutonomousTop: 11.0,
  calloutYourOwnAiLeft: 77.3,
  calloutYourOwnAiTop: 11.5,

  calloutAiTrunkX: 1,
  calloutAiLineDown: 85,
  calloutAiBendRight: 0,
  calloutAutonomousLineDown: 10,
  calloutYourOwnAiTrunkX: 99,
  calloutYourOwnAiLineDown: 22,
  calloutYourOwnAiBendLeft: 0,

  realismEnabled: true,
  toneMappingExposure: 100,
  hdriEnabled: true,
  hdriPreset: "studio",
  hdriIntensity: 55,
  hdriBackground: false,
  aoEnabled: true,
  aoIntensity: 70,
  aoRadius: 30,
  aoAperture: 25,
  keyLightIntensity: 120,
  fillLightIntensity: 55,
  rimLightIntensity: 85,
  keyLightColor: "#fff5e6",
  rimLightColor: "#8fb6ff",
  filmGrain: 22,
  globalLineOpacity: 100,

  outcomesEnabled: true,
  outcomeLabels: ["NOTIFY BUYER", "FLAG SUPPLIER", "HOLD PRICE", "REORDER"],
  outcomeRightPct: 6,
  outcomeTopPct: 32,
  outcomeSpacingPct: 12,
  outcomeFontSize: 18,
  outcomeFg: "#ffffff",
  outcomeConnectorsEnabled: true,
  outcomeConnectorColor: "#ffffff",
  outcomeConnectorThickness: 0.06,
  outcomeConnectorOpacity: 95,

  verticalSlabsEnabled: true,
  verticalSlabCount: 4,
  verticalSlabCenterXPct: 50,
  verticalSlabZoneWidthPct: 6,
  verticalSlabHeightPct: 92,
  verticalSlabDepthPct: 85,
  verticalSlabThickness: 0.12,
  verticalSlabColor: "#f4f6ff",
  verticalSlabOpacity: 55,
  verticalSlabGridResolution: 24,
};
