import presetDefault from "./preset-default.json";

export const MAX_SLABS = 8;

export type SecurityGridSettings = {
  backgroundColor: string;

  // Camera — centered frontal elevated view (per spec: pitch ~41°, 55-70mm)
  fov: number;
  cameraPitch: number;
  cameraDistance: number;
  autoRotate: boolean;
  rotateSpeed: number;
  cameraMode: "perspective" | "isometric";
  isoZoom: number;

  // Camera framing — moves what the camera looks at (pan whole scene)
  cameraTargetX: number;
  cameraTargetY: number;
  cameraTargetZ: number;

  // Base plane / grid
  floorSize: number;
  floorCells: number;
  basePlaneColor: string;
  basePlaneOpacity: number;
  gridColor: string;
  gridOpacityNear: number;
  gridOpacityFar: number;
  gridLineWidth: number;
  floorEdgeFade: number;
  floorEdgeIntensity: number;

  // Zero nodes (hollow luminous rings in every inactive cell)
  zeroColor: string;
  zeroOpacity: number;
  zeroRingSize: number;
  zeroRingThickness: number;

  // Active "1" tiles
  activeCount: number;
  activeSeed: number;
  activeTileColor: string;
  activeTileEmission: number;
  activeSymbolColor: string;
  activeTileScale: number;
  activeRadius: number;
  activeCenterBias: number;
  // Active tile motion — scale + brightness pulse driven by time
  activeAnimEnabled: boolean;
  activeAnimSpeed: number;     // 0-200, cycles/sec scale
  activeAnimIntensity: number; // 0-200, pulse amplitude
  activeAnimDynamic: number;   // 0-100, per-tile phase + speed randomness
  activeAnimMode: "pulse" | "wave" | "flicker";

  // Vertical data stems rising from selected active cells
  stemsEnabled: boolean;
  stemPercentage: number;
  stemColor: string;
  stemOpacity: number;
  stemHeightMin: number;
  stemHeightMax: number;
  stemLinkToCube: boolean;
  stemLinkJitter: number;
  stemEnterCube: number;

  // Micro sampling nodes along stems
  stemNodesEnabled: boolean;
  stemNodeMaxPerStem: number;
  stemNodeColor: string;
  stemNodeSize: number;

  // Volumetric projection rays
  raysEnabled: boolean;
  rayCount: number;
  rayColor: string;
  rayOpacityMin: number;
  rayOpacityMax: number;
  rayHeightMin: number;
  rayHeightMax: number;
  rayAngleJitter: number;
  rayLinkToCube: boolean;
  rayLinkJitter: number;
  rayFromMatrixOnly: boolean;

  // Post
  bloomIntensity: number;
  bloomThreshold: number;
  bloomSmoothing: number;
  vignette: number;

  // Cube (top layer)
  cubeEnabled: boolean;
  cubeSize: number;
  cubeSubdivisions: number;
  cubeOuterColor: string;
  cubeOuterOpacity: number;
  cubeInnerColor: string;
  cubeInnerOpacity: number;
  cubeNodeColor: string;
  cubeNodeSize: number;
  cubeNodeIntensity: number;
  cubeHeightAbove: number;
  cubeOffsetX: number;
  cubeOffsetZ: number;

  // Hyper-real slab cube — solid stacked plates with metallic material
  cubeSlabsEnabled: boolean;
  cubeSlabColor: string;
  cubeSlabMetalness: number;
  cubeSlabRoughness: number;
  cubeSlabHeightPct: number;
  cubeSlabHeights: number[]; // per-slab height multiplier (%), length = MAX_SLABS
  cubeSlabColors: string[];  // per-slab color, length = MAX_SLABS
  cubeSlabTextures: string[]; // per-slab texture data URL (empty = no texture)
  cubeSlabTextureBlend: number; // 0-100: how much the texture tints vs. slab color
  cubeSlabGapPct: number;    // inter-slab gap as % of band height
  cubeHideWireframeWhenSlabs: boolean;

  // Per-slab text labels (tile with text that floats beside each slab)
  cubeSlabLabelsEnabled: boolean;
  cubeSlabLabels: string[];
  cubeSlabLabelTextColor: string;
  cubeSlabLabelBgColor: string;
  cubeSlabLabelFontSize: number;
  cubeSlabLabelOffset: number;
  cubeSlabLabelSide: "right" | "left" | "front" | "back";
  cubeSlabLabelPadding: number;
  cubeSlabLabelOffsetX: number;
  cubeSlabLabelOffsetY: number;
  cubeSlabLabelOffsetZ: number;
  cubeSlabLabelScale: number;

  // Glass material (MeshPhysicalMaterial) — slabs become translucent panes
  cubeSlabGlassEnabled: boolean;
  cubeSlabTransmission: number; // 0-100 → 0-1 transmission (glass transparency)
  cubeSlabThickness: number;    // 0-100 → 0-5 world units thickness for refraction
  cubeSlabClearcoat: number;    // 0-100 → 0-1 clearcoat layer intensity
  cubeSlabClearcoatRough: number; // 0-100 → 0-1 clearcoat polish
  cubeSlabIOR: number;          // 100-250 → 1.0-2.5 index of refraction
  cubeSlabGlassTint: number;    // 0-100 → how much slab color tints the glass

  // Inner glowing core (equivalent of the server's blue memory array)
  cubeCoreEnabled: boolean;
  cubeCoreColor: string;
  cubeCoreEmission: number;
  cubeCoreSizePct: number;

  // Lighting rig (for metallic slabs)
  lightKeyIntensity: number;
  lightFillIntensity: number;
  lightHemiIntensity: number;

  // Explode animation
  cubeOpenEnabled: boolean;
  cubeOpenAmount: number;
  cubeInterSpacing: number;
  cubeOpenDuration: number;
  cubeOpenStagger: number;
  cubeOpenEasing:
    | "expoOut"
    | "quartOut"
    | "cubicOut"
    | "sineOut"
    | "springOut"
    | "springBounce";
  cubeOpenMode: "once" | "loop";
  cubeOpenHold: number;
  cubeOpenTrigger: number;

  // Idle float
  cubeFloatEnabled: boolean;
  cubeFloatAmp: number;
  cubeFloatPeriod: number;

  // Wires between cube and floor — interlayer-style controls
  wiresEnabled: boolean;
  wireColor: string;
  wireOpacity: number;
  wireCount: number;
  wireDrift: number;
  wireTopFade: number;
  wireBottomFade: number;
  wireFlowSpeed: number;
  wireFlowDensity: number;
  wireFlowDuty: number;
  wireFlowRandomness: number;
  wireBend: number;         // -100..100 — vertical bend; negative = sag, positive = arch
  wireBendRadial: number;   // -100..100 — radial bend outward (+) / inward (-) from cube axis
  wireBendSegments: number; // 1..48 — curve resolution per wire
  wireThickness: number;    // 0..100 — 0 = thin GL line, >0 = tube radius
  wireFloorRadius: number;  // 0..200 — scales floor-end XZ distance from cube axis
                            // (0 = vertical column at axis; 100 = active-cell position;
                            //  200 = double spread)
  wireAttachRadius: number; // 0..200 — scales the cube-end attachment outward
                            // from the cube axis (0 = all wires meet at the
                            // cube center; 100 = snapped cube-grid position;
                            //  200 = 2× past the cube edge)

  // Top wires — grouped controls for strands emanating UP from the cube top
  topWiresEnabled: boolean;
  topWireColor: string;
  topWireOpacity: number;
  topWireCount: number;
  topWireDrift: number;       // radius expanding at the upper tip
  topWireHeight: number;      // 0..300 — world units of upward length
  topWireTopFade: number;     // fade at upper tip (t=1)
  topWireBottomFade: number;  // fade near cube face (t=0)
  topWireFlowSpeed: number;
  topWireFlowDensity: number;
  topWireFlowDuty: number;
  topWireFlowRandomness: number;
  topWireBend: number;        // -100..100 — vertical bend
  topWireBendRadial: number;  // -100..100 — radial bend
  topWireBendSegments: number;
  topWireThickness: number;   // 0..100 — 0 = thin GL line, >0 = tube radius
  topWireAttachRadius: number; // 0..200 — scales the cube-top attachment
                               // (base end) outward from the cube axis.
};

export const defaultSecurityGridSettings = presetDefault as SecurityGridSettings;
