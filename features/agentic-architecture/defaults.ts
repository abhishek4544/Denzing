export type AgenticArchitectureSettings = {
  backgroundColor: string;
  lineColor: string;
  lineOpacity: number;      // 0..100
  lineThickness: number;    // SVG stroke-width in viewBox units
  accentColor: string;      // red/orange highlight on the center module
  accentOpacity: number;    // 0..100

  titleText: string;
  subtitleText: string;
  titleColor: string;
  subtitleColor: string;
  titleFontSize: number;    // px
  subtitleFontSize: number; // px

  moduleTopLabel: string;
  moduleCenterLabel: string;
  moduleBottomLabel: string;
  bracketLabelTop: string;      // right-side bracket label for top module
  bracketLabelCenter: string;
  bracketLabelBottom: string;

  /** Whether to draw the thin curved input/output lines coming into the top
   *  and out of the bottom module. */
  flowLinesEnabled: boolean;
  flowLineCount: number;    // per side; 2 matches the reference
  flowLineOpacity: number;  // 0..100

  /** Subtle rotation of the dashed accent orbit around the center module. */
  orbitSpeed: number;       // 0..100 → 0..60°/s

  /** Vertical gap between modules as % of viewBox height. */
  moduleGapPct: number;
  /** Horizontal scale of each module (0..200 → 0..2× base width). */
  moduleWidthPct: number;
};

export const defaultAgenticArchitectureSettings: AgenticArchitectureSettings = {
  backgroundColor: "#000000",
  lineColor: "#f4f6ff",
  lineOpacity: 85,
  lineThickness: 1.2,
  accentColor: "#ff5a2e",
  accentOpacity: 95,

  titleText: "People. Platforms. Systems.",
  subtitleText: "ARCHITECTURE",
  titleColor: "#ffffff",
  subtitleColor: "#bfc3cf",
  titleFontSize: 44,
  subtitleFontSize: 12,

  moduleTopLabel: "OPERATIONS",
  moduleCenterLabel: "AGENTIC INFRASTRUCTURE",
  moduleBottomLabel: "AI PROVIDERS",
  bracketLabelTop: "ORGANIZATIONS",
  bracketLabelCenter: "INFRASTRUCTURE",
  bracketLabelBottom: "SYSTEMS & MODELS",

  flowLinesEnabled: true,
  flowLineCount: 2,
  flowLineOpacity: 55,

  orbitSpeed: 10,

  moduleGapPct: 4,
  moduleWidthPct: 100,
};
